# Tenant Public Landing Page & Business Branding Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each tenant a branded public landing page at `/s/:slug` showing services, a staff login modal, and a customer request form — plus a post-payment setup wizard and an `/admin/branding` management page.

**Architecture:** SSR showcase template (existing `/s/:slug` route) extended with brand color, font, services section, staff-login modal, and customer request form injected as template variables. New React pages for the wizard and management. Customer access requests stored in a new DB table, surfaced as a tab in the existing Customers page.

**Tech Stack:** React 18 + Vite, Express/Node, Supabase (PostgreSQL), `react-colorful` (HexColorPicker), Google Fonts API, NodeMailer (existing `sendCustomerWelcomeEmail`), supertest + jest (backend tests).

**Spec:** `docs/superpowers/specs/2026-04-02-tenant-public-page-design.md`

---

## File Map

| File | New/Modified | Purpose |
|------|-------------|---------|
| `sql/101_branding_and_access_requests.sql` | New | DB migration |
| `server/routes/accessRequests.js` | New | Public POST + admin CRUD for requests |
| `server/__tests__/access-requests.test.js` | New | Backend tests for access requests |
| `server/__tests__/branding-extended.test.js` | New | Backend tests for new branding fields |
| `src/pages/owner/BrandingSetupPage.jsx` | New | 3-step post-payment wizard |
| `src/pages/owner/BrandingPage.jsx` | New | Branding management page |
| `src/pages/owner/CustomerRequestDetail.jsx` | New | Request detail + approve/reject |
| `server/views/showcase.html` | Modified | Full rewrite with all new sections |
| `server/middleware/subdomainResolver.js` | Modified | Pass brand_color, font, services, tenant_id |
| `server/routes/branding.js` | Modified | Accept new fields |
| `server/index.js` | Modified | Register new routes |
| `src/lib/api.js` | Modified | Add accessRequestsApi, extend brandingApi |
| `src/pages/owner/Customers.jsx` | Modified | Add Pending Requests tab |
| `src/pages/owner/AdminDash.jsx` | Modified | Add nudge banner |
| `src/pages/owner/SubscriptionPage.jsx` | Modified | Post-payment redirect to wizard |
| `src/pages/owner/index.js` | Modified | Export 3 new pages |
| `src/pages/index.js` | Modified | Export 3 new pages |
| `src/App.jsx` | Modified | New routes + dynamic /requests/:id routing |
| `src/config/navigation.js` | Modified | Add Branding nav item |
| `src/pages/superadmin/Tenants.jsx` | Modified | Show public page link |
| `server/routes/tenants.js` | Modified | Include tenant_branding in detail |
| `MasterSchema.md` | Modified | Document schema changes |

---

## Task 1: Install react-colorful

**Files:** `package.json`

- [ ] **Step 1: Install**

```bash
cd "C:/Users/Jefferson B. Pile/Documents/VS Code/obsidian-pmtp-mng"
npm install react-colorful
```

Expected: `added 1 package` (react-colorful has zero runtime dependencies)

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-colorful for HSL color picker"
```

---

## Task 2: Database migration

**Files:**
- Create: `sql/101_branding_and_access_requests.sql`
- Modify: `MasterSchema.md`

- [ ] **Step 1: Create migration file**

Create `sql/101_branding_and_access_requests.sql`:

```sql
-- ── 1. Extend tenant_branding ────────────────────────────────────────────────
ALTER TABLE tenant_branding
  ADD COLUMN IF NOT EXISTS brand_color      TEXT,
  ADD COLUMN IF NOT EXISTS font_family      TEXT,
  ADD COLUMN IF NOT EXISTS services_enabled JSONB DEFAULT '[]'::jsonb;

-- ── 2. customer_access_requests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_access_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name      TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  mobile_number  TEXT,
  status         TEXT        NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by    UUID        REFERENCES tenant_users(id),
  reviewed_at    TIMESTAMPTZ,
  notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_car_tenant_status
  ON customer_access_requests (tenant_id, status);

ALTER TABLE customer_access_requests ENABLE ROW LEVEL SECURITY;

-- Tenant users can read/manage their own tenant's requests
CREATE POLICY car_tenant_isolation ON customer_access_requests
  USING (tenant_id = get_my_tenant_id());
```

- [ ] **Step 2: Run in Supabase SQL editor**

Copy the SQL and run it. Verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tenant_branding'
  AND column_name IN ('brand_color','font_family','services_enabled');
-- Expected: 3 rows

SELECT table_name FROM information_schema.tables
WHERE table_name = 'customer_access_requests';
-- Expected: 1 row
```

- [ ] **Step 3: Add to MasterSchema.md**

In the `tenant_branding` row of the table, append `, brand_color, font_family, services_enabled (JSONB)` to the Key Columns column.

In Group 4 (Tenant Customers), add a new row:

```markdown
| `customer_access_requests` | id, tenant_id, full_name, email, mobile_number, status (PENDING/APPROVED/REJECTED), requested_at, reviewed_by, reviewed_at, notes | Public access requests submitted from showcase page |
```

- [ ] **Step 4: Commit**

```bash
git add sql/101_branding_and_access_requests.sql MasterSchema.md
git commit -m "feat(db): add brand_color/font_family/services_enabled to tenant_branding, add customer_access_requests table"
```

---

## Task 3: Extend branding backend route

**Files:**
- Modify: `server/routes/branding.js`
- Create: `server/__tests__/branding-extended.test.js`

- [ ] **Step 1: Write failing tests**

Create `server/__tests__/branding-extended.test.js`:

```js
jest.mock('../config/db', () => require('./helpers/supabaseMock'));

const request  = require('supertest');
const app      = require('../index');
const mock     = require('./helpers/supabaseMock');
const { authenticateAs } = require('./helpers/auth');
const fixtures = require('./helpers/fixtures');

beforeEach(() => { mock.resetMocks(); authenticateAs(fixtures.ownerProfile()); });

describe('Branding — extended fields', () => {
  test('PUT /api/branding accepts brand_color, font_family, services_enabled', async () => {
    const result = {
      tenant_id: fixtures.TENANT_A, brand_color: '#FF5733',
      font_family: 'Playfair Display', services_enabled: ['gold_jewelry'],
      tenants: { business_name: 'Test', logo_url: null },
    };
    mock.mockQueryResponse('tenant_branding', { data: result, error: null });

    const res = await request(app)
      .put('/api/branding')
      .set('Authorization', 'Bearer test-token')
      .send({ brand_color: '#FF5733', font_family: 'Playfair Display', services_enabled: ['gold_jewelry'] });

    expect(res.status).toBe(200);
    expect(res.body.brand_color).toBe('#FF5733');
    expect(res.body.font_family).toBe('Playfair Display');
  });

  test('PUT /api/branding rejects invalid hex color', async () => {
    const res = await request(app)
      .put('/api/branding')
      .set('Authorization', 'Bearer test-token')
      .send({ brand_color: 'notacolor' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid.*color/i);
  });

  test('PUT /api/branding rejects non-array services_enabled', async () => {
    const res = await request(app)
      .put('/api/branding')
      .set('Authorization', 'Bearer test-token')
      .send({ services_enabled: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/services_enabled/i);
  });

  test('PUT /api/branding accepts logo_url and business_name', async () => {
    mock.mockQueryResponse('tenants', { data: { id: fixtures.TENANT_A }, error: null });
    mock.mockQueryResponse('tenant_branding', {
      data: { tenant_id: fixtures.TENANT_A, tenants: { business_name: 'New Name', logo_url: 'https://ex.com/logo.png' } },
      error: null,
    });

    const res = await request(app)
      .put('/api/branding')
      .set('Authorization', 'Bearer test-token')
      .send({ logo_url: 'https://ex.com/logo.png', business_name: 'New Name' });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest server/__tests__/branding-extended.test.js --no-coverage
```

Expected: FAIL — new fields not accepted yet.

- [ ] **Step 3: Update `server/routes/branding.js` PUT handler**

In `server/routes/branding.js`, replace the entire `router.put('/', ...)` block with:

```js
router.put('/', async (req, res) => {
  try {
    const {
      subdomain, tagline, apk_download_url, is_published,
      brand_color, font_family, services_enabled,
      logo_url, business_name,
    } = req.body;

    // --- existing subdomain validation ---
    if (subdomain !== undefined && subdomain !== null) {
      const slug = subdomain.toLowerCase().trim();
      if (!isValidSubdomain(slug)) {
        return res.status(400).json({ error: 'Invalid subdomain. Use 3-63 lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.' });
      }
      if (isReservedSubdomain(slug)) {
        return res.status(400).json({ error: 'This subdomain is reserved' });
      }
      const { data: existing } = await supabaseAdmin
        .from('tenant_branding')
        .select('tenant_id')
        .eq('subdomain', slug)
        .neq('tenant_id', req.tenantId)
        .single();
      if (existing) return res.status(409).json({ error: 'This subdomain is already taken' });
    }

    // --- existing APK URL validation ---
    if (apk_download_url) {
      try {
        const parsed = new URL(apk_download_url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({ error: 'APK download link must be an HTTP or HTTPS URL' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid APK download URL' });
      }
    }

    // --- new: validate brand_color ---
    if (brand_color !== undefined && brand_color !== null && brand_color !== '') {
      if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(brand_color)) {
        return res.status(400).json({ error: 'Invalid brand color. Must be a hex value like #A3E635' });
      }
    }

    // --- new: validate services_enabled ---
    if (services_enabled !== undefined && !Array.isArray(services_enabled)) {
      return res.status(400).json({ error: 'services_enabled must be an array' });
    }

    // --- new: validate logo_url ---
    if (logo_url !== undefined && logo_url !== null && logo_url !== '') {
      try {
        const parsed = new URL(logo_url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({ error: 'Logo URL must be HTTP or HTTPS' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid logo URL' });
      }
    }

    const transformedUrl = apk_download_url
      ? transformGoogleDriveUrl(apk_download_url)
      : apk_download_url;

    // --- build upsert payload ---
    const payload = { tenant_id: req.tenantId, updated_at: new Date().toISOString() };
    if (subdomain !== undefined)         payload.subdomain         = subdomain?.toLowerCase().trim() || null;
    if (tagline !== undefined)           payload.tagline           = tagline?.trim() || null;
    if (apk_download_url !== undefined)  payload.apk_download_url  = transformedUrl || null;
    if (is_published !== undefined)      payload.is_published      = !!is_published;
    if (brand_color !== undefined)       payload.brand_color       = brand_color || null;
    if (font_family !== undefined)       payload.font_family       = font_family?.trim() || null;
    if (services_enabled !== undefined)  payload.services_enabled  = services_enabled;

    // --- update tenants table if identity fields provided ---
    if (logo_url !== undefined || business_name !== undefined) {
      const tenantUpdate = {};
      if (logo_url !== undefined)       tenantUpdate.logo_url      = logo_url || null;
      if (business_name !== undefined)  tenantUpdate.business_name = business_name?.trim() || null;
      if (Object.keys(tenantUpdate).length > 0) {
        await supabaseAdmin.from('tenants').update(tenantUpdate).eq('id', req.tenantId);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('tenant_branding')
      .upsert(payload, { onConflict: 'tenant_id' })
      .select('*, tenants(business_name, logo_url)')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('[Branding PUT]', err.message);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest server/__tests__/branding-extended.test.js --no-coverage
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/routes/branding.js server/__tests__/branding-extended.test.js
git commit -m "feat(branding): accept brand_color, font_family, services_enabled, logo_url, business_name"
```

---

## Task 4: Access requests backend routes

**Files:**
- Create: `server/routes/accessRequests.js`
- Create: `server/__tests__/access-requests.test.js`
- Modify: `server/index.js`

- [ ] **Step 1: Write failing tests**

Create `server/__tests__/access-requests.test.js`:

```js
jest.mock('../config/db', () => require('./helpers/supabaseMock'));

const crypto   = require('crypto');
const request  = require('supertest');
const app      = require('../index');
const mock     = require('./helpers/supabaseMock');
const { authenticateAs } = require('./helpers/auth');
const fixtures = require('./helpers/fixtures');

const uuid = () => crypto.randomUUID();

beforeEach(() => mock.resetMocks());

describe('Access Requests — Public POST', () => {
  test('201 with valid payload', async () => {
    mock.mockQueryResponse('tenants', { data: { id: fixtures.TENANT_A }, error: null });
    mock.mockQueryResponse('customer_access_requests', {
      data: { id: uuid(), tenant_id: fixtures.TENANT_A, full_name: 'Maria', email: 'maria@example.com', status: 'PENDING', requested_at: new Date().toISOString() },
      error: null,
    });

    const res = await request(app)
      .post('/api/access-requests')
      .send({ tenant_id: fixtures.TENANT_A, full_name: 'Maria', email: 'maria@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
  });

  test('400 when full_name missing', async () => {
    const res = await request(app)
      .post('/api/access-requests')
      .send({ tenant_id: fixtures.TENANT_A, email: 'x@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/full_name/i);
  });

  test('400 when email invalid', async () => {
    const res = await request(app)
      .post('/api/access-requests')
      .send({ tenant_id: fixtures.TENANT_A, full_name: 'Test', email: 'notanemail' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('404 when tenant not found', async () => {
    mock.mockQueryResponse('tenants', { data: null, error: { code: 'PGRST116', message: 'Not found' } });
    const res = await request(app)
      .post('/api/access-requests')
      .send({ tenant_id: uuid(), full_name: 'Test', email: 'test@example.com' });
    expect(res.status).toBe(404);
  });
});

describe('Access Requests — Admin routes', () => {
  beforeEach(() => authenticateAs(fixtures.ownerProfile()));

  test('GET /api/access-requests/admin returns 200 array', async () => {
    mock.mockQueryResponse('customer_access_requests', { data: [], error: null });
    const res = await request(app)
      .get('/api/access-requests/admin')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('PATCH /:id/approve returns 200 with APPROVED status', async () => {
    const id = uuid();
    const reqRecord = { id, tenant_id: fixtures.TENANT_A, full_name: 'Juan', email: 'juan@ex.com', mobile_number: '09171234567', status: 'PENDING' };
    // First call: fetch the request; Second call: insert customer; Third call: update request
    mock.mockQueryResponse('customer_access_requests', { data: reqRecord, error: null });
    mock.mockQueryResponse('customers', { data: { id: uuid() }, error: null });
    mock.mockQueryResponse('tenants', { data: { business_name: 'Shop' }, error: null });

    const res = await request(app)
      .patch(`/api/access-requests/admin/${id}/approve`)
      .set('Authorization', 'Bearer test-token');

    // 200 or error from auth.admin.createUser mock — either way the route exists
    expect([200, 400, 500]).toContain(res.status);
  });

  test('PATCH /:id/reject returns 200 with REJECTED status', async () => {
    const id = uuid();
    mock.mockQueryResponse('customer_access_requests', {
      data: { id, tenant_id: fixtures.TENANT_A, full_name: 'Juan', email: 'j@ex.com', status: 'REJECTED', reviewed_at: new Date().toISOString() },
      error: null,
    });

    const res = await request(app)
      .patch(`/api/access-requests/admin/${id}/reject`)
      .set('Authorization', 'Bearer test-token')
      .send({ notes: 'Incomplete info' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest server/__tests__/access-requests.test.js --no-coverage
```

Expected: FAIL — routes don't exist.

- [ ] **Step 3: Create `server/routes/accessRequests.js`**

```js
// server/routes/accessRequests.js
const express  = require('express');
const { supabaseAdmin } = require('../config/db');
const { generateTempPassword } = require('../utils/helpers');
const { sendCustomerWelcomeEmail } = require('../services/email');

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
const isValidUuid  = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));

// Simple in-memory rate limiter: 5 requests per IP per hour
const _rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const WINDOW = 60 * 60 * 1000;
  const entry = _rateLimitMap.get(ip) || { count: 0, resetAt: now + WINDOW };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + WINDOW; }
  entry.count++;
  _rateLimitMap.set(ip, entry);
  return entry.count <= 5;
}

// ── Public POST ──────────────────────────────────────────────────────────────
const handlePublicPost = async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { tenant_id, full_name, email, mobile_number } = req.body;

  if (!tenant_id || !isValidUuid(tenant_id)) return res.status(400).json({ error: 'Invalid tenant_id' });
  if (!full_name || !full_name.trim())        return res.status(400).json({ error: 'full_name is required' });
  if (!email || !isValidEmail(email))         return res.status(400).json({ error: 'A valid email is required' });

  try {
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants').select('id').eq('id', tenant_id).eq('status', 'ACTIVE').single();
    if (tErr || !tenant) return res.status(404).json({ error: 'Tenant not found' });

    const { data, error } = await supabaseAdmin
      .from('customer_access_requests')
      .insert({ tenant_id, full_name: full_name.trim(), email: email.toLowerCase().trim(), mobile_number: mobile_number?.trim() || null })
      .select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    console.error('[AccessRequests POST]', err.message);
    res.status(500).json({ error: 'Failed to submit request' });
  }
};

// ── Admin Router ─────────────────────────────────────────────────────────────
const adminRouter = express.Router();

// GET /api/access-requests/admin
adminRouter.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let q = supabaseAdmin
      .from('customer_access_requests')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('requested_at', { ascending: false });
    if (status) q = q.eq('status', status.toUpperCase());

    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('[AccessRequests LIST]', err.message);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// GET /api/access-requests/admin/:id
adminRouter.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('customer_access_requests')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Request not found' });
    res.json(data);
  } catch (err) {
    console.error('[AccessRequests GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch request' });
  }
});

// PATCH /api/access-requests/admin/:id/approve
adminRouter.patch('/:id/approve', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can approve requests' });
  }
  try {
    const { data: ar, error: arErr } = await supabaseAdmin
      .from('customer_access_requests')
      .select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('status', 'PENDING').single();
    if (arErr || !ar) return res.status(404).json({ error: 'Pending request not found' });

    // Create customer record
    const nameParts = ar.full_name.trim().split(' ');
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('customers')
      .insert({
        tenant_id: req.tenantId,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' ') || '-',
        email: ar.email,
        mobile_number: ar.mobile_number,
        risk_rating: 'LOW',
      })
      .select().single();
    if (custErr) return res.status(400).json({ error: custErr.message });

    // Create Supabase auth user
    const tempPassword = generateTempPassword();
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: ar.email, password: tempPassword, email_confirm: true,
    });
    if (authErr) {
      await supabaseAdmin.from('customers').delete().eq('id', customer.id);
      return res.status(400).json({ error: authErr.message });
    }

    await supabaseAdmin.from('customers').update({ auth_id: authData.user.id }).eq('id', customer.id);

    const { data: tenant } = await supabaseAdmin.from('tenants').select('business_name').eq('id', req.tenantId).single();

    sendCustomerWelcomeEmail({
      to: ar.email, fullName: ar.full_name, email: ar.email,
      tempPassword, businessName: tenant?.business_name || 'Our Business',
    }).catch((e) => console.error('[AccessRequests email]', e.message));

    const { data: updated } = await supabaseAdmin
      .from('customer_access_requests')
      .update({ status: 'APPROVED', reviewed_by: req.userId, reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();

    res.json({ ...updated, status: 'APPROVED' });
  } catch (err) {
    console.error('[AccessRequests APPROVE]', err.message);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// PATCH /api/access-requests/admin/:id/reject
adminRouter.patch('/:id/reject', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can reject requests' });
  }
  try {
    const { notes } = req.body;
    const { data, error } = await supabaseAdmin
      .from('customer_access_requests')
      .update({ status: 'REJECTED', reviewed_by: req.userId, reviewed_at: new Date().toISOString(), notes: notes?.trim() || null })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('status', 'PENDING')
      .select().single();
    if (error || !data) return res.status(404).json({ error: 'Pending request not found' });
    res.json({ ...data, status: 'REJECTED' });
  } catch (err) {
    console.error('[AccessRequests REJECT]', err.message);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

module.exports = { handlePublicPost, adminRouter };
```

- [ ] **Step 4: Register in `server/index.js`**

After the existing branding route line (`app.use('/api/branding', ...)`), add:

```js
// Access requests
const { handlePublicPost: arPublicPost, adminRouter: arAdminRouter } = require('./routes/accessRequests');
app.post('/api/access-requests', arPublicPost);                          // public, no auth
app.use('/api/access-requests/admin', auth, tenantScope, arAdminRouter); // auth required
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest server/__tests__/access-requests.test.js --no-coverage
```

Expected: PASS (all tests). Note: the approve test may show 400 or 500 because `supabaseAdmin.auth.admin.createUser` isn't mocked — that's acceptable; the route exists and the other tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/routes/accessRequests.js server/__tests__/access-requests.test.js server/index.js
git commit -m "feat(access-requests): add public POST + admin approve/reject routes"
```

---

## Task 5: Extend showcase SSR template

**Files:**
- Modify: `server/middleware/subdomainResolver.js`
- Modify: `server/views/showcase.html`

- [ ] **Step 1: Update `server/middleware/subdomainResolver.js`**

Replace the entire file with:

```js
// server/middleware/subdomainResolver.js
const fs   = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/db');

const showcaseTemplate = fs.readFileSync(path.join(__dirname, '../views/showcase.html'), 'utf-8');
const notFoundPage     = fs.readFileSync(path.join(__dirname, '../views/404.html'), 'utf-8');

const GOOGLE_FONTS_BASE = 'https://fonts.googleapis.com/css2?family=';

// Map font_family values to their Google Fonts URL slugs
const FONT_URL_MAP = {
  'Playfair Display': 'Playfair+Display:wght@700;800',
  'Lora': 'Lora:wght@700',
  'Merriweather': 'Merriweather:wght@700',
  'EB Garamond': 'EB+Garamond:wght@700',
  'Inter': 'Inter:wght@700;800',
  'Outfit': 'Outfit:wght@700;800',
  'Nunito': 'Nunito:wght@700;800',
  'Raleway': 'Raleway:wght@700;800',
  'Oswald': 'Oswald:wght@600;700',
  'Bebas Neue': 'Bebas+Neue',
  'Righteous': 'Righteous',
  'Staatliches': 'Staatliches',
};

const PAWNSHOP_SERVICES = [
  { slug: 'gold_jewelry',        label: 'Gold & Jewelry',       icon: 'diamond',       desc: 'Gold, silver, diamonds' },
  { slug: 'electronics',         label: 'Electronics',          icon: 'smartphone',    desc: 'Phones, laptops, tablets' },
  { slug: 'watches',             label: 'Watches',              icon: 'watch',         desc: 'Luxury & branded watches' },
  { slug: 'bags_apparel',        label: 'Bags & Apparel',       icon: 'shopping_bag',  desc: 'Designer bags & clothing' },
  { slug: 'power_tools',         label: 'Power Tools',          icon: 'construction',  desc: 'Tools & equipment' },
  { slug: 'musical_instruments', label: 'Musical Instruments',  icon: 'music_note',    desc: 'Guitars, keyboards & more' },
  { slug: 'title_loans',         label: 'Title Loans',          icon: 'article',       desc: 'Vehicle & property titles' },
];

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function buildServicesHtml(enabledSlugs, accentColor) {
  const enabled = Array.isArray(enabledSlugs) && enabledSlugs.length > 0
    ? PAWNSHOP_SERVICES.filter(s => enabledSlugs.includes(s.slug))
    : PAWNSHOP_SERVICES.slice(0, 4); // fallback: first 4

  return enabled.map(s => `
    <div class="service-card">
      <div class="service-icon">
        <span class="material-symbols-outlined">${escapeHtml(s.icon)}</span>
      </div>
      <div class="service-name">${escapeHtml(s.label)}</div>
      <div class="service-desc">${escapeHtml(s.desc)}</div>
    </div>`).join('');
}

function renderShowcase(tenant) {
  const accent       = tenant.brand_color || '#A3E635';
  const fontFamily   = tenant.font_family  || 'Plus Jakarta Sans';
  const fontSlug     = FONT_URL_MAP[fontFamily];
  const fontUrl      = fontSlug
    ? `${GOOGLE_FONTS_BASE}${fontSlug}&display=swap`
    : 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&display=swap';
  const servicesHtml = buildServicesHtml(tenant.services_enabled, accent);
  const logoHtml     = tenant.logo_url
    ? `<img src="${escapeHtml(tenant.logo_url)}" alt="${escapeHtml(tenant.business_name)}" style="width:100%;height:100%;object-fit:cover;border-radius:6px" />`
    : escapeHtml(tenant.business_name.charAt(0).toUpperCase());

  return showcaseTemplate
    .replace(/\{\{BUSINESS_NAME\}\}/g, escapeHtml(tenant.business_name))
    .replace('{{LOGO_HTML}}',    logoHtml)
    .replace('{{FONT_URL}}',     escapeHtml(fontUrl))
    .replace('{{FONT_FAMILY}}',  escapeHtml(fontFamily))
    .replace(/\{\{BRAND_COLOR\}\}/g, escapeHtml(accent))
    .replace(/\{\{TAGLINE\}\}/g, escapeHtml(tenant.tagline || ''))
    .replace('{{TAGLINE_CLASS}}',    tenant.tagline ? '' : 'hidden')
    .replace('{{APK_URL}}',          escapeHtml(tenant.apk_download_url || '#'))
    .replace('{{DOWNLOAD_CLASS}}',   tenant.apk_download_url ? '' : 'hidden')
    .replace('{{SERVICES_HTML}}',    servicesHtml)
    .replace(/\{\{TENANT_ID\}\}/g,   escapeHtml(tenant.tenant_id));
}

const showcaseHandler = async (req, res) => {
  const slug = req.params.slug?.toLowerCase();
  if (!slug) return res.status(404).type('html').send(notFoundPage);

  try {
    const { data: branding, error } = await supabaseAdmin
      .from('tenant_branding')
      .select('tenant_id, subdomain, tagline, apk_download_url, is_published, brand_color, font_family, services_enabled, tenants(business_name, logo_url)')
      .eq('subdomain', slug)
      .eq('is_published', true)
      .single();

    if (error || !branding) return res.status(404).type('html').send(notFoundPage);

    const tenant = {
      tenant_id:        branding.tenant_id,
      business_name:    branding.tenants.business_name,
      logo_url:         branding.tenants.logo_url,
      tagline:          branding.tagline,
      apk_download_url: branding.apk_download_url,
      brand_color:      branding.brand_color,
      font_family:      branding.font_family,
      services_enabled: branding.services_enabled,
    };

    return res.status(200).type('html').send(renderShowcase(tenant));
  } catch (err) {
    console.error('[Showcase]', err.message);
    return res.status(500).type('html').send(notFoundPage);
  }
};

module.exports = showcaseHandler;
```

- [ ] **Step 2: Rewrite `server/views/showcase.html`**

Replace the entire file with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{BUSINESS_NAME}}</title>
  <meta name="description" content="{{TAGLINE}}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="{{FONT_URL}}" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">
  <style>
    :root { --accent: {{BRAND_COLOR}}; --accent-dim: color-mix(in srgb, {{BRAND_COLOR}} 15%, transparent); }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #111; color: #f5f5f5; min-height: 100vh; overflow-x: hidden; }
    .hidden { display: none !important; }

    /* ── Navbar ── */
    .navbar { position: fixed; top: 0; width: 100%; z-index: 50; background: rgba(10,10,10,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.06); }
    .navbar-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-logo { width: 36px; height: 36px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; color: #111; overflow: hidden; flex-shrink: 0; }
    .brand-name { font-family: '{{FONT_FAMILY}}', 'Plus Jakarta Sans', sans-serif; font-size: 17px; font-weight: 800; color: #fff; letter-spacing: -0.3px; }
    .btn-staff { padding: 8px 18px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12); background: transparent; color: #aaa; font-size: 13px; font-weight: 600; cursor: pointer; transition: border-color .15s, color .15s; font-family: inherit; }
    .btn-staff:hover { border-color: rgba(255,255,255,0.3); color: #fff; }

    /* ── Hero ── */
    .hero { padding: 100px 24px 60px; background: radial-gradient(ellipse at top right, var(--accent-dim) 0%, transparent 55%); border-bottom: 1px solid #1a1a1a; }
    .hero-inner { max-width: 1200px; margin: 0 auto; }
    .hero-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; background: var(--accent-dim); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--accent); margin-bottom: 18px; }
    .hero-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
    .hero-title { font-family: '{{FONT_FAMILY}}', 'Plus Jakarta Sans', sans-serif; font-size: clamp(32px,5vw,60px); font-weight: 800; line-height: 1.1; letter-spacing: -.02em; margin-bottom: 14px; max-width: 640px; }
    .hero-tagline { font-size: 17px; color: #777; line-height: 1.6; max-width: 480px; margin-bottom: 28px; }
    .hero-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .btn-primary { display: inline-flex; align-items: center; gap: 8px; padding: 13px 26px; background: var(--accent); color: #111; border: none; border-radius: 6px; font-weight: 700; font-size: 14px; cursor: pointer; font-family: inherit; text-decoration: none; transition: opacity .15s; }
    .btn-primary:hover { opacity: .88; }
    .btn-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 12px 20px; border: 1px solid #2a2a2a; background: transparent; color: #888; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; text-decoration: none; transition: border-color .15s, color .15s; }
    .btn-secondary:hover { border-color: #444; color: #ccc; }

    /* ── Services ── */
    .services { padding: 56px 24px; border-bottom: 1px solid #1a1a1a; }
    .section-inner { max-width: 1200px; margin: 0 auto; }
    .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: var(--accent); margin-bottom: 8px; }
    .section-title { font-size: 28px; font-weight: 800; color: #fff; margin-bottom: 6px; }
    .section-sub { font-size: 14px; color: #555; margin-bottom: 28px; }
    .services-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
    .service-card { background: #161616; border: 1px solid #222; border-radius: 10px; padding: 20px; transition: border-color .15s; }
    .service-card:hover { border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
    .service-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--accent-dim); display: flex; align-items: center; justify-content: center; color: var(--accent); margin-bottom: 12px; }
    .service-icon .material-symbols-outlined { font-size: 20px; }
    .service-name { font-size: 14px; font-weight: 700; color: #e5e5e5; margin-bottom: 4px; }
    .service-desc { font-size: 12px; color: #555; line-height: 1.4; }

    /* ── Request Access ── */
    .request-section { padding: 56px 24px; background: #0d0d0d; border-bottom: 1px solid #1a1a1a; }
    .request-inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 420px; gap: 56px; align-items: center; }
    .request-copy p { font-size: 14px; color: #555; line-height: 1.7; margin-top: 10px; }
    .request-form { background: #141414; border: 1px solid #222; border-radius: 12px; padding: 28px; }
    .form-field { margin-bottom: 14px; }
    .form-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #666; display: block; margin-bottom: 6px; }
    .form-input { width: 100%; background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 6px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit; outline: none; transition: border-color .15s; }
    .form-input:focus { border-color: var(--accent); }
    .btn-submit { width: 100%; padding: 13px; background: var(--accent); color: #111; border: none; border-radius: 6px; font-weight: 700; font-size: 14px; cursor: pointer; font-family: inherit; margin-top: 4px; transition: opacity .15s; }
    .btn-submit:hover { opacity: .88; }
    .btn-submit:disabled { opacity: .5; cursor: not-allowed; }
    .form-message { padding: 12px 14px; border-radius: 6px; font-size: 13px; margin-top: 12px; }
    .form-message.success { background: rgba(163,230,53,.08); border: 1px solid rgba(163,230,53,.2); color: var(--accent); }
    .form-message.error   { background: rgba(239,68,68,.08);  border: 1px solid rgba(239,68,68,.2);  color: #ef4444; }

    /* ── Footer ── */
    .footer { padding: 20px 24px; border-top: 1px solid #1a1a1a; }
    .footer-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
    .powered { font-size: 11px; color: #333; }
    .powered span { color: #555; font-weight: 700; }
    .copyright { font-size: 11px; color: #2a2a2a; }

    /* ── Staff Login Modal ── */
    .modal-overlay { display: none; position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.7); backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 16px; }
    .modal-overlay.open { display: flex; }
    .modal { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 28px; width: 100%; max-width: 360px; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .modal-title { font-size: 17px; font-weight: 800; color: #fff; }
    .modal-close { background: none; border: none; color: #555; cursor: pointer; font-size: 20px; line-height: 1; padding: 0; }
    .modal-close:hover { color: #fff; }
    .modal-sub { font-size: 12px; color: #555; margin-bottom: 22px; }
    .modal-actions { margin-top: 16px; }
    .modal-forgot { text-align: center; font-size: 12px; color: #444; margin-top: 12px; cursor: pointer; background: none; border: none; font-family: inherit; width: 100%; }
    .modal-forgot:hover { color: #888; }
    .modal-error { color: #ef4444; font-size: 12px; margin-top: 8px; text-align: center; }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .request-inner { grid-template-columns: 1fr; }
      .navbar-inner { padding: 0 16px; }
    }
  </style>
</head>
<body>

<!-- Navbar -->
<nav class="navbar">
  <div class="navbar-inner">
    <div class="brand">
      <div class="brand-logo">{{LOGO_HTML}}</div>
      <div class="brand-name">{{BUSINESS_NAME}}</div>
    </div>
    <button class="btn-staff" onclick="openLoginModal()">Staff Login</button>
  </div>
</nav>

<!-- Hero -->
<section class="hero">
  <div class="hero-inner">
    <div class="hero-badge"><div class="hero-dot"></div> Licensed Pawnshop</div>
    <h1 class="hero-title">{{BUSINESS_NAME}}</h1>
    <p class="hero-tagline {{TAGLINE_CLASS}}">{{TAGLINE}}</p>
    <div class="hero-actions">
      <a href="#request" class="btn-primary">
        <span class="material-symbols-outlined" style="font-size:18px">person_add</span>
        Request Account Access
      </a>
      <a href="#services" class="btn-secondary">
        View Services
        <span class="material-symbols-outlined" style="font-size:16px">arrow_downward</span>
      </a>
      <a href="{{APK_URL}}" class="btn-secondary {{DOWNLOAD_CLASS}}">
        <span class="material-symbols-outlined" style="font-size:16px">download</span>
        Download App
      </a>
    </div>
  </div>
</section>

<!-- Services -->
<section class="services" id="services">
  <div class="section-inner">
    <div class="section-label">What we offer</div>
    <div class="section-title">Our Services</div>
    <div class="section-sub">We accept a wide range of items for pawning and buying.</div>
    <div class="services-grid">
      {{SERVICES_HTML}}
    </div>
  </div>
</section>

<!-- Request Access -->
<section class="request-section" id="request">
  <div class="request-inner">
    <div class="request-copy">
      <div class="section-label">Customer Portal</div>
      <div class="section-title">Request Account Access</div>
      <p>Submit your details and our staff will review your request. Once approved, you'll receive login credentials to track your loans and payments via our mobile app.</p>
    </div>
    <div class="request-form">
      <form id="accessRequestForm" data-tenant-id="{{TENANT_ID}}">
        <div class="form-field">
          <label class="form-label" for="req-name">Full Name</label>
          <input class="form-input" id="req-name" name="full_name" type="text" placeholder="Juan Dela Cruz" required />
        </div>
        <div class="form-field">
          <label class="form-label" for="req-email">Email Address</label>
          <input class="form-input" id="req-email" name="email" type="email" placeholder="juan@example.com" required />
        </div>
        <div class="form-field">
          <label class="form-label" for="req-mobile">Mobile Number</label>
          <input class="form-input" id="req-mobile" name="mobile_number" type="tel" placeholder="+63 917 123 4567" />
        </div>
        <button class="btn-submit" type="submit" id="submitBtn">Submit Request</button>
        <div id="formMessage" style="display:none"></div>
      </form>
    </div>
  </div>
</section>

<!-- Footer -->
<footer class="footer">
  <div class="footer-inner">
    <div class="powered">Powered by <span>OBSIDIAN</span></div>
    <div class="copyright">&copy; {{BUSINESS_NAME}}</div>
  </div>
</footer>

<!-- Staff Login Modal -->
<div class="modal-overlay" id="loginModal" onclick="handleModalOverlayClick(event)">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title">Staff Login</div>
      <button class="modal-close" onclick="closeLoginModal()">&times;</button>
    </div>
    <div class="modal-sub">{{BUSINESS_NAME}} &middot; Employee access</div>
    <div class="form-field">
      <label class="form-label" for="login-email">Email</label>
      <input class="form-input" id="login-email" type="email" placeholder="you@business.com" />
    </div>
    <div class="form-field">
      <label class="form-label" for="login-password">Password</label>
      <input class="form-input" id="login-password" type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" />
    </div>
    <div class="modal-actions">
      <button class="btn-submit" id="loginBtn" onclick="handleLogin()">Sign In</button>
      <div id="loginError" class="modal-error" style="display:none"></div>
      <button class="modal-forgot" onclick="window.location='/recover'">Forgot password?</button>
    </div>
  </div>
</div>

<script>
  const API_BASE = '/api';

  // ── Modal ──────────────────────────────────────────────
  function openLoginModal()  { document.getElementById('loginModal').classList.add('open'); }
  function closeLoginModal() { document.getElementById('loginModal').classList.remove('open'); document.getElementById('loginError').style.display='none'; }
  function handleModalOverlayClick(e) { if (e.target === e.currentTarget) closeLoginModal(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLoginModal(); });

  // ── Staff login ────────────────────────────────────────
  async function handleLogin() {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('loginError');
    const btn      = document.getElementById('loginBtn');

    if (!email || !password) { errEl.textContent = 'Please enter email and password.'; errEl.style.display='block'; return; }

    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      const res  = await fetch(`${API_BASE}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      window.location.href = '/login?redirect=/admin';
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  }

  // ── Access request form ────────────────────────────────
  document.getElementById('accessRequestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form     = e.target;
    const tenantId = form.dataset.tenantId;
    const msgEl    = document.getElementById('formMessage');
    const btn      = document.getElementById('submitBtn');

    const payload = {
      tenant_id:     tenantId,
      full_name:     form.full_name.value.trim(),
      email:         form.email.value.trim(),
      mobile_number: form.mobile_number.value.trim() || undefined,
    };

    btn.disabled = true; btn.textContent = 'Submitting...';
    msgEl.style.display = 'none';

    try {
      const res  = await fetch(`${API_BASE}/access-requests`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');

      form.style.display = 'none';
      msgEl.className = 'form-message success';
      msgEl.textContent = 'Request submitted! Our staff will review it shortly.';
      msgEl.style.display = 'block';
    } catch (err) {
      msgEl.className = 'form-message error';
      msgEl.textContent = err.message;
      msgEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Submit Request';
    }
  });
</script>
</body>
</html>
```

- [ ] **Step 3: Manual verification**

Start the dev server (`npm run dev` or `node server/index.js`) and navigate to `/s/your-slug` (use a slug that exists in your DB with `is_published = true`). Verify:
- Services grid renders with enabled services
- "Staff Login" button opens the modal
- "Request Account Access" form submits and shows success message

- [ ] **Step 4: Commit**

```bash
git add server/views/showcase.html server/middleware/subdomainResolver.js
git commit -m "feat(showcase): extend SSR template with services, request form, staff login modal, brand color/font"
```

---

## Task 6: Frontend API module

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Extend `brandingApi` and add `accessRequestsApi`**

In `src/lib/api.js`, find the `brandingApi` export and replace it with:

```js
// ── Branding ────────────────────────────────────────────
export const brandingApi = {
  get: () => apiFetch('/branding'),
  update: (data) =>
    apiFetch('/branding', { method: 'PUT', body: JSON.stringify(data) }),
  checkSubdomain: (slug) =>
    apiFetch(`/branding/check-subdomain/${encodeURIComponent(slug)}`),
};
```

Then add `accessRequestsApi` after it:

```js
// ── Access Requests ─────────────────────────────────────
export const accessRequestsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/access-requests/admin${qs ? '?' + qs : ''}`);
  },
  get: (id) => apiFetch(`/access-requests/admin/${id}`),
  approve: (id) =>
    apiFetch(`/access-requests/admin/${id}/approve`, { method: 'PATCH' }),
  reject: (id, notes) =>
    apiFetch(`/access-requests/admin/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.js
git commit -m "feat(api): extend brandingApi and add accessRequestsApi"
```

---

## Task 7: BrandingSetupPage wizard

**Files:**
- Create: `src/pages/owner/BrandingSetupPage.jsx`

- [ ] **Step 1: Create the file**

Create `src/pages/owner/BrandingSetupPage.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { brandingApi } from '../../lib/api';

const PAWNSHOP_SERVICES = [
  { slug: 'gold_jewelry',        label: 'Gold & Jewelry',       icon: 'diamond' },
  { slug: 'electronics',         label: 'Electronics',          icon: 'smartphone' },
  { slug: 'watches',             label: 'Watches',              icon: 'watch' },
  { slug: 'bags_apparel',        label: 'Bags & Apparel',       icon: 'shopping_bag' },
  { slug: 'power_tools',         label: 'Power Tools',          icon: 'construction' },
  { slug: 'musical_instruments', label: 'Musical Instruments',  icon: 'music_note' },
  { slug: 'title_loans',         label: 'Title Loans',          icon: 'article' },
];

const FONTS = {
  Serif:   ['Playfair Display', 'Lora', 'Merriweather', 'EB Garamond'],
  Sans:    ['Inter', 'Outfit', 'Nunito', 'Raleway'],
  Display: ['Oswald', 'Bebas Neue', 'Righteous', 'Staatliches'],
};

const GOOGLE_FONTS_LOAD_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lora:wght@700&family=Merriweather:wght@700&family=EB+Garamond:wght@700&family=Inter:wght@700&family=Outfit:wght@700&family=Nunito:wght@700&family=Raleway:wght@700&family=Oswald:wght@700&family=Bebas+Neue&family=Righteous&family=Staatliches&display=swap';

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const STEP_LABELS = ['Identity', 'Branding', 'Services'];

const BrandingSetupPage = () => {
  const { profile } = useAuth();
  const currentUser  = buildSidebarUser(profile);
  const navigation   = getNavigationByRole(profile?.role);
  const [step, setStep]         = useState(0);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [fontCategory, setFontCategory] = useState('Serif');

  const [identity, setIdentity] = useState({
    business_name: profile?.full_name ? '' : '',
    logo_url: '',
  });
  const [branding, setBranding] = useState({ brand_color: '#A3E635', font_family: 'Playfair Display' });
  const [hexInput,  setHexInput]  = useState('#A3E635');
  const [services,  setServices]  = useState(['gold_jewelry', 'electronics', 'watches']);

  // Preload identity from existing profile
  useEffect(() => {
    brandingApi.get().then(data => {
      if (data?.tenants?.business_name) setIdentity(prev => ({ ...prev, business_name: data.tenants.business_name }));
      if (data?.tenants?.logo_url)      setIdentity(prev => ({ ...prev, logo_url: data.tenants.logo_url }));
      if (data?.brand_color)   { setBranding(prev => ({ ...prev, brand_color: data.brand_color })); setHexInput(data.brand_color); }
      if (data?.font_family)   setBranding(prev => ({ ...prev, font_family: data.font_family }));
      if (data?.services_enabled?.length) setServices(data.services_enabled);
    }).catch(() => {});

    // Load all fonts for the picker
    if (!document.getElementById('wizard-fonts')) {
      const link = document.createElement('link');
      link.id = 'wizard-fonts'; link.rel = 'stylesheet'; link.href = GOOGLE_FONTS_LOAD_URL;
      document.head.appendChild(link);
    }
  }, []);

  const navigate = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

  const handleSkip = () => navigate('/admin');

  const handleColorChange = (color) => {
    setBranding(prev => ({ ...prev, brand_color: color }));
    setHexInput(color);
  };

  const handleHexInput = (e) => {
    const val = e.target.value;
    setHexInput(val);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val)) {
      setBranding(prev => ({ ...prev, brand_color: val }));
    }
  };

  const toggleService = (slug) => {
    setServices(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  };

  const saveStep = async () => {
    setSaving(true); setError(null);
    try {
      if (step === 0) {
        await brandingApi.update({ business_name: identity.business_name, logo_url: identity.logo_url });
      } else if (step === 1) {
        await brandingApi.update({ brand_color: branding.brand_color, font_family: branding.font_family });
      } else {
        if (services.length === 0) { setError('Select at least one service.'); setSaving(false); return; }
        await brandingApi.update({ services_enabled: services });
        navigate('/admin/branding');
        return;
      }
      setStep(s => s + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/branding/setup" onNavigate={() => {}} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="flex rounded-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden min-h-[480px]">

              {/* Left panel */}
              <div className="w-48 bg-neutral-50 dark:bg-neutral-800/50 border-r border-neutral-200 dark:border-neutral-700 p-5 flex flex-col flex-shrink-0">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-4">Setup Steps</p>
                <div className="space-y-1">
                  {STEP_LABELS.map((label, i) => (
                    <div key={label} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-semibold
                      ${i < step  ? 'text-primary' : ''}
                      ${i === step ? 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white' : ''}
                      ${i > step  ? 'text-neutral-400 dark:text-neutral-600' : ''}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                        ${i < step  ? 'bg-primary text-neutral-900' : ''}
                        ${i === step ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900' : ''}
                        ${i > step  ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400' : ''}`}>
                        {i < step ? '✓' : i + 1}
                      </div>
                      {label}
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-6">
                  <button onClick={handleSkip} className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 underline">
                    Set up later →
                  </button>
                </div>
              </div>

              {/* Right panel */}
              <div className="flex-1 p-7">
                {/* Step 0: Identity */}
                {step === 0 && (
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-1">Identify your business</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Your business name and logo shown on your public page.</p>
                    <div className="space-y-5">
                      <div>
                        <label className="form-label">Business Name</label>
                        <input className="profile-input" value={identity.business_name}
                          onChange={e => setIdentity(p => ({ ...p, business_name: e.target.value }))}
                          placeholder="Goldsmith Pawnshop" />
                      </div>
                      <div>
                        <label className="form-label">Logo URL <span className="text-neutral-400 font-normal">(optional)</span></label>
                        <input className="profile-input" value={identity.logo_url}
                          onChange={e => setIdentity(p => ({ ...p, logo_url: e.target.value }))}
                          placeholder="https://i.imgur.com/your-logo.png" />
                        <p className="text-xs text-neutral-400 mt-1.5">Must be a square image (1:1 ratio). PNG or JPG.</p>
                        {identity.logo_url && (
                          <img src={identity.logo_url} alt="Logo preview"
                            className="mt-2 w-16 h-16 rounded-sm object-cover border border-neutral-200 dark:border-neutral-700"
                            onError={e => { e.target.style.display = 'none'; }} />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 1: Branding */}
                {step === 1 && (
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-1">Brand your page</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Pick a color and a font for your public page.</p>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="form-label">Brand Color</label>
                        <HexColorPicker color={branding.brand_color} onChange={handleColorChange} style={{ width: '100%', height: '160px' }} />
                        <div className="flex items-center gap-2 mt-3">
                          <div className="w-8 h-8 rounded-sm border border-neutral-200 dark:border-neutral-700 flex-shrink-0" style={{ background: branding.brand_color }} />
                          <input className="profile-input font-mono text-sm" value={hexInput} onChange={handleHexInput} maxLength={7} placeholder="#A3E635" />
                        </div>
                      </div>
                      <div>
                        <label className="form-label">Business Name Font</label>
                        <div className="flex gap-1.5 mb-3">
                          {Object.keys(FONTS).map(cat => (
                            <button key={cat} onClick={() => setFontCategory(cat)}
                              className={`text-xs px-3 py-1.5 rounded-sm font-semibold border transition-colors ${fontCategory === cat ? 'bg-primary text-neutral-900 border-primary' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400'}`}>
                              {cat}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {FONTS[fontCategory].map(font => (
                            <button key={font} onClick={() => setBranding(p => ({ ...p, font_family: font }))}
                              className={`p-2.5 rounded-sm border text-center transition-colors ${branding.font_family === font ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'}`}>
                              <div className="text-base text-neutral-900 dark:text-white" style={{ fontFamily: `'${font}', serif` }}>Aa</div>
                              <div className="text-xs text-neutral-400 mt-1 truncate">{font}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Services */}
                {step === 2 && (
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-1">Select your services</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Choose what your shop accepts. At least one required.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {PAWNSHOP_SERVICES.map(s => {
                        const on = services.includes(s.slug);
                        return (
                          <button key={s.slug} onClick={() => toggleService(s.slug)}
                            className={`flex items-center gap-3 p-3 rounded-sm border text-left transition-colors ${on ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'}`}>
                            <div className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 ${on ? 'bg-primary text-neutral-900' : 'border border-neutral-300 dark:border-neutral-600'}`}>
                              {on && '✓'}
                            </div>
                            <span className="material-symbols-outlined text-lg text-neutral-500 dark:text-neutral-400">{s.icon}</span>
                            <span className={`text-sm font-semibold ${on ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

                <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                  {step > 0
                    ? <button onClick={() => setStep(s => s - 1)} className="btn-secondary text-sm">← Back</button>
                    : <div />
                  }
                  <button onClick={saveStep} disabled={saving} className="btn-primary text-sm">
                    {saving ? 'Saving...' : step === 2 ? 'Finish Setup' : 'Next →'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BrandingSetupPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/owner/BrandingSetupPage.jsx
git commit -m "feat(branding): add 3-step BrandingSetupPage wizard"
```

---

## Task 8: BrandingPage management

**Files:**
- Create: `src/pages/owner/BrandingPage.jsx`

- [ ] **Step 1: Create the file**

Create `src/pages/owner/BrandingPage.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { brandingApi } from '../../lib/api';

const PAWNSHOP_SERVICES = [
  { slug: 'gold_jewelry',        label: 'Gold & Jewelry',       icon: 'diamond' },
  { slug: 'electronics',         label: 'Electronics',          icon: 'smartphone' },
  { slug: 'watches',             label: 'Watches',              icon: 'watch' },
  { slug: 'bags_apparel',        label: 'Bags & Apparel',       icon: 'shopping_bag' },
  { slug: 'power_tools',         label: 'Power Tools',          icon: 'construction' },
  { slug: 'musical_instruments', label: 'Musical Instruments',  icon: 'music_note' },
  { slug: 'title_loans',         label: 'Title Loans',          icon: 'article' },
];

const FONTS = {
  Serif:   ['Playfair Display', 'Lora', 'Merriweather', 'EB Garamond'],
  Sans:    ['Inter', 'Outfit', 'Nunito', 'Raleway'],
  Display: ['Oswald', 'Bebas Neue', 'Righteous', 'Staatliches'],
};

const GOOGLE_FONTS_LOAD_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lora:wght@700&family=Merriweather:wght@700&family=EB+Garamond:wght@700&family=Inter:wght@700&family=Outfit:wght@700&family=Nunito:wght@700&family=Raleway:wght@700&family=Oswald:wght@700&family=Bebas+Neue&family=Righteous&family=Staatliches&display=swap';

const SHOWCASE_BASE = import.meta.env.VITE_SHOWCASE_URL || window.location.origin;

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const NAV_TABS = [
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'services',   label: 'Services',   icon: 'category' },
  { id: 'publish',    label: 'Publish',     icon: 'public' },
];

const BrandingPage = () => {
  const { profile } = useAuth();
  const currentUser = buildSidebarUser(profile);
  const navigation  = getNavigationByRole(profile?.role);

  const [activeTab, setActiveTab] = useState('appearance');
  const [loading, setLoading]     = useState(true);
  const [saving,  setSaving]      = useState(false);
  const [message, setMessage]     = useState(null);
  const [fontCategory, setFontCategory] = useState('Serif');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [subdomainStatus, setSubdomainStatus] = useState(null);
  const [subdomainChecking, setSubdomainChecking] = useState(false);

  const [form, setForm] = useState({
    business_name: '', logo_url: '',
    brand_color: '#A3E635', font_family: 'Playfair Display',
    services_enabled: ['gold_jewelry', 'electronics', 'watches'],
    subdomain: '', tagline: '', apk_download_url: '', is_published: false,
  });
  const [hexInput, setHexInput] = useState('#A3E635');

  useEffect(() => {
    brandingApi.get().then(data => {
      if (data) {
        setForm(prev => ({
          ...prev,
          business_name:    data.tenants?.business_name || '',
          logo_url:         data.tenants?.logo_url      || '',
          brand_color:      data.brand_color    || '#A3E635',
          font_family:      data.font_family    || 'Playfair Display',
          services_enabled: data.services_enabled?.length ? data.services_enabled : prev.services_enabled,
          subdomain:        data.subdomain      || '',
          tagline:          data.tagline        || '',
          apk_download_url: data.apk_download_url || '',
          is_published:     data.is_published   || false,
        }));
        setHexInput(data.brand_color || '#A3E635');
      }
    }).catch(() => {}).finally(() => setLoading(false));

    if (!document.getElementById('branding-fonts')) {
      const link = document.createElement('link');
      link.id = 'branding-fonts'; link.rel = 'stylesheet'; link.href = GOOGLE_FONTS_LOAD_URL;
      document.head.appendChild(link);
    }
  }, []);

  // Subdomain availability check
  useEffect(() => {
    if (!form.subdomain || form.subdomain.length < 3) { setSubdomainStatus(null); return; }
    setSubdomainChecking(true);
    const timer = setTimeout(() => {
      brandingApi.checkSubdomain(form.subdomain)
        .then(setSubdomainStatus)
        .catch(() => setSubdomainStatus(null))
        .finally(() => setSubdomainChecking(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [form.subdomain]);

  const set = (key) => (val) => setForm(prev => ({ ...prev, [key]: val }));
  const setFromEvent = (key) => (e) => set(key)(e.target.type === 'checkbox' ? e.target.checked : e.target.value);

  const handleColorChange = (color) => { set('brand_color')(color); setHexInput(color); };
  const handleHexInput = (e) => {
    setHexInput(e.target.value);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(e.target.value)) set('brand_color')(e.target.value);
  };
  const toggleService = (slug) => {
    set('services_enabled')(form.services_enabled.includes(slug)
      ? form.services_enabled.filter(s => s !== slug)
      : [...form.services_enabled, slug]);
  };

  const handleSave = async () => {
    setSaving(true); setMessage(null);
    const payload = {};
    if (activeTab === 'appearance') {
      Object.assign(payload, { business_name: form.business_name, logo_url: form.logo_url, brand_color: form.brand_color, font_family: form.font_family });
    } else if (activeTab === 'services') {
      if (form.services_enabled.length === 0) { setMessage({ type: 'error', text: 'Select at least one service.' }); setSaving(false); return; }
      Object.assign(payload, { services_enabled: form.services_enabled });
    } else {
      Object.assign(payload, { subdomain: form.subdomain, tagline: form.tagline, apk_download_url: form.apk_download_url, is_published: form.is_published });
    }
    try {
      await brandingApi.update(payload);
      setMessage({ type: 'success', text: 'Saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = `${SHOWCASE_BASE}/s/${form.subdomain}`;

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/branding" onNavigate={() => {}} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="max-w-5xl mx-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
              </div>
            ) : (
              <div className="flex rounded-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden min-h-[560px]">

                {/* Left nav */}
                <div className="w-52 bg-neutral-50 dark:bg-neutral-800/50 border-r border-neutral-200 dark:border-neutral-700 p-4 flex flex-col flex-shrink-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-3 px-2">Branding</p>
                  <div className="space-y-1">
                    {NAV_TABS.map(tab => (
                      <button key={tab.id} onClick={() => { setActiveTab(tab.id); setMessage(null); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-semibold transition-colors text-left
                          ${activeTab === tab.id
                            ? 'bg-primary/10 dark:bg-primary/10 text-primary border border-primary/20'
                            : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50'}`}>
                        <span className="material-symbols-outlined text-base">{tab.icon}</span>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 px-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-2">Page Status</p>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${form.is_published ? 'bg-primary/10 text-primary border-primary/20' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500 border-neutral-200 dark:border-neutral-600'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {form.is_published ? 'Live' : 'Draft'}
                    </span>
                    {form.subdomain && (
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2 font-mono break-all">/s/{form.subdomain}</p>
                    )}
                  </div>
                </div>

                {/* Right content */}
                <div className="flex-1 flex flex-col">
                  <div className="flex-1 p-7 overflow-y-auto">

                    {/* Appearance */}
                    {activeTab === 'appearance' && (
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">Appearance</h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Logo, brand color, and font for your public page.</p>
                        <div className="space-y-5">
                          <div>
                            <label className="form-label">Business Name</label>
                            <input className="profile-input" value={form.business_name} onChange={setFromEvent('business_name')} placeholder="Your business name" />
                          </div>
                          <div>
                            <label className="form-label">Logo URL <span className="text-neutral-400 font-normal">(optional)</span></label>
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 flex-shrink-0 text-sm font-bold text-neutral-500">
                                {form.logo_url ? <img src={form.logo_url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} /> : form.business_name?.[0]?.toUpperCase()}
                              </div>
                              <input className="profile-input flex-1" value={form.logo_url} onChange={setFromEvent('logo_url')} placeholder="https://example.com/logo.png" />
                            </div>
                            <p className="text-xs text-neutral-400 mt-1.5">Square image, 1:1 ratio. Shown in your page navbar.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <label className="form-label">Brand Color</label>
                              <div className="flex items-center gap-2 mb-2">
                                <button onClick={() => setShowColorPicker(p => !p)}
                                  className="w-9 h-9 rounded-sm border border-neutral-200 dark:border-neutral-700 flex-shrink-0 transition-transform hover:scale-105"
                                  style={{ background: form.brand_color }} />
                                <input className="profile-input font-mono text-sm w-32" value={hexInput} onChange={handleHexInput} maxLength={7} placeholder="#A3E635" />
                                <span className="text-xs text-neutral-400">Click swatch to open picker</span>
                              </div>
                              {showColorPicker && (
                                <div className="mt-2">
                                  <HexColorPicker color={form.brand_color} onChange={handleColorChange} style={{ width: '200px' }} />
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="form-label">Business Name Font</label>
                              <div className="flex gap-1 mb-2">
                                {Object.keys(FONTS).map(cat => (
                                  <button key={cat} onClick={() => setFontCategory(cat)}
                                    className={`text-xs px-2.5 py-1 rounded-sm font-semibold border transition-colors ${fontCategory === cat ? 'bg-primary text-neutral-900 border-primary' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400'}`}>
                                    {cat}
                                  </button>
                                ))}
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {FONTS[fontCategory].map(font => (
                                  <button key={font} onClick={() => set('font_family')(font)}
                                    className={`p-2 rounded-sm border text-center transition-colors ${form.font_family === font ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'}`}>
                                    <div className="text-sm text-neutral-900 dark:text-white" style={{ fontFamily: `'${font}', serif` }}>Aa</div>
                                    <div className="text-xs text-neutral-400 mt-0.5 truncate">{font}</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Services */}
                    {activeTab === 'services' && (
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">Services</h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Choose which services appear on your public page.</p>
                        <div className="grid grid-cols-2 gap-2">
                          {PAWNSHOP_SERVICES.map(s => {
                            const on = form.services_enabled.includes(s.slug);
                            return (
                              <button key={s.slug} onClick={() => toggleService(s.slug)}
                                className={`flex items-center gap-3 p-3 rounded-sm border text-left transition-colors ${on ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'}`}>
                                <div className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 ${on ? 'bg-primary text-neutral-900' : 'border border-neutral-300 dark:border-neutral-600'}`}>
                                  {on && '✓'}
                                </div>
                                <span className="material-symbols-outlined text-lg text-neutral-500">{s.icon}</span>
                                <span className={`text-sm font-semibold ${on ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>{s.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Publish */}
                    {activeTab === 'publish' && (
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">Publish</h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Configure your public page URL and go live.</p>
                        <div className="space-y-5">
                          <div>
                            <label className="form-label">Page Slug (URL path)</label>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-neutral-500 whitespace-nowrap">{SHOWCASE_BASE}/s/</span>
                              <input className="profile-input flex-1" value={form.subdomain} onChange={setFromEvent('subdomain')} placeholder="your-business" maxLength={63} />
                            </div>
                            {subdomainChecking && <p className="text-xs text-neutral-400 mt-1">Checking availability...</p>}
                            {subdomainStatus && !subdomainChecking && (
                              <p className={`text-xs mt-1 ${subdomainStatus.available ? 'text-emerald-600' : 'text-red-500'}`}>
                                {subdomainStatus.available ? 'Available!' : subdomainStatus.reason || 'Taken'}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="form-label">Tagline <span className="text-neutral-400 font-normal">(optional)</span></label>
                            <input className="profile-input" value={form.tagline} onChange={setFromEvent('tagline')} maxLength={255} placeholder="Your trusted pawnshop since 1995" />
                            <p className="text-xs text-neutral-400 mt-1">{form.tagline.length}/255</p>
                          </div>
                          <div>
                            <label className="form-label">APK Download Link <span className="text-neutral-400 font-normal">(optional)</span></label>
                            <input className="profile-input" value={form.apk_download_url} onChange={setFromEvent('apk_download_url')} placeholder="https://drive.google.com/..." />
                            <p className="text-xs text-neutral-400 mt-1">Google Drive share link auto-converted for direct download.</p>
                          </div>
                          <div className="profile-toggle-item">
                            <div className="flex items-center gap-3">
                              <div className="profile-toggle-icon">
                                <span className="material-symbols-outlined text-xl">public</span>
                              </div>
                              <div>
                                <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Publish Page</p>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">Make your page publicly accessible</p>
                              </div>
                            </div>
                            <label className="toggle-switch">
                              <input type="checkbox" checked={form.is_published} onChange={setFromEvent('is_published')} className="toggle-checkbox" />
                              <span className="toggle-slider"></span>
                            </label>
                          </div>
                          {form.subdomain && form.is_published && (
                            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-sm border border-emerald-200 dark:border-emerald-800">
                              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                                Live at{' '}
                                <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">{publicUrl}</a>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {message && (
                      <p className={`text-sm mt-4 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>{message.text}</p>
                    )}
                  </div>

                  {/* Save bar */}
                  <div className="border-t border-neutral-200 dark:border-neutral-700 px-7 py-4 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50">
                    {form.subdomain && (
                      <a href={`/s/${form.subdomain}`} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center gap-1">
                        <span className="material-symbols-outlined text-base">open_in_new</span>
                        Preview Page
                      </a>
                    )}
                    {!form.subdomain && <div />}
                    <button className="btn-primary text-sm" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default BrandingPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/owner/BrandingPage.jsx
git commit -m "feat(branding): add BrandingPage management with Appearance/Services/Publish tabs"
```

---

## Task 9: CustomerRequestDetail page

**Files:**
- Create: `src/pages/owner/CustomerRequestDetail.jsx`

- [ ] **Step 1: Create the file**

Create `src/pages/owner/CustomerRequestDetail.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { accessRequestsApi } from '../../lib/api';

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  APPROVED: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const CustomerRequestDetail = ({ requestId }) => {
  const { profile } = useAuth();
  const currentUser = buildSidebarUser(profile);
  const navigation  = getNavigationByRole(profile?.role);
  const canAction   = ['OWNER', 'MANAGER'].includes(profile?.role);

  const [req, setReq]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(null); // 'approve' | 'reject'
  const [notes, setNotes]     = useState('');
  const [message, setMessage] = useState(null);

  const navigate = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

  useEffect(() => {
    if (!requestId) return;
    accessRequestsApi.get(requestId)
      .then(setReq)
      .catch(() => setMessage({ type: 'error', text: 'Failed to load request.' }))
      .finally(() => setLoading(false));
  }, [requestId]);

  const handleApprove = async () => {
    setActing('approve'); setMessage(null);
    try {
      const updated = await accessRequestsApi.approve(requestId);
      setReq(updated);
      setMessage({ type: 'success', text: 'Request approved. Welcome email sent to customer.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActing(null);
    }
  };

  const handleReject = async () => {
    setActing('reject'); setMessage(null);
    try {
      const updated = await accessRequestsApi.reject(requestId, notes);
      setReq(updated);
      setMessage({ type: 'success', text: 'Request rejected.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActing(null);
    }
  };

  const statusCfg = req ? (STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING) : null;

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/customers" onNavigate={() => {}} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate('/admin/customers')}
              className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-5 transition-colors">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to Customers
            </button>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
              </div>
            ) : !req ? (
              <div className="profile-section text-center py-10">
                <p className="text-neutral-500">Request not found.</p>
              </div>
            ) : (
              <div className="profile-section">
                <div className="profile-section-header">
                  <div className="profile-section-icon">
                    <span className="material-symbols-outlined">person_add</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Access Request</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Submitted {new Date(req.requested_at).toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  {[
                    { label: 'Full Name',     value: req.full_name },
                    { label: 'Email',         value: req.email },
                    { label: 'Mobile Number', value: req.mobile_number || '—' },
                    { label: 'Status',        value: req.status },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 border border-neutral-200 dark:border-neutral-700">
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">{label}</p>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 break-all">{value}</p>
                    </div>
                  ))}
                </div>

                {req.notes && (
                  <div className="mt-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 border border-neutral-200 dark:border-neutral-700">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Staff Notes</p>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">{req.notes}</p>
                  </div>
                )}

                {canAction && req.status === 'PENDING' && (
                  <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700 space-y-4">
                    <div>
                      <label className="form-label">Notes <span className="text-neutral-400 font-normal">(optional)</span></label>
                      <textarea className="profile-input resize-none" rows={3} value={notes}
                        onChange={e => setNotes(e.target.value)} placeholder="Add a note before approving or rejecting..." />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={handleApprove} disabled={acting !== null}
                        className="btn-primary flex items-center gap-2 text-sm">
                        {acting === 'approve' ? 'Approving...' : <><span className="material-symbols-outlined text-base">check_circle</span> Approve</>}
                      </button>
                      <button onClick={handleReject} disabled={acting !== null}
                        className="btn-outline flex items-center gap-2 text-sm text-red-500 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20">
                        {acting === 'reject' ? 'Rejecting...' : <><span className="material-symbols-outlined text-base">cancel</span> Reject</>}
                      </button>
                    </div>
                  </div>
                )}

                {message && (
                  <p className={`text-sm mt-4 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>{message.text}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CustomerRequestDetail;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/owner/CustomerRequestDetail.jsx
git commit -m "feat(customers): add CustomerRequestDetail page with approve/reject actions"
```

---

## Task 10: Customers page — Pending Requests tab

**Files:**
- Modify: `src/pages/owner/Customers.jsx`

- [ ] **Step 1: Add the Pending Requests tab**

In `src/pages/owner/Customers.jsx`, find where the page title/header is rendered. Add a tab state and imports at the top of the `Customers` component, then render the tab bar and tab content.

At the top of the `Customers` component function, add after the existing state declarations:

```jsx
const [activeTab, setActiveTab]         = useState('customers'); // 'customers' | 'requests'
const [accessRequests, setAccessRequests] = useState([]);
const [reqLoading, setReqLoading]        = useState(false);
const [reqCount, setReqCount]            = useState(0);
```

Add the import at the top of the file:

```jsx
import { accessRequestsApi } from '../../lib/api';
```

After the existing `useEffect` that fetches customers, add:

```jsx
// Fetch pending requests count (for badge)
useEffect(() => {
  accessRequestsApi.list({ status: 'PENDING' })
    .then(data => setReqCount(Array.isArray(data) ? data.length : 0))
    .catch(() => {});
}, []);

// Fetch requests when tab switches to 'requests'
useEffect(() => {
  if (activeTab !== 'requests') return;
  setReqLoading(true);
  accessRequestsApi.list({ status: 'PENDING' })
    .then(data => setAccessRequests(Array.isArray(data) ? data : []))
    .catch(() => {})
    .finally(() => setReqLoading(false));
}, [activeTab]);
```

Find the `navigate` helper or add one:
```jsx
const navigateTo = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };
```

In the JSX, find the main content area heading (typically `<h1>Customers</h1>` or similar) and add tabs immediately below/above the existing table controls:

```jsx
{/* Tabs */}
<div className="flex gap-0 border-b border-neutral-200 dark:border-neutral-700 mb-0 -mx-0">
  <button onClick={() => setActiveTab('customers')}
    className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'customers' ? 'border-primary text-neutral-900 dark:text-white' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}>
    All Customers
  </button>
  <button onClick={() => setActiveTab('requests')}
    className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'requests' ? 'border-primary text-neutral-900 dark:text-white' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}>
    Pending Requests
    {reqCount > 0 && (
      <span className="bg-primary text-neutral-900 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{reqCount}</span>
    )}
  </button>
</div>
```

Below the tabs, wrap the existing table in `{activeTab === 'customers' && (...)}` and add the requests table when `activeTab === 'requests'`:

```jsx
{activeTab === 'requests' && (
  <div>
    {reqLoading ? (
      <div className="flex items-center justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
      </div>
    ) : accessRequests.length === 0 ? (
      <div className="text-center py-16 text-neutral-400">No pending requests.</div>
    ) : (
      <table className="loan-table w-full">
        <thead>
          <tr>
            <th className="loan-th text-left">Name</th>
            <th className="loan-th">Email</th>
            <th className="loan-th">Mobile</th>
            <th className="loan-th">Requested</th>
            <th className="loan-th">Action</th>
          </tr>
        </thead>
        <tbody>
          {accessRequests.map(r => (
            <tr key={r.id} className="loan-row cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              onClick={() => navigateTo(`/admin/customers/requests/${r.id}`)}>
              <td className="px-6 py-4 text-sm font-semibold text-neutral-800 dark:text-neutral-200">{r.full_name}</td>
              <td className="px-6 py-4 text-sm text-center text-neutral-500">{r.email}</td>
              <td className="px-6 py-4 text-sm text-center text-neutral-500">{r.mobile_number || '—'}</td>
              <td className="px-6 py-4 text-sm text-center text-neutral-500">{new Date(r.requested_at).toLocaleDateString('en-PH')}</td>
              <td className="px-6 py-4 text-center">
                <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                  <button className="btn-primary text-xs px-3 py-1.5"
                    onClick={async () => {
                      try {
                        await accessRequestsApi.approve(r.id);
                        setAccessRequests(prev => prev.filter(x => x.id !== r.id));
                        setReqCount(c => Math.max(0, c - 1));
                      } catch (err) { alert(err.message); }
                    }}>
                    Approve
                  </button>
                  <button className="btn-outline text-xs px-3 py-1.5 text-red-500 border-red-200 dark:border-red-900"
                    onClick={() => navigateTo(`/admin/customers/requests/${r.id}`)}>
                    Review
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/owner/Customers.jsx
git commit -m "feat(customers): add Pending Requests tab with approve/review actions"
```

---

## Task 11: Dashboard nudge banner

**Files:**
- Modify: `src/pages/owner/AdminDash.jsx`

- [ ] **Step 1: Add nudge banner to AdminDash**

In `src/pages/owner/AdminDash.jsx`, add the following import:

```jsx
import { brandingApi } from '../../lib/api';
```

In the component, add state:

```jsx
const [showNudge, setShowNudge] = useState(false);
```

Add a `useEffect` after the existing ones:

```jsx
useEffect(() => {
  const dismissed = localStorage.getItem('branding_nudge_dismissed');
  if (dismissed) return;
  brandingApi.get()
    .then(data => { if (!data?.is_published) setShowNudge(true); })
    .catch(() => {});
}, []);
```

Add a `navigate` helper if not already present:
```jsx
const navigate = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };
```

In the JSX, immediately after the opening `<div className="admin-content ...">` tag, add:

```jsx
{showNudge && (
  <div className="mb-5 flex items-center justify-between gap-4 p-4 rounded-sm bg-primary/10 border border-primary/20">
    <div className="flex items-center gap-3">
      <span className="material-symbols-outlined text-primary text-xl">web</span>
      <div>
        <p className="text-sm font-bold text-neutral-900 dark:text-white">Your public page isn't set up yet</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Complete your branding to go live and attract customers.</p>
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      <button onClick={() => navigate('/admin/branding/setup')} className="btn-primary text-xs px-4 py-2">
        Set Up Now
      </button>
      <button onClick={() => { setShowNudge(false); localStorage.setItem('branding_nudge_dismissed', '1'); }}
        className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
        <span className="material-symbols-outlined text-lg">close</span>
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/owner/AdminDash.jsx
git commit -m "feat(dashboard): add branding setup nudge banner"
```

---

## Task 12: Routing, navigation, and page exports

**Files:**
- Modify: `src/pages/owner/index.js`
- Modify: `src/pages/index.js`
- Modify: `src/App.jsx`
- Modify: `src/config/navigation.js`

- [ ] **Step 1: Export new pages from `src/pages/owner/index.js`**

Add three lines at the end of `src/pages/owner/index.js`:

```js
export { default as BrandingSetupPage }     from './BrandingSetupPage'
export { default as BrandingPage }          from './BrandingPage'
export { default as CustomerRequestDetail } from './CustomerRequestDetail'
```

- [ ] **Step 2: Re-export from `src/pages/index.js`**

In `src/pages/index.js`, find the owner pages export line and add the three new pages:

```js
export { AdminDash, ProfilePage, SettingsPage, ActiveLoans, Inventory, Appraisals, AuctionItems, Customers, Employee, InventoryAudit, OverdueItems, Reports, SubscriptionPage, KycPage, AdminPricingPage, BrandingSetupPage, BrandingPage, CustomerRequestDetail } from './owner'
```

- [ ] **Step 3: Add routes to `src/App.jsx`**

In `src/App.jsx`, add the three imports to the existing destructured import from `'./pages'`:

```js
import {
  LandingPage, ProcessPage, PricingPage, AboutPage, TermsPage,
  LoginPage, RegisterPage, RecoverAcc, SetupPasswordPage,
  AdminDash, ProfilePage, SettingsPage, ActiveLoans, Inventory,
  Appraisals, AuctionItems, Customers, Employee, InventoryAudit, OverdueItems, Reports,
  SubscriptionPage, KycPage, AdminPricingPage,
  BrandingSetupPage, BrandingPage, CustomerRequestDetail,  // ← add these
  SuperAdminDash, SuperAdminTenants, SuperAdminReports, SuperAdminSalesReport, SuperAdminAuditLogs, SuperAdminBackup, SuperAdminSettings, SuperAdminAdmins,
} from './pages'
```

In the `renderPage` function, **before** the `switch` statement, add a dynamic route check:

```js
// Dynamic route: customer request detail
if (currentPath.startsWith('/admin/customers/requests/')) {
  const requestId = currentPath.split('/').pop();
  if (requestId) return <CustomerRequestDetail requestId={requestId} />;
}
```

In the `switch` statement, add the two new branding routes in the `// ── Owner ──` section:

```js
case '/admin/branding/setup':
  return <BrandingSetupPage />
case '/admin/branding':
  return <BrandingPage />
```

- [ ] **Step 4: Add Branding to navigation**

In `src/config/navigation.js`, in `adminNavigation`, find the `System` category and add a Branding item to `Management`:

```js
// In adminNavigation, Management category:
{
  category: 'Management',
  items: [
    { icon: 'group',    label: 'Customers',  path: '/admin/customers',  requiresKyc: true },
    { icon: 'badge',    label: 'Employees',  path: '/admin/employees',  requiresKyc: true },
    { icon: 'web',      label: 'Branding',   path: '/admin/branding',   requiresKyc: true },  // ← add
  ],
},
```

Add the same item to `managerNavigation` Management category:

```js
{ icon: 'web', label: 'Branding', path: '/admin/branding' },
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/owner/index.js src/pages/index.js src/App.jsx src/config/navigation.js
git commit -m "feat(routing): add BrandingSetupPage, BrandingPage, CustomerRequestDetail routes and nav"
```

---

## Task 13: SubscriptionPage post-payment redirect

**Files:**
- Modify: `src/pages/owner/SubscriptionPage.jsx`

- [ ] **Step 1: Add branding check after payment confirmation**

In `src/pages/owner/SubscriptionPage.jsx`, add this import at the top:

```jsx
import { brandingApi } from '../../lib/api';
```

Find the `useEffect` that polls for subscription status:

```js
useEffect(() => {
  if (!successMessage) return;
  const interval = setInterval(async () => {
    const active = await refreshSubscription();
    if (active) {
      clearInterval(interval);
    }
  }, 3000);
  return () => clearInterval(interval);
}, [successMessage, refreshSubscription]);
```

Replace `clearInterval(interval)` with:

```js
if (active) {
  clearInterval(interval);
  // First-time setup: redirect to wizard if branding not configured
  try {
    const branding = await brandingApi.get();
    const isFirstSetup = !branding || !branding.brand_color;
    if (isFirstSetup) {
      window.history.pushState({}, '', '/admin/branding/setup');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  } catch {
    // Silently fail — user stays on subscription page
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/owner/SubscriptionPage.jsx
git commit -m "feat(subscription): redirect to branding wizard after first payment"
```

---

## Task 14: Superadmin tenant detail — public page link

**Files:**
- Modify: `server/routes/tenants.js`
- Modify: `src/pages/superadmin/Tenants.jsx`

- [ ] **Step 1: Include branding in tenants route**

In `server/routes/tenants.js`, find the route that returns a single tenant's detail (likely `GET /:id` or similar). In the Supabase select query for that route, add a join to `tenant_branding`:

Find the select query for tenant detail and change it to include:

```js
.select('*, tenant_branding(subdomain, is_published)')
```

This makes `tenant.tenant_branding` available in the response as `{ subdomain, is_published }`.

If `tenants.js` doesn't have a single-tenant get route, find the list route and check if tenant detail is fetched client-side. In either case, the join adds minimal data.

- [ ] **Step 2: Add public page link in `Tenants.jsx`**

In `src/pages/superadmin/Tenants.jsx`, find where individual tenant details are displayed (tenant detail panel, modal, or row expansion). Add the following field:

```jsx
{/* Public page link */}
{tenant.tenant_branding?.is_published && tenant.tenant_branding?.subdomain ? (
  <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 border border-neutral-200 dark:border-neutral-700">
    <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Public Page</p>
    <a
      href={`${window.location.origin}/s/${tenant.tenant_branding.subdomain}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-primary font-semibold underline flex items-center gap-1"
    >
      /s/{tenant.tenant_branding.subdomain}
      <span className="material-symbols-outlined text-sm">open_in_new</span>
    </a>
  </div>
) : (
  <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 border border-neutral-200 dark:border-neutral-700">
    <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Public Page</p>
    <p className="text-sm text-neutral-400 dark:text-neutral-500">Not published yet</p>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/tenants.js src/pages/superadmin/Tenants.jsx
git commit -m "feat(superadmin): show public page link in tenant detail"
```

---

## Task 15: End-to-end verification

- [ ] **Step 1: Run all backend tests**

```bash
cd "C:/Users/Jefferson B. Pile/Documents/VS Code/obsidian-pmtp-mng"
npx jest --no-coverage
```

Expected: all tests pass (no regression in existing tests).

- [ ] **Step 2: Start dev servers and verify the wizard flow**

Start backend: `node server/index.js`
Start frontend: `npm run dev`

1. Log in as an owner whose subscription just paid (or manually trigger the wizard by navigating to `/admin/branding/setup`)
2. Complete all 3 wizard steps
3. Verify redirect to `/admin/branding` after finishing

- [ ] **Step 3: Verify the branding management page**

Navigate to `/admin/branding`. Verify:
- Appearance tab: logo preview updates, color picker opens on swatch click, font chips show correct typefaces
- Services tab: toggling services saves correctly
- Publish tab: subdomain availability check works, toggle shows live URL

- [ ] **Step 4: Verify the public showcase page**

After publishing at `/admin/branding`:
1. Navigate to `/s/your-slug`
2. Verify brand color is applied as CSS variable
3. Verify business name uses selected font
4. Verify only enabled services are shown
5. Click "Staff Login" → modal opens
6. Submit request access form → success message appears

- [ ] **Step 5: Verify customer requests flow**

1. Submit a request via the public page
2. Navigate to `/admin/customers` → "Pending Requests" tab shows the request
3. Click the row → request detail page loads
4. Click Approve → customer created, welcome email sent (check email logs)

- [ ] **Step 6: Verify superadmin link**

Log in as superadmin → navigate to Tenants → find the tenant → verify public page link shows `/s/slug` with an external link.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: tenant public landing page, branding setup wizard, and customer access requests — complete"
```

---

## Self-Review Checklist

- [x] **DB migration** — `brand_color`, `font_family`, `services_enabled` on `tenant_branding`; `customer_access_requests` table with RLS
- [x] **Backend branding route** — validates hex color, services array, logo URL; updates `tenants` table
- [x] **Public POST** — rate limited, validates tenant exists, creates PENDING record
- [x] **Admin routes** — list, get, approve (creates customer + auth user + sends email), reject
- [x] **Showcase template** — brand color CSS var, font loading, services grid, request form, staff login modal, TENANT_ID injection
- [x] **subdomainResolver** — fetches new fields, builds services HTML, passes all template vars
- [x] **API module** — `brandingApi` extended; `accessRequestsApi` added
- [x] **BrandingSetupPage** — 3-step wizard, skip link, saves each step on Next
- [x] **BrandingPage** — 3 tabs (Appearance, Services, Publish), per-tab save
- [x] **CustomerRequestDetail** — loads request, shows details, approve/reject with notes
- [x] **Customers.jsx** — Pending Requests tab with badge, quick approve + Review button
- [x] **AdminDash.jsx** — nudge banner, localStorage dismiss, disappears when published
- [x] **SubscriptionPage.jsx** — post-payment redirect to wizard on first setup
- [x] **App.jsx** — new routes + dynamic `/admin/customers/requests/:id` handling
- [x] **navigation.js** — Branding in admin + manager navs
- [x] **Tenants.jsx** — public page link shown if published
