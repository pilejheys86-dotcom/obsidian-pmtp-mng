# Payment Modal Enhancement — Active Loans

> **Date:** 2026-03-29
> **Status:** Draft
> **Approach:** Enhance existing modals in-place (Approach A)

---

## Overview

Enhance the existing `RenewModal` and `RedeemModal` in `ActiveLoans.jsx` with:
- 2-step flow (payment form → success receipt)
- Reference number input for non-cash payments (GCash, PayMaya, Bank Transfer)
- Penalty-aware calculations for overdue loans
- Service charge computed from `service_charge_pct` (replacing hardcoded flat amount)
- Email confirmation after successful payment
- Receipt number displayed in success step

---

## Frontend Changes

### Files Modified
- `src/pages/owner/ActiveLoans.jsx` — RenewModal, RedeemModal enhancements

### RenewModal — 2-Step Flow

**Step 1 — Payment Form (enhanced):**

Mode selector (unchanged): Principal+Interest, Interest Only, Partial Interest.

**Penalty-aware totals** (when loan is overdue):
- `overdueMonths = ceil((now - maturityDate) / 30)`
- `penalty = principal * (penalty_interest_rate / 100) * overdueMonths`
- P+I mode: `principal + monthlyInterest + penalty`
- Interest Only mode: `monthlyInterest + penalty`
- Partial Interest mode: `partialAmount + penalty` (penalty always required in full; partial amount is the interest portion only; submit disabled if `partialAmount <= 0`)

Penalty breakdown row shown in calculation section when `penalty > 0`.

**Reference number input:**
- Appears below payment method dropdown when method is GCash, PayMaya, or Bank Transfer
- Free-text input, no format validation
- Submit button disabled until reference number is filled (for non-cash methods)

**Step 2 — Success Receipt:**

Replaces entire modal content:
- Green checkmark header with "Renewal Successful" title
- Receipt number (from API response)
- Ticket number, customer name, item description
- Payment mode label (e.g., "Principal + Interest")
- Amount breakdown (same rows as step 1)
- Payment method + reference number (if non-cash)
- Date/time of transaction
- "Done" button → closes modal, triggers list refresh via `onSuccess()`

### RedeemModal — 2-Step Flow

**Step 1 — Payment Form (enhanced):**

Service charge fix:
- Remove hardcoded `SERVICE_CHARGE = 5` constant
- Compute: `serviceChargeAmount = principal * (service_charge_pct / 100)`
- `service_charge_pct` comes from `loanSettings` prop

Penalty awareness:
- When overdue: `totalDue = principal + interestAccrued + penalty + serviceChargeAmount`
- When current: `totalDue = principal + interestAccrued + serviceChargeAmount`
- Penalty row shown in breakdown when applicable

Reference number input: same behavior as RenewModal.

**Step 2 — Success Receipt:**

Same pattern as RenewModal but with "Item Redeemed" header and emerald color scheme.

### Props Changes

```
RenewModal:  + loanSettings prop
RedeemModal: + loanSettings prop
```

Both modals gain a `step` state: `'form'` | `'success'`, and a `receiptData` state populated from the API response. On modal open (via `useEffect` on `open`), reset `step` back to `'form'` and clear `receiptData`.

### Penalty Computation (inside modals)

```javascript
const computePenaltyAmount = (loan, penaltyRate) => {
  const maturity = new Date(loan.maturityRaw);
  const now = new Date();
  if (now <= maturity) return 0;
  const overdueMs = now - maturity;
  const overdueMonths = Math.ceil(overdueMs / (30 * 24 * 60 * 60 * 1000));
  const principal = Number(loan.principalRaw || 0);
  return principal * (penaltyRate / 100) * overdueMonths;
};
```

---

## Backend Changes

### Database Migration

New file: `sql/107_transaction_reference_number.sql`

```sql
ALTER TABLE transactions
ADD COLUMN reference_number VARCHAR(100) DEFAULT NULL;
```

Nullable — Cash payments won't have a reference number.

### Payments Route (`server/routes/payments.js`)

**`POST /api/payments`** — Enhanced request body:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `ticket_id` | UUID | yes | existing |
| `amount_paid` | decimal | yes | existing |
| `payment_type` | string | yes | existing |
| `payment_method` | string | yes | existing |
| `reference_number` | string | no | new — for GCash/Bank Transfer |
| `penalty_paid` | decimal | no | new — penalty portion of payment |
| `notes` | string | no | existing |

After `process_payment` RPC succeeds:
1. Fetch the most recent transaction for the ticket (by `ticket_id`, order by `created_at DESC`, limit 1)
2. Update the transaction's `reference_number` column if provided
3. Fetch customer email via ticket → customer join
4. Call `sendTransactionReceiptEmail()` fire-and-forget
5. Return response including `receipt_number`, `transaction_id`, `trans_date`

### Renewals Route (`server/routes/renewals.js`)

**`POST /api/renewals`** — Enhanced request body:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `ticket_id` | UUID | yes | existing |
| `payment_method` | string | yes | existing |
| `reference_number` | string | no | new |
| `payment_mode` | string | no | new — `PRINCIPAL_INTEREST`, `INTEREST_ONLY`, `PARTIAL_INTEREST` |
| `amount_paid` | decimal | no | new — total amount for interest-only/partial modes |
| `penalty_paid` | decimal | no | new |

After `process_loan_renewal` RPC succeeds:
1. Fetch the most recent transaction for the ticket
2. Update `reference_number` if provided
3. Fetch customer email
4. Call `sendTransactionReceiptEmail()` fire-and-forget
5. Return response including `receipt_number`, `transaction_id`, `trans_date`

### Email Flow

No new email templates. The existing `sendTransactionReceiptEmail()` is reused. It is called after the RPC succeeds, asynchronously (fire-and-forget with error logging). If the customer has no email on file, skip silently.

---

## Success Receipt Display

| Field | Source |
|-------|--------|
| Receipt Number | `response.receipt_number` from API |
| Ticket Number | `loan.id` (frontend state) |
| Customer | `loan.customerName` (frontend state) |
| Item | `loan.itemDescription` (frontend state) |
| Payment Mode | Local state (P+I / Interest Only / Partial / Redemption) |
| Amount Breakdown | Same calculation rows from step 1 |
| Payment Method | Local state (Cash / GCash / PayMaya / Bank Transfer) |
| Reference Number | Local state (only shown for non-cash) |
| Date/Time | `new Date()` formatted at time of success |

---

## Loan Settings Integration

### Service Charge (RedeemModal)

- Remove `const SERVICE_CHARGE = 5` from `ActiveLoans.jsx`
- `RedeemModal` receives `loanSettings` prop
- Computes: `serviceChargeAmount = principal * (loanSettings.service_charge_pct / 100)`
- Displays percentage and computed peso amount in breakdown

### Penalty Rate (RenewModal)

- `RenewModal` receives `loanSettings` prop
- Uses `loanSettings.penalty_interest_rate` for penalty computation
- Penalty computed inside the modal using `computePenaltyAmount()`

Both modals fall back to defaults if `loanSettings` is null: `service_charge_pct = 5`, `penalty_interest_rate = 3`.

---

## Out of Scope

- No new email templates — reuse existing transaction receipt email
- No print/PDF receipt — receipt number shown in modal success step only
- No changes to the `process_payment` or `process_loan_renewal` RPCs themselves
- No changes to transaction list page or other pages
- No changes to roles/permissions
