# Super Admin Module Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the superadmin module from 2 pages to 7, adding analytics charts to the dashboard, tenant approve/reject/deactivate actions, Reports, Sales Report, Audit Logs, Backup (scaffold), and Settings pages.

**Architecture:** Extend existing `src/pages/superadmin/` pages and `server/routes/tenants.js` backend. All new pages follow the established pattern: Sidebar layout + StatsCard KPIs + tables with Pagination. Frontend uses mock data (`USE_MOCK` flag) until backend is wired.

**Tech Stack:** React 18, MUI X Charts (`@mui/x-charts`), TailwindCSS, Express.js, Supabase (PostgreSQL)

**Spec:** `docs/superpowers/specs/2026-03-20-superadmin-module-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/pages/superadmin/Reports.jsx` | Platform reports with filters (tenant activity, registrations, usage) |
| `src/pages/superadmin/SalesReport.jsx` | Revenue KPIs, period toggle, top tenants, transaction summary |
| `src/pages/superadmin/AuditLogs.jsx` | Filterable audit log table with pagination |
| `src/pages/superadmin/Backup.jsx` | Scaffold page with mock backup history |
| `src/pages/superadmin/SuperAdminSettings.jsx` | Branding, tenant limits, permissions matrix (visual only) |

### Modified Files
| File | Changes |
|------|---------|
| `src/pages/superadmin/SuperAdminDash.jsx` | Add 4th KPI (monthly revenue → active/inactive users), add 3 charts (LineChart, BarChart) |
| `src/pages/superadmin/Tenants.jsx` | Add approve/reject/deactivate buttons + confirmation modals, add PENDING/REJECTED status handling |
| `src/pages/superadmin/index.js` | Export 5 new components |
| `src/pages/index.js` | Add new superadmin exports |
| `src/config/navigation.js` | Expand `superadminNavigation` with Analytics + System categories, fix `getNavigationByRole` |
| `src/lib/api.js` | Add methods to `tenantsApi`: analytics, approve, reject, deactivate, reports, sales, auditLogs, admins, platformSettings, tenantList |
| `src/App.jsx` | Add 5 new route cases for superadmin pages |
| `src/index.css` | Add `sa-*` prefixed CSS classes for filter bars, period toggles, charts, settings |
| `server/routes/tenants.js` | Add 9 new endpoints (analytics, list, admins, approve, reject, deactivate, reports, sales, platform-settings) + enhance audit-logs |

---

## Task 0: Database Schema Changes (Prerequisites)

**Files:**
- Run SQL via Supabase dashboard or migration tool

These schema changes MUST be completed before any backend or frontend tasks.

- [ ] **Step 1: Create `platform_settings` table**

Run this SQL in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_title TEXT DEFAULT 'Obsidian',
  logo_url TEXT,
  max_tenants INTEGER DEFAULT 100,
  max_users_per_tenant INTEGER DEFAULT 50,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES super_admins(id)
);
```

- [ ] **Step 2: Add PENDING and REJECTED to tenant status**

If `tenants.status` uses a PostgreSQL enum type, run:

```sql
ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'REJECTED';
```

If `tenants.status` is a plain `TEXT` column, no ALTER is needed — the values are enforced at the application level.

Verify by running: `SELECT DISTINCT status FROM tenants;`

- [ ] **Step 3: Verify tables exist**

```sql
SELECT * FROM platform_settings LIMIT 1;
-- Should return 0 rows (empty table, created successfully)
```

> **Note:** Modifying `register_owner` RPC to create tenants as `PENDING` instead of `ACTIVE` is deferred — it would break the current registration flow. For now, superadmins can manually change tenant status. This can be added later when the approval workflow is fully wired.

---

## Task 1: Navigation & Routing Infrastructure

**Files:**
- Modify: `src/config/navigation.js:47-66` (superadminNavigation + getNavigationByRole)
- Modify: `src/App.jsx:11-12` (imports) and `src/App.jsx:142-146` (route cases)
- Modify: `src/pages/superadmin/index.js` (exports)
- Modify: `src/pages/index.js:11` (re-exports)

- [ ] **Step 1: Update `superadminNavigation` in `src/config/navigation.js`**

Replace lines 47-66 with the expanded navigation:

```javascript
export const superadminNavigation = [
  {
    category: 'Main',
    items: [
      { icon: 'dashboard', label: 'Overview', path: '/superadmin' },
    ],
  },
  {
    category: 'Tenants',
    items: [
      { icon: 'domain', label: 'All Tenants', path: '/superadmin/tenants' },
    ],
  },
  {
    category: 'Analytics',
    items: [
      { icon: 'summarize', label: 'Reports', path: '/superadmin/reports' },
      { icon: 'point_of_sale', label: 'Sales Report', path: '/superadmin/sales' },
    ],
  },
  {
    category: 'System',
    items: [
      { icon: 'history', label: 'Audit Logs', path: '/superadmin/audit-logs' },
      { icon: 'backup', label: 'Backup', path: '/superadmin/backup' },
      { icon: 'settings', label: 'Settings', path: '/superadmin/settings' },
    ],
  },
];
```

- [ ] **Step 2: Fix `getNavigationByRole` in `src/config/navigation.js`**

Add the `superadmin` case to the switch statement at line 143-154:

```javascript
export const getNavigationByRole = (role) => {
  switch (role?.toLowerCase()) {
    case 'admin':
      return adminNavigation;
    case 'cashier':
      return cashierNavigation;
    case 'manager':
      return managerNavigation;
    case 'superadmin':
      return superadminNavigation;
    default:
      return [];
  }
};
```

- [ ] **Step 3: Create placeholder pages**

Create minimal placeholder components for all 5 new pages so routing doesn't break. Each file follows this pattern (example for Reports):

`src/pages/superadmin/Reports.jsx`:
```jsx
const Reports = () => <div>Reports — coming soon</div>
export default Reports
```

Create the same for: `SalesReport.jsx`, `AuditLogs.jsx`, `Backup.jsx`, `SuperAdminSettings.jsx`.

- [ ] **Step 4: Update `src/pages/superadmin/index.js`**

```javascript
export { default as SuperAdminDash } from './SuperAdminDash'
export { default as SuperAdminTenants } from './Tenants'
export { default as SuperAdminReports } from './Reports'
export { default as SuperAdminSalesReport } from './SalesReport'
export { default as SuperAdminAuditLogs } from './AuditLogs'
export { default as SuperAdminBackup } from './Backup'
export { default as SuperAdminSettings } from './SuperAdminSettings'
```

- [ ] **Step 5: Update `src/pages/index.js`**

Replace line 11 with:

```javascript
export { SuperAdminDash, SuperAdminTenants, SuperAdminReports, SuperAdminSalesReport, SuperAdminAuditLogs, SuperAdminBackup, SuperAdminSettings } from './superadmin'
```

- [ ] **Step 6: Update `src/App.jsx` imports and routes**

Update the import block (lines 10-11) to include new components:

```javascript
  // Super Admin pages
  SuperAdminDash, SuperAdminTenants, SuperAdminReports, SuperAdminSalesReport, SuperAdminAuditLogs, SuperAdminBackup, SuperAdminSettings,
```

Add route cases after line 146 (`case '/superadmin/tenants'`):

```javascript
      case '/superadmin/reports':
        return <SuperAdminReports />
      case '/superadmin/sales':
        return <SuperAdminSalesReport />
      case '/superadmin/audit-logs':
        return <SuperAdminAuditLogs />
      case '/superadmin/backup':
        return <SuperAdminBackup />
      case '/superadmin/settings':
        return <SuperAdminSettings />
```

- [ ] **Step 7: Verify navigation works**

Run: `npm run dev:fe`

Test: Navigate to each new route — sidebar should highlight correct item, placeholder pages should render.

- [ ] **Step 8: Commit**

```bash
git add src/config/navigation.js src/App.jsx src/pages/superadmin/ src/pages/index.js
git commit -m "feat(superadmin): add navigation, routing, and placeholder pages for 5 new sections"
```

---

## Task 2: CSS Classes for Super Admin Pages

**Files:**
- Modify: `src/index.css` (append new classes at end of `@layer components`)

- [ ] **Step 1: Add `sa-*` CSS classes**

Add these classes inside the existing `@layer components { ... }` block, at the end (before the closing `}`):

```css
  /* ===========================================
     SUPER ADMIN COMPONENTS
     =========================================== */

  /* Filter Bar */
  .sa-filter-bar {
    @apply flex flex-wrap items-center gap-3 mb-6;
  }

  .sa-filter-input {
    @apply h-9 px-3 text-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary;
  }

  .sa-filter-select {
    @apply h-9 px-3 pr-8 text-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary appearance-none cursor-pointer;
  }

  .sa-filter-btn {
    @apply h-9 px-4 text-sm font-semibold rounded-md transition-colors;
  }

  /* Period Toggle */
  .sa-period-toggle {
    @apply inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden;
  }

  .sa-period-btn {
    @apply px-4 py-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-800 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200 border-r border-neutral-200 dark:border-neutral-700 last:border-r-0;
  }

  .sa-period-btn-active {
    @apply bg-primary text-neutral-900 dark:text-neutral-900 hover:text-neutral-900;
  }

  /* Chart Cards */
  .sa-chart-card {
    @apply dashboard-card p-5;
  }

  .sa-chart-grid {
    @apply grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8;
  }

  /* Settings */
  .sa-settings-card {
    @apply dashboard-card p-6 mb-6;
  }

  .sa-settings-label {
    @apply block text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5;
  }

  .sa-settings-input {
    @apply w-full h-10 px-3 text-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary;
  }

  .sa-permissions-table {
    @apply w-full text-sm;
  }

  .sa-permissions-table th {
    @apply px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700;
  }

  .sa-permissions-table td {
    @apply px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300;
  }

  /* Audit Log Details */
  .sa-log-details {
    @apply text-xs text-neutral-500 dark:text-neutral-400 max-w-xs truncate cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-200;
  }

  .sa-log-details-expanded {
    @apply text-xs text-neutral-500 dark:text-neutral-400 max-w-xs whitespace-pre-wrap break-words;
  }

  /* Info Banner */
  .sa-info-banner {
    @apply flex items-center gap-3 p-4 mb-6 rounded-md bg-blue-500/5 border border-blue-500/20;
  }

  /* Generic SA table */
  .sa-table {
    @apply w-full text-sm;
  }

  .sa-table th {
    @apply table-th text-xs;
  }

  .sa-table td {
    @apply px-5 py-3.5 text-sm text-neutral-700 dark:text-neutral-300;
  }

  .sa-table tbody tr {
    @apply border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors;
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "style(superadmin): add sa-* CSS classes for filter bars, period toggles, charts, tables, settings"
```

---

## Task 3: API Client Methods

**Files:**
- Modify: `src/lib/api.js:187-203` (extend `tenantsApi`)

- [ ] **Step 1: Extend `tenantsApi` in `src/lib/api.js`**

Replace lines 187-203 with:

```javascript
// ── Tenants (Platform Admin) ─────────────────────────────
export const tenantsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString()
    return apiFetch(`/tenants?${qs}`)
  },
  tenantList: () => apiFetch('/tenants/list'),
  stats: () => apiFetch('/tenants/stats'),
  get: (id) => apiFetch(`/tenants/${id}`),
  block: (id, data) =>
    apiFetch(`/tenants/${id}/block`, { method: 'POST', body: JSON.stringify(data) }),
  reactivate: (id) =>
    apiFetch(`/tenants/${id}/reactivate`, { method: 'POST' }),
  approve: (id) =>
    apiFetch(`/tenants/${id}/approve`, { method: 'POST' }),
  reject: (id, data) =>
    apiFetch(`/tenants/${id}/reject`, { method: 'POST', body: JSON.stringify(data) }),
  deactivate: (id, data) =>
    apiFetch(`/tenants/${id}/deactivate`, { method: 'POST', body: JSON.stringify(data) }),
  updatePlan: (id, data) =>
    apiFetch(`/tenants/${id}/plan`, { method: 'PATCH', body: JSON.stringify(data) }),
  analytics: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/tenants/analytics?${qs}`)
  },
  reports: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString()
    return apiFetch(`/tenants/reports?${qs}`)
  },
  sales: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString()
    return apiFetch(`/tenants/sales?${qs}`)
  },
  auditLogs: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString()
    return apiFetch(`/tenants/audit-logs?${qs}`)
  },
  admins: () => apiFetch('/tenants/admins'),
  platformSettings: {
    get: () => apiFetch('/tenants/platform-settings'),
    update: (data) =>
      apiFetch('/tenants/platform-settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.js
git commit -m "feat(api): add superadmin API methods — analytics, reports, sales, audit logs, settings"
```

---

## Task 4: Backend — Analytics, Lightweight List & Admins Endpoints

**Files:**
- Modify: `server/routes/tenants.js` (add new routes BEFORE the `/:id` route at line 177)

**CRITICAL — Route Ordering Fix:** The existing `GET /tenants/audit-logs` at line 493 is AFTER the `GET /tenants/:id` route at line 177. Express will match `audit-logs` as `:id = "audit-logs"` and return 404. **All** static path routes must be placed as a contiguous block BETWEEN the `GET /tenants` (list) route (ends at line 174) and the `GET /tenants/:id` (detail) route (line 177). This means:

1. Keep existing: `GET /stats` (line 19) and `GET /` (line 72) — already before `/:id` ✓
2. **Move** existing `GET /audit-logs` from line 493 up to before `/:id`
3. Insert ALL new static routes here: `/analytics`, `/list`, `/admins`, `/reports`, `/sales`, `/platform-settings`
4. Then `/:id` and all `/:id/*` routes come after

- [ ] **Step 1: Add `GET /tenants/analytics` endpoint**

Insert after the existing `GET /tenants/stats` route (after line 69) and before `GET /tenants` (line 72):

```javascript
// ── GET /tenants/analytics — Chart data for dashboard ────────────────────────
router.get('/analytics', async (req, res) => {
  try {
    const { type } = req.query;
    const validTypes = ['user_growth', 'tenant_activity', 'revenue_trend'];

    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid analytics type. Valid: ${validTypes.join(', ')}` });
    }

    if (type === 'user_growth') {
      // New user registrations per month (last 12 months) from tenant_owners + employees
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const [{ data: owners }, { data: employees }] = await Promise.all([
        supabaseAdmin.from('tenant_owners').select('created_at').gte('created_at', twelveMonthsAgo.toISOString()).is('deleted_at', null),
        supabaseAdmin.from('employees').select('created_at').gte('created_at', twelveMonthsAgo.toISOString()).is('deleted_at', null),
      ]);

      const allUsers = [...(owners || []), ...(employees || [])];
      const monthMap = {};
      allUsers.forEach(u => {
        const month = u.created_at.slice(0, 7); // 'YYYY-MM'
        monthMap[month] = (monthMap[month] || 0) + 1;
      });

      // Fill in missing months
      const data = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toISOString().slice(0, 7);
        data.push({ month: key, count: monthMap[key] || 0 });
      }

      return res.json({ data });
    }

    if (type === 'tenant_activity') {
      // Top 10 tenants by transaction count
      const { data: tenants } = await supabaseAdmin
        .from('tenants')
        .select('id, business_name')
        .eq('status', 'ACTIVE')
        .is('deleted_at', null);

      const results = await Promise.all((tenants || []).map(async (t) => {
        const { count } = await supabaseAdmin
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', t.id)
          .is('deleted_at', null);
        return { tenant_name: t.business_name, transaction_count: count || 0 };
      }));

      results.sort((a, b) => b.transaction_count - a.transaction_count);
      return res.json({ data: results.slice(0, 10) });
    }

    if (type === 'revenue_trend') {
      // Subscription revenue per month (last 12 months)
      const { data: subs } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_name, billing_cycle, created_at')
        .eq('payment_status', 'PAID')
        .is('deleted_at', null);

      const planPrices = { basic: 29, professional: 79, enterprise: 199 };
      const monthMap = {};
      (subs || []).forEach(s => {
        const month = s.created_at.slice(0, 7);
        const monthly = planPrices[s.plan_name?.toLowerCase()] || 0;
        monthMap[month] = (monthMap[month] || 0) + monthly;
      });

      const data = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toISOString().slice(0, 7);
        data.push({ month: key, revenue: monthMap[key] || 0 });
      }

      return res.json({ data });
    }
  } catch (err) {
    console.error('[TENANTS] Analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});
```

- [ ] **Step 2: Add `GET /tenants/list` endpoint (lightweight dropdown)**

Insert right after the analytics route:

```javascript
// ── GET /tenants/list — Lightweight list for dropdowns ───────────────────────
router.get('/list', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name')
      .is('deleted_at', null)
      .order('business_name', { ascending: true });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('[TENANTS] List (light) error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tenant list' });
  }
});
```

- [ ] **Step 3: Add `GET /tenants/admins` endpoint**

Insert right after the list route:

```javascript
// ── GET /tenants/admins — List super admins for filters ──────────────────────
router.get('/admins', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('super_admins')
      .select('id, full_name, email')
      .eq('is_active', true);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('[TENANTS] Admins error:', err.message);
    res.status(500).json({ error: 'Failed to fetch admin list' });
  }
});
```

- [ ] **Step 4: Verify the dev server starts**

Run: `npm run dev:be`

Expected: No errors — server starts on port 5000.

- [ ] **Step 5: Commit**

```bash
git add server/routes/tenants.js
git commit -m "feat(api): add analytics, lightweight tenant list, and admins endpoints"
```

---

## Task 5: Backend — Approve, Reject, Deactivate Endpoints

**Files:**
- Modify: `server/routes/tenants.js` (add after the existing `reactivate` route, around line 373)

- [ ] **Step 1: Add `POST /tenants/:id/approve` endpoint**

Insert after the reactivate route:

```javascript
// ── POST /tenants/:id/approve — Approve a pending tenant ─────────────────────
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, status, business_name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending tenants can be approved' });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) throw updateErr;

    // Activate tenant users
    await supabaseAdmin.from('tenant_owners')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);

    await logAudit(req.adminProfile.id, 'TENANT_APPROVED', 'TENANT', id, { business_name: tenant.business_name }, req.ip);

    res.json({ message: `Tenant "${tenant.business_name}" has been approved.` });
  } catch (err) {
    console.error('[TENANTS] Approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve tenant' });
  }
});
```

- [ ] **Step 2: Add `POST /tenants/:id/reject` endpoint**

```javascript
// ── POST /tenants/:id/reject — Reject a pending tenant ──────────────────────
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, status, business_name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending tenants can be rejected' });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        status: 'REJECTED',
        blocked_reason: reason?.trim() || 'Rejected by platform admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await logAudit(req.adminProfile.id, 'TENANT_REJECTED', 'TENANT', id, { business_name: tenant.business_name, reason: reason?.trim() }, req.ip);

    res.json({ message: `Tenant "${tenant.business_name}" has been rejected.` });
  } catch (err) {
    console.error('[TENANTS] Reject error:', err.message);
    res.status(500).json({ error: 'Failed to reject tenant' });
  }
});
```

- [ ] **Step 3: Add `POST /tenants/:id/deactivate` endpoint**

```javascript
// ── POST /tenants/:id/deactivate — Permanently deactivate a tenant ──────────
router.post('/:id/deactivate', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, status, business_name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status === 'DEACTIVATED') {
      return res.status(400).json({ error: 'Tenant is already deactivated' });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        status: 'DEACTIVATED',
        blocked_reason: reason?.trim() || 'Deactivated by platform admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    // Deactivate all tenant users
    await supabaseAdmin.from('tenant_owners')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);
    await supabaseAdmin.from('employees')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);

    await logAudit(req.adminProfile.id, 'TENANT_DEACTIVATED', 'TENANT', id, { business_name: tenant.business_name, reason: reason?.trim() }, req.ip);

    res.json({ message: `Tenant "${tenant.business_name}" has been deactivated.` });
  } catch (err) {
    console.error('[TENANTS] Deactivate error:', err.message);
    res.status(500).json({ error: 'Failed to deactivate tenant' });
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/tenants.js
git commit -m "feat(api): add tenant approve, reject, and deactivate endpoints"
```

---

## Task 6: Backend — Reports, Sales & Audit Logs Enhancement + Platform Settings

**Files:**
- Modify: `server/routes/tenants.js` (add new routes in the static routes block before `/:id`)

**Route placement:** All routes in this task go in the static routes block (before `/:id`). The audit-logs route must be **moved** from its current position at line ~493 to this block — delete it from its old position.

- [ ] **Step 1: Add `GET /tenants/reports` endpoint**

Insert after the `/admins` route (before `/:id`):

```javascript
// ── GET /tenants/reports — Platform reports ──────────────────────────────────
router.get('/reports', async (req, res) => {
  try {
    const { type, from: fromDate, to: toDate, tenant_id } = req.query;
    const validTypes = ['activity', 'registrations', 'usage'];

    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid report type. Valid: ${validTypes.join(', ')}` });
    }

    if (type === 'activity') {
      let tenantQuery = supabaseAdmin.from('tenants').select('id, business_name').is('deleted_at', null);
      if (tenant_id) tenantQuery = tenantQuery.eq('id', tenant_id);
      const { data: tenants } = await tenantQuery;

      const data = await Promise.all((tenants || []).map(async (t) => {
        const [txRes, loanRes, custRes] = await Promise.all([
          supabaseAdmin.from('transactions').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).is('deleted_at', null),
          supabaseAdmin.from('pawn_tickets').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('status', 'ACTIVE').is('deleted_at', null),
          supabaseAdmin.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).is('deleted_at', null),
        ]);
        return {
          tenant_name: t.business_name,
          total_transactions: txRes.count || 0,
          active_loans: loanRes.count || 0,
          customers: custRes.count || 0,
        };
      }));

      return res.json({ data });
    }

    if (type === 'registrations') {
      const [{ data: owners }, { data: emps }] = await Promise.all([
        supabaseAdmin.from('tenant_owners').select('created_at').is('deleted_at', null),
        supabaseAdmin.from('employees').select('created_at').is('deleted_at', null),
      ]);

      const allUsers = [...(owners || []), ...(emps || [])];
      const monthMap = {};
      allUsers.forEach(u => {
        const month = u.created_at.slice(0, 7);
        if (fromDate && month < fromDate.slice(0, 7)) return;
        if (toDate && month > toDate.slice(0, 7)) return;
        monthMap[month] = (monthMap[month] || 0) + 1;
      });

      const months = Object.keys(monthMap).sort();
      let cumulative = 0;
      const data = months.map(m => {
        cumulative += monthMap[m];
        return { month: m, new_users: monthMap[m], cumulative };
      });

      return res.json({ data });
    }

    if (type === 'usage') {
      const { data: tenants } = await supabaseAdmin.from('tenants').select('id').eq('status', 'ACTIVE').is('deleted_at', null);
      const tenantCount = (tenants || []).length || 1;

      const [loanRes, custRes] = await Promise.all([
        supabaseAdmin.from('pawn_tickets').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').is('deleted_at', null),
        supabaseAdmin.from('customers').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      ]);

      // Most active tenant
      const results = await Promise.all((tenants || []).map(async (t) => {
        const { count } = await supabaseAdmin.from('transactions').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).is('deleted_at', null);
        return { id: t.id, count: count || 0 };
      }));
      results.sort((a, b) => b.count - a.count);

      let mostActiveName = '—';
      if (results[0]) {
        const { data: t } = await supabaseAdmin.from('tenants').select('business_name').eq('id', results[0].id).single();
        mostActiveName = t?.business_name || '—';
      }

      return res.json({
        avg_loans_per_tenant: Math.round((loanRes.count || 0) / tenantCount),
        avg_customers_per_tenant: Math.round((custRes.count || 0) / tenantCount),
        most_active_tenant: { name: mostActiveName, transaction_count: results[0]?.count || 0 },
      });
    }
  } catch (err) {
    console.error('[TENANTS] Reports error:', err.message);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});
```

- [ ] **Step 2: Add `GET /tenants/sales` endpoint**

```javascript
// ── GET /tenants/sales — Sales & revenue data ───────────────────────────────
router.get('/sales', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    // KPI: subscription revenue
    const { data: subs } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_name, billing_cycle, tenant_id')
      .eq('payment_status', 'PAID')
      .is('deleted_at', null);

    const planPrices = { basic: 29, professional: 79, enterprise: 199 };
    const totalPlatformRevenue = (subs || []).reduce((sum, s) => {
      return sum + (planPrices[s.plan_name?.toLowerCase()] || 0);
    }, 0);

    // KPI: total transaction volume across all tenants
    const { data: allTx } = await supabaseAdmin
      .from('transactions')
      .select('principal_paid, interest_paid, penalty_paid, tenant_id, created_at, trans_type')
      .is('deleted_at', null);

    const totalTxVolume = (allTx || []).reduce((sum, t) =>
      sum + Number(t.principal_paid || 0) + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0), 0);

    const activeTenantCount = new Set((subs || []).map(s => s.tenant_id)).size || 1;

    // Top performing tenants
    const tenantVolumes = {};
    (allTx || []).forEach(t => {
      tenantVolumes[t.tenant_id] = (tenantVolumes[t.tenant_id] || 0) +
        Number(t.principal_paid || 0) + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0);
    });

    const tenantTxCounts = {};
    (allTx || []).forEach(t => {
      tenantTxCounts[t.tenant_id] = (tenantTxCounts[t.tenant_id] || 0) + 1;
    });

    const tenantIds = Object.keys(tenantVolumes);
    const { data: tenantNames } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name')
      .in('id', tenantIds.length > 0 ? tenantIds : ['00000000-0000-0000-0000-000000000000']);

    const tenantNameMap = {};
    (tenantNames || []).forEach(t => { tenantNameMap[t.id] = t.business_name; });

    const subPlanMap = {};
    (subs || []).forEach(s => { subPlanMap[s.tenant_id] = s.plan_name; });

    const topTenants = tenantIds
      .map(id => ({
        tenant_name: tenantNameMap[id] || 'Unknown',
        plan: subPlanMap[id] || 'basic',
        transaction_count: tenantTxCounts[id] || 0,
        transaction_volume: tenantVolumes[id] || 0,
        subscription_amount: planPrices[(subPlanMap[id] || 'basic').toLowerCase()] || 0,
      }))
      .sort((a, b) => b.transaction_volume - a.transaction_volume)
      .slice(0, 10);

    // Find top tenant name for KPI
    const topTenantName = topTenants[0]?.tenant_name || '—';

    res.json({
      kpis: {
        total_platform_revenue: totalPlatformRevenue,
        total_transaction_volume: totalTxVolume,
        avg_revenue_per_tenant: Math.round(totalPlatformRevenue / activeTenantCount),
        top_performing_tenant: topTenantName,
      },
      top_tenants: topTenants,
    });
  } catch (err) {
    console.error('[TENANTS] Sales error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sales data' });
  }
});
```

- [ ] **Step 3: Enhance existing `GET /tenants/audit-logs` with filters**

Replace the existing audit-logs route (lines 493-516) with:

```javascript
// ── GET /tenants/audit-logs — Platform audit trail (with filters) ────────────
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { from, to } = getPagination(page, limit);
    const { from: fromDate, to: toDate, admin_id, action } = req.query;

    let query = supabaseAdmin
      .from('platform_audit_logs')
      .select('*, super_admins(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', `${toDate}T23:59:59.999Z`);
    if (admin_id) query = query.eq('admin_id', admin_id);
    if (action) query = query.eq('action', action);

    query = query.range(from, to);

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('[AUDIT] Logs error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch audit logs' });
    }

    res.json({ data: logs || [], total: count || 0, page, limit });
  } catch (err) {
    console.error('[AUDIT] Logs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});
```

- [ ] **Step 4: Add platform settings endpoints**

Insert before the `/:id` route:

```javascript
// ── GET /tenants/platform-settings — Get platform config ─────────────────────
router.get('/platform-settings', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    // Return defaults if no row exists
    res.json(data || {
      system_title: 'Obsidian',
      logo_url: null,
      max_tenants: 100,
      max_users_per_tenant: 50,
    });
  } catch (err) {
    console.error('[SETTINGS] Get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch platform settings' });
  }
});

// ── PUT /tenants/platform-settings — Update platform config ──────────────────
router.put('/platform-settings', async (req, res) => {
  try {
    const { system_title, logo_url, max_tenants, max_users_per_tenant } = req.body;

    // Check if row exists
    const { data: existing } = await supabaseAdmin
      .from('platform_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    const payload = {
      system_title: system_title || 'Obsidian',
      logo_url: logo_url || null,
      max_tenants: max_tenants || 100,
      max_users_per_tenant: max_users_per_tenant || 50,
      updated_at: new Date().toISOString(),
      updated_by: req.adminProfile.id,
    };

    let error;
    if (existing) {
      ({ error } = await supabaseAdmin.from('platform_settings').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await supabaseAdmin.from('platform_settings').insert(payload));
    }

    if (error) throw error;

    await logAudit(req.adminProfile.id, 'SETTINGS_UPDATED', 'PLATFORM_SETTINGS', existing?.id || 'new', payload, req.ip);

    res.json({ message: 'Platform settings updated.' });
  } catch (err) {
    console.error('[SETTINGS] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/tenants.js
git commit -m "feat(api): add reports, sales, platform settings endpoints + enhance audit-logs with filters"
```

---

## Task 7: Backend — Update Stats Endpoint & Status Mappings

**Files:**
- Modify: `server/routes/tenants.js` (stats endpoint + list/detail status mappings)

> **Why now:** The dashboard (Task 8) needs `activeUsers`/`inactiveUsers` from stats, and the Tenants page (Task 8b) needs `pending`/`rejected` status values. These backend changes must happen before the frontend tasks that depend on them.

- [ ] **Step 1: Add active/inactive user counts to `GET /tenants/stats`**

In the existing stats endpoint (lines 19-69), add user count queries after the blocked count:

```javascript
// Active users (tenant_owners + employees)
const [{ count: activeOwners }, { count: activeEmployees }] = await Promise.all([
  supabaseAdmin.from('tenant_owners').select('*', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null),
  supabaseAdmin.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null),
]);
const activeUsers = (activeOwners || 0) + (activeEmployees || 0);

const [{ count: inactiveOwners }, { count: inactiveEmployees }] = await Promise.all([
  supabaseAdmin.from('tenant_owners').select('*', { count: 'exact', head: true }).eq('is_active', false).is('deleted_at', null),
  supabaseAdmin.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', false).is('deleted_at', null),
]);
const inactiveUsers = (inactiveOwners || 0) + (inactiveEmployees || 0);
```

Update the response to include:

```javascript
res.json({ total: total || 0, active: active || 0, blocked: blocked || 0, expiringSoon: expiringSoon || 0, mrr, activeUsers, inactiveUsers });
```

- [ ] **Step 2: Add PENDING/REJECTED status mappings to list and detail endpoints**

In the list endpoint (around line 136) update status mapping:

```javascript
let frontendStatus = 'active';
if (t.status === 'SUSPENDED' || t.status === 'DEACTIVATED') frontendStatus = 'blocked';
if (t.status === 'PENDING') frontendStatus = 'pending';
if (t.status === 'REJECTED') frontendStatus = 'rejected';
if (sub?.payment_status === 'OVERDUE') frontendStatus = 'expired';
```

In the detail endpoint (around line 214) add the same two lines for PENDING/REJECTED.

Update the status filter in the list endpoint (around lines 94-96):

```javascript
if (status === 'active') query = query.eq('status', 'ACTIVE');
else if (status === 'blocked') query = query.in('status', ['SUSPENDED', 'DEACTIVATED']);
else if (status === 'pending') query = query.eq('status', 'PENDING');
else if (status === 'rejected') query = query.eq('status', 'REJECTED');
else if (status === 'trial') query = query.eq('status', 'ACTIVE');
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/tenants.js
git commit -m "feat(api): add user counts to stats + PENDING/REJECTED status handling"
```

---

## Task 8: Tenants.jsx — Approve/Reject/Deactivate Actions

**Files:**
- Modify: `src/pages/superadmin/Tenants.jsx`

- [ ] **Step 1: Add PENDING and REJECTED status handling**

In the Tenants.jsx file, find the status mapping object (used for StatusBadge rendering). Add entries for `pending` and `rejected`:

```javascript
pending:    { label: 'Pending',  type: 'warning' },
rejected:   { label: 'Rejected', type: 'destructive' },
```

Also update the status filter dropdown to include these new options.

- [ ] **Step 2: Add Approve/Reject/Deactivate modals**

Add modal components following the existing `BlockModal` and `ReactivateModal` patterns in the file. Create:

- `ApproveModal` — confirmation only, no reason field, calls `tenantsApi.approve(id)`
- `RejectModal` — with reason textarea, calls `tenantsApi.reject(id, { reason })`
- `DeactivateModal` — with reason textarea, calls `tenantsApi.deactivate(id, { reason })`

- [ ] **Step 3: Add action buttons to tenant rows**

In the `TenantRow` component or `ActionMenu`, add conditional buttons:

- Show "Approve" and "Reject" buttons when `tenant.status === 'pending'`
- Show "Deactivate" button when `tenant.status === 'active'`
- Keep existing "Block" and "Reactivate" buttons for their current conditions

- [ ] **Step 4: Wire modals to row actions**

Add state variables for the new modals and wire the open/close/submit handlers following the existing pattern used for `BlockModal`.

- [ ] **Step 5: Update the DetailDrawer**

If the DetailDrawer is open and the tenant has status `pending`, show Approve/Reject action buttons at the bottom. If `active`, show Deactivate alongside existing Block.

- [ ] **Step 6: Verify the Tenants page renders correctly**

Run: `npm run dev:fe`

Test:
- Navigate to `/superadmin/tenants`
- Verify all existing functionality still works (search, filter, block, reactivate)
- Verify new status badges render for pending/rejected

- [ ] **Step 7: Commit**

```bash
git add src/pages/superadmin/Tenants.jsx
git commit -m "feat(superadmin): add approve, reject, deactivate actions to tenant management"
```

---

## Task 9: Enhance SuperAdminDash.jsx — Charts & Updated KPIs

**Files:**
- Modify: `src/pages/superadmin/SuperAdminDash.jsx`

- [ ] **Step 1: Add MUI X Charts imports**

At the top of the file, add:

```javascript
import { BarChart } from '@mui/x-charts/BarChart'
import { LineChart } from '@mui/x-charts/LineChart'
```

- [ ] **Step 2: Update KPI cards**

Replace the `statsCards` array. Change "Blocked" card to "Active Users" and "Est. MRR" to "Inactive Users":

```javascript
const statsCards = [
  { icon: 'domain', iconBg: 'bg-primary', iconColor: 'text-white dark:text-neutral-900', label: 'Total Tenants', value: `${stats.total}`, badge: '', badgeType: 'neutral' },
  { icon: 'group', iconBg: 'bg-emerald-500', iconColor: 'text-white', label: 'Active Users', value: `${stats.activeUsers || 0}`, badge: '', badgeType: 'success' },
  { icon: 'person_off', iconBg: 'bg-amber-500', iconColor: 'text-white', label: 'Inactive Users', value: `${stats.inactiveUsers || 0}`, badge: '', badgeType: 'warning' },
  { icon: 'payments', iconBg: 'bg-blue-500', iconColor: 'text-white', label: 'Monthly Revenue', value: stats.mrr ? `₱${Number(stats.mrr).toLocaleString()}` : '—', badge: '', badgeType: 'neutral' },
]
```

- [ ] **Step 3: Add chart data state and fetch**

Add new state for chart data:

```javascript
const [chartData, setChartData] = useState({ userGrowth: [], tenantActivity: [], revenueTrend: [] })
```

In the `fetchData` callback, add analytics fetches in parallel:

```javascript
const [statsRes, listRes, growthRes, activityRes, revenueRes] = await Promise.all([
  tenantsApi.stats(),
  tenantsApi.list({ limit: 8, sort: 'newest' }),
  tenantsApi.analytics({ type: 'user_growth' }),
  tenantsApi.analytics({ type: 'tenant_activity' }),
  tenantsApi.analytics({ type: 'revenue_trend' }),
])

setChartData({
  userGrowth: growthRes.data || [],
  tenantActivity: activityRes.data || [],
  revenueTrend: revenueRes.data || [],
})
```

- [ ] **Step 4: Add charts section to the JSX**

Insert after the stats grid and before the alert strip. Use existing dark mode detection via the `useTheme` context or check `document.documentElement.classList.contains('dark')`:

```jsx
{/* ── Charts ──────────────────────────────────── */}
<div className="sa-chart-grid">
  {/* User Growth */}
  <div className="sa-chart-card">
    <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">User Growth</h3>
    {chartData.userGrowth.length > 0 ? (
      <LineChart
        height={250}
        series={[{ data: chartData.userGrowth.map(d => d.count), label: 'New Users', color: '#A3E635' }]}
        xAxis={[{ data: chartData.userGrowth.map(d => d.month), scaleType: 'point' }]}
      />
    ) : (
      <div className="h-[250px] flex items-center justify-center text-sm text-neutral-400">No data</div>
    )}
  </div>

  {/* Tenant Activity */}
  <div className="sa-chart-card">
    <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Tenant Activity</h3>
    {chartData.tenantActivity.length > 0 ? (
      <BarChart
        height={250}
        series={[{ data: chartData.tenantActivity.map(d => d.transaction_count), label: 'Transactions', color: '#A3E635' }]}
        xAxis={[{ data: chartData.tenantActivity.map(d => d.tenant_name.slice(0, 12)), scaleType: 'band' }]}
      />
    ) : (
      <div className="h-[250px] flex items-center justify-center text-sm text-neutral-400">No data</div>
    )}
  </div>

  {/* Revenue Trend */}
  <div className="sa-chart-card">
    <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Revenue Trend</h3>
    {chartData.revenueTrend.length > 0 ? (
      <LineChart
        height={250}
        series={[{ data: chartData.revenueTrend.map(d => d.revenue), label: 'Revenue (₱)', color: '#3B82F6', area: true }]}
        xAxis={[{ data: chartData.revenueTrend.map(d => d.month), scaleType: 'point' }]}
      />
    ) : (
      <div className="h-[250px] flex items-center justify-center text-sm text-neutral-400">No data</div>
    )}
  </div>
</div>
```

- [ ] **Step 5: Verify charts render**

Run: `npm run dev:fe`

Navigate to `/superadmin` — verify KPI cards and charts render (charts may show "No data" if no analytics data exists yet).

- [ ] **Step 6: Commit**

```bash
git add src/pages/superadmin/SuperAdminDash.jsx
git commit -m "feat(superadmin): add analytics charts and updated KPIs to dashboard"
```

---

## Task 10: Build Reports.jsx Page

**Files:**
- Create: `src/pages/superadmin/Reports.jsx` (replace placeholder)

- [ ] **Step 1: Build Reports page**

Replace the placeholder with the full component. Follow the existing page pattern from `SuperAdminDash.jsx`:
- Import: `useState, useEffect, useCallback, useMemo` from React
- Import: `Sidebar, StatsCard, StatusBadge, Pagination` from components
- Import: `superadminNavigation` from config
- Import: `useAuth` from context
- Import: `tenantsApi` from api

Structure:
1. `sa-filter-bar` with date range inputs, tenant dropdown, export button
2. Tenant Activity Report table in a `dashboard-card`
3. User Registration Report table in a `dashboard-card`
4. Usage Statistics as 3 `StatsCard` components in a grid

Use `USE_MOCK` flag pattern:

```javascript
const USE_MOCK = false

const mockActivityData = [
  { tenant_name: 'Gold Palace Pawnshop', total_transactions: 245, active_loans: 89, customers: 156 },
  { tenant_name: 'Silver Star Lending', total_transactions: 189, active_loans: 67, customers: 112 },
  { tenant_name: 'Diamond Trust Pawn', total_transactions: 156, active_loans: 45, customers: 98 },
]

const mockRegistrationData = [
  { month: '2026-01', new_users: 12, cumulative: 12 },
  { month: '2026-02', new_users: 18, cumulative: 30 },
  { month: '2026-03', new_users: 8, cumulative: 38 },
]

const mockUsageData = {
  avg_loans_per_tenant: 67,
  avg_customers_per_tenant: 122,
  most_active_tenant: { name: 'Gold Palace Pawnshop', transaction_count: 245 },
}
```

The page should fetch data from `tenantsApi.reports()` with the filter params, or use mock data when `USE_MOCK` is true.

Include the standard Sidebar layout wrapper, header section, and loading/empty states.

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev:fe`

Navigate to `/superadmin/reports` — verify filter bar, tables, and stats cards render.

- [ ] **Step 3: Commit**

```bash
git add src/pages/superadmin/Reports.jsx
git commit -m "feat(superadmin): build reports page with activity, registration, and usage sections"
```

---

## Task 11: Build SalesReport.jsx Page

**Files:**
- Create: `src/pages/superadmin/SalesReport.jsx` (replace placeholder)

- [ ] **Step 1: Build Sales Report page**

Structure:
1. 4 KPI `StatsCard` cards: Total Platform Revenue, Total Transaction Volume, Avg Revenue/Tenant, Top Tenant
2. `sa-period-toggle` with Daily/Weekly/Monthly buttons
3. `BarChart` showing revenue breakdown
4. Top Performing Tenants table in `dashboard-card` using `sa-table`
5. Transaction History Summary table with `Pagination`

Import `BarChart` from `@mui/x-charts/BarChart`.

Mock data:

```javascript
const USE_MOCK = false

const mockKpis = {
  total_platform_revenue: 15800,
  total_transaction_volume: 2450000,
  avg_revenue_per_tenant: 790,
  top_performing_tenant: 'Gold Palace Pawnshop',
}

const mockTopTenants = [
  { tenant_name: 'Gold Palace Pawnshop', plan: 'enterprise', transaction_count: 245, transaction_volume: 850000, subscription_amount: 199 },
  { tenant_name: 'Silver Star Lending', plan: 'professional', transaction_count: 189, transaction_volume: 620000, subscription_amount: 79 },
  { tenant_name: 'Diamond Trust Pawn', plan: 'professional', transaction_count: 156, transaction_volume: 480000, subscription_amount: 79 },
]
```

Use the standard Sidebar layout wrapper. Period toggle state controls which data is shown (for now all periods show same data since backend aggregation is simplified).

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev:fe`

Navigate to `/superadmin/sales` — verify KPIs, chart, and tables render.

- [ ] **Step 3: Commit**

```bash
git add src/pages/superadmin/SalesReport.jsx
git commit -m "feat(superadmin): build sales report page with KPIs, chart, and tenant rankings"
```

---

## Task 12: Build AuditLogs.jsx Page

**Files:**
- Create: `src/pages/superadmin/AuditLogs.jsx` (replace placeholder)

- [ ] **Step 1: Build Audit Logs page**

Structure:
1. `sa-filter-bar` with date range, admin dropdown (from `tenantsApi.admins()`), action type dropdown
2. Table with columns: User, Action (StatusBadge), Target, Details (truncated/expandable), Timestamp
3. `Pagination` at bottom

Action type badge colors:

```javascript
const actionStyles = {
  TENANT_BLOCKED:     'danger',
  TENANT_REACTIVATED: 'success',
  TENANT_APPROVED:    'success',
  TENANT_REJECTED:    'danger',
  TENANT_DEACTIVATED: 'warning',
  PLAN_UPDATED:       'info',
  SETTINGS_UPDATED:   'info',
}
```

Details column: show truncated JSON string, on click expand to show formatted JSON.

Mock data:

```javascript
const USE_MOCK = false

const mockLogs = [
  { id: '1', action: 'TENANT_BLOCKED', target_type: 'TENANT', target_id: 'abc', details: { reason: 'Violation of terms', business_name: 'Test Shop' }, created_at: '2026-03-20T10:30:00Z', super_admins: { full_name: 'Admin User', email: 'admin@obsidian.com' } },
  { id: '2', action: 'TENANT_APPROVED', target_type: 'TENANT', target_id: 'def', details: { business_name: 'Gold Shop' }, created_at: '2026-03-19T14:15:00Z', super_admins: { full_name: 'Admin User', email: 'admin@obsidian.com' } },
  { id: '3', action: 'SETTINGS_UPDATED', target_type: 'PLATFORM_SETTINGS', target_id: 'xyz', details: { system_title: 'Obsidian' }, created_at: '2026-03-18T09:00:00Z', super_admins: { full_name: 'Admin User', email: 'admin@obsidian.com' } },
]
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev:fe`

Navigate to `/superadmin/audit-logs` — verify filter bar, table, and pagination render.

- [ ] **Step 3: Commit**

```bash
git add src/pages/superadmin/AuditLogs.jsx
git commit -m "feat(superadmin): build audit logs page with filterable, paginated log table"
```

---

## Task 13: Build Backup.jsx Page (Scaffold)

**Files:**
- Create: `src/pages/superadmin/Backup.jsx` (replace placeholder)

- [ ] **Step 1: Build Backup scaffold page**

Entirely static — no API calls, no `USE_MOCK` flag needed.

```jsx
import { useState, useMemo } from 'react'
import { Sidebar } from '../../components/layout'
import { StatusBadge } from '../../components/ui'
import { superadminNavigation } from '../../config'
import { useAuth } from '../../context'

const Backup = () => {
  const [currentPath] = useState('/superadmin/backup')
  const { profile } = useAuth()

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'Super Admin',
    role: 'Super Admin',
    initials: (profile?.full_name || 'SA').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  }), [profile])

  const navigateTo = (path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  // Mock data with relative dates
  const today = new Date()
  const mockBackups = [
    { id: 1, date: new Date(today - 0 * 86400000).toLocaleString(), status: 'Success', size: '245 MB' },
    { id: 2, date: new Date(today - 1 * 86400000).toLocaleString(), status: 'Success', size: '243 MB' },
    { id: 3, date: new Date(today - 2 * 86400000).toLocaleString(), status: 'Failed', size: '—' },
    { id: 4, date: new Date(today - 3 * 86400000).toLocaleString(), status: 'Success', size: '240 MB' },
  ]

  return (
    <div className="admin-layout">
      <Sidebar navigation={superadminNavigation} user={currentUser} currentPath={currentPath} onNavigate={navigateTo} />
      <main className="admin-main">
        <div className="admin-content custom-scrollbar">
          {/* Header */}
          <div className="mb-8">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Platform Admin</p>
            <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Backup</h1>
            <p className="text-sm text-neutral-500 mt-1">Database backup history and restore points.</p>
          </div>

          {/* Info Banner */}
          <div className="sa-info-banner">
            <span className="material-symbols-outlined text-blue-500 flex-shrink-0">info</span>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Automated backup management is coming soon. Database backups are currently handled by Supabase.
            </p>
          </div>

          {/* Trigger Backup */}
          <div className="flex justify-end mb-4">
            <button className="btn-primary opacity-50 cursor-not-allowed" disabled title="Coming soon">
              <span className="material-symbols-outlined text-lg mr-1.5">backup</span>
              Trigger Backup
            </button>
          </div>

          {/* Backup History Table */}
          <div className="dashboard-card">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Backup History</h2>
            <div className="overflow-x-auto -mx-6 -mb-6">
              <table className="sa-table">
                <thead>
                  <tr className="border-b border-neutral-100 dark:border-neutral-800">
                    {['Date', 'Status', 'File Size', 'Actions'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {mockBackups.map(b => (
                    <tr key={b.id}>
                      <td>{b.date}</td>
                      <td><StatusBadge status={b.status} type={b.status === 'Success' ? 'success' : 'danger'} /></td>
                      <td>{b.size}</td>
                      <td>
                        <button className="text-neutral-400 cursor-not-allowed opacity-50" disabled title="Coming soon">
                          <span className="material-symbols-outlined text-lg">download</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Backup
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev:fe`

Navigate to `/superadmin/backup` — verify info banner, table, and disabled buttons render.

- [ ] **Step 3: Commit**

```bash
git add src/pages/superadmin/Backup.jsx
git commit -m "feat(superadmin): add backup scaffold page with mock history table"
```

---

## Task 14: Build SuperAdminSettings.jsx Page

**Files:**
- Create: `src/pages/superadmin/SuperAdminSettings.jsx` (replace placeholder)

- [ ] **Step 1: Build Settings page**

Three sections in `sa-settings-card` cards:

**1. System Branding:**
- System title input (`sa-settings-input`)
- Logo upload placeholder (styled file input area)
- Save button

**2. Tenant Limits:**
- Max tenants number input
- Max users per tenant number input
- Save button

**3. Permissions Matrix (read-only):**
- `sa-permissions-table` with features × roles
- Disabled toggle switches using a simple styled checkbox/slider visual
- "Coming soon" tooltip on hover
- Muted text below table

Data fetched from `tenantsApi.platformSettings.get()` on mount, saved via `tenantsApi.platformSettings.update()`.

State:

```javascript
const [settings, setSettings] = useState({ system_title: 'Obsidian', logo_url: null, max_tenants: 100, max_users_per_tenant: 50 })
const [saving, setSaving] = useState(false)
const [message, setMessage] = useState('')
```

Permissions matrix is hardcoded (not from API):

```javascript
const permissions = [
  { feature: 'Dashboard', superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Tenants', superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Reports', superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Sales', superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Audit Logs', superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Backup', superAdmin: 'Read/Write', staff: 'No Access' },
  { feature: 'Settings', superAdmin: 'Read/Write', staff: 'No Access' },
]
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev:fe`

Navigate to `/superadmin/settings` — verify all three sections render with inputs and the permissions matrix.

- [ ] **Step 3: Commit**

```bash
git add src/pages/superadmin/SuperAdminSettings.jsx
git commit -m "feat(superadmin): build settings page with branding, limits, and permissions matrix"
```

---

## Task 15: Final Verification

- [ ] **Step 1: Run the full application**

Run: `npm run dev`

This starts both frontend and backend concurrently.

- [ ] **Step 2: Verify all routes**

Navigate to each page and verify it loads without errors:
- `/superadmin` — Dashboard with KPIs + charts
- `/superadmin/tenants` — Tenant table with new action buttons
- `/superadmin/reports` — Reports with filter bar and tables
- `/superadmin/sales` — Sales report with KPIs and chart
- `/superadmin/audit-logs` — Audit logs with filters and pagination
- `/superadmin/backup` — Backup scaffold with mock data
- `/superadmin/settings` — Settings with branding, limits, permissions

- [ ] **Step 3: Verify sidebar navigation**

- All 7 items visible in sidebar
- Active state highlights correctly for each route
- Collapsed sidebar tooltips work

- [ ] **Step 4: Check dark mode**

Toggle dark mode — verify all new pages and components render correctly in both themes.

- [ ] **Step 5: Check for console errors**

Open browser DevTools — verify no React warnings or JS errors on any page.

- [ ] **Step 6: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore(superadmin): final cleanup and verification"
```
