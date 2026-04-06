const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { logTenantAudit } = require('../utils/auditLog');

// GET /api/loan-settings — Get tenant's loan settings
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('tenant_loan_settings')
    .select('*')
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .single();

  if (error) return res.status(404).json({ error: 'Loan settings not found. Run seed_tenant_defaults.' });
  res.json(data);
});

// PATCH /api/loan-settings — Update tenant's loan settings via stored procedure
router.patch('/', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the owner can update loan settings' });
  }

  const { data, error } = await supabaseAdmin.rpc('save_tenant_loan_settings', {
    p_tenant_id: req.tenantId,
    p_interest_rate: req.body.interest_rate ?? null,
    p_penalty_interest_rate: req.body.penalty_interest_rate ?? null,
    p_ltv_ratio: req.body.ltv_ratio ?? null,
    p_grace_period_days: req.body.grace_period_days ?? null,
    p_maturity_months: req.body.maturity_months ?? null,
    p_renewal_cooldown_days: req.body.renewal_cooldown_days ?? null,
    p_max_missed_payments: req.body.max_missed_payments ?? null,
    p_payment_cycle_days: req.body.payment_cycle_days ?? null,
    p_service_charge: req.body.service_charge ?? null,
    p_affidavit_fee: req.body.affidavit_fee ?? null,
    p_advance_interest_months: req.body.advance_interest_months ?? null,
  });

  if (error) return res.status(400).json({ error: error.message });
  if (!data.success) return res.status(422).json({ error: data.error });

  logTenantAudit(req, { action: 'LOAN_SETTINGS_UPDATED', category: 'SETTINGS', description: 'Updated loan settings' });
  res.json(data);
});

// GET /api/loan-settings/gold-rates — Get tenant's gold rates (latest per karat)
router.get('/gold-rates', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('gold_rates')
    .select('*')
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('effective_date', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  // Deduplicate: keep the latest rate per karat, convert INTEGER karat → '24K' text
  const latestByKarat = {};
  for (const row of (data || [])) {
    const key = row.karat;
    if (!latestByKarat[key]) latestByKarat[key] = row;
  }
  const result = Object.values(latestByKarat).map(r => ({
    ...r,
    karat: `${r.karat}K`,
  }));

  res.json(result);
});

// PUT /api/loan-settings/gold-rates — Upsert a gold rate via stored procedure
router.put('/gold-rates', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can update gold rates' });
  }

  const { karat, rate_per_gram } = req.body;

  if (!karat || !rate_per_gram) {
    return res.status(400).json({ error: 'karat and rate_per_gram are required' });
  }

  const { data, error } = await supabaseAdmin.rpc('save_gold_rate', {
    p_tenant_id: req.tenantId,
    p_karat: karat,
    p_rate_per_gram: rate_per_gram,
  });

  if (error) return res.status(400).json({ error: error.message });
  if (!data.success) return res.status(422).json({ error: data.error });

  res.json(data);
});

// PUT /api/loan-settings/gold-rates/bulk — Bulk upsert gold rates + log history
router.put('/gold-rates/bulk', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can update gold rates' });
  }

  const { rates } = req.body;
  if (!Array.isArray(rates) || rates.length === 0) {
    return res.status(400).json({ error: 'rates must be a non-empty array' });
  }

  const VALID_KARATS = ['24K', '22K', '21K', '18K', '14K', '10K'];
  for (const r of rates) {
    if (!VALID_KARATS.includes(r.karat)) {
      return res.status(400).json({ error: `Invalid karat: ${r.karat}` });
    }
    if (!r.rate_per_gram || Number(r.rate_per_gram) <= 0) {
      return res.status(400).json({ error: `rate_per_gram must be positive for ${r.karat}` });
    }
  }

  // Fetch current rates to compute old_rate for history
  const { data: currentRates } = await supabaseAdmin
    .from('gold_rates')
    .select('karat, rate_per_gram')
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null);

  const currentMap = {};
  (currentRates || []).forEach(r => { currentMap[r.karat] = r.rate_per_gram; });

  // Upsert each rate using existing save_gold_rate RPC
  for (const r of rates) {
    const { data, error } = await supabaseAdmin.rpc('save_gold_rate', {
      p_tenant_id: req.tenantId,
      p_karat: r.karat,
      p_rate_per_gram: r.rate_per_gram,
    });
    if (error || !data?.success) {
      return res.status(400).json({ error: error?.message || data?.error || 'Failed to save rate' });
    }
  }

  // Log history rows
  const historyRows = rates.map(r => ({
    tenant_id: req.tenantId,
    karat: r.karat,
    old_rate: currentMap[r.karat] ?? null,
    new_rate: r.rate_per_gram,
    changed_by: req.userId,
  }));
  await supabaseAdmin.from('gold_rate_history').insert(historyRows);

  logTenantAudit(req, { action: 'GOLD_RATES_UPDATED', category: 'SETTINGS', description: 'Updated gold rates' });
  res.json({ success: true, updated: rates.length });
});

// GET /api/loan-settings/gold-rates/history — Paginated gold rate history (OWNER only)
router.get('/gold-rates/history', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the owner can view rate history' });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { from_date, to_date } = req.query;

  let query = supabaseAdmin
    .from('gold_rate_history')
    .select('*, changed_by_user:tenant_users(full_name)', { count: 'exact' })
    .eq('tenant_id', req.tenantId);
  if (from_date) query = query.gte('changed_at', from_date);
  if (to_date) query = query.lte('changed_at', `${to_date}T23:59:59.999Z`);
  const { data, error, count } = await query
    .order('changed_at', { ascending: false })
    .range(from, to);

  if (error) return res.status(400).json({ error: error.message });

  res.json({
    data: data || [],
    total: count || 0,
    page,
    limit,
  });
});

module.exports = router;
