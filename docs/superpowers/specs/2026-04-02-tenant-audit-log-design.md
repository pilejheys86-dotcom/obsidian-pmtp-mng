# Tenant Audit Log — Design Spec

**Date:** 2026-04-02
**Scope:** Employee activity monitoring for tenant (pawnshop) accounts
**Access:** Owner only

---

## Overview

A tenant-level audit log that records every meaningful employee action across the system. The owner can view, filter, and export a flat table of activity from a dedicated page under the System navigation category.

---

## Database

### Table: `tenant_audit_logs`

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | UUID | PK, default `gen_random_uuid()` | Row identifier |
| `tenant_id` | UUID | NOT NULL, FK → tenants(id) | Tenant isolation |
| `user_id` | UUID | FK → tenant_users(id) | Employee who performed the action (nullable for failed logins) |
| `action` | TEXT | NOT NULL | Machine-readable action code |
| `category` | TEXT | NOT NULL | Grouping for filters |
| `description` | TEXT | NOT NULL | Human-readable summary |
| `target_type` | TEXT | | Entity type affected (e.g., `pawn_item`, `customer`) |
| `target_id` | UUID | | ID of the affected entity |
| `ip_address` | TEXT | | Request IP for security audit |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Auto-timestamped, immutable |

**Indexes:**
- `(tenant_id, created_at DESC)` — primary query path
- `(tenant_id, category)` — category filter
- `(tenant_id, user_id)` — employee filter

**RLS Policy:** `tenant_id = get_my_tenant_id() AND get_my_role() = 'OWNER'`

**Retention:** No automatic deletion. Table is append-only (no UPDATE/DELETE).

---

## Server

### Logging Helper

File: `server/utils/auditLog.js`

```
function logTenantAudit(req, { action, category, description, target_type, target_id })
```

- Reads `req.tenantId`, `req.userId` automatically
- Extracts IP from `req.ip` or `x-forwarded-for` header
- Inserts into `tenant_audit_logs` via `supabaseAdmin`
- Fire-and-forget (does not block the response if logging fails)

### API Endpoint

`GET /api/audit-logs` — Owner only, paginated, filterable.

**Query params:**
- `page` (default 1)
- `limit` (default 20, max 50)
- `category` — filter by category
- `user_id` — filter by employee
- `from_date` — ISO date, inclusive
- `to_date` — ISO date, inclusive (appends T23:59:59.999Z)

**Response:**
```json
{
  "data": [{ "id", "user_id", "action", "category", "description", "target_type", "target_id", "ip_address", "created_at", "user": { "full_name" } }],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

Joins `tenant_users(full_name)` on `user_id` for display.

### Actions to Log

| Category | Action Code | Description Template | Route File |
|----------|------------|---------------------|------------|
| AUTH | `LOGIN_SUCCESS` | "{name} logged in" | auth.js |
| AUTH | `LOGIN_FAILED` | "Failed login attempt for {email}" | auth.js |
| AUTH | `LOGOUT` | "{name} logged out" | auth.js |
| AUTH | `PASSWORD_CHANGED` | "{name} changed their password" | auth.js |
| APPRAISAL | `ITEM_INTAKE` | "Accepted {category} item from {customer}" | appraisals.js |
| APPRAISAL | `APPRAISAL_SUBMITTED` | "Submitted appraisal for {desc} — ₱{value}" | appraisals.js |
| APPRAISAL | `APPRAISAL_APPROVED` | "Approved appraisal for {desc}" | appraisals.js |
| APPRAISAL | `APPRAISAL_REJECTED` | "Rejected appraisal for {desc}" | appraisals.js |
| APPRAISAL | `APPRAISAL_DECLINED` | "Declined appraisal for {desc}" | appraisals.js |
| LOAN | `TICKET_ISSUED` | "Issued pawn ticket {ticket_no} — ₱{amount}" | pawnTickets.js |
| LOAN | `LOAN_RENEWED` | "Renewed loan {ticket_no}" | renewals.js |
| LOAN | `LOAN_REDEEMED` | "Redeemed loan {ticket_no}" | pawnTickets.js |
| PAYMENT | `PAYMENT_PROCESSED` | "Processed ₱{amount} payment for {ticket_no}" | payments.js |
| CUSTOMER | `CUSTOMER_CREATED` | "Created customer {first} {last}" | customers.js |
| CUSTOMER | `CUSTOMER_UPDATED` | "Updated customer {first} {last}" | customers.js |
| INVENTORY | `ITEM_FORFEITED` | "Forfeited item {desc}" | dispositions.js |
| INVENTORY | `ITEM_AUCTIONED` | "Moved item {desc} to auction" | dispositions.js |
| INVENTORY | `ITEM_MELTED` | "Melted item {desc}" | dispositions.js |
| SETTINGS | `GOLD_RATES_UPDATED` | "Updated gold rates" | loanSettings.js |
| SETTINGS | `SILVER_RATES_UPDATED` | "Updated silver rates" | pricing.js |
| SETTINGS | `CONDITIONS_UPDATED` | "Updated item conditions" | pricing.js |
| SETTINGS | `LOAN_SETTINGS_UPDATED` | "Updated loan settings" | loanSettings.js |
| SETTINGS | `BRANDING_UPDATED` | "Updated branding settings" | branding.js |
| EMPLOYEE | `EMPLOYEE_CREATED` | "Created employee {name} ({role})" | employees.js |
| EMPLOYEE | `EMPLOYEE_DEACTIVATED` | "Deactivated employee {name}" | employees.js |

---

## Frontend

### Navigation

New item in `adminNavigation` under the System category:

```js
{ icon: 'history', label: 'Audit Log', path: '/admin/audit-log', ownerOnly: true }
```

### Page: `AuditLogPage.jsx`

**Route:** `/admin/audit-log`

**Layout:** Standard admin page — Sidebar + Header + full-width content. No secondary sidebar.

**Filter bar** (inside a `profile-section` card):
- Category dropdown: All, Auth, Appraisal, Loan, Payment, Customer, Inventory, Settings, Employee
- Employee dropdown: populated from `tenant_users` (fetched on mount)
- Date range: From / To date inputs
- Apply + Clear buttons
- Export PDF button (right-aligned)

**Table** (inside a `profile-section` card):

| Column | Source |
|--------|--------|
| Date & Time | `created_at`, formatted via `toLocaleString()` |
| Employee | `user.full_name` (joined) |
| Category | `category`, displayed as a small colored badge |
| Description | `description` |
| IP Address | `ip_address` |

**Category badge colors:**
- AUTH → blue
- APPRAISAL → amber
- LOAN → green (primary)
- PAYMENT → emerald
- CUSTOMER → purple
- INVENTORY → neutral
- SETTINGS → neutral
- EMPLOYEE → blue

**Pagination:** 20 per page, "Showing X–Y of Z entries", first/prev/next/last buttons.

**PDF Export:** Opens a new print-friendly window using the same `exportHistoryPdf` pattern (with `@page { margin: 0 }` to suppress browser headers). Includes the tenant business name in the header.

### API Client

New entry in `src/lib/api.js`:

```js
export const auditLogApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/audit-logs?${qs}`);
  },
};
```

---

## What This Does NOT Include

- No real-time notifications or live updates
- No before/after value tracking (just action descriptions)
- No drill-down or expandable rows
- No charts or KPI cards
- No automatic retention/cleanup policy
