# Cashier-First Pawn Workflow

> **Date:** 2026-03-29
> **Status:** Approved
> **Motivation:** Adviser requirement — cashier is the front-facing role and should handle item intake. Appraiser should receive items from a queue, not create them.

---

## Flow

```
Cashier Intake → Appraiser Appraisal → Manager Approval → Cashier Issuance
(PENDING_APPRAISAL)  (PENDING_APPROVAL)   (READY_FOR_RELEASE)    (VAULT)
```

**Previous flow:** Appraiser creates item + appraises → Manager approves → Cashier issues.
**New flow:** Cashier accepts item → Appraiser appraises → Manager approves → Cashier issues.

---

## Backend Changes

### New Endpoint: `POST /appraisals/intake`

**Role:** CASHIER, OWNER

**Request body:**
```json
{
  "customer_id": "uuid",
  "category": "JEWELRY | GADGET | VEHICLE | APPLIANCE | OTHER",
  "description": "optional brief text"
}
```

**Behavior:**
1. Create `pawn_items` record:
   - `tenant_id` = req.tenantId
   - `customer_id` = from body
   - `category` = from body
   - `description` = from body (nullable)
   - `inventory_status` = `PENDING_APPRAISAL`
   - `specific_attrs` = `{ "submitted_by": req.userId, "submitted_at": timestamp }`
2. Return created item

### New Endpoint: `GET /appraisals/my-items`

**Role:** CASHIER, OWNER

**Behavior:** Return all `pawn_items` where `specific_attrs->>'submitted_by' = req.userId`, ordered by created_at desc. Include customer name (join). Include a human-readable status label:
- `PENDING_APPRAISAL` → "Awaiting Appraisal"
- `PENDING_APPROVAL` → "Awaiting Approval"
- `READY_FOR_RELEASE` → "Ready for Release"
- `VAULT` → "Issued"

### Modified Endpoint: `POST /appraisals/submit`

**Role:** APPRAISER (unchanged)

**Current behavior:** Creates a new `pawn_items` record + `appraisal_assessments` record.

**New behavior:** Receives an existing `item_id` (from the intake queue) and updates it:
1. Validate item exists, belongs to tenant, and is in `PENDING_APPRAISAL` status
2. Update `pawn_items`:
   - Set category-specific fields (brand, model, serial_number, weight_grams, karat, condition)
   - Set `appraised_value`, `fair_market_value`
   - Update `inventory_status` → `PENDING_APPROVAL`
   - Merge into `specific_attrs`: `appraised_by`, `appraised_at`
3. Create `appraisal_assessments` record with `outcome: PENDING` (same as before)
4. For jewelry: store gold rate snapshot (same as before)

**Request body changes:**
- Remove `customer_id` (already on the item)
- Add `item_id` (required — references the intake item)
- Keep all other fields (category details, valuation, etc.)

### Unchanged Endpoints
- `POST /appraisals/:id/approve` — Manager approval (no changes)
- `POST /appraisals/:id/issue` — Cashier issuance (no changes)
- `POST /appraisals/:id/reject` — Manager rejection (no changes)
- `POST /appraisals/:id/decline` — Decline (no changes)
- `GET /appraisals/queue` — Add `PENDING_APPRAISAL` items to the queue results
- `GET /appraisals/stats` — Add count for `PENDING_APPRAISAL` items

---

## Frontend Changes

### CashierWorkspace.jsx — Updated

**3 tabs:**

1. **Item Intake** (new)
   - Customer search (by name or mobile) with results dropdown
   - "New Customer" inline form: first name, last name, mobile, email (calls existing `POST /customers`)
   - Category select: Jewelry, Gadget, Vehicle, Appliance, Other
   - Description text input (optional)
   - Submit button → calls `POST /appraisals/intake`
   - Success state: show confirmation with item ID, reset form

2. **My Items** (new)
   - Table/list of items submitted by this cashier
   - Columns: Customer, Category, Description, Status (pill), Submitted At
   - Status pills with colors:
     - "Awaiting Appraisal" → amber
     - "Awaiting Approval" → blue
     - "Ready for Release" → green
     - "Issued" → neutral
   - No action buttons — read-only visibility

3. **Issuance Queue** (existing, no changes)
   - Items in `READY_FOR_RELEASE` status
   - Issue ticket modal (unchanged)

### AppraiserWorkspace.jsx — Updated

**2 tabs:**

1. **Appraisal Queue** (new — replaces old submit-from-scratch flow)
   - Table of items in `PENDING_APPRAISAL` status
   - Columns: Customer, Category, Description, Submitted By, Submitted At
   - Click row → navigates to full appraisal page for that item

2. **Appraisal Page** (modified from existing multi-step form)
   - Pre-filled: customer info (read-only), category (read-only from intake)
   - Appraiser fills in: condition, brand/model/serial, weight/karat (jewelry), photos, appraised value, fair market value
   - Gold calculation tool available for jewelry (unchanged)
   - Submit → calls modified `POST /appraisals/submit` with `item_id`
   - On success: return to queue

### ManagerWorkspace.jsx — No changes

Approval queue + approve/reject flow stays identical.

### Appraisals.jsx (Router) — Minor update

Role-based workspace routing stays the same. No new roles, just updated workspace content.

### navigation.js — No changes needed

Cashier already has access to Appraisals page (issuance). The new intake tab lives within the same page.

---

## Data Flow Summary

```
1. CASHIER → POST /appraisals/intake
   Creates: pawn_items (PENDING_APPRAISAL)

2. APPRAISER → POST /appraisals/submit { item_id }
   Updates: pawn_items (PENDING_APPROVAL)
   Creates: appraisal_assessments (PENDING)

3. MANAGER → POST /appraisals/:id/approve
   Updates: pawn_items (READY_FOR_RELEASE)
   Updates: appraisal_assessments (APPROVED)

4. CASHIER → POST /appraisals/:id/issue
   Updates: pawn_items (VAULT)
   Creates: pawn_tickets (ACTIVE)
   Creates: transactions (DISBURSEMENT)
   Updates: appraisal_assessments (ISSUED)
   Sends: disbursement confirmation email + PDF pawn ticket to customer
```

---

## Automated Disbursement Email

### Trigger

Sent automatically after the cashier successfully issues a pawn ticket (step 4 — `POST /appraisals/:id/issue`).

### Recipient

Customer only (using `customers.email`). If the customer has no email on file, skip silently (no error).

### Email Content

**Subject:** `Pawn Ticket #{ticket_number} — Loan Disbursement Confirmation`

**Body (HTML):** Full loan summary including:
- Ticket number
- Item description + category
- Principal loan amount
- Interest rate (%)
- Advance interest deducted
- Service charge deducted
- **Net proceeds (amount received)**
- Loan date
- Maturity date
- Expiry date
- Branch name + address
- "Thank you for choosing {business_name}" footer

### PDF Attachment

- Generate the pawn ticket as a PDF server-side
- Use the same layout/data as the existing `PawnTicketPrint` component but rendered to PDF via a Node library (e.g., `puppeteer`, `pdf-lib`, or `html-pdf-node`)
- Attach as `PawnTicket-{ticket_number}.pdf`

### Backend Changes

1. **Update `sendEmail` function** — Add optional `attachments` parameter, pass through to both Resend API and nodemailer:
   - Resend: `attachments: [{ filename, content (base64) }]`
   - Nodemailer: `attachments: [{ filename, content (Buffer) }]`

2. **New email template:** `sendDisbursementEmail({ to, customerName, ticket, transaction, businessName, branchName, pdfBuffer })`

3. **PDF generation utility:** New function in `server/utils/` that takes ticket data and returns a PDF buffer. Uses an HTML template matching the pawn ticket print layout.

4. **Integration in issue endpoint:** After creating the ticket + transaction, generate the PDF and fire the email. Send asynchronously (don't block the API response — use fire-and-forget with error logging).

---

## Standardized Loan Terms (BSP-Compliant)

Align loan settings and payment logic with Philippine pawnshop industry standards (BSP-regulated).

### Updated Default Values in `tenant_loan_settings`

| Setting | Old Default | New Default | Reason |
|---------|-------------|-------------|--------|
| `interest_rate` | 3% | 3% | Already standard (2.5%–3.5% range) |
| `maturity_months` | 10 | **1** (30 days) | PH pawn tickets mature monthly; customer renews or redeems each month |
| `grace_period_days` | 10 | **90** | BSP minimum grace period before forfeiture |
| `service_charge` | 5 (flat peso) | **Remove flat; add `service_charge_pct`** | Industry uses 1%–5% of principal |
| `advance_interest_months` | 1 | 1 | Already standard |
| `payment_cycle_days` | 30 | 30 | Already standard |
| `penalty_interest_rate` | exists, unused | **3%** (wired into logic) | Additional monthly rate on overdue balance |
| `ltv_ratio` | exists, unused | **70%** (enforced) | Loan cannot exceed 70% of appraised value |

### Schema Changes

1. **Rename `service_charge` → `service_charge_pct`** in `tenant_loan_settings`
   - Type: `NUMERIC(5,2)`, default `5.00` (meaning 5%)
   - Migration: convert any existing flat value to a percentage, or reset to default

2. **No new columns needed** — `penalty_interest_rate` and `ltv_ratio` already exist, just need wiring

### Calculation Changes

#### Service Charge (in approval step)

```
Old: netProceeds = principal - advanceInterest - serviceCharge (flat)
New: serviceChargeAmount = principal * (service_charge_pct / 100)
     netProceeds = principal - advanceInterest - serviceChargeAmount
```

#### LTV Enforcement (in approval step)

```
maxLoan = appraisedValue * (ltv_ratio / 100)
if principal > maxLoan → reject with error:
  "Loan amount cannot exceed {ltv_ratio}% of appraised value (max: ₱{maxLoan})"
```

The manager approval modal should display the max loanable amount so the manager knows the ceiling.

#### Penalty Interest (in `process_payment` RPC)

When a ticket is **overdue** (past maturity date, within grace period):

```
overdueMonths = ceil((today - maturity_date) / 30)
penaltyAmount = principal * (penalty_interest_rate / 100) * overdueMonths
```

- Penalty accrues on top of regular interest
- `INTEREST_ONLY` payment on an overdue ticket must cover: regular interest + penalty
- `FULL_REDEMPTION` must cover: principal + all outstanding interest + penalty
- Penalty amount should be shown separately in the payment UI and on receipts

#### Maturity & Renewal Cycle

With 30-day maturity:
- **Day 0:** Loan issued (1 month advance interest already deducted)
- **Day 30 (maturity):** Customer must pay interest to renew OR pay full to redeem
- **Day 31–120 (grace period):** Penalty interest accrues. Customer can still renew/redeem.
- **Day 121 (expiry):** Item forfeited → eligible for auction/disposition

On **renewal**:
- Customer pays: outstanding interest + any penalty
- Maturity date extends by 30 days from payment date
- New advance interest is NOT deducted again (only on initial issuance)

### Frontend Changes

#### Manager Approval Modal
- Show "Max Loanable Amount" = appraised value × LTV ratio
- Validate principal input against this ceiling
- Show service charge as percentage with computed peso amount preview

#### Payment Modal (ActiveLoans)
- When ticket is overdue, show penalty breakdown:
  - Regular interest: ₱X
  - Penalty interest: ₱Y (Z months overdue × rate%)
  - Total due: ₱X+Y
- For `FULL_REDEMPTION`: show principal + interest + penalty total

#### Settings Page
- Rename "Service Charge" field from flat amount to percentage input
- Add helper text: "Percentage of principal deducted at disbursement"
- Show `penalty_interest_rate` and `ltv_ratio` fields (they may already exist but be hidden)

---

## Out of Scope

- No new roles or permissions — uses existing CASHIER, APPRAISER, MANAGER, OWNER
- No changes to the manager approval/reject flow (only adds LTV validation + service charge %)
- No changes to the print layout structure (only updated values)
