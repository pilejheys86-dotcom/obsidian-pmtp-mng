// server/routes/pricing.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { logTenantAudit } = require('../utils/auditLog');

const SILVER_SEED = [
  { purity_mark: '999', purity_pct: 99.9, common_name: 'Fine Silver' },
  { purity_mark: '958', purity_pct: 95.8, common_name: 'Britannia Silver' },
  { purity_mark: '925', purity_pct: 92.5, common_name: 'Sterling Silver' },
  { purity_mark: '900', purity_pct: 90.0, common_name: 'Coin Silver' },
  { purity_mark: '835', purity_pct: 83.5, common_name: 'Standard Silver' },
  { purity_mark: '800', purity_pct: 80.0, common_name: 'Low Purity Silver' },
];

const CONDITION_SEED = [
  { condition_name: 'Excellent',           description: 'Like new, no visible wear or damage',        multiplier_pct: 100, sort_order: 1 },
  { condition_name: 'Very Good',           description: 'Minor signs of use, fully functional',        multiplier_pct: 85,  sort_order: 2 },
  { condition_name: 'Good',                description: 'Visible wear but no major damage',            multiplier_pct: 70,  sort_order: 3 },
  { condition_name: 'Fair',                description: 'Heavy wear, minor functional issues',         multiplier_pct: 50,  sort_order: 4 },
  { condition_name: 'Poor',                description: 'Significant damage, limited functionality',   multiplier_pct: 30,  sort_order: 5 },
  { condition_name: 'For Parts / Damaged', description: 'Non-functional, salvage value only',          multiplier_pct: 15,  sort_order: 6 },
];

// ── Silver Rates ──────────────────────────────────────────────────────────────

// GET /api/pricing/silver-rates
router.get('/silver-rates', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('silver_rates')
    .select('*')
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('purity_pct', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  // Auto-seed if tenant has no silver rates yet
  if (!data || data.length === 0) {
    const seedRows = SILVER_SEED.map(s => ({ ...s, tenant_id: req.tenantId }));
    const { data: seeded, error: seedErr } = await supabaseAdmin
      .from('silver_rates')
      .insert(seedRows)
      .select();
    if (seedErr) return res.status(400).json({ error: seedErr.message });
    return res.json(seeded);
  }

  res.json(data);
});

// PUT /api/pricing/silver-rates/bulk — Bulk upsert + log history
router.put('/silver-rates/bulk', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can update silver rates' });
  }

  const { rates } = req.body;
  if (!Array.isArray(rates) || rates.length === 0) {
    return res.status(400).json({ error: 'rates must be a non-empty array' });
  }

  const VALID_MARKS = ['999', '958', '925', '900', '835', '800'];
  for (const r of rates) {
    if (!VALID_MARKS.includes(r.purity_mark)) {
      return res.status(400).json({ error: `Invalid purity_mark: ${r.purity_mark}` });
    }
    if (r.rate_per_gram === undefined || Number(r.rate_per_gram) < 0) {
      return res.status(400).json({ error: `rate_per_gram must be >= 0 for ${r.purity_mark}` });
    }
  }

  // Fetch current rates for history diff
  const { data: current } = await supabaseAdmin
    .from('silver_rates')
    .select('purity_mark, rate_per_gram')
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null);

  const currentMap = {};
  (current || []).forEach(r => { currentMap[r.purity_mark] = r.rate_per_gram; });

  // Upsert rates
  const upsertRows = rates.map(r => ({
    tenant_id: req.tenantId,
    purity_mark: r.purity_mark,
    purity_pct: SILVER_SEED.find(s => s.purity_mark === r.purity_mark)?.purity_pct,
    common_name: SILVER_SEED.find(s => s.purity_mark === r.purity_mark)?.common_name,
    rate_per_gram: r.rate_per_gram,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await supabaseAdmin
    .from('silver_rates')
    .upsert(upsertRows, { onConflict: 'tenant_id,purity_mark' });

  if (upsertErr) return res.status(400).json({ error: upsertErr.message });

  // Log history for changed rows only
  const historyRows = rates
    .filter(r => String(currentMap[r.purity_mark]) !== String(r.rate_per_gram))
    .map(r => ({
      tenant_id: req.tenantId,
      purity_mark: r.purity_mark,
      old_rate: currentMap[r.purity_mark] ?? null,
      new_rate: r.rate_per_gram,
      changed_by: req.userId,
    }));

  if (historyRows.length > 0) {
    await supabaseAdmin.from('silver_rate_history').insert(historyRows);
  }

  logTenantAudit(req, { action: 'SILVER_RATES_UPDATED', category: 'SETTINGS', description: 'Updated silver rates' });
  res.json({ success: true, updated: rates.length });
});

// GET /api/pricing/silver-rates/history — Paginated (OWNER only)
router.get('/silver-rates/history', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the owner can view rate history' });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { from_date, to_date } = req.query;

  let query = supabaseAdmin
    .from('silver_rate_history')
    .select('*, changed_by_user:tenant_users(full_name)', { count: 'exact' })
    .eq('tenant_id', req.tenantId);
  if (from_date) query = query.gte('changed_at', from_date);
  if (to_date) query = query.lte('changed_at', `${to_date}T23:59:59.999Z`);
  const { data, error, count } = await query
    .order('changed_at', { ascending: false })
    .range(from, to);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ data: data || [], total: count || 0, page, limit });
});

// ── Item Conditions ───────────────────────────────────────────────────────────

// GET /api/pricing/item-conditions — auto-seeds defaults on first call
router.get('/item-conditions', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('item_conditions')
    .select('*')
    .eq('tenant_id', req.tenantId)
    .order('sort_order');

  if (error) return res.status(400).json({ error: error.message });

  if (!data || data.length === 0) {
    const seedRows = CONDITION_SEED.map(c => ({ ...c, tenant_id: req.tenantId }));
    const { data: seeded, error: seedErr } = await supabaseAdmin
      .from('item_conditions')
      .insert(seedRows)
      .select()
      .order('sort_order');
    if (seedErr) return res.status(400).json({ error: seedErr.message });
    return res.json(seeded);
  }

  res.json(data);
});

// PUT /api/pricing/item-conditions — Bulk upsert all 6 conditions
router.put('/item-conditions', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can update item conditions' });
  }

  const { conditions } = req.body;
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return res.status(400).json({ error: 'conditions must be a non-empty array' });
  }

  const VALID_NAMES = CONDITION_SEED.map(c => c.condition_name);
  for (const c of conditions) {
    if (!VALID_NAMES.includes(c.condition_name)) {
      return res.status(400).json({ error: `Invalid condition_name: ${c.condition_name}` });
    }
    if (c.multiplier_pct === undefined || Number(c.multiplier_pct) < 0 || Number(c.multiplier_pct) > 100) {
      return res.status(400).json({ error: `multiplier_pct must be 0–100 for ${c.condition_name}` });
    }
  }

  const upsertRows = conditions.map(c => ({
    tenant_id: req.tenantId,
    condition_name: c.condition_name,
    description: CONDITION_SEED.find(s => s.condition_name === c.condition_name)?.description,
    multiplier_pct: c.multiplier_pct,
    is_active: c.is_active ?? true,
    sort_order: CONDITION_SEED.findIndex(s => s.condition_name === c.condition_name) + 1,
  }));

  const { error } = await supabaseAdmin
    .from('item_conditions')
    .upsert(upsertRows, { onConflict: 'tenant_id,condition_name' });

  if (error) return res.status(400).json({ error: error.message });

  logTenantAudit(req, { action: 'CONDITIONS_UPDATED', category: 'SETTINGS', description: 'Updated item conditions' });
  res.json({ success: true });
});

module.exports = router;
