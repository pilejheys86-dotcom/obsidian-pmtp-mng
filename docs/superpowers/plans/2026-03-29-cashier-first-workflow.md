# Cashier-First Pawn Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the pawn workflow so Cashier handles intake, Appraiser appraises from a queue, Manager approves with BSP-compliant loan terms, and Cashier issues ticket with automated email + PDF.

**Architecture:** Add cashier intake step at the start of the pipeline using the existing `PENDING_APPRAISAL` status. Modify loan calculations to use percentage-based service charge, enforce LTV ratio, and wire in penalty interest. Add server-side PDF generation and email on ticket issuance.

**Tech Stack:** React 18, Express.js, Supabase (PostgreSQL), NodeMailer/Resend, html-pdf-node (PDF generation)

**Spec:** `docs/superpowers/specs/2026-03-29-cashier-first-workflow-design.md`

---

## File Map

### New Files
- `sql/106_bsp_loan_terms.sql` — Migration: rename service_charge → service_charge_pct, update defaults
- `server/utils/pawnTicketPdf.js` — Server-side PDF generation from HTML template

### Modified Files
- `server/routes/appraisals.js` — New intake endpoint, modify submit/approve/issue/stats/queue endpoints
- `server/services/email.js` — Add attachments support to sendEmail, add sendDisbursementEmail template
- `src/lib/api.js:340-361` — Add intake, myItems API methods
- `src/pages/owner/appraisals/CashierWorkspace.jsx` — Add Intake tab + My Items tab
- `src/pages/owner/appraisals/AppraiserWorkspace.jsx` — Replace create-from-scratch with queue → appraise flow
- `src/pages/owner/appraisals/ManagerWorkspace.jsx:240-296` — Add LTV ceiling display, service charge as %
- `src/pages/owner/appraisals/IssueTicketModal.jsx:86-143` — Update service charge display label
- `src/pages/owner/appraisals/PawnTicketPrint.jsx:97-114` — Update service charge label
- `src/pages/owner/ActiveLoans.jsx` — Add penalty breakdown in payment display
- `src/pages/owner/SettingsPage.jsx` — Update service charge field to percentage

---

## Task 1: SQL Migration — BSP-Compliant Loan Defaults

**Files:**
- Create: `sql/106_bsp_loan_terms.sql`

- [ ] **Step 1: Write migration file**

```sql
-- ============================================================================
-- MIGRATION 106: BSP-Compliant Loan Term Defaults
-- 1. Rename service_charge → service_charge_pct (flat peso → percentage)
-- 2. Update defaults to PH pawnshop industry standards
-- Date: 2026-03-29
-- ============================================================================

-- Rename service_charge to service_charge_pct (percentage-based)
ALTER TABLE tenant_loan_settings RENAME COLUMN service_charge TO service_charge_pct;

-- Update defaults to BSP-compliant values
ALTER TABLE tenant_loan_settings ALTER COLUMN maturity_months SET DEFAULT 1;
ALTER TABLE tenant_loan_settings ALTER COLUMN grace_period_days SET DEFAULT 90;
ALTER TABLE tenant_loan_settings ALTER COLUMN service_charge_pct SET DEFAULT 5.00;
ALTER TABLE tenant_loan_settings ALTER COLUMN penalty_interest_rate SET DEFAULT 3.00;
ALTER TABLE tenant_loan_settings ALTER COLUMN ltv_ratio SET DEFAULT 0.70;
ALTER TABLE tenant_loan_settings ALTER COLUMN max_missed_payments SET DEFAULT 3;
ALTER TABLE tenant_loan_settings ALTER COLUMN renewal_cooldown_days SET DEFAULT 0;

-- Update the save_tenant_loan_settings RPC parameter name
CREATE OR REPLACE FUNCTION save_tenant_loan_settings(
  p_tenant_id UUID,
  p_interest_rate NUMERIC DEFAULT NULL,
  p_penalty_interest_rate NUMERIC DEFAULT NULL,
  p_ltv_ratio NUMERIC DEFAULT NULL,
  p_grace_period_days INTEGER DEFAULT NULL,
  p_maturity_months INTEGER DEFAULT NULL,
  p_renewal_cooldown_days INTEGER DEFAULT NULL,
  p_max_missed_payments INTEGER DEFAULT NULL,
  p_payment_cycle_days INTEGER DEFAULT NULL,
  p_service_charge_pct NUMERIC DEFAULT NULL,
  p_affidavit_fee NUMERIC DEFAULT NULL,
  p_advance_interest_months INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE tenant_loan_settings SET
    interest_rate = COALESCE(p_interest_rate, interest_rate),
    penalty_interest_rate = COALESCE(p_penalty_interest_rate, penalty_interest_rate),
    ltv_ratio = COALESCE(p_ltv_ratio, ltv_ratio),
    grace_period_days = COALESCE(p_grace_period_days, grace_period_days),
    maturity_months = COALESCE(p_maturity_months, maturity_months),
    renewal_cooldown_days = COALESCE(p_renewal_cooldown_days, renewal_cooldown_days),
    max_missed_payments = COALESCE(p_max_missed_payments, max_missed_payments),
    payment_cycle_days = COALESCE(p_payment_cycle_days, payment_cycle_days),
    service_charge_pct = COALESCE(p_service_charge_pct, service_charge_pct),
    affidavit_fee = COALESCE(p_affidavit_fee, affidavit_fee),
    advance_interest_months = COALESCE(p_advance_interest_months, advance_interest_months),
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loan settings not found for tenant');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing tenants to BSP defaults (only if they still have old defaults)
UPDATE tenant_loan_settings
SET maturity_months = 1, grace_period_days = 90
WHERE maturity_months = 10 AND grace_period_days = 10;
```

- [ ] **Step 2: Run migration on Supabase**

Run this SQL in the Supabase SQL Editor. Verify with:
```sql
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name = 'tenant_loan_settings'
ORDER BY ordinal_position;
```
Expected: `service_charge_pct` column exists (not `service_charge`), `maturity_months` default = 1, `grace_period_days` default = 90.

- [ ] **Step 3: Commit**

```bash
git add sql/106_bsp_loan_terms.sql
git commit -m "feat: migration 106 — BSP-compliant loan term defaults"
```

---

## Task 2: Backend — Cashier Intake + My Items Endpoints

**Files:**
- Modify: `server/routes/appraisals.js` (add before the existing `POST /submit` route)

- [ ] **Step 1: Add POST /appraisals/intake endpoint**

Add this after the `GET /appraisals/:id/assessments` endpoint (after line 609) in `server/routes/appraisals.js`:

```javascript
// POST /appraisals/intake — Cashier accepts item from customer (minimal data)
router.post('/intake', async (req, res) => {
  if (!['CASHIER', 'OWNER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only cashiers and owners can accept items' });
  }

  const { customer_id, category, description } = req.body;

  if (!customer_id || !category) {
    return res.status(400).json({ error: 'customer_id and category are required' });
  }

  const validCategories = ['JEWELRY', 'GADGET', 'VEHICLE', 'APPLIANCE', 'OTHER'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${validCategories.join(', ')}` });
  }

  // Verify customer belongs to tenant
  const { data: customer, error: custErr } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name')
    .eq('id', customer_id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .single();

  if (custErr || !customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('pawn_items')
    .insert({
      tenant_id: req.tenantId,
      customer_id,
      category,
      description: description?.trim() || null,
      inventory_status: 'PENDING_APPRAISAL',
      specific_attrs: {
        submitted_by: req.userId,
        submitted_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (itemErr) return res.status(400).json({ error: itemErr.message });

  res.status(201).json(item);
});
```

- [ ] **Step 2: Add GET /appraisals/my-items endpoint**

Add this right after the intake endpoint:

```javascript
// GET /appraisals/my-items — Items submitted by current user with status
router.get('/my-items', async (req, res) => {
  if (!['CASHIER', 'OWNER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { data, error } = await supabaseAdmin
    .from('pawn_items')
    .select('id, category, description, inventory_status, created_at, customer_id, customers(first_name, last_name)')
    .eq('tenant_id', req.tenantId)
    .filter('specific_attrs->>submitted_by', 'eq', req.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  const STATUS_LABELS = {
    PENDING_APPRAISAL: 'Awaiting Appraisal',
    PENDING_APPROVAL: 'Awaiting Approval',
    READY_FOR_RELEASE: 'Ready for Release',
    VAULT: 'Issued',
    REDEEMED: 'Redeemed',
    FORFEITED: 'Forfeited',
    DECLINED: 'Declined',
    REJECTED: 'Rejected',
  };

  const items = (data || []).map(item => ({
    ...item,
    status_label: STATUS_LABELS[item.inventory_status] || item.inventory_status,
    customer_name: item.customers
      ? `${item.customers.first_name} ${item.customers.last_name}`
      : 'Unknown',
  }));

  res.json(items);
});
```

- [ ] **Step 3: Verify server starts without errors**

Run: `node server/index.js` — should start on port 5000 without errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes/appraisals.js
git commit -m "feat: add cashier intake + my-items endpoints"
```

---

## Task 3: Backend — Modify Submit Endpoint for Appraiser Queue Flow

**Files:**
- Modify: `server/routes/appraisals.js:164-286` (the existing `POST /submit` route)

- [ ] **Step 1: Replace the submit endpoint**

Replace the entire `POST /appraisals/submit` handler (lines 164-286) with:

```javascript
// POST /appraisals/submit — Appraiser appraises an existing intake item
router.post('/submit', async (req, res) => {
  if (req.userRole !== 'APPRAISER' && req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only appraisers can submit appraisals' });
  }

  const {
    item_id, category, condition, description,
    brand, model, serial_number, weight_grams, karat,
    appraised_value, fair_market_value, accessories, notes,
  } = req.body;

  if (!item_id) {
    return res.status(400).json({ error: 'item_id is required — select an item from the intake queue' });
  }

  if (!appraised_value || Number(appraised_value) <= 0) {
    return res.status(400).json({ error: 'appraised_value is required and must be positive' });
  }

  // Fetch the intake item
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from('pawn_items')
    .select('*')
    .eq('id', item_id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .single();

  if (fetchErr || !item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  if (item.inventory_status !== 'PENDING_APPRAISAL') {
    return res.status(422).json({ error: `Item is in ${item.inventory_status} status, expected PENDING_APPRAISAL` });
  }

  // Check serial number uniqueness if provided
  if (serial_number?.trim()) {
    const { data: existing } = await supabaseAdmin
      .from('pawn_items')
      .select('id')
      .eq('tenant_id', req.tenantId)
      .eq('serial_number', serial_number.trim())
      .neq('id', item_id)
      .is('deleted_at', null)
      .limit(1);

    if (existing?.length) {
      return res.status(409).json({ error: `Serial number "${serial_number}" is already registered to another item` });
    }
  }

  // Build specific_attrs
  const specificAttrs = {
    ...(item.specific_attrs || {}),
    appraised_by: req.userId,
    appraised_at: new Date().toISOString(),
    accessories: accessories || [],
    notes: notes?.trim() || null,
  };

  // Update the item with appraisal data
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('pawn_items')
    .update({
      category: category || item.category,
      condition: condition || null,
      description: description?.trim() || item.description,
      brand: brand?.trim() || null,
      model: model?.trim() || null,
      serial_number: serial_number?.trim() || null,
      weight_grams: weight_grams ? Number(weight_grams) : null,
      karat: karat ? Number(karat) : null,
      appraised_value: Number(appraised_value),
      fair_market_value: fair_market_value ? Number(fair_market_value) : Number(appraised_value),
      inventory_status: 'PENDING_APPROVAL',
      specific_attrs: specificAttrs,
    })
    .eq('id', item_id)
    .select()
    .single();

  if (updateErr) return res.status(400).json({ error: updateErr.message });

  // Create appraisal assessment record
  const assessmentData = {
    item_id,
    tenant_id: req.tenantId,
    outcome: 'PENDING',
  };

  // For jewelry, store gold rate snapshot
  if ((category || item.category) === 'JEWELRY' && weight_grams && karat) {
    const { data: goldRate } = await supabaseAdmin
      .from('gold_rates')
      .select('rate_per_gram, purity_decimal')
      .eq('tenant_id', req.tenantId)
      .eq('karat', Number(karat))
      .is('deleted_at', null)
      .single();

    if (goldRate) {
      const conditionMultiplier = condition === 'EXCELLENT' ? 1.0 : condition === 'GOOD' ? 0.9 : condition === 'FAIR' ? 0.8 : 0.7;
      assessmentData.gold_rate_used = goldRate.rate_per_gram;
      assessmentData.purity_decimal_used = goldRate.purity_decimal;
      assessmentData.condition_multiplier = conditionMultiplier;
      assessmentData.melt_value = Number(weight_grams) * goldRate.rate_per_gram * goldRate.purity_decimal;
    }
  }

  await supabaseAdmin.from('appraisal_assessments').insert(assessmentData);

  res.status(200).json(updated);
});
```

- [ ] **Step 2: Update the queue endpoint to include PENDING_APPRAISAL items**

In the `GET /appraisals/queue` handler (around line 139-162), find the `.in('inventory_status', ...)` filter and add `PENDING_APPRAISAL`:

Change:
```javascript
.in('inventory_status', ['PENDING_APPROVAL', 'READY_FOR_RELEASE', 'REJECTED', 'DECLINED'])
```
To:
```javascript
.in('inventory_status', ['PENDING_APPRAISAL', 'PENDING_APPROVAL', 'READY_FOR_RELEASE', 'REJECTED', 'DECLINED'])
```

- [ ] **Step 3: Update the stats endpoint to include PENDING_APPRAISAL count**

In the `GET /appraisals/stats` handler (around line 29-137), add a count for pending appraisal items. Add this query alongside the existing stat queries:

```javascript
// Count items awaiting appraisal
const { count: pendingAppraisal } = await supabaseAdmin
  .from('pawn_items')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', req.tenantId)
  .eq('inventory_status', 'PENDING_APPRAISAL')
  .is('deleted_at', null);
```

And include `pendingAppraisal` in the response object alongside the existing stats.

- [ ] **Step 4: Verify server starts**

Run: `node server/index.js`

- [ ] **Step 5: Commit**

```bash
git add server/routes/appraisals.js
git commit -m "feat: modify submit endpoint for appraiser queue flow + add PENDING_APPRAISAL to stats/queue"
```

---

## Task 4: Backend — LTV Enforcement + Service Charge % in Approve Endpoint

**Files:**
- Modify: `server/routes/appraisals.js:288-393` (the `POST /:id/approve` handler)
- Modify: `server/routes/loanSettings.js:24-37` (rename service_charge → service_charge_pct)

- [ ] **Step 1: Update the approve endpoint loan calculation**

In `server/routes/appraisals.js`, replace the loan settings section and calculation (lines 314-355) with:

```javascript
    // Fetch tenant loan settings
    const { data: settings } = await supabaseAdmin
      .from('tenant_loan_settings')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    const interestRate = settings?.interest_rate || 3;
    const maturityMonths = settings?.maturity_months || 1;
    const graceDays = settings?.grace_period_days || 90;
    const serviceChargePct = settings?.service_charge_pct || 5;
    const advanceInterestMonths = settings?.advance_interest_months || 1;
    const paymentCycleDays = settings?.payment_cycle_days || 30;
    const ltvRatio = settings?.ltv_ratio || 0.70;

    // Enforce LTV ratio
    const maxLoan = Number(item.appraised_value) * ltvRatio;
    if (Number(principal_loan) > maxLoan) {
      return res.status(422).json({
        error: `Loan amount cannot exceed ${(ltvRatio * 100).toFixed(0)}% of appraised value (max: ₱${maxLoan.toFixed(2)})`,
      });
    }

    const loanDate = new Date();
    const maturityDate = new Date(loanDate);
    maturityDate.setMonth(maturityDate.getMonth() + maturityMonths);
    const expiryDate = new Date(maturityDate);
    expiryDate.setDate(expiryDate.getDate() + graceDays);
    const nextPaymentDue = new Date(loanDate);
    nextPaymentDue.setDate(nextPaymentDue.getDate() + paymentCycleDays);

    const advanceInterest = Number(principal_loan) * (interestRate / 100) * advanceInterestMonths;
    const serviceChargeAmount = Number(principal_loan) * (serviceChargePct / 100);
    const netProceeds = Number(principal_loan) - advanceInterest - serviceChargeAmount;

    const ticketNumber = generateTicketNumber();

    const loanTerms = {
      principal_loan: Number(principal_loan),
      interest_rate: interestRate,
      advance_interest: advanceInterest,
      service_charge_pct: serviceChargePct,
      service_charge_amount: serviceChargeAmount,
      net_proceeds: netProceeds,
      loan_date: loanDate.toISOString(),
      maturity_date: maturityDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      grace_period_days: graceDays,
      next_payment_due_date: nextPaymentDue.toISOString(),
      payment_cycle_days: paymentCycleDays,
      maturity_months: maturityMonths,
      ticket_number: ticketNumber,
      ltv_ratio: ltvRatio,
    };
```

- [ ] **Step 2: Update loanSettings.js to use service_charge_pct**

In `server/routes/loanSettings.js`, replace line 34:

```javascript
    p_service_charge: req.body.service_charge || null,
```
with:
```javascript
    p_service_charge_pct: req.body.service_charge_pct || null,
```

- [ ] **Step 3: Update the issue endpoint to use service_charge_amount**

In the `POST /:id/issue` handler, find where `service_charge` is written to the pawn_tickets insert (around line 429-436). Update to use the new field names:

Change `service_charge: loanTerms.service_charge` to `service_charge: loanTerms.service_charge_amount`.

- [ ] **Step 4: Verify server starts**

Run: `node server/index.js`

- [ ] **Step 5: Commit**

```bash
git add server/routes/appraisals.js server/routes/loanSettings.js
git commit -m "feat: enforce LTV ratio + percentage-based service charge in approval"
```

---

## Task 5: Backend — Email Attachments Support + Disbursement Email

**Files:**
- Modify: `server/services/email.js` (update sendEmail + add template)

- [ ] **Step 1: Update sendEmail to support attachments**

In `server/services/email.js`, change the `sendEmail` function signature and body (around lines 12-41):

Replace:
```javascript
const sendEmail = async ({ from, to, subject, html }) => {
```
With:
```javascript
const sendEmail = async ({ from, to, subject, html, attachments }) => {
```

In the Resend API path, update the body to include attachments:
```javascript
      body: JSON.stringify({
        from: from || process.env.SMTP_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(attachments?.length ? {
          attachments: attachments.map(a => ({
            filename: a.filename,
            content: a.content.toString('base64'),
          }))
        } : {}),
      }),
```

In the nodemailer fallback path, update to pass attachments:
```javascript
  return transporter.sendMail({ from: from || process.env.SMTP_FROM, to, subject, html, attachments });
```

- [ ] **Step 2: Add sendDisbursementEmail template**

Add this before the `module.exports` block:

```javascript
const sendDisbursementEmail = async ({ to, customerName, ticket, businessName, branchName, pdfBuffer }) => {
  const formatCurrency = (val) => `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const formatDate = (d) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1C1917;">
      <div style="background: #171717; padding: 24px; text-align: center;">
        <h1 style="color: #A3E635; margin: 0; font-size: 20px;">${businessName}</h1>
        <p style="color: #A3A3A3; margin: 4px 0 0; font-size: 12px;">${branchName || ''}</p>
      </div>

      <div style="padding: 24px; background: #FFFFFF; border: 1px solid #E7E5E4;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #1C1917;">Loan Disbursement Confirmation</h2>
        <p style="margin: 0 0 20px; color: #78716C; font-size: 14px;">
          Dear ${customerName}, your pawn loan has been processed. Please find the details below.
        </p>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr style="border-bottom: 1px solid #E7E5E4;">
            <td style="padding: 10px 0; color: #78716C;">Ticket Number</td>
            <td style="padding: 10px 0; text-align: right; font-weight: 600;">${ticket.ticket_number}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E7E5E4;">
            <td style="padding: 10px 0; color: #78716C;">Item</td>
            <td style="padding: 10px 0; text-align: right;">${ticket.item_description || ticket.category}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E7E5E4;">
            <td style="padding: 10px 0; color: #78716C;">Principal Loan</td>
            <td style="padding: 10px 0; text-align: right; font-weight: 600;">${formatCurrency(ticket.principal_loan)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E7E5E4;">
            <td style="padding: 10px 0; color: #78716C;">Interest Rate</td>
            <td style="padding: 10px 0; text-align: right;">${ticket.interest_rate}% / month</td>
          </tr>
          <tr style="border-bottom: 1px solid #E7E5E4;">
            <td style="padding: 10px 0; color: #78716C;">Advance Interest</td>
            <td style="padding: 10px 0; text-align: right; color: #DC2626;">- ${formatCurrency(ticket.advance_interest)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E7E5E4;">
            <td style="padding: 10px 0; color: #78716C;">Service Charge (${ticket.service_charge_pct || 5}%)</td>
            <td style="padding: 10px 0; text-align: right; color: #DC2626;">- ${formatCurrency(ticket.service_charge)}</td>
          </tr>
          <tr style="background: #F5F5F4;">
            <td style="padding: 12px 8px; font-weight: 700;">Net Proceeds (Cash Received)</td>
            <td style="padding: 12px 8px; text-align: right; font-weight: 700; font-size: 16px; color: #16A34A;">${formatCurrency(ticket.net_proceeds)}</td>
          </tr>
        </table>

        <div style="margin-top: 20px; padding: 16px; background: #F5F5F4; border-radius: 4px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #78716C;">Loan Date</td>
              <td style="padding: 4px 0; text-align: right;">${formatDate(ticket.loan_date)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #78716C;">Maturity Date</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 600;">${formatDate(ticket.maturity_date)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #78716C;">Expiry Date</td>
              <td style="padding: 4px 0; text-align: right;">${formatDate(ticket.expiry_date)}</td>
            </tr>
          </table>
        </div>

        <p style="margin: 20px 0 0; font-size: 12px; color: #78716C; line-height: 1.5;">
          Please present this ticket number when making payments or redeeming your item.
          Failure to renew or redeem before the expiry date will result in forfeiture of the pledged item.
        </p>
      </div>

      <div style="padding: 16px; text-align: center; background: #171717;">
        <p style="margin: 0; font-size: 12px; color: #A3A3A3;">Thank you for choosing ${businessName}</p>
      </div>
    </div>
  `;

  const emailPayload = {
    to,
    subject: `Pawn Ticket #${ticket.ticket_number} — Loan Disbursement Confirmation`,
    html,
  };

  if (pdfBuffer) {
    emailPayload.attachments = [{
      filename: `PawnTicket-${ticket.ticket_number}.pdf`,
      content: pdfBuffer,
    }];
  }

  await sendEmail(emailPayload);
};
```

- [ ] **Step 3: Export the new function**

Add `sendDisbursementEmail` to `module.exports`.

- [ ] **Step 4: Commit**

```bash
git add server/services/email.js
git commit -m "feat: add attachment support to sendEmail + disbursement email template"
```

---

## Task 6: Backend — PDF Generation Utility

**Files:**
- Create: `server/utils/pawnTicketPdf.js`

- [ ] **Step 1: Install html-pdf-node**

```bash
npm install html-pdf-node
```

- [ ] **Step 2: Create the PDF generation utility**

```javascript
const htmlPdf = require('html-pdf-node');

/**
 * Generate a pawn ticket PDF from ticket data.
 * Returns a Buffer containing the PDF.
 */
const generatePawnTicketPdf = async ({ ticket, item, businessName, branchName, bspRegNo }) => {
  const formatCurrency = (val) => `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const formatDate = (d) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  const customerName = item.customers
    ? `${item.customers.first_name} ${item.customers.last_name}`
    : 'N/A';

  const itemDesc = [item.brand, item.model, item.description].filter(Boolean).join(' — ') || item.category;

  const loanTerms = item.specific_attrs?.loan_terms || ticket;

  const html = `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #1C1917; font-size: 12px; }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1C1917; padding-bottom: 16px; }
        .header h1 { margin: 0; font-size: 18px; }
        .header p { margin: 2px 0; color: #78716C; font-size: 11px; }
        .title { text-align: center; font-size: 14px; font-weight: bold; margin: 16px 0 8px; }
        .ticket-no { text-align: center; font-size: 13px; margin-bottom: 16px; }
        .section { margin-bottom: 12px; }
        .section-title { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #78716C; margin-bottom: 6px; border-bottom: 1px solid #E7E5E4; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 4px 0; }
        td.label { color: #78716C; width: 45%; }
        td.value { text-align: right; }
        .highlight { background: #F5F5F4; padding: 8px; font-weight: bold; }
        .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
        .sig-block { text-align: center; width: 30%; }
        .sig-line { border-top: 1px solid #1C1917; margin-top: 48px; padding-top: 4px; font-size: 11px; }
        .footer { margin-top: 24px; text-align: center; font-size: 9px; color: #78716C; border-top: 1px solid #E7E5E4; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${businessName}</h1>
        <p>${branchName || ''}</p>
        ${bspRegNo ? `<p>BSP Reg. No.: ${bspRegNo}</p>` : ''}
      </div>

      <div class="title">PAWN TICKET</div>
      <div class="ticket-no">${loanTerms.ticket_number || ticket.ticket_number}</div>

      <div class="section">
        <div class="section-title">Pawner</div>
        <table>
          <tr><td class="label">Name</td><td class="value">${customerName}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Pledged Item</div>
        <table>
          <tr><td class="label">Description</td><td class="value">${itemDesc}</td></tr>
          <tr><td class="label">Category</td><td class="value">${item.category}</td></tr>
          ${item.condition ? `<tr><td class="label">Condition</td><td class="value">${item.condition}</td></tr>` : ''}
          ${item.weight_grams ? `<tr><td class="label">Weight</td><td class="value">${item.weight_grams}g</td></tr>` : ''}
          ${item.karat ? `<tr><td class="label">Karat</td><td class="value">${item.karat}K</td></tr>` : ''}
          <tr><td class="label">Appraised Value</td><td class="value">${formatCurrency(item.appraised_value)}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Loan Details</div>
        <table>
          <tr><td class="label">Principal Loan</td><td class="value">${formatCurrency(loanTerms.principal_loan)}</td></tr>
          <tr><td class="label">Interest Rate</td><td class="value">${loanTerms.interest_rate}% / month</td></tr>
          <tr><td class="label">Advance Interest</td><td class="value">${formatCurrency(loanTerms.advance_interest)}</td></tr>
          <tr><td class="label">Service Charge (${loanTerms.service_charge_pct || 5}%)</td><td class="value">${formatCurrency(loanTerms.service_charge_amount || loanTerms.service_charge)}</td></tr>
        </table>
        <table class="highlight">
          <tr><td class="label" style="font-weight:bold;">Net Proceeds (Cash Received)</td><td class="value" style="font-weight:bold; font-size: 14px;">${formatCurrency(loanTerms.net_proceeds)}</td></tr>
        </table>
        <table>
          <tr><td class="label">Loan Date</td><td class="value">${formatDate(loanTerms.loan_date || ticket.loan_date)}</td></tr>
          <tr><td class="label">Maturity Date</td><td class="value" style="font-weight:bold;">${formatDate(loanTerms.maturity_date || ticket.maturity_date)}</td></tr>
          <tr><td class="label">Expiry Date</td><td class="value">${formatDate(loanTerms.expiry_date || ticket.expiry_date)}</td></tr>
          <tr><td class="label">Grace Period</td><td class="value">${loanTerms.grace_period_days} days</td></tr>
        </table>
      </div>

      <div class="signatures">
        <div class="sig-block"><div class="sig-line">Appraiser</div></div>
        <div class="sig-block"><div class="sig-line">Cashier</div></div>
        <div class="sig-block"><div class="sig-line">Customer</div></div>
      </div>

      <div class="footer">
        This pawn ticket is non-transferable. / Ang pawn ticket na ito ay hindi maaaring ilipat sa ibang tao.
      </div>
    </body>
    </html>
  `;

  const file = { content: html };
  const options = { format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } };

  const pdfBuffer = await htmlPdf.generatePdf(file, options);
  return pdfBuffer;
};

module.exports = { generatePawnTicketPdf };
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/pawnTicketPdf.js package.json package-lock.json
git commit -m "feat: add server-side pawn ticket PDF generation"
```

---

## Task 7: Backend — Wire Email + PDF into Issue Endpoint

**Files:**
- Modify: `server/routes/appraisals.js:395-509` (the `POST /:id/issue` handler)

- [ ] **Step 1: Add imports at top of appraisals.js**

At the top of `server/routes/appraisals.js`, add:

```javascript
const { sendDisbursementEmail } = require('../services/email');
const { generatePawnTicketPdf } = require('../utils/pawnTicketPdf');
```

- [ ] **Step 2: Add fire-and-forget email after ticket creation**

In the issue endpoint, after the successful response is built but before `res.status(201).json(...)`, add the email logic. Insert this code right before the final `res.status(201).json(...)`:

```javascript
    // Fire-and-forget: send disbursement email with PDF to customer
    (async () => {
      try {
        // Fetch customer email
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('email, first_name, last_name')
          .eq('id', item.customer_id)
          .single();

        if (!customer?.email) return; // No email on file, skip silently

        // Fetch tenant info for branding
        const { data: tenant } = await supabaseAdmin
          .from('tenants')
          .select('business_name, bsp_registration_no')
          .eq('id', req.tenantId)
          .single();

        // Fetch branch info
        const { data: branch } = await supabaseAdmin
          .from('branches')
          .select('branch_name')
          .eq('id', req.branchId || item.branch_id)
          .single();

        // Generate PDF
        const pdfBuffer = await generatePawnTicketPdf({
          ticket: ticketRecord,
          item,
          businessName: tenant?.business_name || 'Pawnshop',
          branchName: branch?.branch_name || '',
          bspRegNo: tenant?.bsp_registration_no || '',
        });

        // Send email
        await sendDisbursementEmail({
          to: customer.email,
          customerName: `${customer.first_name} ${customer.last_name}`,
          ticket: {
            ticket_number: loanTerms.ticket_number,
            principal_loan: loanTerms.principal_loan,
            interest_rate: loanTerms.interest_rate,
            advance_interest: loanTerms.advance_interest,
            service_charge_pct: loanTerms.service_charge_pct,
            service_charge: loanTerms.service_charge_amount,
            net_proceeds: loanTerms.net_proceeds,
            loan_date: loanTerms.loan_date,
            maturity_date: loanTerms.maturity_date,
            expiry_date: loanTerms.expiry_date,
            item_description: [item.brand, item.model, item.description].filter(Boolean).join(' — ') || item.category,
            category: item.category,
          },
          businessName: tenant?.business_name || 'Pawnshop',
          branchName: branch?.branch_name || '',
          pdfBuffer,
        });
      } catch (emailErr) {
        console.error('Failed to send disbursement email:', emailErr.message);
      }
    })();
```

Note: `ticketRecord` refers to the created pawn_tickets row. You may need to capture it from the insert result — check the variable name used in the existing code and adjust accordingly.

- [ ] **Step 3: Verify server starts**

Run: `node server/index.js`

- [ ] **Step 4: Commit**

```bash
git add server/routes/appraisals.js
git commit -m "feat: send disbursement email with PDF pawn ticket on issue"
```

---

## Task 8: Frontend — API Methods for Intake + My Items

**Files:**
- Modify: `src/lib/api.js:340-361`

- [ ] **Step 1: Add intake and myItems methods to appraisalsApi**

In the `appraisalsApi` object, add these two methods:

```javascript
  intake: (data) => request('/appraisals/intake', { method: 'POST', body: JSON.stringify(data) }),
  myItems: () => request('/appraisals/my-items'),
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.js
git commit -m "feat: add intake + myItems API methods"
```

---

## Task 9: Frontend — Cashier Workspace with Intake + My Items Tabs

**Files:**
- Modify: `src/pages/owner/appraisals/CashierWorkspace.jsx` (full rewrite of the component)

- [ ] **Step 1: Rewrite CashierWorkspace with 3 tabs**

Replace the entire content of `CashierWorkspace.jsx` with:

```jsx
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../context'
import { appraisalsApi, customersApi } from '../../../lib/api'
import IssueTicketModal from './IssueTicketModal'
import PawnTicketPrint from './PawnTicketPrint'

const formatCurrency = (val) => `₱${Number(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

const STATUS_COLORS = {
  'Awaiting Appraisal': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Awaiting Approval': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Ready for Release': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'Issued': 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
  'Redeemed': 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
  'Declined': 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  'Rejected': 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

const CATEGORIES = ['JEWELRY', 'GADGET', 'VEHICLE', 'APPLIANCE', 'OTHER']

const CashierWorkspace = () => {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('intake')
  const [view, setView] = useState('list')

  // Intake state
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ first_name: '', last_name: '', mobile_number: '', email: '' })
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [intakeLoading, setIntakeLoading] = useState(false)
  const [intakeSuccess, setIntakeSuccess] = useState(null)

  // My Items state
  const [myItems, setMyItems] = useState([])
  const [myItemsLoading, setMyItemsLoading] = useState(false)

  // Issuance state
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState({})
  const [queueLoading, setQueueLoading] = useState(false)
  const [issueItem, setIssueItem] = useState(null)
  const [declineModal, setDeclineModal] = useState(null)
  const [declineReason, setDeclineReason] = useState('')

  // Print state
  const [printData, setPrintData] = useState(null)

  // Customer search with debounce
  useEffect(() => {
    if (customerSearch.length < 2) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await customersApi.list({ search: customerSearch, limit: 5 })
        setCustomerResults(res.data || res || [])
      } catch { setCustomerResults([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch])

  const fetchMyItems = useCallback(async () => {
    setMyItemsLoading(true)
    try {
      const data = await appraisalsApi.myItems()
      setMyItems(data || [])
    } catch { setMyItems([]) }
    setMyItemsLoading(false)
  }, [])

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true)
    try {
      const [statsData, queueData] = await Promise.all([
        appraisalsApi.stats(),
        appraisalsApi.queue({ status: 'READY_FOR_RELEASE' }),
      ])
      setStats(statsData)
      setQueue((queueData.data || queueData || []).filter(i => i.inventory_status === 'READY_FOR_RELEASE'))
    } catch { setQueue([]) }
    setQueueLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'my-items') fetchMyItems()
    if (activeTab === 'issuance') fetchQueue()
  }, [activeTab, fetchMyItems, fetchQueue])

  // Intake handlers
  const handleCreateCustomer = async () => {
    if (!newCustomer.first_name || !newCustomer.last_name || !newCustomer.mobile_number) return
    try {
      const created = await customersApi.create(newCustomer)
      setSelectedCustomer(created)
      setShowNewCustomer(false)
      setNewCustomer({ first_name: '', last_name: '', mobile_number: '', email: '' })
    } catch (err) {
      alert(err.message || 'Failed to create customer')
    }
  }

  const handleIntakeSubmit = async () => {
    if (!selectedCustomer || !category) return
    setIntakeLoading(true)
    try {
      const item = await appraisalsApi.intake({
        customer_id: selectedCustomer.id,
        category,
        description: description.trim() || undefined,
      })
      setIntakeSuccess(item)
      setSelectedCustomer(null)
      setCustomerSearch('')
      setCategory('')
      setDescription('')
    } catch (err) {
      alert(err.message || 'Failed to accept item')
    }
    setIntakeLoading(false)
  }

  // Issuance handlers
  const handleIssueSuccess = (data) => {
    setPrintData({ ticket: data.ticket, item: issueItem })
    setIssueItem(null)
    setView('print')
  }

  const handleDecline = async () => {
    if (!declineModal) return
    try {
      await appraisalsApi.decline(declineModal.id, { reason: declineReason })
      setDeclineModal(null)
      setDeclineReason('')
      fetchQueue()
    } catch (err) {
      alert(err.message || 'Failed to decline')
    }
  }

  // Print view
  if (view === 'print' && printData) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6 print:hidden">
          <button onClick={() => { setView('list'); setPrintData(null) }} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1">
            <span className="material-symbols-outlined text-lg">arrow_back</span> Back
          </button>
          <button onClick={() => window.print()} className="ml-auto px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-sm text-sm font-semibold">
            <span className="material-symbols-outlined text-sm mr-1 align-middle">print</span> Print Ticket
          </button>
        </div>
        <PawnTicketPrint ticket={printData.ticket} item={printData.item} profile={profile} />
      </div>
    )
  }

  const tabs = [
    { id: 'intake', label: 'Item Intake', icon: 'add_circle' },
    { id: 'my-items', label: 'My Items', icon: 'inventory_2' },
    { id: 'issuance', label: 'Issuance Queue', icon: 'receipt_long', badge: stats.readyForRelease },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-display font-bold text-neutral-900 dark:text-white">Appraisals</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Accept items, track progress, and issue pawn tickets</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-lime-500 text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
            {tab.label}
            {tab.badge > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-lime-500 text-neutral-900">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Intake Tab */}
      {activeTab === 'intake' && (
        <div className="max-w-lg space-y-6">
          {intakeSuccess ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-sm p-6 text-center">
              <span className="material-symbols-outlined text-green-600 text-4xl mb-3 block">check_circle</span>
              <h3 className="text-lg font-semibold text-green-800 dark:text-green-300 mb-1">Item Accepted</h3>
              <p className="text-sm text-green-700 dark:text-green-400 mb-4">
                {intakeSuccess.category} item has been queued for appraisal.
              </p>
              <button onClick={() => setIntakeSuccess(null)} className="px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-sm text-sm font-semibold">
                Accept Another Item
              </button>
            </div>
          ) : (
            <>
              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Customer</label>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-700 rounded-sm bg-neutral-50 dark:bg-neutral-800">
                    <div>
                      <p className="font-semibold text-sm text-neutral-900 dark:text-white">{selectedCustomer.first_name} {selectedCustomer.last_name}</p>
                      <p className="text-xs text-neutral-500">{selectedCustomer.mobile_number || selectedCustomer.email}</p>
                    </div>
                    <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }} className="text-neutral-400 hover:text-red-500">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search customer by name or mobile..."
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      className="w-full px-3 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-sm"
                    />
                    {customerResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-sm shadow-lg max-h-48 overflow-y-auto">
                        {customerResults.map(c => (
                          <button
                            key={c.id}
                            onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustomerResults([]) }}
                            className="w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-sm"
                          >
                            <span className="font-semibold">{c.first_name} {c.last_name}</span>
                            <span className="text-neutral-500 ml-2">{c.mobile_number}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => setShowNewCustomer(!showNewCustomer)}
                      className="mt-2 text-sm text-lime-600 dark:text-lime-400 font-semibold hover:underline"
                    >
                      + New Customer
                    </button>
                  </div>
                )}

                {showNewCustomer && !selectedCustomer && (
                  <div className="mt-3 p-4 border border-neutral-200 dark:border-neutral-700 rounded-sm space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="First Name *" value={newCustomer.first_name} onChange={e => setNewCustomer(p => ({ ...p, first_name: e.target.value }))} className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-sm" />
                      <input placeholder="Last Name *" value={newCustomer.last_name} onChange={e => setNewCustomer(p => ({ ...p, last_name: e.target.value }))} className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-sm" />
                    </div>
                    <input placeholder="Mobile Number *" value={newCustomer.mobile_number} onChange={e => setNewCustomer(p => ({ ...p, mobile_number: e.target.value }))} className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-sm" />
                    <input placeholder="Email (optional)" value={newCustomer.email} onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-sm" />
                    <button
                      onClick={handleCreateCustomer}
                      disabled={!newCustomer.first_name || !newCustomer.last_name || !newCustomer.mobile_number}
                      className="w-full py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-sm text-sm font-semibold disabled:opacity-50"
                    >
                      Create Customer
                    </button>
                  </div>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Item Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`py-2.5 px-3 rounded-sm text-sm font-semibold border transition-colors ${
                        category === cat
                          ? 'border-lime-500 bg-lime-50 dark:bg-lime-900/20 text-lime-700 dark:text-lime-400'
                          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Brief Description <span className="font-normal text-neutral-400">(optional)</span></label>
                <input
                  type="text"
                  placeholder='e.g. "Gold necklace" or "iPhone 15 Pro"'
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-sm"
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleIntakeSubmit}
                disabled={!selectedCustomer || !category || intakeLoading}
                className="w-full py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-sm font-bold text-sm disabled:opacity-50"
              >
                {intakeLoading ? 'Accepting...' : 'Accept Item'}
              </button>
            </>
          )}
        </div>
      )}

      {/* My Items Tab */}
      {activeTab === 'my-items' && (
        <div>
          {myItemsLoading ? (
            <div className="text-center py-12"><span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span></div>
          ) : myItems.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
              <span className="material-symbols-outlined text-4xl mb-2 block">inventory_2</span>
              <p className="text-sm">No items submitted yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Customer</th>
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Category</th>
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Description</th>
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Status</th>
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {myItems.map(item => (
                    <tr key={item.id} className="border-b border-neutral-100 dark:border-neutral-800">
                      <td className="py-3 px-3 font-semibold text-neutral-900 dark:text-white">{item.customer_name}</td>
                      <td className="py-3 px-3">{item.category}</td>
                      <td className="py-3 px-3 text-neutral-500">{item.description || '—'}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[item.status_label] || ''}`}>
                          {item.status_label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-neutral-500">{new Date(item.created_at).toLocaleDateString('en-PH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Issuance Tab */}
      {activeTab === 'issuance' && (
        <div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Ready for Release', value: stats.readyForRelease || 0, icon: 'assignment_turned_in', color: 'text-green-600' },
              { label: 'Issued Today', value: stats.issuedToday || 0, icon: 'receipt_long', color: 'text-blue-600' },
              { label: 'Cash Disbursed Today', value: formatCurrency(stats.cashDisbursedToday || 0), icon: 'payments', color: 'text-lime-600' },
            ].map(s => (
              <div key={s.label} className="p-4 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`material-symbols-outlined text-lg ${s.color}`}>{s.icon}</span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{s.label}</span>
                </div>
                <p className="text-xl font-bold text-neutral-900 dark:text-white">{s.value}</p>
              </div>
            ))}
          </div>

          {queueLoading ? (
            <div className="text-center py-12"><span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span></div>
          ) : queue.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
              <span className="material-symbols-outlined text-4xl mb-2 block">receipt_long</span>
              <p className="text-sm">No items ready for release</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Customer</th>
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Item</th>
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Appraised</th>
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Net Proceeds</th>
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Ticket #</th>
                    <th className="py-3 px-3 font-semibold text-neutral-500 dark:text-neutral-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map(item => {
                    const lt = item.specific_attrs?.loan_terms || {}
                    return (
                      <tr key={item.id} className="border-b border-neutral-100 dark:border-neutral-800">
                        <td className="py-3 px-3 font-semibold text-neutral-900 dark:text-white">
                          {item.customers ? `${item.customers.first_name} ${item.customers.last_name}` : '—'}
                        </td>
                        <td className="py-3 px-3">{[item.brand, item.model, item.description].filter(Boolean).join(' — ') || item.category}</td>
                        <td className="py-3 px-3">{formatCurrency(item.appraised_value)}</td>
                        <td className="py-3 px-3 font-semibold text-green-600">{formatCurrency(lt.net_proceeds)}</td>
                        <td className="py-3 px-3 font-mono text-xs">{lt.ticket_number || '—'}</td>
                        <td className="py-3 px-3">
                          <div className="flex gap-2">
                            <button onClick={() => setIssueItem(item)} className="px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-sm text-xs font-semibold">
                              Issue Ticket
                            </button>
                            <button onClick={() => setDeclineModal(item)} className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-600 rounded-sm text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                              Decline
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Issue Ticket Modal */}
      {issueItem && (
        <IssueTicketModal item={issueItem} onClose={() => setIssueItem(null)} onSuccess={handleIssueSuccess} />
      )}

      {/* Decline Modal */}
      {declineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-800 rounded-sm border border-neutral-200 dark:border-neutral-700 shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-display font-bold text-neutral-900 dark:text-white mb-4">Decline Offer</h3>
            <textarea
              placeholder="Reason for declining (optional)"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-sm min-h-[80px]"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setDeclineModal(null); setDeclineReason('') }} className="px-4 py-2 text-sm font-semibold text-neutral-500">Cancel</button>
              <button onClick={handleDecline} className="px-4 py-2 bg-red-600 text-white rounded-sm text-sm font-semibold">Decline</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CashierWorkspace
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build` — should succeed with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/appraisals/CashierWorkspace.jsx
git commit -m "feat: cashier workspace with intake, my items, and issuance tabs"
```

---

## Task 10: Frontend — Appraiser Workspace with Queue Flow

**Files:**
- Modify: `src/pages/owner/appraisals/AppraiserWorkspace.jsx`

- [ ] **Step 1: Add appraisal queue as the entry point**

This is a significant modification. The appraiser workspace currently has a `view` state toggling between `'list'` and `'form'`. We need to change it so:

1. The `'list'` view shows items in `PENDING_APPRAISAL` status (the intake queue)
2. Clicking an item switches to the `'form'` view with the item pre-loaded

At the top of the component, add state for the selected intake item:

```javascript
const [selectedItem, setSelectedItem] = useState(null)
```

In the list view's fetch (`fetchQueue`), filter for `PENDING_APPRAISAL` status:

Change the queue fetch to filter `inventory_status = 'PENDING_APPRAISAL'`:
```javascript
const fetchQueue = async () => {
  setQueueLoading(true)
  try {
    const data = await appraisalsApi.queue({ status: 'PENDING_APPRAISAL' })
    setQueueItems((data.data || data || []).filter(i => i.inventory_status === 'PENDING_APPRAISAL'))
  } catch { setQueueItems([]) }
  setQueueLoading(false)
}
```

In the list view, each item row should have a "Start Appraisal" button:
```jsx
<button
  onClick={() => {
    setSelectedItem(item)
    setFormData(prev => ({
      ...prev,
      customer_id: item.customer_id,
      category: item.category,
      description: item.description || '',
    }))
    setView('form')
    setActiveStep('item')  // Skip customer step since already set
  }}
  className="px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-sm text-xs font-semibold"
>
  Start Appraisal
</button>
```

- [ ] **Step 2: Modify the form submission to use item_id**

In the submit handler (around line 349), change from creating a new item to updating the intake item:

Replace:
```javascript
await appraisalsApi.submit(formData)
```
With:
```javascript
await appraisalsApi.submit({ ...formData, item_id: selectedItem.id })
```

Also remove the customer step from the form steps when an item is selected — the customer is already set from intake. Show customer info as read-only at the top of the form instead.

- [ ] **Step 3: Update the stats section**

Add the `pendingAppraisal` count to the stats display:
```jsx
{ label: 'Awaiting Appraisal', value: stats.pendingAppraisal || 0, icon: 'pending', color: 'text-amber-600' }
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/pages/owner/appraisals/AppraiserWorkspace.jsx
git commit -m "feat: appraiser workspace uses intake queue instead of creating items"
```

---

## Task 11: Frontend — Manager Approval Modal with LTV + Service Charge %

**Files:**
- Modify: `src/pages/owner/appraisals/ManagerWorkspace.jsx:240-296`

- [ ] **Step 1: Fetch loan settings for LTV display**

At the top of the ManagerWorkspace component, add a state and fetch for loan settings:

```javascript
const [loanSettings, setLoanSettings] = useState(null)

useEffect(() => {
  const fetchSettings = async () => {
    try {
      const settings = await loanSettingsApi.get()
      setLoanSettings(settings)
    } catch {}
  }
  fetchSettings()
}, [])
```

Import `loanSettingsApi` from `../../../lib/api`.

- [ ] **Step 2: Add LTV ceiling in approval modal**

In the approval modal (around line 240-296), add a max loanable amount display above the principal input:

```jsx
{approveItem && loanSettings && (
  <div className="mb-3 p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-sm text-sm">
    <div className="flex justify-between">
      <span className="text-neutral-500">Appraised Value</span>
      <span className="font-semibold">{formatCurrency(approveItem.appraised_value)}</span>
    </div>
    <div className="flex justify-between mt-1">
      <span className="text-neutral-500">LTV Ratio</span>
      <span>{((loanSettings.ltv_ratio || 0.70) * 100).toFixed(0)}%</span>
    </div>
    <div className="flex justify-between mt-1 border-t border-neutral-200 dark:border-neutral-600 pt-1">
      <span className="text-neutral-500 font-semibold">Max Loanable</span>
      <span className="font-bold text-lime-600">{formatCurrency(approveItem.appraised_value * (loanSettings.ltv_ratio || 0.70))}</span>
    </div>
  </div>
)}
```

Update the principal_loan input's `max` attribute:
```jsx
max={approveItem ? approveItem.appraised_value * (loanSettings?.ltv_ratio || 0.70) : undefined}
```

- [ ] **Step 3: Add service charge preview**

Below the principal input, add a computed preview:

```jsx
{principalLoan > 0 && loanSettings && (
  <div className="mt-2 text-xs text-neutral-500 space-y-1">
    <p>Service Charge ({loanSettings.service_charge_pct || 5}%): {formatCurrency(principalLoan * (loanSettings.service_charge_pct || 5) / 100)}</p>
    <p>Advance Interest ({loanSettings.interest_rate || 3}% × {loanSettings.advance_interest_months || 1}mo): {formatCurrency(principalLoan * (loanSettings.interest_rate || 3) / 100 * (loanSettings.advance_interest_months || 1))}</p>
    <p className="font-semibold text-neutral-700 dark:text-neutral-300">
      Est. Net Proceeds: {formatCurrency(
        principalLoan
        - principalLoan * (loanSettings.service_charge_pct || 5) / 100
        - principalLoan * (loanSettings.interest_rate || 3) / 100 * (loanSettings.advance_interest_months || 1)
      )}
    </p>
  </div>
)}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/pages/owner/appraisals/ManagerWorkspace.jsx
git commit -m "feat: manager approval modal shows LTV ceiling + service charge % preview"
```

---

## Task 12: Frontend — Update IssueTicketModal + PawnTicketPrint for Service Charge %

**Files:**
- Modify: `src/pages/owner/appraisals/IssueTicketModal.jsx:86-143`
- Modify: `src/pages/owner/appraisals/PawnTicketPrint.jsx:97-114`

- [ ] **Step 1: Update IssueTicketModal to show service charge as percentage**

In `IssueTicketModal.jsx`, find the service charge display row (around line 86-143) and update to show percentage:

Change:
```jsx
<span>Service Charge</span>
```
To:
```jsx
<span>Service Charge ({loanTerms.service_charge_pct || 5}%)</span>
```

And update the value to use `service_charge_amount`:
```jsx
<span>{formatCurrency(loanTerms.service_charge_amount || loanTerms.service_charge)}</span>
```

- [ ] **Step 2: Update PawnTicketPrint to show service charge as percentage**

In `PawnTicketPrint.jsx`, find the service charge line (around line 97-114) and update similarly:

Change the label from `Service Charge` to:
```jsx
Service Charge ({loanTerms.service_charge_pct || 5}%)
```

And the value to:
```jsx
{formatCurrency(loanTerms.service_charge_amount || loanTerms.service_charge)}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/pages/owner/appraisals/IssueTicketModal.jsx src/pages/owner/appraisals/PawnTicketPrint.jsx
git commit -m "feat: show service charge as percentage in issue modal + print layout"
```

---

## Task 13: Frontend — Settings Page Service Charge Field Update

**Files:**
- Modify: `src/pages/owner/SettingsPage.jsx`

- [ ] **Step 1: Update service charge field**

Find the service charge input field in the loan settings section. Change:
- Field name from `service_charge` to `service_charge_pct`
- Label from "Service Charge" to "Service Charge (%)"
- Helper text: "Percentage of principal deducted at disbursement"
- Input type: number with step="0.01" and max="100"

Also ensure the `penalty_interest_rate` and `ltv_ratio` fields are visible and editable (they may exist but be hidden). Add labels:
- Penalty Interest Rate: "Additional monthly rate on overdue balance (%)"
- LTV Ratio: "Maximum loan-to-value ratio (e.g. 0.70 = 70%)"

- [ ] **Step 2: Verify it builds**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/SettingsPage.jsx
git commit -m "feat: settings page shows service_charge_pct, penalty_rate, ltv_ratio"
```

---

## Task 14: Frontend — Penalty Breakdown in Active Loans Payment Display

**Files:**
- Modify: `src/pages/owner/ActiveLoans.jsx`

- [ ] **Step 1: Add penalty calculation display**

In the loan detail / payment section of `ActiveLoans.jsx`, when a ticket is overdue (past maturity date), compute and display the penalty:

```javascript
const computePenalty = (ticket, settings) => {
  if (!ticket.maturity_date) return 0
  const now = new Date()
  const maturity = new Date(ticket.maturity_date)
  if (now <= maturity) return 0

  const overdueMs = now - maturity
  const overdueMonths = Math.ceil(overdueMs / (30 * 24 * 60 * 60 * 1000))
  const penaltyRate = settings?.penalty_interest_rate || 3
  return ticket.principal_loan * (penaltyRate / 100) * overdueMonths
}
```

In the payment area, when the ticket is overdue, show:
```jsx
{isOverdue && (
  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-sm text-sm space-y-1">
    <div className="flex justify-between">
      <span className="text-red-700 dark:text-red-400">Regular Interest</span>
      <span>{formatCurrency(interestDue)}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-red-700 dark:text-red-400">Penalty ({penaltyRate}% × {overdueMonths} mo)</span>
      <span>{formatCurrency(penaltyAmount)}</span>
    </div>
    <div className="flex justify-between border-t border-red-200 dark:border-red-700 pt-1 font-semibold">
      <span className="text-red-800 dark:text-red-300">Total Due</span>
      <span>{formatCurrency(interestDue + penaltyAmount)}</span>
    </div>
  </div>
)}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/ActiveLoans.jsx
git commit -m "feat: show penalty breakdown for overdue loans in active loans page"
```

---

## Task 15: Build Verification + Final Commit

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Start server and verify**

```bash
node server/index.js
```

Expected: Server starts on port 5000 without errors.

- [ ] **Step 3: Manual smoke test checklist**

Verify the following flows work in the browser:

1. Log in as CASHIER → Appraisals page shows 3 tabs (Intake, My Items, Issuance)
2. Intake tab: search customer, select category, submit → success message
3. My Items tab: shows the submitted item with "Awaiting Appraisal" status
4. Log in as APPRAISER → Appraisals page shows queue with the intake item
5. Click "Start Appraisal" → form pre-filled with customer + category
6. Fill valuation and submit → item moves to PENDING_APPROVAL
7. Log in as MANAGER → Approval queue shows the item
8. Approval modal shows LTV ceiling + service charge % preview
9. Approve with principal within LTV limit → item moves to READY_FOR_RELEASE
10. Log in as CASHIER → Issuance tab shows the item
11. Issue ticket → print view shows, email sent to customer (check logs)

- [ ] **Step 4: Tag the feature**

```bash
git tag v1.1.0-cashier-first-workflow
```
