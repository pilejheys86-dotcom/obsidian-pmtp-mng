# Super Admin Module Expansion — Design Spec

> **Date:** 2026-03-20
> **Status:** Draft
> **Scope:** Extend existing superadmin module with 5 new pages + enhancements to 2 existing pages

---

## 1. Overview

Expand the existing superadmin module (`/superadmin/*`) from 2 pages (Dashboard, Tenants) to 7 pages, adding Reports, Sales Report, Audit Logs, Backup (scaffold), and Settings. Enhance the existing Dashboard with richer analytics and the Tenants page with approve/reject/deactivate actions.

### Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Extend in-place (Approach A) | Follows existing conventions in `src/pages/superadmin/` |
| Chart library | MUI X Charts (existing) | No new dependency, consistent with AdminDash |
| Audit logs | Enhance existing `platform_audit_logs` endpoint | Table already has needed columns; endpoint exists but lacks filters |
| Sales scope | Subscription revenue + aggregated tenant transactions | Full platform visibility |
| Permissions matrix | Visual reference only (no enforcement) | Avoid premature RBAC complexity |

---

## 2. File Structure

### New & Modified Files

```
src/
├── pages/superadmin/
│   ├── SuperAdminDash.jsx       ← MODIFY (add charts, more KPIs)
│   ├── Tenants.jsx              ← MODIFY (add approve/reject/deactivate, detail modal)
│   ├── Reports.jsx              ← NEW
│   ├── SalesReport.jsx          ← NEW
│   ├── AuditLogs.jsx            ← NEW
│   ├── Backup.jsx               ← NEW (scaffold, mock data)
│   └── SuperAdminSettings.jsx   ← NEW
├── config/navigation.js         ← MODIFY (expand superadminNavigation, update getNavigationByRole)
├── lib/api.js                   ← MODIFY (add new API methods to tenantsApi)
├── App.jsx                      ← MODIFY (add superadmin routes)
└── index.css                    ← MODIFY (add superadmin-specific styles)

server/
├── routes/tenants.js            ← MODIFY (add new endpoints)
└── index.js                     ← NO CHANGE (tenants routes already mounted)
```

---

## 3. Routing

Add to the existing superadmin route switch in `App.jsx`:

| Path | Component | Description |
|------|-----------|-------------|
| `/superadmin` | `SuperAdminDash` | EXISTS |
| `/superadmin/tenants` | `Tenants` | EXISTS |
| `/superadmin/reports` | `Reports` | NEW |
| `/superadmin/sales` | `SalesReport` | NEW |
| `/superadmin/audit-logs` | `AuditLogs` | NEW |
| `/superadmin/backup` | `Backup` | NEW |
| `/superadmin/settings` | `SuperAdminSettings` | EXISTS (route exists, component is new dedicated page) |

---

## 4. Navigation

Expand `superadminNavigation` in `src/config/navigation.js`.

**Important:** Use existing property format `{ icon, label, path }` (NOT `name` — the Sidebar reads `item.label`).

```javascript
export const superadminNavigation = [
  {
    category: 'Main',
    items: [
      { icon: 'dashboard', label: 'Overview', path: '/superadmin' }
    ]
  },
  {
    category: 'Tenants',
    items: [
      { icon: 'domain', label: 'All Tenants', path: '/superadmin/tenants' }
    ]
  },
  {
    category: 'Analytics',
    items: [
      { icon: 'summarize', label: 'Reports', path: '/superadmin/reports' },
      { icon: 'point_of_sale', label: 'Sales Report', path: '/superadmin/sales' }
    ]
  },
  {
    category: 'System',
    items: [
      { icon: 'history', label: 'Audit Logs', path: '/superadmin/audit-logs' },
      { icon: 'backup', label: 'Backup', path: '/superadmin/backup' },
      { icon: 'settings', label: 'Settings', path: '/superadmin/settings' }
    ]
  }
];
```

**Also update `getNavigationByRole`** — add `case 'superadmin': return superadminNavigation;` to the switch statement. Currently it returns `[]` for superadmin, which would break sidebar rendering if this helper is used.

---

## 5. Page Designs

### 5.1 SuperAdminDash.jsx (Enhance Existing)

**KPI Cards** (top row, 4-column grid using `StatsCard`):

| Card | Data Source | Badge |
|------|-----------|-------|
| Total Tenants | `tenants` count | neutral |
| Active Users | Union of `tenant_owners` (where `is_active = true`) + `employees` (where `is_active = true`) | success |
| Inactive Users | Union of `tenant_owners` (where `is_active = false`) + `employees` (where `is_active = false`) | warning |
| Monthly Revenue | Sum of active subscriptions for current month | neutral |

> **Note:** The codebase uses two separate tables (`tenant_owners` and `employees`) for user data, NOT a single `tenant_users` table. All user count queries must aggregate across both tables.

**Charts** (3-column grid below KPIs):

1. **User Growth** — `LineChart` from `@mui/x-charts`
   - X-axis: months (last 12)
   - Y-axis: new registrations (combined tenant_owners + employees created_at)
   - Data: `GET /api/tenants/analytics?type=user_growth`
   - Verify `LineChart` import works from `@mui/x-charts` — only `BarChart` and `PieChart` are currently used in the project

2. **Tenant Activity** — `BarChart`
   - X-axis: tenant names (top 10)
   - Y-axis: transaction count
   - Data: `GET /api/tenants/analytics?type=tenant_activity`

3. **Revenue Trend** — `LineChart` with area fill
   - X-axis: months (last 12)
   - Y-axis: revenue amount
   - Data: `GET /api/tenants/analytics?type=revenue_trend`

**Recent Tenants table** — keep existing implementation.

### 5.2 Tenants.jsx (Enhance Existing)

**New action buttons per row** (alongside existing Block/Reactivate):

| Button | Condition | Action | HTTP Method |
|--------|-----------|--------|-------------|
| Approve | `status = 'PENDING'` | Sets status to `'ACTIVE'` | `POST /api/tenants/:id/approve` |
| Reject | `status = 'PENDING'` | Sets status to `'REJECTED'` | `POST /api/tenants/:id/reject` |
| Deactivate | `status = 'ACTIVE'` | Sets status to `'DEACTIVATED'` (NOT soft-delete via `deleted_at`) | `POST /api/tenants/:id/deactivate` |

> **Clarifications:**
> - Use `POST` (not `PATCH`) to match existing `block` and `reactivate` endpoint conventions.
> - **Deactivate vs Block:** Block (`SUSPENDED`) is temporary/reversible. Deactivate (`DEACTIVATED`) is a permanent shutdown — the tenant's users cannot log in. Both are reversible via Reactivate.
> - **PENDING status:** Must be added to the tenant registration flow. The `register_owner` RPC currently creates tenants as `ACTIVE`. Modify it to create as `PENDING` so superadmins can approve/reject new registrations. Status enum values: `ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `PENDING`, `REJECTED` (uppercase to match existing convention).
> - Existing Block/Reactivate buttons remain — they are not replaced.

All actions require confirmation modal before executing.

**Tenant Detail Modal** (opens on row click):

- Header: Business name + status badge
- Info grid:
  - Business name, BSP registration number
  - Owner name, contact email, phone
  - Current plan, billing cycle, payment status
  - Created date
- Stats row: Branch count, employee count, customer count (data already fetched by existing detail endpoint)
- Action buttons at bottom (same as row actions, contextual to status)

### 5.3 Reports.jsx (New)

**Filter bar** (top):
- Date range: two `<input type="date">` fields (from/to)
- Tenant filter: `<select>` dropdown — use a lightweight `GET /api/tenants/list` endpoint returning only `id` and `business_name` (the existing `GET /api/tenants` is too heavy for a dropdown, it does N+1 queries per tenant)
- Export button: `btn-secondary`, onClick shows `alert('Export coming soon')`

**Report sections** (stacked cards):

1. **Tenant Activity Report** — table in a card
   - Columns: Tenant Name, Total Transactions, Active Loans, Customers, Last Active
   - Data: `GET /api/tenants/reports?type=activity&from=&to=&tenant_id=`

2. **User Registration Report** — table in a card
   - Columns: Month, New Users, Cumulative Total
   - Data: `GET /api/tenants/reports?type=registrations&from=&to=`

3. **Usage Statistics** — 3 stat cards in a row
   - Avg Loans per Tenant
   - Avg Customers per Tenant
   - Most Active Tenant (name + transaction count)
   - Data: `GET /api/tenants/reports?type=usage&from=&to=`

### 5.4 SalesReport.jsx (New)

**KPI Cards** (top row, 4-column grid):

| Card | Description |
|------|-------------|
| Total Platform Revenue | Sum of all subscription payments |
| Total Transaction Volume | Aggregate of all tenant pawn transactions |
| Avg Revenue Per Tenant | Platform revenue / active tenant count |
| Top Performing Tenant | Tenant with highest transaction volume |

**Period Toggle** (below KPIs):
- Three buttons: Daily / Weekly / Monthly
- Active state uses `btn-primary` styling, inactive uses `btn-outline`
- Controls all data below

**Revenue Chart** — `BarChart` showing subscription revenue vs transaction volume side by side per period.

**Tables:**

1. **Top Performing Tenants**
   - Columns: Rank, Tenant Name, Plan, Transaction Count, Transaction Volume, Subscription Amount
   - Sorted by transaction volume descending, top 10

2. **Transaction History Summary**
   - Columns: Date, Tenant, Type (badge), Amount
   - Paginated using existing `Pagination` component

**Backend:** `GET /api/tenants/sales?period=daily|weekly|monthly&from=&to=`

> **Implementation note:** Cross-tenant aggregation queries (joining `pawn_tickets`, `transactions`, `subscriptions` across all tenants) should use Supabase RPC stored procedures for performance rather than multiple round-trip queries. Define an RPC `platform_sales_summary(period, from_date, to_date)` that returns pre-aggregated results.

### 5.5 AuditLogs.jsx (New)

**Filter bar:**
- Date range: from/to date inputs
- User: `<select>` dropdown — add `GET /api/tenants/admins` endpoint to list super_admins (id, full_name)
- Action type: `<select>` with options: All, LOGIN, LOGOUT, TENANT_BLOCK, TENANT_REACTIVATE, TENANT_APPROVE, TENANT_REJECT, TENANT_DEACTIVATE, SETTINGS_UPDATE, PLAN_UPDATE

**Table:**
- Columns: User (avatar + name), Action (StatusBadge), Target, Details (truncated, expandable on click), Timestamp (formatted)
- Rows styled with alternating background

**Pagination** at bottom using existing `Pagination` component.

**Backend:** ENHANCE existing `GET /api/tenants/audit-logs` endpoint (already exists at line ~493 of `tenants.js`). Add query parameter support: `?from=&to=&admin_id=&action=&page=1&limit=20`. The current implementation returns all logs without filtering — add WHERE clauses for the filter params.

### 5.6 Backup.jsx (Scaffold Only)

**Info banner** at top: info-styled card with message "Automated backup management is coming soon. Database backups are currently handled by Supabase."

**Backup History table** (hardcoded mock data, using relative date calculation):

```javascript
const today = new Date();
const mockBackups = [
  { id: 1, date: formatDate(today), status: 'Success', size: '245 MB' },
  { id: 2, date: formatDate(subDays(today, 1)), status: 'Success', size: '243 MB' },
  { id: 3, date: formatDate(subDays(today, 2)), status: 'Failed', size: '—' },
  { id: 4, date: formatDate(subDays(today, 3)), status: 'Success', size: '240 MB' },
];
```

- Columns: Date, Status (badge: green for Success, red for Failed), File Size, Actions
- Actions: Download button (disabled)

**Trigger Backup button** — `btn-primary`, disabled, title tooltip "Coming soon".

**No backend endpoints.** Purely static.

### 5.7 SuperAdminSettings.jsx (New)

**Three card sections:**

**1. System Branding**
- System title: text input, pre-filled "Obsidian"
- Logo: file input with preview area (placeholder box with upload icon)
- Save button: `btn-primary`

**2. Tenant Limits**
- Max tenants: number input
- Max users per tenant: number input
- Save button: `btn-primary`

**3. Roles & Permissions Matrix** (read-only, forward-looking)
- Table layout:

| Feature | Super Admin | Platform Staff |
|---------|:-----------:|:--------------:|
| Dashboard | Read/Write | Read |
| Tenants | Read/Write | Read |
| Reports | Read/Write | Read |
| Sales | Read/Write | Read |
| Audit Logs | Read/Write | Read |
| Backup | Read/Write | No Access |
| Settings | Read/Write | No Access |

- Toggle switches rendered but disabled with "Coming soon" tooltip
- Muted text below: "Role-based access control will be available in a future update. The 'Platform Staff' role is not yet implemented."

**Backend:**
- `GET /api/tenants/platform-settings` — returns current settings; if no row exists, return defaults
- `PUT /api/tenants/platform-settings` — upserts branding + limits (creates row if none exists)

---

## 6. Backend Endpoints

All new endpoints added to `server/routes/tenants.js`, protected by `auth` + `superAdminScope` middleware.

### New Endpoints

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| `GET` | `/api/tenants/analytics` | Dashboard chart data (query: `type`) | NEW |
| `GET` | `/api/tenants/list` | Lightweight tenant list for dropdowns (id + name only) | NEW |
| `GET` | `/api/tenants/admins` | List super_admins for audit log filter | NEW |
| `POST` | `/api/tenants/:id/approve` | Set tenant status to ACTIVE | NEW |
| `POST` | `/api/tenants/:id/reject` | Set tenant status to REJECTED | NEW |
| `POST` | `/api/tenants/:id/deactivate` | Set tenant status to DEACTIVATED | NEW |
| `GET` | `/api/tenants/reports` | Reports data (query: `type`, `from`, `to`, `tenant_id`) | NEW |
| `GET` | `/api/tenants/sales` | Sales data (query: `period`, `from`, `to`) | NEW |
| `GET` | `/api/tenants/audit-logs` | Paginated audit logs with filters | ENHANCE (add filter params) |
| `GET` | `/api/tenants/platform-settings` | Get platform configuration | NEW |
| `PUT` | `/api/tenants/platform-settings` | Update platform configuration | NEW |

> **Note on HTTP methods:** New tenant action endpoints use `POST` to match existing `block` and `reactivate` conventions in the same file.

> **Note on endpoint ordering:** Static path segments (`/analytics`, `/list`, `/admins`, `/reports`, `/sales`, `/audit-logs`, `/platform-settings`) must be registered BEFORE parameterized routes (`/:id`, `/:id/approve`, etc.) in Express to avoid route conflicts.

### Analytics Endpoint Response Shapes

```javascript
// GET /api/tenants/analytics?type=user_growth
{
  data: [
    { month: '2025-04', count: 12 },
    { month: '2025-05', count: 18 },
    // ... last 12 months
  ]
}

// GET /api/tenants/analytics?type=tenant_activity
{
  data: [
    { tenant_name: 'Gold Palace', transaction_count: 145 },
    // ... top 10
  ]
}

// GET /api/tenants/analytics?type=revenue_trend
{
  data: [
    { month: '2025-04', revenue: 45000 },
    // ... last 12 months
  ]
}

// Invalid type → 400 { error: 'Invalid analytics type. Valid: user_growth, tenant_activity, revenue_trend' }
```

### Database

**New table:**

```sql
CREATE TABLE platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_title TEXT DEFAULT 'Obsidian',
  logo_url TEXT,
  max_tenants INTEGER DEFAULT 100,
  max_users_per_tenant INTEGER DEFAULT 50,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES super_admins(id)
);
-- Single-row table. GET returns first row or defaults. PUT upserts.
```

**Schema changes needed:**
- `tenants.status` enum: add `PENDING` and `REJECTED` values
- Modify `register_owner` RPC: create tenants with status `PENDING` instead of `ACTIVE`

**Existing tables used (no schema changes):**
- `platform_audit_logs` — already has needed columns
- `tenant_owners` + `employees` — query for user counts (NOT `tenant_users`)
- `subscriptions` — query for revenue data
- `pawn_tickets`, `transactions` — aggregate for tenant activity

**New RPC (for performance):**

```sql
CREATE OR REPLACE FUNCTION platform_sales_summary(
  p_period TEXT,      -- 'daily', 'weekly', 'monthly'
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL
) RETURNS JSON AS $$
  -- Aggregates transactions + subscriptions across all tenants
  -- Groups by period
  -- Returns { kpis: {...}, chart: [...], top_tenants: [...], transactions: [...] }
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Audit Logging

All new mutating endpoints call existing `logAudit()` with appropriate action types:
- `TENANT_APPROVE`, `TENANT_REJECT`, `TENANT_DEACTIVATE`
- `SETTINGS_UPDATE`

---

## 7. UI Components & Styling

### Reused Components
- `StatsCard` — KPI cards on all pages
- `StatusBadge` — status indicators throughout
- `Pagination` — audit logs, transaction tables
- `Modal` — tenant detail, confirmations
- `ActionMenu` — row actions on tenant table
- `EmptyState` — empty states for tables

### New CSS Classes (in `index.css`)

```css
/* Filter bar */
.sa-filter-bar          /* Flex row with gap, wraps on mobile */
.sa-filter-input        /* Date/select inputs in filter bars */
.sa-filter-btn          /* Filter action buttons */

/* Period toggle */
.sa-period-toggle       /* Button group container */
.sa-period-btn          /* Individual period button */
.sa-period-btn-active   /* Active period button */

/* Charts */
.sa-chart-card          /* Card wrapper for charts */
.sa-chart-grid          /* 3-column grid for chart row */

/* Settings */
.sa-settings-card       /* Settings section card */
.sa-permissions-table   /* Permissions matrix table */

/* Audit */
.sa-log-details         /* Expandable details cell */

/* Backup */
.sa-info-banner         /* Info/coming-soon banner */
```

Prefix `sa-` (super admin) to avoid collision with existing classes.

---

## 8. Data Flow

```
User Action → Page Component → api.js (tenantsApi.method())
    → apiFetch() with JWT → Express route (auth + superAdminScope)
    → Supabase query → Response → Component state update → Re-render
```

All pages follow the existing pattern:
1. `useState` for data, loading, error, filters
2. `useEffect` to fetch on mount and filter change
3. `apiFetch` via `tenantsApi` methods
4. Loading spinner → data display or error state

---

## 9. Mock Data Strategy

For initial frontend development before backend is wired:
- Each page component includes a `USE_MOCK` constant (set to `true`)
- When `true`, returns hardcoded mock data instead of API calls
- When backend is ready, flip to `false` — no other changes needed

This avoids blocking frontend work on backend implementation.

---

## 10. Error Handling

- API errors caught in `apiFetch` → displayed as toast or inline error message
- Empty states use existing `EmptyState` component
- Loading states use existing spinner pattern from other superadmin pages
- Confirmation modals for all destructive actions (deactivate, reject)
- Analytics endpoint returns 400 for invalid `type` parameter with list of valid types

---

## 11. Out of Scope

- Dynamic RBAC enforcement (permissions matrix is visual only)
- Actual backup/restore functionality (scaffold only)
- CSV/PDF export implementation (placeholder button only)
- Real-time updates / WebSockets
- Mobile-specific layouts (responsive via existing Tailwind, no custom mobile views)
- Platform Staff role implementation (referenced in permissions matrix as future work)
