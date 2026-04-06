# Reports & Analytics Design

> **Date:** 2026-03-23
> **Status:** Approved

---

## Overview

Extend the existing reports system with 8 new reports across tenant and super admin levels, plus CSV/PDF export for all reports. No new database tables — all reports query existing tables.

---

## Decisions

| Decision | Choice |
|----------|--------|
| Architecture | Extend existing route files (reports.js, tenants.js) |
| CSV export | New `exports.js` route, server-side CSV generation with helper |
| PDF export | Client-side via `window.print()` + `@media print` CSS |
| Frontend | Tab-based navigation on existing Reports pages |
| Libraries | No new dependencies — CSV via string formatting, PDF via browser print |

---

## Tenant-Level Reports (4 new endpoints)

### 1. Daily Transaction Summary

**Endpoint:** `GET /api/reports/daily-transactions`

**Params:** `date` (YYYY-MM-DD, default today), `branch_id` (optional)

**Returns:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "created_at": "timestamp",
      "type": "INTEREST|PENALTY|DISBURSEMENT|REDEMPTION|AUCTION_SALE",
      "amount": 1500.00,
      "customer_name": "Juan Dela Cruz",
      "ticket_number": "TKT-20260323-00001",
      "item_description": "Gold Necklace 18K",
      "processed_by": "Employee Name",
      "branch_name": "Main Branch"
    }
  ],
  "summary": {
    "total_disbursed": 50000.00,
    "total_collected": 35000.00,
    "total_interest": 8500.00,
    "total_penalties": 1200.00,
    "total_redemptions": 25300.00,
    "transaction_count": 24
  }
}
```

**Query:** JOIN transactions → pawn_tickets → pawn_items → customers, filtered by date range (start of day to end of day) and tenant_id.

### 2. Overdue/Expiring Loans

**Endpoint:** `GET /api/reports/overdue-loans`

**Params:** `branch_id` (optional)

**Returns:**
```json
{
  "loans": [
    {
      "ticket_id": "uuid",
      "ticket_number": "TKT-...",
      "customer_name": "...",
      "item_description": "...",
      "principal": 5000.00,
      "maturity_date": "2026-03-20",
      "days_overdue": 3,
      "penalty_accrued": 150.00,
      "status": "OVERDUE",
      "branch_name": "Main Branch"
    }
  ],
  "summary": {
    "total_overdue": 12,
    "total_expiring_soon": 5,
    "total_at_risk_value": 85000.00
  }
}
```

**Logic:**
- OVERDUE: pawn_tickets WHERE status = 'ACTIVE' AND maturity_date < NOW()
- EXPIRING_SOON: pawn_tickets WHERE status = 'ACTIVE' AND maturity_date BETWEEN NOW() AND NOW() + 7 days
- penalty_accrued = days_overdue × daily_penalty_rate × principal (from tenant_loan_settings)

### 3. Branch Comparison

**Endpoint:** `GET /api/reports/branch-comparison`

**Params:** `period` (days, default 30)

**Returns:**
```json
{
  "branches": [
    {
      "branch_id": "uuid",
      "branch_name": "Main Branch",
      "loan_count": 45,
      "total_disbursed": 225000.00,
      "total_collected": 180000.00,
      "active_loans_value": 120000.00,
      "customer_count": 38,
      "transaction_count": 92
    }
  ]
}
```

**Query:** Aggregate pawn_tickets, transactions, and customers grouped by branch_id within the period.

### 4. Customer Loan History

**Endpoint:** `GET /api/reports/customer-history`

**Params:** `customer_id` (required)

**Returns:**
```json
{
  "customer": {
    "id": "uuid",
    "name": "Juan Dela Cruz",
    "risk_rating": "LOW",
    "total_loans": 8
  },
  "tickets": [
    {
      "ticket_id": "uuid",
      "ticket_number": "TKT-...",
      "item_description": "Gold Ring 21K",
      "principal": 3000.00,
      "interest_rate": 3.5,
      "status": "REDEEMED",
      "created_at": "2026-01-15",
      "maturity_date": "2026-04-15",
      "redeemed_at": "2026-03-10",
      "parent_ticket_id": null,
      "transactions": [
        { "type": "DISBURSEMENT", "amount": 3000.00, "date": "2026-01-15" },
        { "type": "INTEREST", "amount": 315.00, "date": "2026-02-15" },
        { "type": "REDEMPTION", "amount": 3000.00, "date": "2026-03-10" }
      ]
    }
  ],
  "totals": {
    "total_borrowed": 24000.00,
    "total_interest_paid": 2520.00,
    "total_penalties_paid": 300.00,
    "active_loans": 2,
    "redeemed_loans": 5,
    "forfeited_loans": 1
  }
}
```

**Query:** customers → pawn_tickets (with parent_ticket_id for renewal chain) → transactions, all filtered by customer_id and tenant_id.

---

## Super Admin Reports (4 new endpoints)

### 5. Tenant Health Dashboard

**Endpoint:** `GET /api/tenants/health`

**Params:** `sort` (health_score, last_activity), `status` (healthy, warning, critical)

**Returns:**
```json
{
  "tenants": [
    {
      "tenant_id": "uuid",
      "business_name": "Juan's Pawnshop",
      "health_score": 85,
      "health_status": "healthy",
      "last_login": "2026-03-22T14:30:00Z",
      "transactions_30d": 45,
      "active_loans": 12,
      "subscription_status": "PAID",
      "plan_name": "Professional",
      "days_until_expiry": 22
    }
  ],
  "summary": {
    "healthy": 18,
    "warning": 5,
    "critical": 3
  }
}
```

**Health Score Formula (0-100):**
- Activity (40%): transactions in last 30 days → 0 txns = 0pts, 1-10 = 20pts, 11+ = 40pts
- Subscription (30%): PAID = 30pts, PENDING = 15pts, OVERDUE/CANCELLED = 0pts
- Loan volume (30%): active_loans > 0 = 30pts, else 0pts
- 70-100 = Healthy (green), 30-69 = Warning (amber), 0-29 = Critical (red)

### 6. Subscription Revenue Analytics

**Endpoint:** `GET /api/tenants/subscription-analytics`

**Params:** `period` (months, default 6)

**Returns:**
```json
{
  "mrr": 45000.00,
  "mrr_trend": [
    { "month": "2025-10", "mrr": 38000.00 },
    { "month": "2025-11", "mrr": 40000.00 }
  ],
  "churn_rate": 4.2,
  "plan_distribution": [
    { "plan": "Starter", "count": 8, "revenue": 12000.00 },
    { "plan": "Professional", "count": 12, "revenue": 24000.00 },
    { "plan": "Enterprise", "count": 3, "revenue": 9000.00 }
  ],
  "payment_status": {
    "paid": 20,
    "pending": 2,
    "overdue": 1
  },
  "new_vs_churned": [
    { "month": "2025-10", "new": 3, "churned": 1 }
  ]
}
```

### 7. Platform-wide Pawn Volume

**Endpoint:** `GET /api/tenants/pawn-volume`

**Params:** `period` (days, default 30)

**Returns:**
```json
{
  "kpis": {
    "total_loans_issued": 342,
    "total_principal_disbursed": 1720000.00,
    "total_interest_collected": 180600.00,
    "total_items_in_vault": 856,
    "total_customers": 1240,
    "avg_loan_value": 5029.24
  },
  "trend": [
    { "date": "2026-03-01", "loans_issued": 15, "principal": 75000.00 }
  ]
}
```

**Query:** Aggregate across ALL tenants — pawn_tickets, transactions, pawn_items, customers. No tenant_id filter (super admin sees everything).

### 8. Tenant Comparison Rankings

**Endpoint:** `GET /api/tenants/rankings`

**Params:** `metric` (revenue, loans, customers, transactions), `limit` (default 10), `period` (days, default 30)

**Returns:**
```json
{
  "metric": "revenue",
  "period_days": 30,
  "platform_total": 180600.00,
  "rankings": [
    {
      "rank": 1,
      "tenant_id": "uuid",
      "business_name": "Juan's Pawnshop",
      "branch_count": 3,
      "value": 45000.00,
      "pct_of_platform": 24.9
    }
  ]
}
```

**Metric definitions:**
- revenue: SUM(transactions.amount) WHERE type IN ('INTEREST', 'PENALTY')
- loans: COUNT(pawn_tickets) created in period
- customers: COUNT(DISTINCT customers) with activity in period
- transactions: COUNT(transactions) in period

---

## CSV Export

### New route: `server/routes/exports.js`

**Tenant exports** (auth + tenantScope):
- `GET /api/exports/daily-transactions?date=YYYY-MM-DD`
- `GET /api/exports/overdue-loans`
- `GET /api/exports/branch-comparison?period=30`
- `GET /api/exports/customer-history?customer_id=xxx`

**Super admin exports** (auth + superAdminScope):
- `GET /api/exports/tenant-health`
- `GET /api/exports/subscription-analytics`
- `GET /api/exports/pawn-volume?period=30`
- `GET /api/exports/tenant-rankings?metric=revenue`

**Implementation:**
- Reuse the same query logic from report endpoints
- Format as CSV using `server/utils/csvHelper.js`
- Set response headers: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="report-YYYY-MM-DD.csv"`
- CSV helper handles: header row, value escaping (commas, quotes, newlines), number formatting

### `server/utils/csvHelper.js`

```javascript
function toCsv(headers, rows) {
  const escape = (val) => {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  return lines.join('\n');
}
```

---

## PDF Export

**No server-side changes.** Add `@media print` rules to `src/index.css`:

```css
@media print {
  /* Hide non-report elements */
  .admin-layout > aside,
  .admin-header,
  .report-controls,
  .report-export-btns,
  .toggle-switch, .toggle-switch-sm,
  .notification-dot { display: none !important; }

  /* Full width content */
  .admin-main { margin: 0; padding: 0; }
  .admin-content { padding: 16px; }

  /* Clean styling */
  body { background: white; color: black; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
}
```

Each report tab gets a "Print PDF" button: `<button onClick={() => window.print()}>Print PDF</button>`

---

## Frontend Changes

### Tenant Reports Page (`src/pages/owner/Reports.jsx`)

Add tab bar at top:

| Tab | Content |
|-----|---------|
| Overview (existing) | KPI cards, revenue chart, loan donut, tables |
| Daily Transactions | Date picker + branch filter → transaction table + totals |
| Overdue Loans | At-risk loans table with status badges |
| Branch Comparison | Period selector → branch metrics table |
| Customer History | Customer search → loan timeline + totals |

Each tab includes "Export CSV" and "Print PDF" buttons.

### Super Admin Reports Page (`src/pages/superadmin/Reports.jsx`)

Extend with new tabs:

| Tab | Content |
|-----|---------|
| Activity (existing) | Current activity report |
| Tenant Health | Health score table, color badges, filter by status |
| Subscriptions | MRR line chart, plan donut, churn KPI, payment breakdown |
| Pawn Volume | Platform KPI cards + trend line chart |
| Rankings | Metric selector → ranked table with % bars |

### API Module Additions (`src/lib/api.js`)

```javascript
// Add to reportsApi:
dailyTransactions: (params) => apiFetch(`/reports/daily-transactions?${qs(params)}`),
overdueLoans: (params) => apiFetch(`/reports/overdue-loans?${qs(params)}`),
branchComparison: (params) => apiFetch(`/reports/branch-comparison?${qs(params)}`),
customerHistory: (customerId) => apiFetch(`/reports/customer-history?customer_id=${customerId}`),

// Add to tenantsApi:
health: (params) => apiFetch(`/tenants/health?${qs(params)}`),
subscriptionAnalytics: (params) => apiFetch(`/tenants/subscription-analytics?${qs(params)}`),
pawnVolume: (params) => apiFetch(`/tenants/pawn-volume?${qs(params)}`),
rankings: (params) => apiFetch(`/tenants/rankings?${qs(params)}`),

// New export module:
export const exportsApi = {
  download: (reportType, params = {}) => {
    // Opens CSV download in new tab
    const url = `${API_BASE}/exports/${reportType}?${qs(params)}`;
    window.open(url, '_blank');
  },
};
```

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `server/routes/exports.js` | CSV export endpoints |
| `server/utils/csvHelper.js` | CSV formatting helper |

### Modified Files
| File | Change |
|------|--------|
| `server/routes/reports.js` | Add 4 tenant report endpoints |
| `server/routes/tenants.js` | Add 4 super admin report endpoints |
| `server/index.js` | Mount exports route |
| `src/lib/api.js` | Add report + export API methods |
| `src/pages/owner/Reports.jsx` | Add tabs + 4 new report views + export buttons |
| `src/pages/superadmin/Reports.jsx` | Add 4 new report tabs + export buttons |
| `src/index.css` | Add @media print rules |
| `.claude/CLAUDE.md` | Update implemented features |
