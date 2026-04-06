# Changelog: Cashier-First Workflow, BSP Loan Terms & Payment Modal

> **Date:** 2026-03-29 | **Branch:** main

---

## 1. Cashier-First Pawn Workflow

### What Changed

Restructured the appraisal pipeline so the **Cashier handles item intake** first, instead of the Appraiser creating items from scratch.

**Old flow:** Appraiser creates item + appraises → Manager approves → Cashier issues.
**New flow:** Cashier accepts item → Appraiser appraises from queue → Manager approves → Cashier issues.

### Backend

| Endpoint | Change |
|---|---|
| `POST /appraisals/intake` | **New.** Cashier/Owner creates a `pawn_items` record in `PENDING_APPRAISAL` status with just `customer_id`, `category`, and optional `description`. Stores `submitted_by` + `submitted_at` in `specific_attrs`. |
| `GET /appraisals/my-items` | **New.** Returns all items submitted by the current user with a human-readable status label (Awaiting Appraisal / Awaiting Approval / Ready for Release / Issued). |
| `POST /appraisals/submit` | **Modified.** Now accepts an `item_id` from the intake queue instead of creating a new item. Validates item is in `PENDING_APPRAISAL`, updates it with appraisal details, advances to `PENDING_APPROVAL`. |
| `GET /appraisals/queue` | **Modified.** Now includes `PENDING_APPRAISAL` items in results. |
| `GET /appraisals/stats` | **Modified.** Now counts `PENDING_APPRAISAL` items. |

### Frontend

- **`CashierWorkspace.jsx`** — Replaced with 3 tabs: **Item Intake** (customer search + new customer inline form + category select), **My Items** (read-only status tracker with color-coded pills), **Issuance Queue** (unchanged).
- **`AppraiserWorkspace.jsx`** — Replaced create-from-scratch with a 2-tab flow: **Appraisal Queue** (table of `PENDING_APPRAISAL` items) → **Appraisal Page** (pre-filled customer/category, appraiser fills details).

### API Client (`src/lib/api.js`)

Added `appraisals.intake()` and `appraisals.myItems()` methods.

### Automated Disbursement Email + PDF

On `POST /appraisals/:id/issue`:

- **`server/utils/pawnTicketPdf.js`** — New utility that generates a pawn ticket PDF buffer from an HTML template using `html-pdf-node`.
- **`server/services/email.js`** — `sendEmail()` now accepts optional `attachments`. New `sendDisbursementEmail()` template with full loan summary (principal, advance interest deducted, service charge deducted, net proceeds, dates, branch info). Fires asynchronously after ticket issuance.

---

## 2. BSP-Compliant Loan Terms

### What Changed

Aligned loan settings and calculations with Philippine BSP pawnshop industry standards.

### Migration (`sql/106_bsp_loan_terms.sql`)

| Setting | Old Default | New Default | Reason |
|---|---|---|---|
| `maturity_months` | 10 | **1** (30 days) | PH pawn tickets mature monthly |
| `grace_period_days` | 10 | **90** | BSP minimum before forfeiture |
| `service_charge` | flat ₱ amount | **`service_charge_pct`** (5%) | Industry uses % of principal |
| `penalty_interest_rate` | exists, unused | **3%** (wired in) | Additional monthly rate on overdue |
| `ltv_ratio` | exists, unused | **70%** (enforced) | Max loan = 70% of appraised value |

The `save_tenant_loan_settings` RPC was updated to use `p_service_charge_pct` (replacing `p_service_charge`).

### Calculation Changes

- **Service charge** (`POST /appraisals/:id/approve`): Changed from flat deduction to `principal × (service_charge_pct / 100)`.
- **LTV enforcement** (approval step): Rejects if `principal > appraisedValue × (ltv_ratio / 100)` with a clear error message showing the ceiling.
- **Penalty interest** (payment logic): `penaltyAmount = principal × (penalty_interest_rate / 100) × overdueMonths` added on top of regular interest for overdue tickets.

### Frontend

- **`ManagerWorkspace.jsx`** — Approval modal shows "Max Loanable Amount" ceiling, service charge as % with computed peso preview.
- **`IssueTicketModal.jsx`** / **`PawnTicketPrint.jsx`** — Service charge label updated to show percentage.
- **`SettingsPage.jsx`** — Service charge input is now a percentage field; `penalty_interest_rate` and `ltv_ratio` fields are now visible and editable.
- **`ActiveLoans.jsx`** — Penalty breakdown shown for overdue loans (regular interest + penalty interest rows).

---

## 3. Payment Modal Enhancements

### What Changed

`RenewModal` and `RedeemModal` in `ActiveLoans.jsx` upgraded to a **2-step flow** with receipt display, reference number input, and penalty-aware calculations.

### Migration (`sql/107_transaction_reference_number.sql`)

Added nullable `reference_number VARCHAR(100)` column to `transactions` table for GCash/bank transfer tracking.

### Backend

| Route | Change |
|---|---|
| `POST /api/payments` | Accepts optional `reference_number` and `penalty_paid`. After RPC, updates transaction's `reference_number`, fires `sendTransactionReceiptEmail()` asynchronously, returns `receipt_number` + `transaction_id` + `trans_date`. |
| `POST /api/renewals` | Same additions: `reference_number`, `payment_mode`, `amount_paid`, `penalty_paid`. Returns receipt data + fires email. |

### Frontend (`ActiveLoans.jsx`)

**RenewModal:**

- **Step 1 (form):** Penalty-aware totals when overdue — shows regular interest + penalty rows. Reference number input appears for GCash/PayMaya/Bank Transfer (submit disabled until filled).
- **Step 2 (receipt):** Success screen with receipt number, ticket/customer/item info, payment breakdown, method + reference number, timestamp. "Done" closes and refreshes the list.

**RedeemModal:**

- Service charge now computed from `loanSettings.service_charge_pct` (removes hardcoded `SERVICE_CHARGE = 5`).
- Same penalty awareness and 2-step receipt flow as RenewModal.

Both modals receive a new `loanSettings` prop and fall back to `service_charge_pct = 5` / `penalty_interest_rate = 3` if null.

---

## Files Changed

| Area | Files |
|---|---|
| **SQL migrations** | `sql/106_bsp_loan_terms.sql`, `sql/107_transaction_reference_number.sql` |
| **Backend routes** | `server/routes/appraisals.js`, `server/routes/payments.js`, `server/routes/renewals.js` |
| **Backend services** | `server/services/email.js`, `server/utils/pawnTicketPdf.js` |
| **Frontend pages** | `src/pages/owner/ActiveLoans.jsx`, `src/pages/owner/SettingsPage.jsx` |
| **Frontend appraisals** | `src/pages/owner/appraisals/CashierWorkspace.jsx`, `src/pages/owner/appraisals/AppraiserWorkspace.jsx`, `src/pages/owner/appraisals/ManagerWorkspace.jsx`, `src/pages/owner/appraisals/IssueTicketModal.jsx`, `src/pages/owner/appraisals/PawnTicketPrint.jsx` |
| **API client** | `src/lib/api.js` |
