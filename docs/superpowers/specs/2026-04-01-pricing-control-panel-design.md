# Pricing Control Panel — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Route:** `/admin/pricing`
**Role access:** OWNER + MANAGER (edit); history sections visible to OWNER only

---

## Overview

A standalone dedicated page that consolidates all pricing and business-rule configuration for the tenant. Replaces the Loan Settings tab in SettingsPage. Structured as a left-sidebar nav page (same pattern as SettingsPage) with 4 submodules.

---

## Navigation

### Sidebar entry
Add to `adminNavigation` and `managerNavigation` in `src/config/navigation.js`, under the `Main` category, directly below Dashboard:

```js
{ icon: 'price_change', label: 'Pricing', path: '/admin/pricing', requiresKyc: true }
```

### Internal left-nav (inside PricingPage)

| Icon | Label | Visible to |
|------|-------|-----------|
| `workspace_premium` | Gold Prices | OWNER + MANAGER |
| `water_drop` | Silver Prices | OWNER + MANAGER |
| `inventory` | Item Conditions | OWNER + MANAGER |
| `gavel` | Pawning Terms | OWNER + MANAGER |

---

## SettingsPage Change

Remove the `Loan Settings` tab (`id: 'loan'`) from `SettingsPage.jsx` entirely — its fields (`penalty_interest_rate`, `service_charge_pct`) now live exclusively in Pricing → Pawning Terms. Also remove the `loanSettings` state, `handleLoanSettingsSave`, `handleLoanSettingsChange`, and the `useEffect` that loads loan settings.

---

## Submodule 1 — Gold Price Manager

### UI
- **Table layout:** Karat | Purity % | Common Name | Rate per Gram (₱)
- 6 rows, one per karat purity, inline-editable rate input (right-aligned, ₱ prefix)
- Active row highlighted with lime-green border on the focused input
- **"Live Rates" button** (top-right of panel header) — opens a full-screen modal with an embedded `goldpricez.com` iframe. The iframe URL is `https://goldpricez.com/ph/gram` (PHP rates per gram). Modal has a close button; no other interaction needed. Verify the exact URL is iframe-embeddable during implementation; if blocked, fall back to opening in a new tab.
- **"Save Gold Rates"** button + last-updated timestamp (user name + timestamp from response)
- **Price History section** (OWNER only, rendered conditionally on `role === 'OWNER'`):
  - Labelled with an "OWNER ONLY" badge
  - Paginated table: Date & Time | Karat | Old Rate | New Rate | Updated By
  - **Export PDF** button triggers `window.print()` with `@media print` scoped to the history table

### Gold karat reference data (static, not editable)

| Karat | Purity % | Common Name |
|-------|----------|-------------|
| 24K | 99.9% | Fine Gold |
| 22K | 91.7% | Standard Gold |
| 21K | 87.5% | — |
| 18K | 75.0% | Gold Jewelry |
| 14K | 58.3% | Common Jewelry |
| 10K | 41.7% | Low Karat |

### API
- `GET /api/loan-settings/gold-rates` — existing, returns all current rates for tenant
- `PUT /api/loan-settings/gold-rates/bulk` — **new**, accepts array of `{ karat, rate_per_gram }` objects, upserts all in one request and logs history rows; replaces calling the single-karat endpoint in a loop
- `GET /api/loan-settings/gold-rates/history?page=1&limit=20` — **new**, OWNER only, paginated

---

## Submodule 2 — Silver Price Manager

### UI
Identical structure to Gold Price Manager panel, with these differences:
- Table columns: Purity Mark | Purity % | Common Name | Rate per Gram (₱)
- "Live Rates" modal uses `https://goldpricez.com/ph/silver/gram` (goldpricez.com silver page, PHP rates per gram). Verify URL is iframe-embeddable during implementation.
- "Save Silver Rates" button
- Price History section (OWNER only) — same structure as gold history

### Silver purity reference data (static, not editable)

| Purity Mark | Purity % | Common Name |
|-------------|----------|-------------|
| 999 | 99.9% | Fine Silver |
| 958 | 95.8% | Britannia Silver |
| 925 | 92.5% | Sterling Silver |
| 900 | 90.0% | Coin Silver |
| 835 | 83.5% | Standard Silver |
| 800 | 80.0% | Low Purity Silver |

### API
- `GET /api/pricing/silver-rates` — **new**, returns all silver rates for tenant
- `PUT /api/pricing/silver-rates/bulk` — **new**, accepts array of `{ purity_mark, rate_per_gram }` objects, bulk upsert + logs history; OWNER + MANAGER
- `GET /api/pricing/silver-rates/history?page=1&limit=20` — **new**, OWNER only, paginated

---

## Submodule 3 — Item Conditions

### UI
- Table: Active (toggle) | Condition Grade | Description | Appraisal Multiplier (%)
- 6 predefined condition grades — names and descriptions are fixed (not editable)
- Owner can toggle active/inactive and edit the multiplier %
- When inactive: row is greyed out, multiplier input is disabled
- "Save Conditions" button (saves all rows in one call)

### Predefined condition grades (seeded per tenant on first load)

| Condition | Description | Default Multiplier |
|-----------|-------------|-------------------|
| Excellent | Like new, no visible wear or damage | 100% |
| Very Good | Minor signs of use, fully functional | 85% |
| Good | Visible wear but no major damage | 70% |
| Fair | Heavy wear, minor functional issues | 50% |
| Poor | Significant damage, limited functionality | 30% |
| For Parts / Damaged | Non-functional, salvage value only | 15% |

### API
- `GET /api/pricing/item-conditions` — **new**, returns tenant's condition rows (auto-seeded with defaults if none exist)
- `PUT /api/pricing/item-conditions` — **new**, bulk upsert all 6 rows; OWNER + MANAGER

---

## Submodule 4 — Pawning Terms

### UI
Two input blocks, each with an explanation, live example calculation, and a labelled input:

**Late Payment Penalty**
- Label: "% of principal loan"
- Input: numeric, e.g. `3.5`
- Live example: "₱ 10,000 principal → ₱ [penalty] penalty per overdue period"

**Service Fee Charge**
- Label: "% of principal (max 1%)"
- Input: numeric, e.g. `1.0`, max value enforced at `1.0`
- BSP cap warning box: "BSP Cap: Actual fee charged = min(₱ 5.00, rate% × principal). The system enforces this cap automatically at transaction time."
- Live example: "₱ 10,000 principal → fee = min(₱ 5.00, ₱ 100.00) = ₱ 5.00"

"Save Pawning Terms" button.

### API
- Reuses `PATCH /api/loan-settings` with fields `penalty_interest_rate` and `service_charge_pct`
- No new endpoint needed

---

## Database Changes

### New table: `gold_rate_history`
```sql
CREATE TABLE gold_rate_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  karat       text NOT NULL,           -- '24K', '22K', etc.
  old_rate    numeric(12,4),
  new_rate    numeric(12,4) NOT NULL,
  changed_by  uuid REFERENCES tenant_users(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);
```
RLS: tenant_id = get_my_tenant_id(), role = OWNER.

### New table: `silver_rates`
```sql
CREATE TABLE silver_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  purity_mark     text NOT NULL,       -- '999', '958', '925', etc.
  purity_pct      numeric(5,2) NOT NULL,
  common_name     text,
  rate_per_gram   numeric(12,4) NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE(tenant_id, purity_mark)
);
```
RLS: tenant_id = get_my_tenant_id().

### New table: `silver_rate_history`
```sql
CREATE TABLE silver_rate_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  purity_mark  text NOT NULL,
  old_rate     numeric(12,4),
  new_rate     numeric(12,4) NOT NULL,
  changed_by   uuid REFERENCES tenant_users(id),
  changed_at   timestamptz NOT NULL DEFAULT now()
);
```
RLS: tenant_id = get_my_tenant_id(), role = OWNER.

### New table: `item_conditions`
```sql
CREATE TABLE item_conditions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  condition_name  text NOT NULL,
  description     text,
  multiplier_pct  numeric(5,2) NOT NULL DEFAULT 100,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, condition_name)
);
```
RLS: tenant_id = get_my_tenant_id().

---

## Backend Routes

### Extend `server/routes/loanSettings.js`
- Add `GET /gold-rates/history` — OWNER only, paginated from `gold_rate_history`
- Modify existing `PUT /gold-rates` — after upsert, insert a row into `gold_rate_history`

### New file: `server/routes/pricing.js`
Mounted at `/api/pricing`:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/silver-rates` | OWNER + MANAGER | List all silver rates for tenant |
| PUT | `/silver-rates/bulk` | OWNER + MANAGER | Bulk upsert silver rates array; logs history rows |
| GET | `/silver-rates/history` | OWNER only | Paginated silver rate history |
| GET | `/item-conditions` | OWNER + MANAGER | List tenant conditions; auto-seeds defaults on first call |
| PUT | `/item-conditions` | OWNER + MANAGER | Bulk upsert all 6 condition rows |

Register in `server/index.js`:
```js
app.use('/api/pricing', require('./routes/pricing'));
```

---

## Frontend Files

| File | Action |
|------|--------|
| `src/pages/owner/PricingPage.jsx` | **New** — full page with left-nav + 4 submodule panels |
| `src/pages/owner/index.js` | Add `PricingPage` export |
| `src/pages/index.js` | Add `PricingPage` to owner exports |
| `src/App.jsx` | Add `case '/admin/pricing': return <PricingPage />` |
| `src/config/navigation.js` | Add Pricing nav item to `adminNavigation` and `managerNavigation` under `Main` |
| `src/lib/api.js` | Add `pricingApi` module (silver rates + item conditions endpoints) |
| `src/pages/owner/SettingsPage.jsx` | Remove Loan Settings tab, state, handlers, and useEffect |

### `pricingApi` module (api.js)
```js
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

---

## PDF Export

History tables use `window.print()` with `@media print` CSS — same pattern as existing Reports page. The print stylesheet hides the sidebar, header, and other panels; only the history table and a header row are printed.

---

## Key Constraints

- Service fee cap (`min(₱5, rate% × principal)`) is enforced at **transaction time** in `payments.js` — not in the pricing page itself
- Gold rate history is triggered server-side on every successful `PUT /gold-rates` call
- Silver rate history is triggered server-side on every successful `PUT /silver-rates` call
- Item conditions are seeded with defaults on first `GET /item-conditions` if no rows exist for the tenant
- `PricingPage.jsx` checks `profile.role === 'OWNER'` to conditionally render history sections
