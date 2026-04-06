# Tenant Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tenant-level audit log that records every meaningful employee action and lets the owner view, filter, and export it.

**Architecture:** New `tenant_audit_logs` DB table + a `logTenantAudit()` server helper called explicitly from each route at the success point. New `GET /api/audit-logs` endpoint serves the data. New `AuditLogPage.jsx` displays a filterable, paginated, exportable table.

**Tech Stack:** Supabase PostgreSQL, Express.js, React 18

---

### Task 1: Database Migration

**Files:**
- Create: `sql/109_tenant_audit_logs.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 109: Tenant-level audit logs for employee activity monitoring

CREATE TABLE IF NOT EXISTS tenant_audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES tenant_users(id),
  action      TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  description TEXT        NOT NULL,
  target_type TEXT,
  target_id   UUID,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query path: list by tenant sorted by time
CREATE INDEX idx_tenant_audit_tenant_time ON tenant_audit_logs (tenant_id, created_at DESC);

-- Filter by category within a tenant
CREATE INDEX idx_tenant_audit_tenant_cat ON tenant_audit_logs (tenant_id, category);

-- Filter by employee within a tenant
CREATE INDEX idx_tenant_audit_tenant_user ON tenant_audit_logs (tenant_id, user_id);

-- RLS: only OWNER can read their own tenant's logs
ALTER TABLE tenant_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_audit_logs_owner_read ON tenant_audit_logs
  FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'OWNER');

-- Service role (backend) can insert freely — no insert policy needed since we use supabaseAdmin
```

- [ ] **Step 2: Run migration on Supabase**

Run the SQL in the Supabase SQL editor or via CLI.

- [ ] **Step 3: Commit**

```bash
git add sql/109_tenant_audit_logs.sql
git commit -m "feat(db): add tenant_audit_logs table with RLS"
```

---

### Task 2: Server — Audit Log Helper

**Files:**
- Create: `server/utils/auditLog.js`

- [ ] **Step 1: Create the helper**

```js
const { supabaseAdmin } = require('../config/db');

/**
 * Log a tenant-level audit event. Fire-and-forget — does not throw on failure.
 *
 * @param {object} req - Express request (must have tenantId, userId)
 * @param {object} opts
 * @param {string} opts.action - Machine-readable code (e.g. APPRAISAL_SUBMITTED)
 * @param {string} opts.category - Grouping (AUTH, APPRAISAL, LOAN, etc.)
 * @param {string} opts.description - Human-readable summary
 * @param {string} [opts.target_type] - Entity type (pawn_item, customer, etc.)
 * @param {string} [opts.target_id] - UUID of affected entity
 */
function logTenantAudit(req, { action, category, description, target_type, target_id }) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

  supabaseAdmin.from('tenant_audit_logs').insert({
    tenant_id: req.tenantId,
    user_id: req.userId || null,
    action,
    category,
    description,
    target_type: target_type || null,
    target_id: target_id || null,
    ip_address: ip,
  }).then(({ error }) => {
    if (error) console.error('[AUDIT] Failed to log:', error.message);
  });
}

module.exports = { logTenantAudit };
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/auditLog.js
git commit -m "feat(server): add logTenantAudit helper"
```

---

### Task 3: Server — Audit Log API Endpoint

**Files:**
- Create: `server/routes/auditLogs.js`
- Modify: `server/index.js`

- [ ] **Step 1: Create the route file**

```js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');

// GET /api/audit-logs — Owner-only, paginated, filterable
router.get('/', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the owner can view audit logs' });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { category, user_id, from_date, to_date } = req.query;

  let query = supabaseAdmin
    .from('tenant_audit_logs')
    .select('*, user:tenant_users(full_name)', { count: 'exact' })
    .eq('tenant_id', req.tenantId);

  if (category) query = query.eq('category', category);
  if (user_id) query = query.eq('user_id', user_id);
  if (from_date) query = query.gte('created_at', from_date);
  if (to_date) query = query.lte('created_at', `${to_date}T23:59:59.999Z`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ data: data || [], total: count || 0, page, limit });
});

module.exports = router;
```

- [ ] **Step 2: Register the route in server/index.js**

Add after the branding routes line (~line 105):

```js
const auditLogRoutes = require('./routes/auditLogs');
```

Add in the protected routes section:

```js
app.use('/api/audit-logs', auth, tenantScope, auditLogRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/auditLogs.js server/index.js
git commit -m "feat(server): add GET /api/audit-logs endpoint (owner only)"
```

---

### Task 4: Instrument Routes — Auth

**Files:**
- Modify: `server/routes/auth.js`

- [ ] **Step 1: Add audit log calls to auth.js**

Add at the top of the file, after the existing requires:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

Insert `logTenantAudit` calls at each success point:

**Login success** — after the `res.json()` at line ~168 (OWNER/employee login), add before the response:

```js
logTenantAudit(
  { ...req, tenantId: tuProfile.tenant_id, userId: tuProfile.id },
  { action: 'LOGIN_SUCCESS', category: 'AUTH', description: `${tuProfile.full_name} logged in`, target_type: 'tenant_user', target_id: tuProfile.id }
);
```

**Login failed** — after returning 401 for bad credentials, add:

```js
logTenantAudit(
  { ...req, tenantId: null, userId: null },
  { action: 'LOGIN_FAILED', category: 'AUTH', description: `Failed login attempt for ${email}` }
);
```

Note: `tenantId` is null for failed logins since we don't know the tenant. These rows will have null tenant_id and won't appear in the owner's view — this is acceptable.

**Logout** — before the `res.json()` at the logout endpoint:

```js
logTenantAudit(req, { action: 'LOGOUT', category: 'AUTH', description: `${req.user?.email || 'User'} logged out` });
```

**Password changed** — before the success response in the force-change-password endpoint:

```js
logTenantAudit(req, { action: 'PASSWORD_CHANGED', category: 'AUTH', description: 'Changed password' });
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat(audit): instrument auth routes with audit logging"
```

---

### Task 5: Instrument Routes — Appraisals

**Files:**
- Modify: `server/routes/appraisals.js`

- [ ] **Step 1: Add audit log calls to appraisals.js**

Add the require at the top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

**Intake** (POST /intake, before `res.status(201).json(item)`):

```js
logTenantAudit(req, {
  action: 'ITEM_INTAKE', category: 'APPRAISAL',
  description: `Accepted ${category || 'item'} from customer`,
  target_type: 'pawn_item', target_id: item.id,
});
```

**Submit** (POST /submit, before `res.status(200).json(updated)`):

```js
logTenantAudit(req, {
  action: 'APPRAISAL_SUBMITTED', category: 'APPRAISAL',
  description: `Submitted appraisal for ${description || updated.general_desc || 'item'} — ₱${Number(appraised_value).toLocaleString()}`,
  target_type: 'pawn_item', target_id: item_id,
});
```

**Approve** (POST /:id/approve, before the success response):

```js
logTenantAudit(req, {
  action: 'APPRAISAL_APPROVED', category: 'APPRAISAL',
  description: `Approved appraisal for item`,
  target_type: 'pawn_item', target_id: req.params.id,
});
```

**Reject** (POST /:id/reject, before `res.json(data)`):

```js
logTenantAudit(req, {
  action: 'APPRAISAL_REJECTED', category: 'APPRAISAL',
  description: `Rejected appraisal for item`,
  target_type: 'pawn_item', target_id: req.params.id,
});
```

**Decline** (POST /:id/decline, before `res.json(data)`):

```js
logTenantAudit(req, {
  action: 'APPRAISAL_DECLINED', category: 'APPRAISAL',
  description: `Declined appraisal for item`,
  target_type: 'pawn_item', target_id: req.params.id,
});
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/appraisals.js
git commit -m "feat(audit): instrument appraisal routes with audit logging"
```

---

### Task 6: Instrument Routes — Loans, Renewals, Payments

**Files:**
- Modify: `server/routes/pawnTickets.js`
- Modify: `server/routes/renewals.js`
- Modify: `server/routes/payments.js`

- [ ] **Step 1: Instrument pawnTickets.js**

Add require at top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

**Ticket issued** (POST /, before `res.status(201).json(data)`):

```js
logTenantAudit(req, {
  action: 'TICKET_ISSUED', category: 'LOAN',
  description: `Issued pawn ticket ${data.ticket_number} — ₱${Number(data.principal_loan).toLocaleString()}`,
  target_type: 'pawn_ticket', target_id: data.id,
});
```

**Loan redeemed** — find the redemption success point, and add:

```js
logTenantAudit(req, {
  action: 'LOAN_REDEEMED', category: 'LOAN',
  description: `Redeemed loan ${ticket.ticket_number}`,
  target_type: 'pawn_ticket', target_id: ticket.id,
});
```

- [ ] **Step 2: Instrument renewals.js**

Add require at top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

Before `res.status(201).json()`:

```js
logTenantAudit(req, {
  action: 'LOAN_RENEWED', category: 'LOAN',
  description: `Renewed loan`,
  target_type: 'pawn_ticket', target_id: req.body.ticket_id,
});
```

- [ ] **Step 3: Instrument payments.js**

Add require at top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

Before `res.status(201).json()`:

```js
logTenantAudit(req, {
  action: 'PAYMENT_PROCESSED', category: 'PAYMENT',
  description: `Processed ₱${Number(req.body.amount_paid || 0).toLocaleString()} payment`,
  target_type: 'pawn_ticket', target_id: req.body.ticket_id,
});
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/pawnTickets.js server/routes/renewals.js server/routes/payments.js
git commit -m "feat(audit): instrument loan, renewal, payment routes"
```

---

### Task 7: Instrument Routes — Customers, Employees, Dispositions

**Files:**
- Modify: `server/routes/customers.js`
- Modify: `server/routes/employees.js`
- Modify: `server/routes/dispositions.js`

- [ ] **Step 1: Instrument customers.js**

Add require at top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

**Create** (POST /, before `res.status(201).json(customer)`):

```js
logTenantAudit(req, {
  action: 'CUSTOMER_CREATED', category: 'CUSTOMER',
  description: `Created customer ${customer.first_name} ${customer.last_name}`,
  target_type: 'customer', target_id: customer.id,
});
```

**Update** (PATCH /:id, before `res.json(data)`):

```js
logTenantAudit(req, {
  action: 'CUSTOMER_UPDATED', category: 'CUSTOMER',
  description: `Updated customer ${data.first_name} ${data.last_name}`,
  target_type: 'customer', target_id: data.id,
});
```

- [ ] **Step 2: Instrument employees.js**

Add require at top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

**Create** (POST /, before `res.status(201).json(employee)`):

```js
logTenantAudit(req, {
  action: 'EMPLOYEE_CREATED', category: 'EMPLOYEE',
  description: `Created employee ${employee.full_name} (${employee.role})`,
  target_type: 'tenant_user', target_id: employee.id,
});
```

**Deactivate** (DELETE /:id, before `res.json()`):

```js
logTenantAudit(req, {
  action: 'EMPLOYEE_DEACTIVATED', category: 'EMPLOYEE',
  description: `Deactivated employee`,
  target_type: 'tenant_user', target_id: req.params.id,
});
```

- [ ] **Step 3: Instrument dispositions.js**

Add require at top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

**Disposition approve** (POST /approve, before `res.json(data)`):

```js
const dispositionLabel = req.body.disposition_path === 'AUCTION' ? 'Moved item to auction'
  : req.body.disposition_path === 'MELT' ? 'Melted item' : 'Forfeited item';
const actionCode = req.body.disposition_path === 'AUCTION' ? 'ITEM_AUCTIONED'
  : req.body.disposition_path === 'MELT' ? 'ITEM_MELTED' : 'ITEM_FORFEITED';

logTenantAudit(req, {
  action: actionCode, category: 'INVENTORY',
  description: dispositionLabel,
  target_type: 'pawn_item', target_id: req.body.item_id,
});
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/customers.js server/routes/employees.js server/routes/dispositions.js
git commit -m "feat(audit): instrument customer, employee, disposition routes"
```

---

### Task 8: Instrument Routes — Settings, Pricing, Branding

**Files:**
- Modify: `server/routes/loanSettings.js`
- Modify: `server/routes/pricing.js`
- Modify: `server/routes/branding.js`

- [ ] **Step 1: Instrument loanSettings.js**

Add require at top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

**Loan settings update** (PATCH /, before `res.json(data)`):

```js
logTenantAudit(req, { action: 'LOAN_SETTINGS_UPDATED', category: 'SETTINGS', description: 'Updated loan settings' });
```

**Gold rates bulk update** (PUT /gold-rates/bulk, before `res.json()`):

```js
logTenantAudit(req, { action: 'GOLD_RATES_UPDATED', category: 'SETTINGS', description: 'Updated gold rates' });
```

- [ ] **Step 2: Instrument pricing.js**

Add require at top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

**Silver rates update** (PUT /silver-rates/bulk, before `res.json()`):

```js
logTenantAudit(req, { action: 'SILVER_RATES_UPDATED', category: 'SETTINGS', description: 'Updated silver rates' });
```

**Conditions update** (PUT /item-conditions, before `res.json()`):

```js
logTenantAudit(req, { action: 'CONDITIONS_UPDATED', category: 'SETTINGS', description: 'Updated item conditions' });
```

- [ ] **Step 3: Instrument branding.js**

Add require at top:

```js
const { logTenantAudit } = require('../utils/auditLog');
```

**Branding update** (PUT /, before `res.json(data)`):

```js
logTenantAudit(req, { action: 'BRANDING_UPDATED', category: 'SETTINGS', description: 'Updated branding settings' });
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/loanSettings.js server/routes/pricing.js server/routes/branding.js
git commit -m "feat(audit): instrument settings, pricing, branding routes"
```

---

### Task 9: Frontend — API Client + Navigation

**Files:**
- Modify: `src/lib/api.js`
- Modify: `src/config/navigation.js`

- [ ] **Step 1: Add auditLogApi to api.js**

After the `pricingApi` export block, add:

```js
// ── Audit Logs ───────────────────────────────────────────
export const auditLogApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/audit-logs?${qs}`);
  },
};
```

- [ ] **Step 2: Add nav item in navigation.js**

In `adminNavigation`, inside the System category items array, add before the Settings item:

```js
{ icon: 'history', label: 'Audit Log', path: '/admin/audit-log', requiresKyc: true, ownerOnly: true },
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.js src/config/navigation.js
git commit -m "feat(frontend): add audit log API client and nav item"
```

---

### Task 10: Frontend — AuditLogPage

**Files:**
- Create: `src/pages/owner/AuditLogPage.jsx`
- Modify: `src/pages/owner/index.js`
- Modify: `src/pages/index.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create AuditLogPage.jsx**

```jsx
import { useState, useEffect } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { Pagination } from '../../components/ui';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { auditLogApi, employeesApi } from '../../lib/api';

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const PAGE_SIZE = 20;

const CATEGORIES = ['All', 'AUTH', 'APPRAISAL', 'LOAN', 'PAYMENT', 'CUSTOMER', 'INVENTORY', 'SETTINGS', 'EMPLOYEE'];

const CATEGORY_COLORS = {
  AUTH: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  APPRAISAL: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  LOAN: 'bg-primary/10 text-primary border-primary/20',
  PAYMENT: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  CUSTOMER: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  INVENTORY: 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20',
  SETTINGS: 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20',
  EMPLOYEE: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
};

function exportAuditPdf(rows, businessName) {
  const now = new Date().toLocaleString();
  const headers = ['Date & Time', 'Employee', 'Category', 'Description', 'IP Address'];
  const html = `<!DOCTYPE html>
<html><head><title>Audit Log</title>
<style>
  @page { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; padding: 40px; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .header-left h1 { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .header-left p { font-size: 11px; color: #666; margin-top: 2px; }
  .header-right { text-align: right; }
  .header-right .biz { font-size: 14px; font-weight: 700; }
  .header-right .date { font-size: 10px; color: #888; margin-top: 2px; }
  .summary { display: flex; gap: 24px; margin-bottom: 20px; }
  .summary-card { background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px 16px; flex: 1; }
  .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: 600; }
  .summary-card .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
  thead th { background: #1a1a1a; color: #fff; text-align: left; padding: 10px 14px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th:first-child { border-radius: 6px 0 0 0; }
  thead th:last-child { border-radius: 0 6px 0 0; }
  tbody td { padding: 9px 14px; border-bottom: 1px solid #eee; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .footer { text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #e5e5e5; padding-top: 12px; }
</style></head><body>
<div class="header">
  <div class="header-left"><h1>Audit Log</h1><p>Employee activity report</p></div>
  <div class="header-right"><div class="biz">${businessName || 'Obsidian'}</div><div class="date">Generated: ${now}</div></div>
</div>
<div class="summary">
  <div class="summary-card"><div class="label">Entries Shown</div><div class="value">${rows.length}</div></div>
  <div class="summary-card"><div class="label">Report</div><div class="value">Audit Log</div></div>
  <div class="summary-card"><div class="label">Generated</div><div class="value">${new Date().toLocaleDateString()}</div></div>
</div>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:#999">No entries</td></tr>` :
  rows.map(r => `<tr>
    <td>${new Date(r.created_at).toLocaleString()}</td>
    <td>${r.user?.full_name || '–'}</td>
    <td>${r.category}</td>
    <td>${r.description}</td>
    <td>${r.ip_address || '–'}</td>
  </tr>`).join('')}
</tbody></table>
<div class="footer">${businessName || 'Obsidian'} — Pawnshop Management System — Confidential</div>
</body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.print(); };
}

const AuditLogPage = () => {
  const { profile } = useAuth();
  const navigation = getNavigationByRole(profile?.role);
  const currentUser = buildSidebarUser(profile);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState('');
  const [userId, setUserId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [employees, setEmployees] = useState([]);

  // Fetch employees for dropdown
  useEffect(() => {
    employeesApi.list({ limit: 200 })
      .then(res => setEmployees(res.data || res || []))
      .catch(() => {});
  }, []);

  const fetchLogs = (p = page) => {
    setLoading(true);
    const params = { page: p, limit: PAGE_SIZE };
    if (category) params.category = category;
    if (userId) params.user_id = userId;
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    auditLogApi.list(params)
      .then(res => { setLogs(res.data || []); setTotal(res.total || 0); })
      .catch(() => { setLogs([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(page); }, [page]);

  const handleFilter = () => { setPage(1); fetchLogs(1); };
  const handleClear = () => {
    setCategory(''); setUserId(''); setFromDate(''); setToDate('');
    setPage(1);
    // Fetch with cleared filters
    setLoading(true);
    auditLogApi.list({ page: 1, limit: PAGE_SIZE })
      .then(res => { setLogs(res.data || []); setTotal(res.total || 0); })
      .catch(() => { setLogs([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/audit-log" onNavigate={() => {}} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="md:px-8 md:py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">Audit Log</h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Monitor employee activity across your pawnshop</p>
              </div>
            </div>

            {/* Filters */}
            <div className="profile-section mb-6">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="form-label">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="profile-input text-sm">
                    {CATEGORIES.map(c => (
                      <option key={c} value={c === 'All' ? '' : c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Employee</label>
                  <select value={userId} onChange={e => setUserId(e.target.value)} className="profile-input text-sm">
                    <option value="">All</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">From</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="profile-input text-sm" />
                </div>
                <div>
                  <label className="form-label">To</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="profile-input text-sm" />
                </div>
                <button onClick={handleFilter} className="btn-primary text-xs px-4 py-2.5">Apply</button>
                {(category || userId || fromDate || toDate) && (
                  <button onClick={handleClear} className="btn-outline text-xs px-4 py-2.5">Clear</button>
                )}
                <div className="ml-auto">
                  <button
                    onClick={() => exportAuditPdf(logs, profile?.tenants?.business_name)}
                    className="btn-outline flex items-center gap-2 text-xs"
                  >
                    <span className="material-symbols-outlined text-base">download</span>
                    Export PDF
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="profile-section">
              {loading ? (
                <div className="flex justify-center py-12">
                  <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
                </div>
              ) : (
                <>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-neutral-100 dark:bg-neutral-800">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Date & Time</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Employee</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Category</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Description</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-400">No audit log entries found.</td></tr>
                      )}
                      {logs.map((log, i) => (
                        <tr key={log.id} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
                          <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="px-4 py-2.5 font-medium text-neutral-800 dark:text-neutral-100">{log.user?.full_name || '–'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${CATEGORY_COLORS[log.category] || CATEGORY_COLORS.SETTINGS}`}>
                              {log.category}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">{log.description}</td>
                          <td className="px-4 py-2.5 text-neutral-400 font-mono text-xs">{log.ip_address || '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <span className="text-xs text-neutral-400">
                      Showing {logs.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} entries
                    </span>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <button disabled={page <= 1} onClick={() => setPage(1)} className="btn-outline text-xs px-2.5 py-1.5">
                          <span className="material-symbols-outlined text-sm">first_page</span>
                        </button>
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-outline text-xs px-3 py-1.5">Prev</button>
                        <span className="text-xs text-neutral-400">Page {page} of {totalPages}</span>
                        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-outline text-xs px-3 py-1.5">Next</button>
                        <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="btn-outline text-xs px-2.5 py-1.5">
                          <span className="material-symbols-outlined text-sm">last_page</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AuditLogPage;
```

- [ ] **Step 2: Add exports in src/pages/owner/index.js**

```js
export { default as AuditLogPage } from './AuditLogPage'
```

- [ ] **Step 3: Add export in src/pages/index.js**

Add `AuditLogPage` to the owner imports line.

- [ ] **Step 4: Add route in src/App.jsx**

Add import in the destructured imports:

```js
AuditLogPage,
```

Add case before the settings route:

```js
case '/admin/audit-log':
  return <AuditLogPage />
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/owner/AuditLogPage.jsx src/pages/owner/index.js src/pages/index.js src/App.jsx
git commit -m "feat(frontend): add AuditLogPage with filters, pagination, PDF export"
```
