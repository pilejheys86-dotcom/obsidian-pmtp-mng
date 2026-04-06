# Pricing Control Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `/admin/pricing` page with 4 submodules (Gold Prices, Silver Prices, Item Conditions, Pawning Terms) that centralises all tenant pricing configuration, replacing the SettingsPage Loan Settings tab.

**Architecture:** New `PricingPage.jsx` using the same left-sidebar nav pattern as `SettingsPage`. Backend adds a `server/routes/pricing.js` route (silver rates + item conditions) and extends `server/routes/loanSettings.js` (bulk gold save + history). Four new Supabase tables store silver rates, item conditions, and price history for gold and silver.

**Tech Stack:** React 18, Express.js, Supabase (PostgreSQL), TailwindCSS 4, Jest + Supertest (backend tests)

**Spec:** `docs/superpowers/specs/2026-04-01-pricing-control-panel-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `sql/017_pricing_control_panel.sql` | 4 new tables + RLS policies |
| Modify | `server/routes/loanSettings.js` | Add `PUT /gold-rates/bulk` + `GET /gold-rates/history` |
| Create | `server/routes/pricing.js` | Silver rates + item conditions endpoints |
| Modify | `server/index.js` | Register `/api/pricing` route |
| Create | `server/__tests__/pricing.test.js` | Backend tests for all new endpoints |
| Modify | `src/lib/api.js` | Add `pricingApi` module |
| Modify | `src/config/navigation.js` | Add Pricing item to admin + manager nav |
| Modify | `src/App.jsx` | Add `/admin/pricing` route case |
| Modify | `src/pages/owner/index.js` | Export PricingPage |
| Modify | `src/pages/index.js` | Re-export PricingPage |
| Modify | `src/pages/owner/SettingsPage.jsx` | Remove Loan Settings tab |
| Create | `src/pages/owner/PricingPage.jsx` | Full page with left-nav + 4 panels |

---

## Task 1: Database Migration

**Files:**
- Create: `sql/017_pricing_control_panel.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- sql/017_pricing_control_panel.sql
-- Pricing Control Panel: gold history, silver rates, silver history, item conditions

-- ── 1. Gold Rate History ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gold_rate_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  karat       text        NOT NULL,          -- '24K', '22K', '21K', '18K', '14K', '10K'
  old_rate    numeric(12,4),
  new_rate    numeric(12,4) NOT NULL,
  changed_by  uuid        REFERENCES tenant_users(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gold_rate_history_tenant_idx ON gold_rate_history(tenant_id, changed_at DESC);

ALTER TABLE gold_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read gold history"
  ON gold_rate_history FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant members insert gold history"
  ON gold_rate_history FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ── 2. Silver Rates ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silver_rates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purity_mark   text        NOT NULL,        -- '999', '958', '925', '900', '835', '800'
  purity_pct    numeric(5,2) NOT NULL,
  common_name   text,
  rate_per_gram numeric(12,4) NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE(tenant_id, purity_mark)
);

ALTER TABLE silver_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read silver rates"
  ON silver_rates FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant members write silver rates"
  ON silver_rates FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ── 3. Silver Rate History ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silver_rate_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purity_mark  text        NOT NULL,
  old_rate     numeric(12,4),
  new_rate     numeric(12,4) NOT NULL,
  changed_by   uuid        REFERENCES tenant_users(id) ON DELETE SET NULL,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS silver_rate_history_tenant_idx ON silver_rate_history(tenant_id, changed_at DESC);

ALTER TABLE silver_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read silver history"
  ON silver_rate_history FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant members insert silver history"
  ON silver_rate_history FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ── 4. Item Conditions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_conditions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  condition_name  text        NOT NULL,
  description     text,
  multiplier_pct  numeric(5,2) NOT NULL DEFAULT 100,
  is_active       boolean     NOT NULL DEFAULT true,
  sort_order      int         NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, condition_name)
);

ALTER TABLE item_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read conditions"
  ON item_conditions FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant members write conditions"
  ON item_conditions FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());
```

- [ ] **Step 2: Run the migration against your Supabase project**

In the Supabase dashboard → SQL Editor, paste and run the contents of `sql/017_pricing_control_panel.sql`.

Verify: all 4 tables appear in the Table Editor with RLS enabled.

- [ ] **Step 3: Commit**

```bash
git add sql/017_pricing_control_panel.sql
git commit -m "feat(db): add pricing control panel tables (gold/silver history, silver rates, item conditions)"
```

---

## Task 2: Backend — Extend loanSettings.js

**Files:**
- Modify: `server/routes/loanSettings.js`

- [ ] **Step 1: Add bulk gold rates PUT and history GET routes**

Open `server/routes/loanSettings.js`. After the existing `PUT /gold-rates` route (around line 58), add:

```js
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

  const { data, error, count } = await supabaseAdmin
    .from('gold_rate_history')
    .select('*, changed_by_user:tenant_users(full_name)', { count: 'exact' })
    .eq('tenant_id', req.tenantId)
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
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/loanSettings.js
git commit -m "feat(api): add bulk gold rates save and gold rate history endpoints"
```

---

## Task 3: Backend — New pricing.js Route

**Files:**
- Create: `server/routes/pricing.js`

- [ ] **Step 1: Create the pricing route file**

```js
// server/routes/pricing.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');

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

  const { data, error, count } = await supabaseAdmin
    .from('silver_rate_history')
    .select('*, changed_by_user:tenant_users(full_name)', { count: 'exact' })
    .eq('tenant_id', req.tenantId)
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

  res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/pricing.js
git commit -m "feat(api): add pricing routes for silver rates and item conditions"
```

---

## Task 4: Backend — Register Pricing Route

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add require and mount**

In `server/index.js`, add after the `loanSettingRoutes` require (around line 28):

```js
const pricingRoutes = require('./routes/pricing');
```

Then after line 100 (`app.use('/api/loan-settings', auth, tenantScope, loanSettingRoutes);`), add:

```js
app.use('/api/pricing', auth, tenantScope, pricingRoutes);
```

- [ ] **Step 2: Verify server starts**

```bash
cd server && node index.js
```
Expected: `Server running on port 5000` with no errors.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat(server): register /api/pricing route"
```

---

## Task 5: Backend Tests — pricing.test.js

**Files:**
- Create: `server/__tests__/pricing.test.js`

- [ ] **Step 1: Write the test file**

```js
// server/__tests__/pricing.test.js
jest.mock('../config/db', () => require('./helpers/supabaseMock'));

const request = require('supertest');
const app = require('../index');
const mock = require('./helpers/supabaseMock');
const { authenticateAs } = require('./helpers/auth');
const fixtures = require('./helpers/fixtures');

beforeEach(() => mock.resetMocks());

// ── Silver Rates ─────────────────────────────────────────────────────────────

describe('GET /api/pricing/silver-rates', () => {
  test('returns silver rates for tenant', async () => {
    authenticateAs(fixtures.ownerProfile());
    const rates = [
      { id: fixtures.uuid(), tenant_id: fixtures.uuid(), purity_mark: '925', purity_pct: 92.5, common_name: 'Sterling Silver', rate_per_gram: 45.00 },
    ];
    mock.mockQueryResponse('silver_rates', { data: rates, error: null });

    const res = await request(app)
      .get('/api/pricing/silver-rates')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('MANAGER can read silver rates', async () => {
    authenticateAs(fixtures.managerProfile());
    mock.mockQueryResponse('silver_rates', { data: [], error: null });
    // empty array triggers seed path; seed insert also returns empty in mock
    mock.mockQueryResponse('silver_rates', { data: [], error: null });

    const res = await request(app)
      .get('/api/pricing/silver-rates')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
  });
});

describe('PUT /api/pricing/silver-rates/bulk', () => {
  test('OWNER can bulk update silver rates', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockQueryResponse('silver_rates', { data: [], error: null });
    mock.mockQueryResponse('silver_rates', { data: null, error: null }); // upsert
    mock.mockQueryResponse('silver_rate_history', { data: null, error: null });

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '925', rate_per_gram: 48.50 }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('MANAGER can bulk update silver rates', async () => {
    authenticateAs(fixtures.managerProfile());
    mock.mockQueryResponse('silver_rates', { data: [], error: null });
    mock.mockQueryResponse('silver_rates', { data: null, error: null });
    mock.mockQueryResponse('silver_rate_history', { data: null, error: null });

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '999', rate_per_gram: 55.00 }] });

    expect(res.status).toBe(200);
  });

  test('CASHIER cannot update silver rates', async () => {
    authenticateAs({ ...fixtures.clerkProfile(), role: 'CASHIER' });

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '925', rate_per_gram: 48.50 }] });

    expect(res.status).toBe(403);
  });

  test('rejects invalid purity mark', async () => {
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '999X', rate_per_gram: 48.50 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid purity_mark/);
  });

  test('rejects negative rate_per_gram', async () => {
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '925', rate_per_gram: -5 }] });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/pricing/silver-rates/history', () => {
  test('OWNER can view history', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockQueryResponse('silver_rate_history', {
      data: [{ id: fixtures.uuid(), purity_mark: '925', old_rate: 44.00, new_rate: 48.50, changed_at: new Date().toISOString() }],
      error: null,
      count: 1,
    });

    const res = await request(app)
      .get('/api/pricing/silver-rates/history')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  test('MANAGER cannot view history', async () => {
    authenticateAs(fixtures.managerProfile());

    const res = await request(app)
      .get('/api/pricing/silver-rates/history')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner/i);
  });
});

// ── Item Conditions ───────────────────────────────────────────────────────────

describe('GET /api/pricing/item-conditions', () => {
  test('returns seeded defaults when none exist', async () => {
    authenticateAs(fixtures.ownerProfile());
    // First query returns empty → triggers seed
    mock.mockQueryResponse('item_conditions', { data: [], error: null });

    const res = await request(app)
      .get('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token');

    // Seed insert returns mock response; status 200 regardless
    expect(res.status).toBe(200);
  });

  test('returns existing conditions', async () => {
    authenticateAs(fixtures.managerProfile());
    const conditions = [
      { id: fixtures.uuid(), condition_name: 'Excellent', multiplier_pct: 100, is_active: true, sort_order: 1 },
      { id: fixtures.uuid(), condition_name: 'Good',      multiplier_pct: 70,  is_active: true, sort_order: 3 },
    ];
    mock.mockQueryResponse('item_conditions', { data: conditions, error: null });

    const res = await request(app)
      .get('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('PUT /api/pricing/item-conditions', () => {
  test('OWNER can update conditions', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockQueryResponse('item_conditions', { data: null, error: null });

    const res = await request(app)
      .put('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token')
      .send({ conditions: [
        { condition_name: 'Excellent', multiplier_pct: 100, is_active: true },
        { condition_name: 'Good',      multiplier_pct: 72,  is_active: true },
      ]});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('rejects invalid condition name', async () => {
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token')
      .send({ conditions: [{ condition_name: 'Mint', multiplier_pct: 100, is_active: true }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid condition_name/);
  });

  test('rejects multiplier_pct > 100', async () => {
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token')
      .send({ conditions: [{ condition_name: 'Excellent', multiplier_pct: 110, is_active: true }] });

    expect(res.status).toBe(400);
  });

  test('CASHIER cannot update conditions', async () => {
    authenticateAs({ ...fixtures.clerkProfile(), role: 'CASHIER' });

    const res = await request(app)
      .put('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token')
      .send({ conditions: [{ condition_name: 'Good', multiplier_pct: 70, is_active: true }] });

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd server && npx jest __tests__/pricing.test.js --verbose
```
Expected: All tests pass.

- [ ] **Step 3: Also run the gold rates test to confirm no regressions**

```bash
npx jest __tests__/settings-appraisal.test.js --verbose
```
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/pricing.test.js
git commit -m "test(pricing): add backend tests for silver rates and item conditions"
```

---

## Task 6: Frontend — pricingApi Module

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add pricingApi at the end of api.js**

```js
// ── Pricing ───────────────────────────────────────────────────────────
export const pricingApi = {
  // Gold
  getGoldRates: () => apiFetch('/loan-settings/gold-rates'),
  updateGoldRates: (rates) =>
    apiFetch('/loan-settings/gold-rates/bulk', { method: 'PUT', body: JSON.stringify({ rates }) }),
  getGoldHistory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/loan-settings/gold-rates/history?${qs}`);
  },
  // Silver
  getSilverRates: () => apiFetch('/pricing/silver-rates'),
  updateSilverRates: (rates) =>
    apiFetch('/pricing/silver-rates/bulk', { method: 'PUT', body: JSON.stringify({ rates }) }),
  getSilverHistory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/pricing/silver-rates/history?${qs}`);
  },
  // Item Conditions
  getItemConditions: () => apiFetch('/pricing/item-conditions'),
  updateItemConditions: (conditions) =>
    apiFetch('/pricing/item-conditions', { method: 'PUT', body: JSON.stringify({ conditions }) }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.js
git commit -m "feat(api): add pricingApi module for gold, silver, and item conditions"
```

---

## Task 7: Navigation, Routing, and Page Exports

**Files:**
- Modify: `src/config/navigation.js`
- Modify: `src/App.jsx`
- Modify: `src/pages/owner/index.js`
- Modify: `src/pages/index.js`

- [ ] **Step 1: Add Pricing nav item to adminNavigation and managerNavigation**

In `src/config/navigation.js`, in `adminNavigation`, find the `Main` category:

```js
{
  category: 'Main',
  items: [
    { icon: 'dashboard', label: 'Dashboard', path: '/admin' },
  ],
},
```

Change to:

```js
{
  category: 'Main',
  items: [
    { icon: 'dashboard', label: 'Dashboard', path: '/admin' },
    { icon: 'price_change', label: 'Pricing', path: '/admin/pricing', requiresKyc: true },
  ],
},
```

Apply the same change to `managerNavigation`'s `Main` category.

- [ ] **Step 2: Add route to App.jsx**

In `src/App.jsx`, find the import line:

```js
import {
  // ...
  AdminDash, ProfilePage, SettingsPage, ActiveLoans, Inventory,
  Appraisals, AuctionItems, Customers, Employee, InventoryAudit, OverdueItems, Reports,
  SubscriptionPage, KycPage,
```

Add `PricingPage` to the import list:

```js
  AdminDash, ProfilePage, SettingsPage, ActiveLoans, Inventory,
  Appraisals, AuctionItems, Customers, Employee, InventoryAudit, OverdueItems, Reports,
  SubscriptionPage, KycPage, PricingPage,
```

Then in the `renderPage` switch, after `case '/admin/settings':`:

```js
case '/admin/pricing':
  return <PricingPage />
```

- [ ] **Step 3: Export PricingPage from owner index**

In `src/pages/owner/index.js`, add:

```js
export { default as PricingPage } from './PricingPage'
```

- [ ] **Step 4: Re-export from pages index**

In `src/pages/index.js`, update the owner exports line:

```js
export { AdminDash, ProfilePage, SettingsPage, ActiveLoans, Inventory, Appraisals, AuctionItems, Customers, Employee, InventoryAudit, OverdueItems, Reports, SubscriptionPage, KycPage, PricingPage } from './owner'
```

- [ ] **Step 5: Commit**

```bash
git add src/config/navigation.js src/App.jsx src/pages/owner/index.js src/pages/index.js
git commit -m "feat(nav): add Pricing Control Panel route and nav entries"
```

---

## Task 8: SettingsPage — Remove Loan Settings Tab

**Files:**
- Modify: `src/pages/owner/SettingsPage.jsx`

- [ ] **Step 1: Remove the loan settings category from baseCategories**

Find:

```js
const baseCategories = [
  { icon: 'palette', label: 'Appearance', id: 'appearance' },
  { icon: 'notifications_active', label: 'Notifications', id: 'notifications' },
  { icon: 'security', label: 'Security', id: 'security' },
  { icon: 'account_balance', label: 'Loan Settings', id: 'loan' },
  { icon: 'backup', label: 'Backup & Data', id: 'backup' },
  { icon: 'integration_instructions', label: 'Integrations', id: 'integrations' },
];
```

Change to:

```js
const baseCategories = [
  { icon: 'palette', label: 'Appearance', id: 'appearance' },
  { icon: 'notifications_active', label: 'Notifications', id: 'notifications' },
  { icon: 'security', label: 'Security', id: 'security' },
  { icon: 'backup', label: 'Backup & Data', id: 'backup' },
  { icon: 'integration_instructions', label: 'Integrations', id: 'integrations' },
];
```

- [ ] **Step 2: Remove loan settings state and handlers**

Remove these lines:

```js
// Loan settings state
const [loanSettings, setLoanSettings] = useState({
  service_charge_pct: '',
  penalty_interest_rate: '',
  ltv_ratio: '',
});
const [loanLoading, setLoanLoading] = useState(false);
const [loanSaving, setLoanSaving] = useState(false);
const [loanMessage, setLoanMessage] = useState(null);
```

Remove the `useEffect` for loan settings (lines starting with `if (activeCategory === 'loan')`).

Remove the `handleLoanSettingsSave` function.

Remove the `handleLoanSettingsChange` function.

- [ ] **Step 3: Remove the Loan Settings JSX panel**

Remove the entire `{activeCategory === 'loan' && ( ... )}` block (the full JSX section for loan settings).

- [ ] **Step 4: Remove loanSettingsApi import**

Change the import at the top from:

```js
import { brandingApi, loanSettingsApi } from '../../lib/api';
```

to:

```js
import { brandingApi } from '../../lib/api';
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/owner/SettingsPage.jsx
git commit -m "refactor(settings): remove Loan Settings tab (moved to Pricing Control Panel)"
```

---

## Task 9: PricingPage — Shell and Left Nav

**Files:**
- Create: `src/pages/owner/PricingPage.jsx`

- [ ] **Step 1: Create the page shell**

```jsx
// src/pages/owner/PricingPage.jsx
import { useState } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const NAV_ITEMS = [
  { id: 'gold',       icon: 'workspace_premium', label: 'Gold Prices' },
  { id: 'silver',     icon: 'water_drop',        label: 'Silver Prices' },
  { id: 'conditions', icon: 'inventory',          label: 'Item Conditions' },
  { id: 'terms',      icon: 'gavel',             label: 'Pawning Terms' },
];

// ── Submodule panels (imported in later tasks) ─────────────────────────
// Placeholder panels — replaced in Tasks 10–13
const GoldPanel     = () => <div className="profile-section"><p className="text-neutral-500">Gold Prices — coming in Task 10</p></div>;
const SilverPanel   = () => <div className="profile-section"><p className="text-neutral-500">Silver Prices — coming in Task 11</p></div>;
const ConditionsPanel = () => <div className="profile-section"><p className="text-neutral-500">Item Conditions — coming in Task 12</p></div>;
const TermsPanel    = () => <div className="profile-section"><p className="text-neutral-500">Pawning Terms — coming in Task 13</p></div>;

const PANELS = { gold: GoldPanel, silver: SilverPanel, conditions: ConditionsPanel, terms: TermsPanel };

const PricingPage = () => {
  const { profile } = useAuth();
  const navigation = getNavigationByRole(profile?.role);
  const currentUser = buildSidebarUser(profile);
  const [currentPath, setCurrentPath] = useState('/admin/pricing');
  const [activeTab, setActiveTab] = useState('gold');

  const handleNavigate = (path) => setCurrentPath(path);
  const ActivePanel = PANELS[activeTab];

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath={currentPath} onNavigate={handleNavigate} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Left nav */}
              <div className="w-full lg:w-1/4 space-y-6">
                <nav className="profile-settings-nav">
                  {NAV_ITEMS.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`profile-settings-link ${activeTab === item.id ? 'active' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-xl">{item.icon}</span>
                        {item.label}
                      </div>
                      {activeTab === item.id && (
                        <span className="material-symbols-outlined text-lg">chevron_right</span>
                      )}
                    </button>
                  ))}
                </nav>
              </div>
              {/* Right panel */}
              <div className="w-full lg:w-3/4 space-y-6">
                <ActivePanel />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PricingPage;
```

- [ ] **Step 2: Verify page renders**

Start the dev server (`npm run dev`) and navigate to `/admin/pricing`. Confirm the left nav renders with 4 items and the placeholder panels appear.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/PricingPage.jsx
git commit -m "feat(pricing): add PricingPage shell with left-nav layout"
```

---

## Task 10: Gold Price Manager Panel

**Files:**
- Modify: `src/pages/owner/PricingPage.jsx`

- [ ] **Step 1: Replace the placeholder GoldPanel with the full implementation**

Replace the line `const GoldPanel = () => <div ...` with this full component (add above `const PANELS = ...`):

```jsx
const GOLD_KARATS = [
  { karat: '24K', purity: '99.9%', name: 'Fine Gold' },
  { karat: '22K', purity: '91.7%', name: 'Standard Gold' },
  { karat: '21K', purity: '87.5%', name: '–' },
  { karat: '18K', purity: '75.0%', name: 'Gold Jewelry' },
  { karat: '14K', purity: '58.3%', name: 'Common Jewelry' },
  { karat: '10K', purity: '41.7%', name: 'Low Karat' },
];

const LiveRatesModal = ({ url, title, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-2xl w-full max-w-4xl mx-4 flex flex-col" style={{ height: '80vh' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-neutral-700">
        <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{title}</span>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <iframe
        src={url}
        title={title}
        className="flex-1 w-full rounded-b-lg"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  </div>
);

const GoldPanel = () => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'OWNER';
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    pricingApi.getGoldRates().then(data => {
      const map = {};
      (data || []).forEach(r => { map[r.karat] = r.rate_per_gram; });
      setRates(map);
      if (data?.length) setLastUpdated(data[0].updated_at);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    setHistoryLoading(true);
    pricingApi.getGoldHistory({ page: historyPage, limit: 20 })
      .then(res => { setHistory(res.data || []); setHistoryTotal(res.total || 0); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [isOwner, historyPage]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = GOLD_KARATS.map(k => ({ karat: k.karat, rate_per_gram: parseFloat(rates[k.karat]) || 0 }));
      await pricingApi.updateGoldRates(payload);
      setMessage({ type: 'success', text: 'Gold rates saved successfully.' });
      setLastUpdated(new Date().toISOString());
      if (isOwner) {
        pricingApi.getGoldHistory({ page: 1, limit: 20 })
          .then(res => { setHistory(res.data || []); setHistoryTotal(res.total || 0); setHistoryPage(1); });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="profile-section flex items-center justify-center py-16">
      <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
    </div>
  );

  return (
    <div className="profile-section">
      {showModal && <LiveRatesModal url="https://goldpricez.com/ph/gram" title="Live Gold Prices (PHP)" onClose={() => setShowModal(false)} />}
      <div className="profile-section-header">
        <div className="profile-section-icon">
          <span className="material-symbols-outlined">workspace_premium</span>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Gold Price Manager</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Set your buying/appraising rate per gram for each karat purity</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-outline flex items-center gap-2 text-xs">
          <span className="material-symbols-outlined text-base">wifi</span>
          Live Rates
        </button>
      </div>

      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="bg-neutral-100 dark:bg-neutral-800">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Karat</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Purity</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Common Name</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Rate per Gram (₱)</th>
          </tr>
        </thead>
        <tbody>
          {GOLD_KARATS.map((k, i) => (
            <tr key={k.karat} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
              <td className="px-4 py-2.5 font-bold text-primary">{k.karat}</td>
              <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">{k.purity}</td>
              <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">{k.name}</td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-xs text-neutral-400">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rates[k.karat] || ''}
                    onChange={e => setRates(prev => ({ ...prev, [k.karat]: e.target.value }))}
                    className="profile-input w-28 text-right text-sm font-semibold"
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-3 mb-6">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Gold Rates'}
        </button>
        {lastUpdated && (
          <span className="text-xs text-neutral-400">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </span>
        )}
      </div>
      {message && (
        <p className={`text-sm mb-4 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}

      {isOwner && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Price History</p>
              <span className="text-xs bg-neutral-900 text-primary px-2 py-0.5 rounded-sm font-semibold">OWNER ONLY</span>
            </div>
            <button
              onClick={() => window.print()}
              className="btn-outline flex items-center gap-2 text-xs"
            >
              <span className="material-symbols-outlined text-base">download</span>
              Export PDF
            </button>
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-6">
              <span className="material-symbols-outlined animate-spin text-neutral-400">progress_activity</span>
            </div>
          ) : (
            <>
              <table className="w-full text-xs border-collapse print-history-table">
                <thead>
                  <tr className="bg-neutral-100 dark:bg-neutral-800">
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Date & Time</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Karat</th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Old Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">New Rate</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Updated By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-neutral-400">No history yet.</td></tr>
                  )}
                  {history.map((h, i) => (
                    <tr key={h.id} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
                      <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">{new Date(h.changed_at).toLocaleString()}</td>
                      <td className="px-3 py-2 font-bold text-primary">{h.karat}</td>
                      <td className="px-3 py-2 text-right text-neutral-400">₱ {Number(h.old_rate || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-right font-bold text-neutral-800 dark:text-neutral-100">₱ {Number(h.new_rate).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-neutral-500">{h.changed_by_user?.full_name || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {historyTotal > 20 && (
                <div className="flex justify-end gap-2 mt-3">
                  <button disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)} className="btn-outline text-xs px-3 py-1.5">Prev</button>
                  <span className="text-xs text-neutral-400 self-center">Page {historyPage}</span>
                  <button disabled={historyPage * 20 >= historyTotal} onClick={() => setHistoryPage(p => p + 1)} className="btn-outline text-xs px-3 py-1.5">Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
```

Also add the import at the top of `PricingPage.jsx` (after existing imports):

```jsx
import { useState, useEffect } from 'react';
import { pricingApi, loanSettingsApi } from '../../lib/api';
```

Replace the existing `import { useState } from 'react';` with the above.

- [ ] **Step 2: Remove placeholder GoldPanel and update PANELS map**

```jsx
const PANELS = { gold: GoldPanel, silver: SilverPanel, conditions: ConditionsPanel, terms: TermsPanel };
```
(No change needed — the map already references GoldPanel which you replaced above.)

- [ ] **Step 3: Verify in browser**

Navigate to `/admin/pricing`. Click "Gold Prices". Confirm the rate table loads, inputs are editable, "Live Rates" opens the modal, "Save Gold Rates" saves and shows the success message. As OWNER, confirm history table appears below.

- [ ] **Step 4: Commit**

```bash
git add src/pages/owner/PricingPage.jsx
git commit -m "feat(pricing): implement Gold Price Manager panel with history and live rates modal"
```

---

## Task 11: Silver Price Manager Panel

**Files:**
- Modify: `src/pages/owner/PricingPage.jsx`

- [ ] **Step 1: Replace placeholder SilverPanel**

Add these before `const PANELS = ...`:

```jsx
const SILVER_PURITIES = [
  { mark: '999', purity: '99.9%', name: 'Fine Silver' },
  { mark: '958', purity: '95.8%', name: 'Britannia Silver' },
  { mark: '925', purity: '92.5%', name: 'Sterling Silver' },
  { mark: '900', purity: '90.0%', name: 'Coin Silver' },
  { mark: '835', purity: '83.5%', name: 'Standard Silver' },
  { mark: '800', purity: '80.0%', name: 'Low Purity Silver' },
];

const SilverPanel = () => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'OWNER';
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    pricingApi.getSilverRates().then(data => {
      const map = {};
      (data || []).forEach(r => { map[r.purity_mark] = r.rate_per_gram; });
      setRates(map);
      if (data?.length) setLastUpdated(data[0].updated_at);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    setHistoryLoading(true);
    pricingApi.getSilverHistory({ page: historyPage, limit: 20 })
      .then(res => { setHistory(res.data || []); setHistoryTotal(res.total || 0); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [isOwner, historyPage]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = SILVER_PURITIES.map(s => ({ purity_mark: s.mark, rate_per_gram: parseFloat(rates[s.mark]) || 0 }));
      await pricingApi.updateSilverRates(payload);
      setMessage({ type: 'success', text: 'Silver rates saved successfully.' });
      setLastUpdated(new Date().toISOString());
      if (isOwner) {
        pricingApi.getSilverHistory({ page: 1, limit: 20 })
          .then(res => { setHistory(res.data || []); setHistoryTotal(res.total || 0); setHistoryPage(1); });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="profile-section flex items-center justify-center py-16">
      <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
    </div>
  );

  return (
    <div className="profile-section">
      {showModal && <LiveRatesModal url="https://goldpricez.com/ph/silver/gram" title="Live Silver Prices (PHP)" onClose={() => setShowModal(false)} />}
      <div className="profile-section-header">
        <div className="profile-section-icon">
          <span className="material-symbols-outlined">water_drop</span>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Silver Price Manager</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Set your buying/appraising rate per gram for each silver purity</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-outline flex items-center gap-2 text-xs">
          <span className="material-symbols-outlined text-base">wifi</span>
          Live Rates
        </button>
      </div>

      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="bg-neutral-100 dark:bg-neutral-800">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Purity Mark</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Purity %</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Common Name</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Rate per Gram (₱)</th>
          </tr>
        </thead>
        <tbody>
          {SILVER_PURITIES.map((s, i) => (
            <tr key={s.mark} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
              <td className="px-4 py-2.5 font-bold text-neutral-700 dark:text-neutral-200">{s.mark}</td>
              <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">{s.purity}</td>
              <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">{s.name}</td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-xs text-neutral-400">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rates[s.mark] || ''}
                    onChange={e => setRates(prev => ({ ...prev, [s.mark]: e.target.value }))}
                    className="profile-input w-28 text-right text-sm font-semibold"
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-3 mb-6">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Silver Rates'}
        </button>
        {lastUpdated && (
          <span className="text-xs text-neutral-400">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </span>
        )}
      </div>
      {message && (
        <p className={`text-sm mb-4 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}

      {isOwner && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Price History</p>
              <span className="text-xs bg-neutral-900 text-primary px-2 py-0.5 rounded-sm font-semibold">OWNER ONLY</span>
            </div>
            <button onClick={() => window.print()} className="btn-outline flex items-center gap-2 text-xs">
              <span className="material-symbols-outlined text-base">download</span>
              Export PDF
            </button>
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-6">
              <span className="material-symbols-outlined animate-spin text-neutral-400">progress_activity</span>
            </div>
          ) : (
            <>
              <table className="w-full text-xs border-collapse print-history-table">
                <thead>
                  <tr className="bg-neutral-100 dark:bg-neutral-800">
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Date & Time</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Purity</th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Old Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">New Rate</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Updated By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-neutral-400">No history yet.</td></tr>
                  )}
                  {history.map((h, i) => (
                    <tr key={h.id} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
                      <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">{new Date(h.changed_at).toLocaleString()}</td>
                      <td className="px-3 py-2 font-bold text-neutral-700 dark:text-neutral-200">{h.purity_mark}</td>
                      <td className="px-3 py-2 text-right text-neutral-400">₱ {Number(h.old_rate || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-right font-bold text-neutral-800 dark:text-neutral-100">₱ {Number(h.new_rate).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-neutral-500">{h.changed_by_user?.full_name || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {historyTotal > 20 && (
                <div className="flex justify-end gap-2 mt-3">
                  <button disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)} className="btn-outline text-xs px-3 py-1.5">Prev</button>
                  <span className="text-xs text-neutral-400 self-center">Page {historyPage}</span>
                  <button disabled={historyPage * 20 >= historyTotal} onClick={() => setHistoryPage(p => p + 1)} className="btn-outline text-xs px-3 py-1.5">Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify in browser**

Navigate to Pricing → Silver Prices. Confirm the table loads with 6 purity rows, rates are editable, save works, history visible to OWNER only.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/PricingPage.jsx
git commit -m "feat(pricing): implement Silver Price Manager panel with history and live rates modal"
```

---

## Task 12: Item Conditions Panel

**Files:**
- Modify: `src/pages/owner/PricingPage.jsx`

- [ ] **Step 1: Replace placeholder ConditionsPanel**

Add before `const PANELS = ...`:

```jsx
const ConditionsPanel = () => {
  const [conditions, setConditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    pricingApi.getItemConditions()
      .then(data => setConditions(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (name) => {
    setConditions(prev => prev.map(c => c.condition_name === name ? { ...c, is_active: !c.is_active } : c));
  };

  const handleMultiplier = (name, value) => {
    setConditions(prev => prev.map(c => c.condition_name === name ? { ...c, multiplier_pct: value } : c));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await pricingApi.updateItemConditions(conditions.map(c => ({
        condition_name: c.condition_name,
        multiplier_pct: parseFloat(c.multiplier_pct) || 0,
        is_active: c.is_active,
      })));
      setMessage({ type: 'success', text: 'Item conditions saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="profile-section flex items-center justify-center py-16">
      <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
    </div>
  );

  return (
    <div className="profile-section">
      <div className="profile-section-header">
        <div className="profile-section-icon">
          <span className="material-symbols-outlined">inventory</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Item Conditions</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Each active condition applies a multiplier to the appraised value</p>
        </div>
      </div>

      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="bg-neutral-100 dark:bg-neutral-800">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Active</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Condition</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Description</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Multiplier (%)</th>
          </tr>
        </thead>
        <tbody>
          {conditions.map((c, i) => (
            <tr key={c.condition_name} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''} ${!c.is_active ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2.5">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={c.is_active}
                    onChange={() => handleToggle(c.condition_name)}
                    className="toggle-checkbox"
                  />
                  <span className="toggle-slider"></span>
                </label>
              </td>
              <td className="px-4 py-2.5 font-bold text-neutral-800 dark:text-neutral-100">{c.condition_name}</td>
              <td className="px-4 py-2.5 text-xs text-neutral-500 dark:text-neutral-400">{c.description}</td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!c.is_active}
                    value={c.multiplier_pct || ''}
                    onChange={e => handleMultiplier(c.condition_name, e.target.value)}
                    className="profile-input w-20 text-right text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs text-neutral-400">%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {message && (
        <p className={`text-sm mb-3 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}
      <button onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : 'Save Conditions'}
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Verify in browser**

Navigate to Pricing → Item Conditions. Confirm 6 rows appear, toggles work, multiplier inputs respect active state, save shows success message.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/PricingPage.jsx
git commit -m "feat(pricing): implement Item Conditions panel"
```

---

## Task 13: Pawning Terms Panel

**Files:**
- Modify: `src/pages/owner/PricingPage.jsx`

- [ ] **Step 1: Replace placeholder TermsPanel**

Add `loanSettingsApi` to the import at the top of the file if not already present (it should be from Task 10).

Add before `const PANELS = ...`:

```jsx
const TermsPanel = () => {
  const [form, setForm] = useState({ penalty_interest_rate: '', service_charge_pct: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loanSettingsApi.get()
      .then(data => {
        if (data) {
          setForm({
            penalty_interest_rate: data.penalty_interest_rate ?? '',
            service_charge_pct: data.service_charge_pct ?? '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const penaltyAmt = form.penalty_interest_rate
    ? (10000 * (parseFloat(form.penalty_interest_rate) / 100)).toFixed(2)
    : null;

  const feeAmt = form.service_charge_pct
    ? Math.min(5, 10000 * (parseFloat(form.service_charge_pct) / 100)).toFixed(2)
    : null;

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await loanSettingsApi.update({
        penalty_interest_rate: form.penalty_interest_rate !== '' ? Number(form.penalty_interest_rate) : undefined,
        service_charge_pct: form.service_charge_pct !== '' ? Number(form.service_charge_pct) : undefined,
      });
      setMessage({ type: 'success', text: 'Pawning terms saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="profile-section flex items-center justify-center py-16">
      <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
    </div>
  );

  return (
    <div className="profile-section">
      <div className="profile-section-header">
        <div className="profile-section-icon">
          <span className="material-symbols-outlined">gavel</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Pawning Terms</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Define penalty and service fee rules for all pawn transactions</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Penalty Rate */}
        <div className="p-5 bg-neutral-50 dark:bg-neutral-800/50 rounded-sm border border-neutral-200 dark:border-neutral-700">
          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 mb-1">Late Payment Penalty</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">Applied as a percentage of the principal loan when a payment is overdue</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.penalty_interest_rate}
              onChange={e => setForm(prev => ({ ...prev, penalty_interest_rate: e.target.value }))}
              className="profile-input w-28 text-center text-lg font-bold"
              placeholder="0.00"
            />
            <span className="text-sm font-bold text-neutral-500">% of principal</span>
          </div>
          {penaltyAmt && (
            <p className="text-xs text-neutral-400 mt-2">
              Example: ₱ 10,000 principal → <strong className="text-neutral-700 dark:text-neutral-200">₱ {Number(penaltyAmt).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> penalty per overdue period
            </p>
          )}
        </div>

        {/* Service Fee */}
        <div className="p-5 bg-neutral-50 dark:bg-neutral-800/50 rounded-sm border border-neutral-200 dark:border-neutral-700">
          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 mb-1">Service Fee Charge</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">Deducted from the loan at disbursement. BSP-regulated: must not exceed PHP 5.00 or 1% of principal, whichever is lower.</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={form.service_charge_pct}
              onChange={e => setForm(prev => ({ ...prev, service_charge_pct: e.target.value }))}
              className="profile-input w-28 text-center text-lg font-bold"
              placeholder="0.00"
            />
            <span className="text-sm font-bold text-neutral-500">% of principal</span>
          </div>
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-sm">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              ⚠ BSP Cap: Actual fee = <strong>min(₱ 5.00, rate% × principal)</strong>. The system enforces this cap automatically at transaction time.
            </p>
          </div>
          {feeAmt && (
            <p className="text-xs text-neutral-400 mt-2">
              Example: ₱ 10,000 principal → fee = <strong className="text-neutral-700 dark:text-neutral-200">₱ {Number(feeAmt).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
            </p>
          )}
        </div>

        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
            {message.text}
          </p>
        )}
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Pawning Terms'}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify in browser**

Navigate to Pricing → Pawning Terms. Confirm values load from existing loan settings. Edit penalty and service fee, confirm live examples update, save shows success.

- [ ] **Step 3: Run full backend tests to confirm no regressions**

```bash
cd server && npx jest --verbose
```
Expected: All existing + new tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/owner/PricingPage.jsx
git commit -m "feat(pricing): implement Pawning Terms panel with BSP cap warning"
```

---

## Task 14: Final Wiring and Smoke Test

**Files:**
- No new files

- [ ] **Step 1: Run the full dev environment**

```bash
# Terminal 1
cd server && node index.js

# Terminal 2
npm run dev
```

- [ ] **Step 2: Smoke test as OWNER**

1. Log in as OWNER
2. Confirm "Pricing" appears in sidebar under Dashboard
3. Gold Prices: edit 24K rate, save → history row appears below
4. Silver Prices: edit 925 rate, save → history row appears below
5. Item Conditions: toggle "For Parts / Damaged" off, save → row stays greyed out on reload
6. Pawning Terms: change penalty to 4%, save → reload and confirm value persists
7. Settings page: confirm no Loan Settings tab

- [ ] **Step 3: Smoke test as MANAGER**

1. Log in as MANAGER
2. Confirm "Pricing" appears in sidebar
3. Gold Prices: can edit and save
4. History section: **does not** appear
5. Silver Prices: can edit and save
6. Item Conditions: can toggle and save
7. Pawning Terms: can edit and save

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat(pricing): Pricing Control Panel complete — gold, silver, conditions, pawning terms"
```
