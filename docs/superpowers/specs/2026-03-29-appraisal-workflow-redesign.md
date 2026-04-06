# Appraisal Workflow Redesign — Role-Based Workspaces

> **Date:** 2026-03-29
> **Status:** Approved

---

## Overview

Redesign the appraisal-to-pawn-ticket pipeline into a 3-phase workflow with dedicated role-based workspaces. Each employee role (Appraiser, Manager, Cashier) gets a tailored UI with only the actions relevant to their job. The Owner retains full access across all phases.

---

## 1. Workflow & Status Flow

### New Pipeline

```
APPRAISER submits item + valuation
        |
   PENDING_APPROVAL
        |
MANAGER approves (sets loan terms)
        |
   READY_FOR_RELEASE
        |
CASHIER issues ticket + disburses cash
        |
      VAULT
```

### Status Transitions

| From | Action | By | To |
|------|--------|----|----|
| *(new)* | Submit + appraise | APPRAISER, OWNER | PENDING_APPROVAL |
| PENDING_APPROVAL | Approve (set loan terms) | MANAGER, OWNER | READY_FOR_RELEASE |
| PENDING_APPROVAL | Reject | MANAGER, OWNER | REJECTED |
| READY_FOR_RELEASE | Issue ticket + disburse | CASHIER, OWNER | VAULT |
| READY_FOR_RELEASE | Decline (customer refuses) | CASHIER, MANAGER, OWNER | DECLINED |

### Removed

- `PENDING_APPRAISAL` status — no longer needed since Appraiser submits and values in one step.
- `/appraisals/:id/appraise` endpoint — submit now includes valuation.

---

## 2. Role Workspaces

All roles navigate to `/admin/appraisals`. The page renders a different component based on `userRole` from AuthContext.

### 2.1 Appraiser Workspace

**Dashboard KPIs:**
- Items appraised today (by this user)
- Pending approval (submitted by them)
- Approved count
- Rejected count

**Primary action:** "New Appraisal" button opens the multi-step form:
1. Select Customer (search by name/ID/contact)
2. Item Details (category-specific fields)
3. Valuation (appraised value, auto-calculate for jewelry)
4. Review & Submit

On submit, item is created with `inventory_status = PENDING_APPROVAL` and an `appraisal_assessments` record is inserted with `outcome = PENDING`.

**Queue view:** Read-only list of items this appraiser submitted, with status tracking. No approve/reject/issue actions.

### 2.2 Manager Workspace

**Dashboard KPIs:**
- Pending approval count
- Approved today
- Rejected today
- Ready for release count

**Primary view:** Approval queue — items in `PENDING_APPROVAL`.

**Actions per item:**
- **Approve** — Modal with fields: `principal_loan` (required, <= appraised_value), `offered_amount` (optional), `storage_location` (optional). On confirm: loan terms are calculated from tenant settings, item moves to `READY_FOR_RELEASE`. Pawn ticket is NOT created yet.
- **Reject** — Modal with reason textarea. Item moves to `REJECTED`.

**Secondary view:** All statuses for oversight (history tab).

### 2.3 Cashier Workspace

**Dashboard KPIs:**
- Ready for release count
- Issued today
- Total cash disbursed today (sum of net proceeds issued today)

**Primary view:** Issuance queue — items in `READY_FOR_RELEASE`.

**Actions per item:**
- **Issue Ticket** — Opens issuance modal (see Section 3).
- **Decline** — Customer refuses the offer. Modal with optional reason. Item moves to `DECLINED`.

**Secondary view:** Issued tickets history (items moved to VAULT by this cashier).

### 2.4 Owner Workspace

Full access to all views and actions across all phases. Combined KPIs showing the entire pipeline:
- Pending approval
- Ready for release
- Issued today
- Rejected today

Can submit appraisals, approve/reject, and issue tickets.

---

## 3. Cashier Issuance Flow

When the Cashier clicks "Issue Ticket" on a `READY_FOR_RELEASE` item, a modal opens.

### Modal Layout

**Section 1 — Ticket Summary (read-only):**
- Customer name & ID
- Item description, category, condition
- Appraised value
- Principal loan amount
- Interest rate, advance interest, service charge
- Net proceeds (the amount to disburse)
- Maturity date, expiry date, grace period

**Section 2 — Disbursement Record:**
- Disbursement amount: pre-filled with net proceeds (read-only, cash-only)
- Remarks: optional text field (e.g., "Customer received cash")

**Section 3 — Confirm:**
- "Issue Pawn Ticket" button

### On Confirm

1. **Create pawn ticket** in `pawn_tickets` table:
   - `status = ACTIVE`
   - All loan terms (principal, interest, dates) pre-calculated during Manager approval
   - `appraiser_id` = original appraiser from submission
   - `issued_by` = cashier's user ID
2. **Update item** `inventory_status` from `READY_FOR_RELEASE` to `VAULT`
3. **Record disbursement** in `transactions` table:
   - `trans_type = DISBURSEMENT`
   - `amount = net_proceeds`
   - `payment_method = CASH`
   - `processed_by = cashier_id`
   - `reference = ticket_number`
4. **Update assessment** `outcome` from `PENDING` to `ISSUED`

---

## 4. Printable Pawn Ticket

After issuance, a "Print Pawn Ticket" button appears. Also accessible from ticket history views.

### Layout

```
+---------------------------------------------+
|  [Business Name / Logo]                     |
|  [Branch Name & Address]                    |
|  BSP Registration No: XXXX                  |
+---------------------------------------------+
|  PAWN TICKET                                |
|  Ticket No: PT-20260329-00001               |
|  Date: March 29, 2026                       |
+---------------------------------------------+
|  PAWNER                                     |
|  Name: Juan Dela Cruz                       |
|  Customer ID: 0d56b869                      |
|  Address: ...                               |
+---------------------------------------------+
|  PLEDGED ITEM                               |
|  Description: 18K Gold Necklace             |
|  Category: Jewelry  |  Condition: Good      |
|  Weight: 10.5g  |  Karat: 18K              |
|  Appraised Value: P15,000.00                |
+---------------------------------------------+
|  LOAN DETAILS                               |
|  Principal Loan:      P12,000.00            |
|  Interest Rate:       3% / month            |
|  Advance Interest:    P   360.00            |
|  Service Charge:      P     5.00            |
|  Net Proceeds:        P11,635.00            |
|                                             |
|  Loan Date:           March 29, 2026        |
|  Maturity Date:       January 29, 2027      |
|  Expiry Date:         February 8, 2027      |
|  Grace Period:        10 days               |
+---------------------------------------------+
|  Appraiser: ___________                     |
|  Cashier:   ___________                     |
|  Customer Signature: ___________            |
+---------------------------------------------+
|  "This pawn ticket is not transferable.     |
|   Sinumpaang Salaysay..."                   |
|  [BSP regulatory fine print]                |
+---------------------------------------------+
```

### Implementation

- Dedicated `PawnTicketPrint` component rendered in-page
- Styled with `@media print` CSS for clean output
- Triggered via `window.print()`
- Data sources: ticket record + tenant branding (business name, BSP reg) + branch info + customer record + item details + appraiser/cashier names from `tenant_users`

---

## 5. Backend Changes

### New Endpoint

**POST `/api/appraisals/:id/issue`**
- Auth: CASHIER, OWNER
- Input: `{ remarks?: string }`
- Validates item is in `READY_FOR_RELEASE`
- Creates pawn ticket from pre-calculated loan terms stored during approval
- Records disbursement transaction
- Updates item to `VAULT`
- Returns: `{ ticket, transaction }`

### Modified Endpoints

**POST `/api/appraisals/submit`**
- Now requires `appraised_value > 0`
- Creates `appraisal_assessments` record inline (outcome = PENDING)
- Sets `inventory_status = PENDING_APPROVAL` (was PENDING_APPRAISAL)
- Stores `appraised_by`, `appraised_at` in `specific_attrs`

**POST `/api/appraisals/:id/approve`**
- No longer creates pawn ticket
- Calculates and stores loan terms in a new JSONB column `loan_terms` on the item (or in `specific_attrs`):
  - `principal_loan`, `interest_rate`, `advance_interest`, `service_charge`, `net_proceeds`
  - `loan_date`, `maturity_date`, `expiry_date`, `grace_period_days`, `next_payment_due_date`
  - `ticket_number` (pre-generated)
- Sets `inventory_status = READY_FOR_RELEASE`
- Updates assessment with `offered_amount`

**GET `/api/appraisals/stats`**
- Add `readyForRelease` count
- Remove `pendingAppraisal` count
- Add role-scoped stats (appraiser sees their own counts, cashier sees issuance counts)

**POST `/api/appraisals/:id/decline`**
- Now valid from `READY_FOR_RELEASE` (was `PENDING_APPROVAL`)

### Removed Endpoint

**PATCH `/api/appraisals/:id/appraise`** — no longer needed.

### Data Storage for Loan Terms

During Manager approval, loan terms are calculated and stored in `specific_attrs.loan_terms` on the `pawn_items` row. This avoids a new table and keeps all pre-ticket data on the item. The Cashier's `/issue` endpoint reads these stored terms to create the actual `pawn_tickets` record.

```json
{
  "loan_terms": {
    "principal_loan": 12000,
    "interest_rate": 3,
    "advance_interest": 360,
    "service_charge": 5,
    "net_proceeds": 11635,
    "loan_date": "2026-03-29",
    "maturity_date": "2027-01-29",
    "expiry_date": "2027-02-08",
    "grace_period_days": 10,
    "next_payment_due_date": "2026-04-28",
    "ticket_number": "PT-20260329-00001"
  }
}
```

---

## 6. Frontend Component Structure

### New Files

| File | Purpose |
|------|---------|
| `src/pages/owner/appraisals/AppraiserWorkspace.jsx` | Appraiser dashboard + form + queue |
| `src/pages/owner/appraisals/ManagerWorkspace.jsx` | Manager dashboard + approval queue |
| `src/pages/owner/appraisals/CashierWorkspace.jsx` | Cashier dashboard + issuance queue |
| `src/pages/owner/appraisals/OwnerWorkspace.jsx` | Owner combined view |
| `src/pages/owner/appraisals/IssueTicketModal.jsx` | Cashier issuance modal |
| `src/pages/owner/appraisals/PawnTicketPrint.jsx` | Print-ready pawn ticket |

### Modified Files

| File | Change |
|------|--------|
| `src/pages/owner/Appraisals.jsx` | Becomes a thin router that renders the correct workspace based on role |
| `src/lib/api.js` | Add `appraisalsApi.issue()` method |
| `src/config/navigation.js` | No change needed (all roles already have appraisals in nav) |
| `server/routes/appraisals.js` | Add `/issue`, modify `/submit`, `/approve`, `/decline`, remove `/appraise` |

### Shared Components

The existing multi-step appraisal form, modals (approve, reject, decline), and table components will be extracted from the current `Appraisals.jsx` and shared across workspaces as needed.

---

## 7. Migration Checklist

- [ ] Add `READY_FOR_RELEASE` to `inventory_status` enum in database
- [ ] Add `DISBURSEMENT` to `trans_type` enum in database (if not present)
- [ ] Add `ISSUED` to assessment `outcome` enum (if not present)
- [ ] Backfill: any existing `PENDING_APPRAISAL` items should be migrated to `PENDING_APPROVAL`
- [ ] Add `issued_by` column to `pawn_tickets` table (nullable UUID, FK to tenant_users)
