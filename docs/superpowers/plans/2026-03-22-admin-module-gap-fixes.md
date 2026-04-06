# Admin (Developer) Module — Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all gaps between the professor's Admin Module requirements and the current implementation — audit log login/logout tracking, daily activity on dashboard, daily/weekly sales granularity, and transaction history in sales report.

**Architecture:** Backend changes add login/logout audit events to the existing `platform_audit_logs` table. Because `platform_audit_logs.admin_id` has a FK to `super_admins(id)`, only super admin login/logout events are written there. Tenant user login/logout events are stored in the `details` JSONB with `admin_id` set to NULL via a schema ALTER. The audit logs UI falls back to `details.full_name` when the `super_admins` join returns null. Frontend changes add period toggles and a transaction history section. One new route (`POST /auth/logout`) is added.

**Tech Stack:** Express.js backend, React 18 frontend, Supabase (PostgreSQL), MUI X Charts, TailwindCSS

**Important codebase note:** The existing analytics code uses `tenant_owners` + `employees` tables (not `tenant_users`). All new code must follow this same pattern.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `server/routes/auth.js:92-147` | Add audit log entries on login (super admin + tenant user) |
| Modify | `server/routes/auth.js` | Add new `POST /auth/logout` route |
| Modify | `server/routes/tenants.js:213-298` | Add `period` param to all 3 analytics types (daily/monthly) |
| Modify | `server/routes/tenants.js:424-498` | Add date filtering to sales endpoint + transaction history list |
| Modify | `src/pages/superadmin/SuperAdminDash.jsx` | Add daily/monthly period toggle for charts |
| Modify | `src/pages/superadmin/SalesReport.jsx` | Wire period param to backend, add transaction history table |
| Modify | `src/pages/superadmin/AuditLogs.jsx:17-37` | Add LOGIN/LOGOUT to action filter options + badge styles |
| Modify | `src/pages/superadmin/AuditLogs.jsx:240-256` | Fallback to `details.full_name` when `super_admins` join is null |
| Modify | `src/context/AuthContext.jsx` | Call logout endpoint before `supabase.auth.signOut()` |

---

## Task 1: Fix FK Constraint + Add Login/Logout Audit Logging (Backend)

**Files:**
- Modify: `server/routes/auth.js:92-147` (login route)
- Modify: `server/routes/auth.js` (add logout route)

**Important:** `platform_audit_logs.admin_id` is `UUID NOT NULL REFERENCES super_admins(id)`. Tenant user IDs do not exist in `super_admins`, so we must ALTER the column to be nullable before inserting tenant user events.

- [ ] **Step 1: ALTER `admin_id` to be nullable via Supabase SQL editor**

Run this SQL in the Supabase dashboard SQL editor:

```sql
ALTER TABLE platform_audit_logs ALTER COLUMN admin_id DROP NOT NULL;
```

This allows tenant user login/logout entries where `admin_id` is NULL and the actor info is stored in `details` JSONB.

- [ ] **Step 2: Add audit log on successful super admin login**

In `server/routes/auth.js`, inside the `if (adminProfile)` block (line ~120), add a try/catch-wrapped audit log call **before** `return res.json(...)`:

```javascript
// Audit log — super admin login (wrap in try/catch to never block login)
try {
  await supabaseAdmin.from('platform_audit_logs').insert({
    admin_id: adminProfile.id,
    action: 'ADMIN_LOGIN',
    target_type: 'SUPER_ADMIN',
    target_id: adminProfile.id,
    details: { email: adminProfile.email, full_name: adminProfile.full_name },
    ip_address: req.ip || null,
  });
} catch (auditErr) {
  console.error('[AUTH] Login audit error:', auditErr.message);
}
```

- [ ] **Step 3: Add audit log on successful tenant user login**

After the tenant user profile lookup (line ~135), add a try/catch-wrapped log entry **before** `res.json(...)`:

```javascript
// Audit log — tenant user login (admin_id = null, actor info in details)
if (tuProfile) {
  try {
    await supabaseAdmin.from('platform_audit_logs').insert({
      admin_id: null,
      action: 'USER_LOGIN',
      target_type: 'TENANT_USER',
      target_id: tuProfile.id,
      details: {
        email: tuProfile.work_email || email,
        full_name: tuProfile.full_name,
        role: tuProfile.role,
        tenant_id: tuProfile.tenant_id,
      },
      ip_address: req.ip || null,
    });
  } catch (auditErr) {
    console.error('[AUTH] Login audit error:', auditErr.message);
  }
}
```

- [ ] **Step 4: Add a logout endpoint that logs the event**

Add a new POST route in `server/routes/auth.js` (after the login route). Note: uses `tenant_owners` table (not `tenant_users`) to match the existing codebase pattern:

```javascript
// POST /api/auth/logout — Log the logout event
router.post('/logout', auth, async (req, res) => {
  try {
    const userId = req.userId;

    // Check if super admin
    const { data: adminProfile } = await supabaseAdmin
      .from('super_admins')
      .select('id, email, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (adminProfile) {
      await supabaseAdmin.from('platform_audit_logs').insert({
        admin_id: adminProfile.id,
        action: 'ADMIN_LOGOUT',
        target_type: 'SUPER_ADMIN',
        target_id: adminProfile.id,
        details: { email: adminProfile.email, full_name: adminProfile.full_name },
        ip_address: req.ip || null,
      });
    } else {
      // Tenant user logout — check tenant_users (unified table used by auth)
      const { data: tuProfile } = await supabaseAdmin
        .from('tenant_users')
        .select('id, work_email, full_name, role, tenant_id')
        .eq('id', userId)
        .is('deleted_at', null)
        .maybeSingle();

      if (tuProfile) {
        await supabaseAdmin.from('platform_audit_logs').insert({
          admin_id: null,
          action: 'USER_LOGOUT',
          target_type: 'TENANT_USER',
          target_id: tuProfile.id,
          details: {
            email: tuProfile.work_email,
            full_name: tuProfile.full_name,
            role: tuProfile.role,
            tenant_id: tuProfile.tenant_id,
          },
          ip_address: req.ip || null,
        });
      }
    }

    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    console.error('[AUTH] Logout audit error:', err.message);
    // Don't fail the logout — just log the error
    res.json({ message: 'Logged out.' });
  }
});
```

- [ ] **Step 5: Call logout endpoint from frontend before clearing session**

In `src/context/AuthContext.jsx`, find the `logout` function and add an API call **before** `supabase.auth.signOut()`:

```javascript
// Before supabase.auth.signOut()
try {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
  const token = session?.access_token;
  if (token) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  }
} catch (e) {
  // Don't block logout if audit call fails
}
```

- [ ] **Step 6: Verify login/logout events appear in audit logs**

Start the server, log in as super admin, then log out. Check the Audit Logs page and verify `ADMIN_LOGIN` and `ADMIN_LOGOUT` entries appear.

- [ ] **Step 7: Commit**

```bash
git add server/routes/auth.js src/context/AuthContext.jsx
git commit -m "feat: add login/logout audit logging for all user types"
```

---

## Task 2: Update Audit Logs UI for New Action Types

**Files:**
- Modify: `src/pages/superadmin/AuditLogs.jsx:17-37` (badge styles + filter options)
- Modify: `src/pages/superadmin/AuditLogs.jsx:240-256` (user name display fallback)

- [ ] **Step 1: Add new action types to badge styles**

In `AuditLogs.jsx`, update `actionStyles` (line ~17):

```javascript
const actionStyles = {
  TENANT_BLOCKED:      'danger',
  TENANT_REACTIVATED:  'success',
  TENANT_APPROVED:     'success',
  TENANT_REJECTED:     'danger',
  TENANT_DEACTIVATED:  'warning',
  PLAN_UPDATED:        'info',
  SETTINGS_UPDATED:    'info',
  ADMIN_LOGIN:         'success',
  ADMIN_LOGOUT:        'neutral',
  USER_LOGIN:          'success',
  USER_LOGOUT:         'neutral',
}
```

- [ ] **Step 2: Add new filter options to ACTION_OPTIONS array**

Update `ACTION_OPTIONS` (line ~28):

```javascript
const ACTION_OPTIONS = [
  { value: '',                    label: 'All Actions' },
  { value: 'TENANT_BLOCKED',      label: 'Tenant Blocked' },
  { value: 'TENANT_REACTIVATED',  label: 'Tenant Reactivated' },
  { value: 'TENANT_APPROVED',     label: 'Tenant Approved' },
  { value: 'TENANT_REJECTED',     label: 'Tenant Rejected' },
  { value: 'TENANT_DEACTIVATED',  label: 'Tenant Deactivated' },
  { value: 'PLAN_UPDATED',        label: 'Plan Updated' },
  { value: 'SETTINGS_UPDATED',    label: 'Settings Updated' },
  { value: 'ADMIN_LOGIN',         label: 'Admin Login' },
  { value: 'ADMIN_LOGOUT',        label: 'Admin Logout' },
  { value: 'USER_LOGIN',          label: 'User Login' },
  { value: 'USER_LOGOUT',         label: 'User Logout' },
]
```

- [ ] **Step 3: Fix user name display for non-admin audit entries**

In the table row rendering (line ~248-256), the `User` column currently shows `log.super_admins?.full_name`. For tenant user login/logout entries, this join returns null. Update to fallback to `log.details?.full_name`:

Change the User cell from:
```jsx
{(log.super_admins?.full_name || 'SA').split(' ')...}
```
to:
```jsx
{(log.super_admins?.full_name || log.details?.full_name || 'Unknown').split(' ')...}
```

And the name text from:
```jsx
{log.super_admins?.full_name || '—'}
```
to:
```jsx
{log.super_admins?.full_name || log.details?.full_name || '—'}
```

- [ ] **Step 4: Verify the new action types render correctly**

Log in/out as super admin, then log in/out as tenant user. Navigate to Audit Logs page, verify all entries show with correct badge colors, user names display properly, and filters work.

- [ ] **Step 5: Commit**

```bash
git add src/pages/superadmin/AuditLogs.jsx
git commit -m "feat: add login/logout action types to audit logs UI with name fallback"
```

---

## Task 3: Add Daily/Monthly Period Toggle to Dashboard Charts

**Files:**
- Modify: `server/routes/tenants.js:213-298` (analytics endpoint — all 3 types)
- Modify: `src/pages/superadmin/SuperAdminDash.jsx`

- [ ] **Step 1: Add `period` param support to user_growth analytics**

In `server/routes/tenants.js`, update the `/analytics` handler. Change line ~215 from:

```javascript
const { type } = req.query;
```
to:
```javascript
const { type, period = 'monthly' } = req.query;
```

Replace the existing `user_growth` block (lines ~222-247) with period-aware logic. **Uses `tenant_owners` + `employees` to match existing codebase pattern:**

```javascript
if (type === 'user_growth') {
  const isDaily = period === 'daily';
  const lookback = new Date();
  if (isDaily) {
    lookback.setDate(lookback.getDate() - 30);
  } else {
    lookback.setMonth(lookback.getMonth() - 12);
  }

  const [{ data: owners }, { data: employees }] = await Promise.all([
    supabaseAdmin.from('tenant_owners').select('created_at').gte('created_at', lookback.toISOString()).is('deleted_at', null),
    supabaseAdmin.from('employees').select('created_at').gte('created_at', lookback.toISOString()).is('deleted_at', null),
  ]);

  const allUsers = [...(owners || []), ...(employees || [])];
  const dateMap = {};
  allUsers.forEach(u => {
    const key = isDaily ? u.created_at.slice(0, 10) : u.created_at.slice(0, 7);
    dateMap[key] = (dateMap[key] || 0) + 1;
  });

  const data = [];
  if (isDaily) {
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      data.push({ month: key, count: dateMap[key] || 0 });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      data.push({ month: key, count: dateMap[key] || 0 });
    }
  }

  return res.json({ data });
}
```

- [ ] **Step 2: Add `period` param support to revenue_trend analytics**

Replace the existing `revenue_trend` block (lines ~269-293):

```javascript
if (type === 'revenue_trend') {
  const isDaily = period === 'daily';
  const lookback = new Date();
  if (isDaily) {
    lookback.setDate(lookback.getDate() - 30);
  } else {
    lookback.setMonth(lookback.getMonth() - 12);
  }

  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_name, billing_cycle, created_at')
    .eq('payment_status', 'PAID')
    .gte('created_at', lookback.toISOString())
    .is('deleted_at', null);

  const planPrices = { basic: 29, professional: 79, enterprise: 199 };
  const dateMap = {};
  (subs || []).forEach(s => {
    const key = isDaily ? s.created_at.slice(0, 10) : s.created_at.slice(0, 7);
    const monthly = planPrices[s.plan_name?.toLowerCase()] || 0;
    dateMap[key] = (dateMap[key] || 0) + monthly;
  });

  const data = [];
  if (isDaily) {
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      data.push({ month: key, revenue: dateMap[key] || 0 });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      data.push({ month: key, revenue: dateMap[key] || 0 });
    }
  }

  return res.json({ data });
}
```

- [ ] **Step 3: Add period toggle UI to SuperAdminDash.jsx**

Add a `period` state after the existing state declarations (line ~78):

```javascript
const [period, setPeriod] = useState('monthly')
```

Update `fetchData` to pass period to all analytics calls:

```javascript
tenantsApi.analytics({ type: 'user_growth', period }),
tenantsApi.analytics({ type: 'tenant_activity', period }),
tenantsApi.analytics({ type: 'revenue_trend', period }),
```

Add `period` to the `useCallback` dependency array: `}, [period])`

Add toggle buttons after the header div and before the stats cards grid (after line ~155):

```jsx
{/* ── Period Toggle ─────────────────────────────── */}
<div className="sa-period-toggle mb-6">
  {['daily', 'monthly'].map(p => (
    <button
      key={p}
      className={`sa-period-btn ${period === p ? 'sa-period-btn-active' : ''}`}
      onClick={() => setPeriod(p)}
    >
      {p.charAt(0).toUpperCase() + p.slice(1)}
    </button>
  ))}
</div>
```

Note: `tenant_activity` type does not change with period (it's always top-10 by transaction count), which is correct — activity ranking is not time-scoped.

- [ ] **Step 4: Verify daily/monthly toggle works on dashboard**

Navigate to super admin dashboard, click Daily, verify User Growth and Revenue Trend charts update with daily granularity (30 data points). Click Monthly, verify 12-month view returns.

- [ ] **Step 5: Commit**

```bash
git add server/routes/tenants.js src/pages/superadmin/SuperAdminDash.jsx
git commit -m "feat: add daily/monthly period toggle to admin dashboard charts"
```

---

## Task 4: Add Daily/Weekly Granularity + Transaction History to Sales Report

**Files:**
- Modify: `server/routes/tenants.js:424-498` (sales endpoint)
- Modify: `src/pages/superadmin/SalesReport.jsx`

- [ ] **Step 1: Add date-range filtering to sales backend**

The sales endpoint already receives `period` from the frontend (line 426) but doesn't filter by it. Update the endpoint to filter both transactions AND subscriptions by period.

After `const { period = 'monthly' } = req.query;` add date boundary logic:

```javascript
// Calculate date boundary based on period
const now = new Date();
let dateFrom = null;
if (period === 'daily') {
  dateFrom = new Date(now);
  dateFrom.setDate(dateFrom.getDate() - 1);
} else if (period === 'weekly') {
  dateFrom = new Date(now);
  dateFrom.setDate(dateFrom.getDate() - 7);
} else {
  dateFrom = new Date(now);
  dateFrom.setMonth(dateFrom.getMonth() - 1);
}
```

Update the subscriptions query (line ~428) to filter by period:

```javascript
let subsQuery = supabaseAdmin
  .from('subscriptions')
  .select('plan_name, billing_cycle, tenant_id')
  .eq('payment_status', 'PAID')
  .is('deleted_at', null);

if (dateFrom) {
  subsQuery = subsQuery.gte('created_at', dateFrom.toISOString());
}

const { data: subs } = await subsQuery;
```

Update the transactions query (line ~439) to also filter by period:

```javascript
let txQuery = supabaseAdmin
  .from('transactions')
  .select('principal_paid, interest_paid, penalty_paid, tenant_id, created_at, trans_type')
  .is('deleted_at', null);

if (dateFrom) {
  txQuery = txQuery.gte('created_at', dateFrom.toISOString());
}

const { data: allTx } = await txQuery;
```

- [ ] **Step 2: Add transaction history list to sales response**

At the end of the sales endpoint (before `res.json`), build a recent transactions list:

```javascript
// Recent transactions summary (last 20)
const { data: recentTx } = await supabaseAdmin
  .from('transactions')
  .select('id, trans_type, principal_paid, interest_paid, penalty_paid, tenant_id, created_at')
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(20);

const recentTransactions = (recentTx || []).map(t => ({
  id: t.id,
  type: t.trans_type,
  amount: Number(t.principal_paid || 0) + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0),
  tenant_name: tenantNameMap[t.tenant_id] || 'Unknown',
  date: t.created_at,
}));
```

Add `recent_transactions: recentTransactions` to the `res.json()` response object.

- [ ] **Step 3: Add `recentTransactions` state to SalesReport.jsx (BEFORE adding JSX)**

Add state declaration alongside existing state (line ~49):

```javascript
const [recentTransactions, setRecentTransactions] = useState([])
```

In `fetchData`, update the response parsing (after `setTopTenants`):

```javascript
setRecentTransactions(res.recent_transactions || [])
```

- [ ] **Step 4: Add transaction history table JSX to SalesReport.jsx**

After the Top Performing Tenants `</div>` closing tag (line ~260), add:

```jsx
{/* ── Transaction History Summary ──────────────────── */}
<div className="dashboard-card mt-8">
  <div className="flex items-center justify-between mb-5">
    <div>
      <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Transaction History</h2>
      <p className="text-xs text-neutral-400 mt-0.5">Most recent platform-wide transactions</p>
    </div>
  </div>

  {loading ? (
    <div className="py-14 text-center">
      <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
      <p className="mt-3 text-sm text-neutral-400">Loading...</p>
    </div>
  ) : recentTransactions.length === 0 ? (
    <div className="py-14 text-center">
      <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-700">receipt_long</span>
      <p className="mt-3 text-sm text-neutral-500">No transactions found</p>
    </div>
  ) : (
    <div className="overflow-x-auto -mx-6 -mb-6">
      <table className="sa-table w-full">
        <thead>
          <tr className="border-b border-neutral-100 dark:border-neutral-800">
            {['Tenant', 'Type', 'Amount (₱)', 'Date'].map(h => (
              <th key={h} className="table-th text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {recentTransactions.map(tx => (
            <tr key={tx.id} className="loan-row">
              <td className="px-5 py-3.5 text-sm font-medium text-neutral-800 dark:text-white">{tx.tenant_name}</td>
              <td className="px-5 py-3.5 text-center">
                <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  {tx.type}
                </span>
              </td>
              <td className="px-5 py-3.5 text-center text-sm font-semibold text-neutral-800 dark:text-white">
                ₱{Number(tx.amount).toLocaleString()}
              </td>
              <td className="px-5 py-3.5 text-center text-sm text-neutral-500 dark:text-neutral-400">
                {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
```

- [ ] **Step 5: Verify sales report period switching and transaction history**

Navigate to Sales Report, toggle Daily/Weekly/Monthly, verify KPIs and charts update. Scroll down to verify Transaction History table renders.

- [ ] **Step 6: Commit**

```bash
git add server/routes/tenants.js src/pages/superadmin/SalesReport.jsx
git commit -m "feat: add period filtering and transaction history to sales report"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Run the full app and verify all pages**

Start the backend (`node server/index.js`) and frontend (`npm run dev`). Walk through:
1. Login as super admin → check Audit Logs for `ADMIN_LOGIN` with correct name
2. Dashboard → toggle Daily/Monthly on User Growth and Revenue Trend charts
3. Sales Report → toggle Daily/Weekly/Monthly, verify KPIs change, scroll to Transaction History
4. Audit Logs → filter by `Admin Login`, `User Login`, `Admin Logout`, `User Logout`
5. Logout → re-login → check Audit Logs for `ADMIN_LOGOUT` entry with correct name

- [ ] **Step 2: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues from final verification"
```
