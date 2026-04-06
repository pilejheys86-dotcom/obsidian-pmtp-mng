# Appraisal Workflow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the appraisal-to-pawn-ticket pipeline into a 3-phase workflow (Appraiser → Manager → Cashier) with role-based workspaces, separating ticket creation from approval into a dedicated cashier issuance step.

**Architecture:** The current single-page `Appraisals.jsx` (1950 lines) becomes a thin role-router that renders one of four workspace components based on `userRole` from AuthContext. The backend approve endpoint no longer creates pawn tickets — it stores pre-calculated loan terms in `specific_attrs.loan_terms`. A new `/issue` endpoint lets the Cashier create the actual ticket and record the disbursement transaction. A new `READY_FOR_RELEASE` inventory status bridges the gap between approval and ticket issuance.

**Tech Stack:** React 18, Express.js, Supabase (PostgreSQL), TailwindCSS 4

**Spec:** `docs/superpowers/specs/2026-03-29-appraisal-workflow-redesign.md`

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `sql/104_appraisal_workflow_redesign.sql` | DB migration: add READY_FOR_RELEASE enum, issued_by column, backfill |
| `src/pages/owner/appraisals/AppraiserWorkspace.jsx` | Appraiser dashboard + multi-step form + read-only queue |
| `src/pages/owner/appraisals/ManagerWorkspace.jsx` | Manager dashboard + approval/rejection queue |
| `src/pages/owner/appraisals/CashierWorkspace.jsx` | Cashier dashboard + issuance queue |
| `src/pages/owner/appraisals/OwnerWorkspace.jsx` | Owner combined view with all actions |
| `src/pages/owner/appraisals/IssueTicketModal.jsx` | Cashier issuance modal (ticket summary + confirm) |
| `src/pages/owner/appraisals/PawnTicketPrint.jsx` | Print-ready pawn ticket with @media print CSS |

### Modified Files

| File | Change |
|------|--------|
| `server/routes/appraisals.js` | Modify `/submit`, `/approve`, `/stats`, `/decline`, `/queue`; add `/issue`; remove `/appraise` |
| `src/lib/api.js` | Add `appraisalsApi.issue()` method |
| `src/pages/owner/Appraisals.jsx` | Replace with thin role-router (~30 lines) |

---

## Task 1: Database Migration

**Files:**
- Create: `sql/104_appraisal_workflow_redesign.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================================================
-- MIGRATION 104: Appraisal Workflow Redesign
-- Spec: docs/superpowers/specs/2026-03-29-appraisal-workflow-redesign.md
-- Date: 2026-03-29
-- ============================================================================

-- 1. Add READY_FOR_RELEASE to inventory_status enum
ALTER TYPE inventory_status ADD VALUE IF NOT EXISTS 'READY_FOR_RELEASE' AFTER 'PENDING_APPROVAL';

-- 2. Add issued_by column to pawn_tickets (nullable UUID, FK to tenant_users)
ALTER TABLE pawn_tickets ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES tenant_users(id);

-- 3. Add ISSUED to assessment outcome (text column, no enum — just a convention check)
-- outcome is TEXT, so no ALTER TYPE needed. Just document: valid values are PENDING, APPROVED, REJECTED, DECLINED, ISSUED.

-- 4. Backfill: migrate any PENDING_APPRAISAL items to PENDING_APPROVAL
-- (Since the new flow has no PENDING_APPRAISAL state, existing items in that state move forward)
UPDATE pawn_items
SET inventory_status = 'PENDING_APPROVAL',
    updated_at = NOW()
WHERE inventory_status = 'PENDING_APPRAISAL'
  AND deleted_at IS NULL;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Run each statement individually in the Supabase SQL Editor:
1. The `ALTER TYPE` statement first
2. The `ALTER TABLE` statement second
3. The `UPDATE` backfill statement last

Expected: All statements succeed. Verify with:
```sql
SELECT enum_range(NULL::inventory_status);
-- Should include 'READY_FOR_RELEASE'

SELECT column_name FROM information_schema.columns
WHERE table_name = 'pawn_tickets' AND column_name = 'issued_by';
-- Should return 1 row
```

- [ ] **Step 3: Commit the migration file**

```bash
git add sql/104_appraisal_workflow_redesign.sql
git commit -m "feat: add READY_FOR_RELEASE status and issued_by column for appraisal workflow redesign"
```

---

## Task 2: Backend — Modify `/submit` Endpoint

The submit endpoint now requires `appraised_value > 0` and creates an `appraisal_assessments` record inline. The item goes directly to `PENDING_APPROVAL` (no more `PENDING_APPRAISAL` state).

**Files:**
- Modify: `server/routes/appraisals.js` (lines 102-177)

- [ ] **Step 1: Update the submit endpoint**

In `server/routes/appraisals.js`, replace the existing submit handler (lines 102-177) with this version that:
1. Requires `appraised_value > 0`
2. Sets `inventory_status = 'PENDING_APPROVAL'` instead of `PENDING_APPRAISAL`
3. Creates an `appraisal_assessments` record inline with `outcome = 'PENDING'`
4. Stores `appraised_by` and `appraised_at` in `specific_attrs`

```javascript
// POST /api/appraisals/submit — Appraiser submits item + valuation in one step
router.post('/submit', async (req, res) => {
  const {
    customer_id, category, general_desc, item_condition, condition_notes,
    brand, model, serial_number, weight_grams, karat, accessories,
    appraised_value, fair_market_value, specific_attrs, notes,
  } = req.body;

  if (!customer_id || !isValidUuid(customer_id)) return res.status(422).json({ error: 'Valid customer_id is required' });
  if (!category || !CATEGORIES.has(category)) return res.status(422).json({ error: 'Valid category is required' });
  if (!general_desc?.trim()) return res.status(422).json({ error: 'general_desc is required' });
  if (item_condition && !CONDITIONS.has(item_condition)) return res.status(422).json({ error: 'Invalid item_condition' });
  if (!appraised_value || Number(appraised_value) <= 0) {
    return res.status(422).json({ error: 'appraised_value must be greater than 0' });
  }

  try {
    // Verify customer belongs to tenant
    const { data: cust } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!cust) return res.status(404).json({ error: 'Customer not found' });

    // Serial number uniqueness check for electronics
    if (serial_number?.trim() && ['GADGET', 'APPLIANCE'].includes(category)) {
      const { count: serialCount } = await supabaseAdmin
        .from('pawn_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', req.tenantId)
        .eq('serial_number', serial_number.trim())
        .is('deleted_at', null)
        .not('inventory_status', 'in', '(REDEEMED,DECLINED,REJECTED)');

      if ((serialCount || 0) > 0) {
        return res.status(409).json({ error: 'An active item with this serial number already exists.' });
      }
    }

    const fmv = fair_market_value ? Number(fair_market_value) : Number(appraised_value);

    const insertPayload = {
      tenant_id: req.tenantId,
      customer_id,
      branch_id: req.branchId,
      category: category.toUpperCase(),
      general_desc: general_desc.trim(),
      item_condition: item_condition || null,
      condition_notes: condition_notes?.trim() || null,
      brand: brand?.trim() || null,
      model: model?.trim() || null,
      serial_number: serial_number?.trim() || null,
      weight_grams: weight_grams ? Number(weight_grams) : null,
      karat: karat ? Number(karat) : null,
      accessories: Array.isArray(accessories) && accessories.length > 0 ? accessories : null,
      appraised_value: Number(appraised_value),
      fair_market_value: fmv,
      inventory_status: 'PENDING_APPROVAL',
      specific_attrs: {
        ...(specific_attrs || {}),
        submitted_by: req.userId,
        submitted_at: new Date().toISOString(),
        appraised_by: req.userId,
        appraised_at: new Date().toISOString(),
      },
    };

    const { data: item, error } = await supabaseAdmin
      .from('pawn_items')
      .insert(insertPayload)
      .select()
      .single();

    if (error) return res.status(400).json({ error: 'Unable to submit item for appraisal.' });

    // Create assessment audit record inline
    let rateSnapshot = {};
    if (category === 'JEWELRY' && weight_grams && karat) {
      const { data: calcData } = await supabaseAdmin.rpc('calculate_appraisal', {
        p_tenant_id: req.tenantId,
        p_weight_grams: weight_grams,
        p_karat: karat,
        p_item_condition: item_condition || 'GOOD',
      });
      if (calcData?.success) {
        rateSnapshot = {
          gold_rate_used: calcData.gold_rate_used || calcData.rate_per_gram,
          purity_decimal_used: calcData.purity_decimal_used || calcData.purity,
          condition_multiplier: calcData.condition_multiplier || calcData.condition_mult,
          ltv_ratio_used: calcData.ltv_ratio_used || calcData.ltv_ratio,
          melt_value: calcData.melt_value,
        };
      }
    }

    await supabaseAdmin.from('appraisal_assessments').insert({
      tenant_id: req.tenantId,
      item_id: item.id,
      assessed_by: req.userId,
      category: item.category,
      weight_grams: item.weight_grams,
      karat: item.karat,
      item_condition: item.item_condition,
      gold_rate_used: rateSnapshot.gold_rate_used || null,
      purity_decimal_used: rateSnapshot.purity_decimal_used || null,
      condition_multiplier: rateSnapshot.condition_multiplier || null,
      ltv_ratio_used: rateSnapshot.ltv_ratio_used || null,
      melt_value: rateSnapshot.melt_value || null,
      fair_market_value: fmv,
      appraised_value: Number(appraised_value),
      notes: notes?.trim() || null,
      outcome: 'PENDING',
    });

    res.status(201).json(item);
  } catch (err) {
    console.error('[appraisals] submit error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2: Verify the server starts without errors**

Run: `node server/index.js`
Expected: Server starts on port 5000 without syntax or import errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes/appraisals.js
git commit -m "feat: submit endpoint now requires appraised_value and creates assessment inline"
```

---

## Task 3: Backend — Modify `/approve` Endpoint

The approve endpoint no longer creates a pawn ticket. Instead, it calculates loan terms, stores them in `specific_attrs.loan_terms`, and moves the item to `READY_FOR_RELEASE`.

**Files:**
- Modify: `server/routes/appraisals.js` (lines 270-389)

- [ ] **Step 1: Replace the approve handler**

Replace the existing approve handler (lines 270-389) with this version:

```javascript
// POST /api/appraisals/:id/approve — Manager approves (sets loan terms, no ticket yet)
router.post('/:id/approve', async (req, res) => {
  if (!isValidUuid(req.params.id)) return res.status(422).json({ error: 'Invalid item id' });
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can approve appraisals' });
  }

  const { principal_loan, offered_amount, storage_location } = req.body;
  if (!principal_loan || Number(principal_loan) <= 0) {
    return res.status(422).json({ error: 'principal_loan must be greater than 0' });
  }

  try {
    const { data: item } = await supabaseAdmin
      .from('pawn_items')
      .select('id, tenant_id, customer_id, appraised_value, fair_market_value, inventory_status, specific_attrs')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .eq('inventory_status', 'PENDING_APPROVAL')
      .maybeSingle();

    if (!item) return res.status(404).json({ error: 'Item not found or not in PENDING_APPROVAL state' });
    if (Number(principal_loan) > Number(item.appraised_value)) {
      return res.status(422).json({ error: 'Loan amount cannot exceed appraised value' });
    }

    // Fetch tenant loan settings
    const { data: settings } = await supabaseAdmin
      .from('tenant_loan_settings')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    const interestRate = settings?.interest_rate || 3;
    const maturityMonths = settings?.maturity_months || 10;
    const graceDays = settings?.grace_period_days || 10;
    const serviceCharge = settings?.service_charge || 5;
    const advanceInterestMonths = settings?.advance_interest_months || 1;
    const paymentCycleDays = settings?.payment_cycle_days || 30;

    const loanDate = new Date();
    const maturityDate = new Date(loanDate);
    maturityDate.setMonth(maturityDate.getMonth() + maturityMonths);
    const expiryDate = new Date(maturityDate);
    expiryDate.setDate(expiryDate.getDate() + graceDays);
    const nextPaymentDue = new Date(loanDate);
    nextPaymentDue.setDate(nextPaymentDue.getDate() + paymentCycleDays);

    const advanceInterest = Number(principal_loan) * (interestRate / 100) * advanceInterestMonths;
    const netProceeds = Number(principal_loan) - advanceInterest - serviceCharge;

    const ticketNumber = generateTicketNumber();

    // Store loan terms in specific_attrs (no ticket created yet)
    const loanTerms = {
      principal_loan: Number(principal_loan),
      interest_rate: interestRate,
      advance_interest: advanceInterest,
      service_charge: serviceCharge,
      net_proceeds: netProceeds,
      loan_date: loanDate.toISOString(),
      maturity_date: maturityDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      grace_period_days: graceDays,
      next_payment_due_date: nextPaymentDue.toISOString(),
      payment_cycle_days: paymentCycleDays,
      maturity_months: maturityMonths,
      ticket_number: ticketNumber,
    };

    // Update item to READY_FOR_RELEASE with stored loan terms
    const { data, error } = await supabaseAdmin
      .from('pawn_items')
      .update({
        inventory_status: 'READY_FOR_RELEASE',
        offered_amount: offered_amount ? Number(offered_amount) : Number(principal_loan),
        storage_location: storage_location?.trim() || null,
        specific_attrs: {
          ...(item.specific_attrs || {}),
          approved_by: req.userId,
          approved_at: new Date().toISOString(),
          loan_terms: loanTerms,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) {
      console.error('[appraisals] approve update error:', error.message);
      return res.status(400).json({ error: 'Unable to approve appraisal.' });
    }

    // Update assessment outcome
    await supabaseAdmin
      .from('appraisal_assessments')
      .update({ outcome: 'APPROVED', offered_amount: offered_amount ? Number(offered_amount) : Number(principal_loan) })
      .eq('item_id', item.id)
      .eq('tenant_id', req.tenantId)
      .eq('outcome', 'PENDING');

    res.status(200).json({ item_id: item.id, loan_terms: loanTerms });
  } catch (err) {
    console.error('[appraisals] approve error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2: Verify the server starts**

Run: `node server/index.js`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes/appraisals.js
git commit -m "feat: approve endpoint stores loan terms without creating ticket, sets READY_FOR_RELEASE"
```

---

## Task 4: Backend — New `/issue` Endpoint + Modify `/decline` + Remove `/appraise` + Update `/stats` and `/queue`

**Files:**
- Modify: `server/routes/appraisals.js`

- [ ] **Step 1: Add the `/issue` endpoint**

Add this new endpoint after the approve handler. Also import `generateReceiptNumber` at the top of the file (line 4):

Update the imports at line 4:
```javascript
const { getPagination, generateTicketNumber, generateReceiptNumber } = require('../utils/helpers');
```

Add the endpoint after the approve handler:

```javascript
// POST /api/appraisals/:id/issue — Cashier issues pawn ticket + disburses cash
router.post('/:id/issue', async (req, res) => {
  if (!isValidUuid(req.params.id)) return res.status(422).json({ error: 'Invalid item id' });
  if (!['OWNER', 'CASHIER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and cashiers can issue pawn tickets' });
  }

  const { remarks } = req.body;

  try {
    const { data: item } = await supabaseAdmin
      .from('pawn_items')
      .select('id, tenant_id, customer_id, branch_id, appraised_value, specific_attrs, inventory_status')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .eq('inventory_status', 'READY_FOR_RELEASE')
      .maybeSingle();

    if (!item) return res.status(404).json({ error: 'Item not found or not in READY_FOR_RELEASE state' });

    const loanTerms = item.specific_attrs?.loan_terms;
    if (!loanTerms) return res.status(422).json({ error: 'No loan terms found. Item must be approved first.' });

    // 1. Create pawn ticket from pre-calculated loan terms
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('pawn_tickets')
      .insert({
        tenant_id: req.tenantId,
        ticket_number: loanTerms.ticket_number,
        customer_id: item.customer_id,
        item_id: item.id,
        appraiser_id: item.specific_attrs.appraised_by || item.specific_attrs.submitted_by,
        issued_by: req.userId,
        principal_loan: loanTerms.principal_loan,
        interest_rate: loanTerms.interest_rate,
        advance_interest: loanTerms.advance_interest,
        service_charge: loanTerms.service_charge,
        net_proceeds: loanTerms.net_proceeds,
        loan_date: loanTerms.loan_date,
        maturity_date: loanTerms.maturity_date,
        expiry_date: loanTerms.expiry_date,
        grace_period_days: loanTerms.grace_period_days,
        next_payment_due_date: loanTerms.next_payment_due_date,
        status: 'ACTIVE',
        renewal_count: 0,
        is_overdue: false,
        consecutive_missed_payments: 0,
      })
      .select()
      .single();

    if (ticketError) {
      console.error('[appraisals] ticket creation error:', ticketError.message);
      return res.status(400).json({ error: 'Unable to create pawn ticket.' });
    }

    // 2. Update item status to VAULT
    await supabaseAdmin
      .from('pawn_items')
      .update({
        inventory_status: 'VAULT',
        specific_attrs: {
          ...(item.specific_attrs || {}),
          issued_by: req.userId,
          issued_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('tenant_id', req.tenantId);

    // 3. Record disbursement transaction
    const receiptNumber = generateReceiptNumber();
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('transactions')
      .insert({
        tenant_id: req.tenantId,
        ticket_id: ticket.id,
        processed_by: req.userId,
        trans_type: 'DISBURSEMENT',
        payment_method: 'CASH',
        principal_paid: loanTerms.net_proceeds,
        interest_paid: 0,
        penalty_paid: 0,
        service_charge_paid: 0,
        months_covered: 0,
        notes: remarks?.trim() || 'Cash disbursement on pawn ticket issuance',
        trans_date: new Date().toISOString(),
        receipt_number: receiptNumber,
      })
      .select()
      .single();

    if (txError) {
      console.error('[appraisals] disbursement transaction error:', txError.message);
      // Ticket was already created — log but don't fail the whole operation
    }

    // 4. Update assessment outcome to ISSUED
    await supabaseAdmin
      .from('appraisal_assessments')
      .update({ outcome: 'ISSUED' })
      .eq('item_id', item.id)
      .eq('tenant_id', req.tenantId)
      .in('outcome', ['PENDING', 'APPROVED']);

    res.status(201).json({ ticket, transaction });
  } catch (err) {
    console.error('[appraisals] issue error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2: Update the `/decline` endpoint to accept `READY_FOR_RELEASE`**

In the decline handler, change the status filter from `'PENDING_APPROVAL'` to accept both states. Also allow CASHIER and MANAGER roles:

Replace the decline handler with:

```javascript
// POST /api/appraisals/:id/decline — Customer declined the offer
router.post('/:id/decline', async (req, res) => {
  if (!isValidUuid(req.params.id)) return res.status(422).json({ error: 'Invalid item id' });
  if (!['OWNER', 'MANAGER', 'CASHIER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { reason } = req.body;

  try {
    const { data, error } = await supabaseAdmin
      .from('pawn_items')
      .update({
        inventory_status: 'DECLINED',
        condition_notes: reason?.trim() || 'Customer declined the offer',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .in('inventory_status', ['PENDING_APPROVAL', 'READY_FOR_RELEASE'])
      .select()
      .single();

    if (error || !data) return res.status(400).json({ error: 'Unable to decline. Item must be in PENDING_APPROVAL or READY_FOR_RELEASE state.' });

    // Update assessment outcome
    await supabaseAdmin
      .from('appraisal_assessments')
      .update({ outcome: 'DECLINED' })
      .eq('item_id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .in('outcome', ['PENDING', 'APPROVED']);

    res.json(data);
  } catch (err) {
    console.error('[appraisals] decline error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 3: Remove the `/appraise` endpoint**

Delete the entire PATCH `/:id/appraise` handler (lines 179-268 in the original file). This endpoint is no longer needed since submit now includes valuation.

- [ ] **Step 4: Update the `/stats` endpoint**

Replace the stats handler with this version that adds `readyForRelease`, removes `pendingAppraisal`, and adds role-scoped stats:

```javascript
// GET /api/appraisals/stats — KPI counts (role-scoped)
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const baseQuery = (status) => supabaseAdmin
      .from('pawn_items')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', req.tenantId)
      .eq('inventory_status', status);

    const [
      { count: pendingApproval },
      { count: readyForRelease },
      { count: rejected },
      { count: declined },
    ] = await Promise.all([
      baseQuery('PENDING_APPROVAL'),
      baseQuery('READY_FOR_RELEASE'),
      baseQuery('REJECTED'),
      baseQuery('DECLINED'),
    ]);

    // Role-scoped counts
    let appraisedToday = 0;
    let approvedToday = 0;
    let issuedToday = 0;

    if (['APPRAISER', 'OWNER'].includes(req.userRole)) {
      // Items submitted by this appraiser today
      const { count } = await supabaseAdmin
        .from('pawn_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', req.tenantId)
        .eq('specific_attrs->>submitted_by', req.userId)
        .gte('created_at', todayISO);
      appraisedToday = count || 0;
    }

    if (['MANAGER', 'OWNER'].includes(req.userRole)) {
      const { count } = await supabaseAdmin
        .from('pawn_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', req.tenantId)
        .in('inventory_status', ['READY_FOR_RELEASE', 'VAULT'])
        .eq('specific_attrs->>approved_by', req.userRole === 'OWNER' ? req.userId : req.userId)
        .gte('updated_at', todayISO);
      approvedToday = count || 0;
    }

    if (['CASHIER', 'OWNER'].includes(req.userRole)) {
      // Tickets issued today
      const { count } = await supabaseAdmin
        .from('pawn_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', req.tenantId)
        .gte('created_at', todayISO);
      issuedToday = count || 0;
    }

    // Cash disbursed today (for cashier)
    let cashDisbursedToday = 0;
    if (['CASHIER', 'OWNER'].includes(req.userRole)) {
      const { data: disbursements } = await supabaseAdmin
        .from('transactions')
        .select('principal_paid')
        .eq('tenant_id', req.tenantId)
        .eq('trans_type', 'DISBURSEMENT')
        .gte('trans_date', todayISO);
      cashDisbursedToday = (disbursements || []).reduce((sum, t) => sum + Number(t.principal_paid || 0), 0);
    }

    res.json({
      pendingApproval: pendingApproval || 0,
      readyForRelease: readyForRelease || 0,
      rejected: rejected || 0,
      declined: declined || 0,
      appraisedToday,
      approvedToday,
      issuedToday,
      cashDisbursedToday,
    });
  } catch (err) {
    console.error('[appraisals] stats error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 5: Update the `/queue` endpoint to include `READY_FOR_RELEASE`**

In the queue handler, update the default status filter to include `READY_FOR_RELEASE`:

Change line 89 from:
```javascript
.in('inventory_status', status ? [status] : ['PENDING_APPRAISAL', 'PENDING_APPROVAL', 'REJECTED', 'DECLINED'])
```
To:
```javascript
.in('inventory_status', status ? [status] : ['PENDING_APPROVAL', 'READY_FOR_RELEASE', 'REJECTED', 'DECLINED'])
```

- [ ] **Step 6: Verify the server starts**

Run: `node server/index.js`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add server/routes/appraisals.js
git commit -m "feat: add /issue endpoint, update /decline for READY_FOR_RELEASE, remove /appraise, update stats/queue"
```

---

## Task 5: Frontend — Update API Layer

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add `issue` method and remove `appraise` from appraisalsApi**

In `src/lib/api.js`, find the `appraisalsApi` object and:
1. Remove the `appraise` method
2. Add the `issue` method

```javascript
export const appraisalsApi = {
  queue: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api(`/appraisals/queue${qs ? `?${qs}` : ''}`);
  },
  stats: () => api('/appraisals/stats'),
  calculate: (data) => api('/appraisals/calculate', { method: 'POST', body: JSON.stringify(data) }),
  submit: (data) => api('/appraisals/submit', { method: 'POST', body: JSON.stringify(data) }),
  approve: (itemId, data) => api(`/appraisals/${itemId}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  reject: (itemId, data) => api(`/appraisals/${itemId}/reject`, { method: 'POST', body: JSON.stringify(data) }),
  decline: (itemId, data) => api(`/appraisals/${itemId}/decline`, { method: 'POST', body: JSON.stringify(data) }),
  issue: (itemId, data) => api(`/appraisals/${itemId}/issue`, { method: 'POST', body: JSON.stringify(data) }),
  assessments: (itemId) => api(`/appraisals/${itemId}/assessments`),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.js
git commit -m "feat: add appraisalsApi.issue(), remove appraise()"
```

---

## Task 6: Frontend — Role-Router in `Appraisals.jsx`

Replace the 1950-line `Appraisals.jsx` with a thin router that renders the correct workspace based on `userRole`.

**Files:**
- Modify: `src/pages/owner/Appraisals.jsx`

- [ ] **Step 1: Replace `Appraisals.jsx` with role router**

Replace the entire file content with:

```jsx
import { useAuth } from '../../context/AuthContext'
import AppraiserWorkspace from './appraisals/AppraiserWorkspace'
import ManagerWorkspace from './appraisals/ManagerWorkspace'
import CashierWorkspace from './appraisals/CashierWorkspace'
import OwnerWorkspace from './appraisals/OwnerWorkspace'

export default function Appraisals() {
  const { profile } = useAuth()
  const role = profile?.role

  switch (role) {
    case 'APPRAISER':
      return <AppraiserWorkspace />
    case 'MANAGER':
      return <ManagerWorkspace />
    case 'CASHIER':
      return <CashierWorkspace />
    case 'OWNER':
    default:
      return <OwnerWorkspace />
  }
}
```

- [ ] **Step 2: Create the `appraisals/` directory**

```bash
mkdir -p src/pages/owner/appraisals
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/Appraisals.jsx
git commit -m "refactor: Appraisals.jsx becomes thin role-router for workspace components"
```

---

## Task 7: Frontend — Appraiser Workspace

The Appraiser sees: KPI cards, a "New Appraisal" button that opens the multi-step form, and a read-only queue of their submitted items.

**Files:**
- Create: `src/pages/owner/appraisals/AppraiserWorkspace.jsx`

- [ ] **Step 1: Create the AppraiserWorkspace component**

This component reuses the existing multi-step form logic from the old `Appraisals.jsx`. It has two views: `list` (dashboard + queue) and `submit` (multi-step form).

```jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { appraisalsApi, customersApi } from '../../../lib/api'

const CATEGORIES = ['JEWELRY', 'VEHICLE', 'GADGET', 'APPLIANCE', 'OTHER']
const CONDITIONS = ['MINT', 'GOOD', 'FAIR', 'POOR']
const KARAT_OPTIONS = [24, 22, 21, 18, 14, 10]

const JEWELRY_ACCESSORIES = {
  NECKLACE: ['Chain', 'Pendant', 'Clasp', 'Box'],
  RING: ['Box', 'Certificate'],
  BRACELET: ['Clasp', 'Box'],
  EARRING: ['Pair', 'Back piece', 'Box'],
  DEFAULT: ['Box', 'Certificate', 'Receipt'],
}

const formatCurrency = (val) => {
  const num = Number(val) || 0
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_STYLES = {
  PENDING_APPROVAL: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'Pending Approval' },
  READY_FOR_RELEASE: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', label: 'Ready for Release' },
  VAULT: { bg: 'bg-primary/10', text: 'text-primary', label: 'Vault' },
  REJECTED: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Rejected' },
  DECLINED: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400', label: 'Declined' },
}

export default function AppraiserWorkspace() {
  const { profile } = useAuth()
  const [view, setView] = useState('list')
  const [stats, setStats] = useState({})
  const [queue, setQueue] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const limit = 10

  // Multi-step form state
  const [step, setStep] = useState(0)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [formData, setFormData] = useState({
    category: '', general_desc: '', item_condition: '', condition_notes: '',
    brand: '', model: '', serial_number: '', weight_grams: '', karat: '',
    accessories: [], appraised_value: '', fair_market_value: '', notes: '',
    // Category-specific gadget/appliance/vehicle fields
    gadget_color: '', storage_capacity: '',
    appliance_brand: '', appliance_model: '', appliance_serial: '', size_capacity: '', wattage: '', appliance_color: '',
    vehicle_make: '', vehicle_model: '', vehicle_year: '', vehicle_color: '', plate_number: '',
    engine_number: '', chassis_number: '', mileage: '', transmission: '', fuel_type: '',
  })
  const [calcResult, setCalcResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const searchTimeout = useRef(null)

  const steps = [
    { id: 'customer', label: 'Customer' },
    { id: 'item', label: 'Item Details' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'review', label: 'Review & Submit' },
  ]

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, queueRes] = await Promise.all([
        appraisalsApi.stats(),
        appraisalsApi.queue({ page, limit }),
      ])
      setStats(statsRes)
      setQueue(queueRes.data || [])
      setTotal(queueRes.total || 0)
    } catch (err) {
      console.error('[AppraiserWorkspace] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchData() }, [fetchData])

  // Customer search with debounce
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) {
      setCustomerResults([])
      return
    }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await customersApi.list({ search: customerSearch, limit: 10 })
        setCustomerResults(res.data || [])
      } catch (err) {
        console.error('[AppraiserWorkspace] customer search error:', err)
      } finally {
        setSearchLoading(false)
      }
    }, 400)
    return () => clearTimeout(searchTimeout.current)
  }, [customerSearch])

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const toggleAccessory = (acc) => {
    setFormData(prev => ({
      ...prev,
      accessories: prev.accessories.includes(acc)
        ? prev.accessories.filter(a => a !== acc)
        : [...prev.accessories, acc],
    }))
  }

  const handleCalculate = async () => {
    if (!formData.weight_grams || !formData.karat) return
    try {
      const result = await appraisalsApi.calculate({
        weight_grams: Number(formData.weight_grams),
        karat: Number(formData.karat),
        item_condition: formData.item_condition || 'GOOD',
      })
      setCalcResult(result)
      if (result.appraised_value) {
        setFormData(prev => ({
          ...prev,
          appraised_value: String(result.appraised_value),
          fair_market_value: String(result.fair_market_value || result.appraised_value),
        }))
      }
    } catch (err) {
      console.error('[AppraiserWorkspace] calculate error:', err)
    }
  }

  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedCustomer
      case 1: return formData.category && formData.item_condition && formData.general_desc.trim()
      case 2: return Number(formData.appraised_value) > 0
      case 3: return true
      default: return false
    }
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const payload = {
        customer_id: selectedCustomer.id,
        category: formData.category,
        general_desc: formData.general_desc.trim(),
        item_condition: formData.item_condition,
        condition_notes: formData.condition_notes?.trim() || null,
        brand: formData.brand?.trim() || null,
        model: formData.model?.trim() || null,
        serial_number: formData.serial_number?.trim() || null,
        weight_grams: formData.weight_grams ? Number(formData.weight_grams) : null,
        karat: formData.karat ? Number(formData.karat) : null,
        accessories: formData.accessories.length > 0 ? formData.accessories : null,
        appraised_value: Number(formData.appraised_value),
        fair_market_value: formData.fair_market_value ? Number(formData.fair_market_value) : null,
        notes: formData.notes?.trim() || null,
        specific_attrs: {
          ...(formData.category === 'GADGET' && { gadget_color: formData.gadget_color, storage_capacity: formData.storage_capacity }),
          ...(formData.category === 'APPLIANCE' && { appliance_brand: formData.appliance_brand, appliance_model: formData.appliance_model, appliance_serial: formData.appliance_serial, size_capacity: formData.size_capacity, wattage: formData.wattage, appliance_color: formData.appliance_color }),
          ...(formData.category === 'VEHICLE' && { vehicle_make: formData.vehicle_make, vehicle_model: formData.vehicle_model, vehicle_year: formData.vehicle_year, vehicle_color: formData.vehicle_color, plate_number: formData.plate_number, engine_number: formData.engine_number, chassis_number: formData.chassis_number, mileage: formData.mileage, transmission: formData.transmission, fuel_type: formData.fuel_type }),
        },
      }
      await appraisalsApi.submit(payload)
      // Reset form and go back to list
      resetForm()
      setView('list')
      fetchData()
    } catch (err) {
      console.error('[AppraiserWorkspace] submit error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setStep(0)
    setSelectedCustomer(null)
    setCustomerSearch('')
    setCustomerResults([])
    setCalcResult(null)
    setFormData({
      category: '', general_desc: '', item_condition: '', condition_notes: '',
      brand: '', model: '', serial_number: '', weight_grams: '', karat: '',
      accessories: [], appraised_value: '', fair_market_value: '', notes: '',
      gadget_color: '', storage_capacity: '',
      appliance_brand: '', appliance_model: '', appliance_serial: '', size_capacity: '', wattage: '', appliance_color: '',
      vehicle_make: '', vehicle_model: '', vehicle_year: '', vehicle_color: '', plate_number: '',
      engine_number: '', chassis_number: '', mileage: '', transmission: '', fuel_type: '',
    })
  }

  // ── Submit View (Multi-Step Form) ──
  if (view === 'submit') {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-heading">New Appraisal</h1>
          <button onClick={() => { resetForm(); setView('list') }} className="btn-secondary text-sm">
            <span className="material-symbols-rounded text-base mr-1">arrow_back</span> Back
          </button>
        </div>

        {/* Step Nav */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {steps.map((s, i) => (
            <button key={s.id} onClick={() => i <= step && setStep(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                ${i === step ? 'bg-primary text-black' : i < step ? 'bg-primary/20 text-primary' : 'bg-surface-alt text-muted'}`}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${i <= step ? 'bg-black/10' : 'bg-neutral-300 dark:bg-neutral-600'}">{i + 1}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Step 0: Customer Selection */}
        {step === 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-heading mb-4">Select Customer</h2>
            <div className="relative">
              <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-muted">search</span>
              <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Search by name, email, or ID..." className="input pl-10 w-full" />
            </div>
            {searchLoading && <p className="text-sm text-muted mt-2">Searching...</p>}
            {customerResults.length > 0 && !selectedCustomer && (
              <div className="mt-2 border border-border rounded-lg max-h-60 overflow-y-auto">
                {customerResults.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerResults([]) }}
                    className="w-full text-left px-4 py-3 hover:bg-surface-alt transition-colors border-b border-border last:border-0">
                    <p className="font-medium text-heading">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-muted">{c.email || c.mobile_number} · {c.id.slice(0, 8)}</p>
                  </button>
                ))}
              </div>
            )}
            {selectedCustomer && (
              <div className="mt-4 p-4 bg-primary/10 rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-semibold text-heading">{selectedCustomer.first_name} {selectedCustomer.last_name}</p>
                  <p className="text-sm text-muted">{selectedCustomer.email || selectedCustomer.mobile_number} · {selectedCustomer.id.slice(0, 8)}</p>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }} className="text-sm text-red-500 hover:underline">Change</button>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Item Details */}
        {step === 1 && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-heading mb-4">Item Details</h2>
            <div>
              <label className="label">Category</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => handleFieldChange('category', cat)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                      ${formData.category === cat ? 'bg-primary text-black' : 'bg-surface-alt text-muted hover:bg-surface-alt/80'}`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Condition</label>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map(cond => (
                  <button key={cond} onClick={() => handleFieldChange('item_condition', cond)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                      ${formData.item_condition === cond ? 'bg-primary text-black' : 'bg-surface-alt text-muted hover:bg-surface-alt/80'}`}>
                    {cond}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <input type="text" value={formData.general_desc} onChange={e => handleFieldChange('general_desc', e.target.value)}
                maxLength={100} placeholder="Brief item description" className="input w-full" />
              <p className="text-xs text-muted mt-1">{formData.general_desc.length}/100</p>
            </div>

            {/* Category-specific fields */}
            {formData.category === 'JEWELRY' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Weight (grams)</label>
                  <input type="number" step="0.01" value={formData.weight_grams}
                    onChange={e => handleFieldChange('weight_grams', e.target.value)} className="input w-full" />
                </div>
                <div>
                  <label className="label">Karat</label>
                  <div className="flex flex-wrap gap-2">
                    {KARAT_OPTIONS.map(k => (
                      <button key={k} onClick={() => handleFieldChange('karat', String(k))}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors
                          ${String(formData.karat) === String(k) ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>
                        {k}K
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {['GADGET', 'APPLIANCE', 'VEHICLE'].includes(formData.category) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Brand</label>
                  <input type="text" value={formData.brand} onChange={e => handleFieldChange('brand', e.target.value)} className="input w-full" />
                </div>
                <div>
                  <label className="label">Model</label>
                  <input type="text" value={formData.model} onChange={e => handleFieldChange('model', e.target.value)} className="input w-full" />
                </div>
                {formData.category !== 'VEHICLE' && (
                  <div>
                    <label className="label">Serial Number</label>
                    <input type="text" value={formData.serial_number} onChange={e => handleFieldChange('serial_number', e.target.value)} className="input w-full" />
                  </div>
                )}
              </div>
            )}

            {formData.category === 'VEHICLE' && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Plate Number</label><input type="text" value={formData.plate_number} onChange={e => handleFieldChange('plate_number', e.target.value)} className="input w-full" /></div>
                <div><label className="label">Engine Number</label><input type="text" value={formData.engine_number} onChange={e => handleFieldChange('engine_number', e.target.value)} className="input w-full" /></div>
                <div><label className="label">Chassis Number</label><input type="text" value={formData.chassis_number} onChange={e => handleFieldChange('chassis_number', e.target.value)} className="input w-full" /></div>
                <div><label className="label">Year</label><input type="number" value={formData.vehicle_year} onChange={e => handleFieldChange('vehicle_year', e.target.value)} className="input w-full" /></div>
                <div><label className="label">Mileage (km)</label><input type="number" value={formData.mileage} onChange={e => handleFieldChange('mileage', e.target.value)} className="input w-full" /></div>
                <div><label className="label">Color</label><input type="text" value={formData.vehicle_color} onChange={e => handleFieldChange('vehicle_color', e.target.value)} className="input w-full" /></div>
              </div>
            )}

            {/* Accessories */}
            {formData.category && (
              <div>
                <label className="label">Accessories</label>
                <div className="flex flex-wrap gap-2">
                  {(formData.category === 'JEWELRY' ? JEWELRY_ACCESSORIES.DEFAULT : ['Box', 'Charger', 'Manual', 'Receipt', 'Warranty Card']).map(acc => (
                    <button key={acc} onClick={() => toggleAccessory(acc)}
                      className={`px-3 py-1.5 rounded text-sm transition-colors
                        ${formData.accessories.includes(acc) ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>
                      {acc}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="label">Condition Notes (optional)</label>
              <textarea value={formData.condition_notes} onChange={e => handleFieldChange('condition_notes', e.target.value)}
                rows={2} className="input w-full" placeholder="Scratches, dents, etc." />
            </div>
          </div>
        )}

        {/* Step 2: Valuation */}
        {step === 2 && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-heading mb-4">Valuation</h2>
            {formData.category === 'JEWELRY' && formData.weight_grams && formData.karat && (
              <div>
                <button onClick={handleCalculate} className="btn-primary text-sm mb-4">
                  <span className="material-symbols-rounded text-base mr-1">calculate</span> Auto-Calculate (Gold)
                </button>
                {calcResult && (
                  <div className="grid grid-cols-2 gap-3 p-4 bg-surface-alt rounded-lg text-sm mb-4">
                    <div><span className="text-muted">Gold Rate:</span> <span className="font-medium">{formatCurrency(calcResult.gold_rate_used || calcResult.rate_per_gram)}/g</span></div>
                    <div><span className="text-muted">Melt Value:</span> <span className="font-medium">{formatCurrency(calcResult.melt_value)}</span></div>
                    <div><span className="text-muted">Purity:</span> <span className="font-medium">{calcResult.purity_decimal_used || calcResult.purity}</span></div>
                    <div><span className="text-muted">Condition Mult:</span> <span className="font-medium">{calcResult.condition_multiplier || calcResult.condition_mult}</span></div>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="label">Appraised Value</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-medium">₱</span>
                <input type="number" step="0.01" value={formData.appraised_value}
                  onChange={e => handleFieldChange('appraised_value', e.target.value)}
                  className="input w-full pl-8" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <textarea value={formData.notes} onChange={e => handleFieldChange('notes', e.target.value)}
                rows={2} className="input w-full" placeholder="Appraisal notes..." />
            </div>
          </div>
        )}

        {/* Step 3: Review & Submit */}
        {step === 3 && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-heading mb-4">Review & Submit</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-surface-alt rounded-lg">
                <p className="text-muted text-xs mb-1">Customer</p>
                <p className="font-medium">{selectedCustomer?.first_name} {selectedCustomer?.last_name}</p>
              </div>
              <div className="p-3 bg-surface-alt rounded-lg">
                <p className="text-muted text-xs mb-1">Category</p>
                <p className="font-medium">{formData.category}</p>
              </div>
              <div className="p-3 bg-surface-alt rounded-lg">
                <p className="text-muted text-xs mb-1">Condition</p>
                <p className="font-medium">{formData.item_condition}</p>
              </div>
              <div className="p-3 bg-surface-alt rounded-lg">
                <p className="text-muted text-xs mb-1">Appraised Value</p>
                <p className="font-medium text-primary">{formatCurrency(formData.appraised_value)}</p>
              </div>
              <div className="col-span-2 p-3 bg-surface-alt rounded-lg">
                <p className="text-muted text-xs mb-1">Description</p>
                <p className="font-medium">{formData.general_desc}</p>
              </div>
              {formData.category === 'JEWELRY' && (
                <>
                  <div className="p-3 bg-surface-alt rounded-lg">
                    <p className="text-muted text-xs mb-1">Weight</p>
                    <p className="font-medium">{formData.weight_grams}g</p>
                  </div>
                  <div className="p-3 bg-surface-alt rounded-lg">
                    <p className="text-muted text-xs mb-1">Karat</p>
                    <p className="font-medium">{formData.karat}K</p>
                  </div>
                </>
              )}
              {formData.accessories.length > 0 && (
                <div className="col-span-2 p-3 bg-surface-alt rounded-lg">
                  <p className="text-muted text-xs mb-1">Accessories</p>
                  <p className="font-medium">{formData.accessories.join(', ')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
            className="btn-secondary text-sm disabled:opacity-40">
            <span className="material-symbols-rounded text-base mr-1">arrow_back</span> Previous
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}
              className="btn-primary text-sm disabled:opacity-40">
              Next <span className="material-symbols-rounded text-base ml-1">arrow_forward</span>
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting || !canProceed()}
              className="btn-primary text-sm disabled:opacity-40">
              {submitting ? 'Submitting...' : 'Submit Appraisal'}
              <span className="material-symbols-rounded text-base ml-1">send</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── List View (Dashboard + Queue) ──
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-heading">Appraiser Workspace</h1>
        <button onClick={() => setView('submit')} className="btn-primary text-sm">
          <span className="material-symbols-rounded text-base mr-1">add_circle</span> New Appraisal
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-primary">rate_review</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.appraisedToday || 0}</p>
              <p className="text-xs text-muted">Appraised Today</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-blue-500">hourglass_top</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.pendingApproval || 0}</p>
              <p className="text-xs text-muted">Pending Approval</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-emerald-500">check_circle</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.approvedToday || 0}</p>
              <p className="text-xs text-muted">Approved</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-red-500">cancel</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.rejected || 0}</p>
              <p className="text-xs text-muted">Rejected</p>
            </div>
          </div>
        </div>
      </div>

      {/* Queue Table (read-only for appraiser) */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-heading">My Submissions</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted">Loading...</div>
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-muted">No appraisals found. Click "New Appraisal" to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt text-left">
                  <th className="px-4 py-3 text-muted font-medium">Item</th>
                  <th className="px-4 py-3 text-muted font-medium">Customer</th>
                  <th className="px-4 py-3 text-muted font-medium">Category</th>
                  <th className="px-4 py-3 text-muted font-medium">Value</th>
                  <th className="px-4 py-3 text-muted font-medium">Status</th>
                  <th className="px-4 py-3 text-muted font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => {
                  const style = STATUS_STYLES[item.inventory_status] || STATUS_STYLES.DECLINED
                  return (
                    <tr key={item.id} className="border-b border-border hover:bg-surface-alt/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-heading">{item.general_desc}</td>
                      <td className="px-4 py-3 text-muted">{item.customers?.first_name} {item.customers?.last_name}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-surface-alt">{item.category}</span></td>
                      <td className="px-4 py-3 font-medium">{item.appraised_value ? formatCurrency(item.appraised_value) : '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>{style.label}</span></td>
                      <td className="px-4 py-3 text-muted">{formatDate(item.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {total > limit && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} className="btn-secondary text-sm disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= total} className="btn-secondary text-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the component renders**

Run: `npm run dev`
Expected: Visiting `/admin/appraisals` as an APPRAISER role shows the Appraiser Workspace with KPI cards and queue table.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/appraisals/AppraiserWorkspace.jsx
git commit -m "feat: add AppraiserWorkspace with multi-step form and read-only queue"
```

---

## Task 8: Frontend — Manager Workspace

The Manager sees: KPI cards, an approval queue of `PENDING_APPROVAL` items, and approve/reject modals.

**Files:**
- Create: `src/pages/owner/appraisals/ManagerWorkspace.jsx`

- [ ] **Step 1: Create the ManagerWorkspace component**

```jsx
import { useState, useEffect, useCallback } from 'react'
import { appraisalsApi } from '../../../lib/api'

const formatCurrency = (val) => {
  const num = Number(val) || 0
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_STYLES = {
  PENDING_APPROVAL: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'Pending Approval' },
  READY_FOR_RELEASE: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', label: 'Ready for Release' },
  VAULT: { bg: 'bg-primary/10', text: 'text-primary', label: 'Vault' },
  REJECTED: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Rejected' },
  DECLINED: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400', label: 'Declined' },
}

export default function ManagerWorkspace() {
  const [stats, setStats] = useState({})
  const [queue, setQueue] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const limit = 10

  // Modal states
  const [approveModal, setApproveModal] = useState({ open: false, item: null })
  const [rejectModal, setRejectModal] = useState({ open: false, item: null })
  const [approveForm, setApproveForm] = useState({ principal_loan: '', offered_amount: '', storage_location: '' })
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const statusFilter = activeTab === 'pending' ? 'PENDING_APPROVAL' : ''
      const [statsRes, queueRes] = await Promise.all([
        appraisalsApi.stats(),
        appraisalsApi.queue({ page, limit, ...(statusFilter && { status: statusFilter }) }),
      ])
      setStats(statsRes)
      setQueue(queueRes.data || [])
      setTotal(queueRes.total || 0)
    } catch (err) {
      console.error('[ManagerWorkspace] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  useEffect(() => { fetchData() }, [fetchData])

  const handleApprove = async () => {
    if (actionLoading || !approveForm.principal_loan) return
    setActionLoading(true)
    try {
      await appraisalsApi.approve(approveModal.item.id, {
        principal_loan: Number(approveForm.principal_loan),
        offered_amount: approveForm.offered_amount ? Number(approveForm.offered_amount) : null,
        storage_location: approveForm.storage_location?.trim() || null,
      })
      setApproveModal({ open: false, item: null })
      setApproveForm({ principal_loan: '', offered_amount: '', storage_location: '' })
      fetchData()
    } catch (err) {
      console.error('[ManagerWorkspace] approve error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (actionLoading) return
    setActionLoading(true)
    try {
      await appraisalsApi.reject(rejectModal.item.id, { reason: rejectReason.trim() })
      setRejectModal({ open: false, item: null })
      setRejectReason('')
      fetchData()
    } catch (err) {
      console.error('[ManagerWorkspace] reject error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const openApproveModal = (item) => {
    setApproveForm({ principal_loan: String(item.appraised_value || ''), offered_amount: '', storage_location: '' })
    setApproveModal({ open: true, item })
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-heading mb-6">Manager Workspace</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-blue-500">pending_actions</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.pendingApproval || 0}</p>
              <p className="text-xs text-muted">Pending Approval</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-emerald-500">check_circle</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.approvedToday || 0}</p>
              <p className="text-xs text-muted">Approved Today</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-red-500">cancel</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.rejected || 0}</p>
              <p className="text-xs text-muted">Rejected</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-amber-500">local_shipping</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.readyForRelease || 0}</p>
              <p className="text-xs text-muted">Ready for Release</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setActiveTab('pending'); setPage(1) }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'pending' ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>
          Approval Queue
        </button>
        <button onClick={() => { setActiveTab('all'); setPage(1) }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>
          All Items
        </button>
      </div>

      {/* Queue Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">Loading...</div>
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-muted">No items in queue.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt text-left">
                  <th className="px-4 py-3 text-muted font-medium">Item</th>
                  <th className="px-4 py-3 text-muted font-medium">Customer</th>
                  <th className="px-4 py-3 text-muted font-medium">Category</th>
                  <th className="px-4 py-3 text-muted font-medium">Appraised Value</th>
                  <th className="px-4 py-3 text-muted font-medium">Status</th>
                  <th className="px-4 py-3 text-muted font-medium">Date</th>
                  <th className="px-4 py-3 text-muted font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => {
                  const style = STATUS_STYLES[item.inventory_status] || STATUS_STYLES.DECLINED
                  return (
                    <tr key={item.id} className="border-b border-border hover:bg-surface-alt/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-heading">{item.general_desc}</td>
                      <td className="px-4 py-3 text-muted">{item.customers?.first_name} {item.customers?.last_name}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-surface-alt">{item.category}</span></td>
                      <td className="px-4 py-3 font-medium">{item.appraised_value ? formatCurrency(item.appraised_value) : '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>{style.label}</span></td>
                      <td className="px-4 py-3 text-muted">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-3">
                        {item.inventory_status === 'PENDING_APPROVAL' && (
                          <div className="flex gap-2">
                            <button onClick={() => openApproveModal(item)} className="text-xs px-3 py-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">Approve</button>
                            <button onClick={() => setRejectModal({ open: true, item })} className="text-xs px-3 py-1.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors">Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > limit && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} className="btn-secondary text-sm disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= total} className="btn-secondary text-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {approveModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setApproveModal({ open: false, item: null })}>
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-heading mb-4">Approve Appraisal</h3>
            <div className="space-y-3 mb-4 text-sm">
              <div className="p-3 bg-surface-alt rounded-lg">
                <p className="text-muted text-xs">Item</p>
                <p className="font-medium">{approveModal.item.general_desc} — {approveModal.item.category}</p>
              </div>
              <div className="p-3 bg-surface-alt rounded-lg">
                <p className="text-muted text-xs">Appraised Value</p>
                <p className="font-medium text-primary">{formatCurrency(approveModal.item.appraised_value)}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Principal Loan Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-medium">₱</span>
                  <input type="number" step="0.01" value={approveForm.principal_loan}
                    onChange={e => setApproveForm(f => ({ ...f, principal_loan: e.target.value }))}
                    className="input w-full pl-8" max={approveModal.item.appraised_value} />
                </div>
                <p className="text-xs text-muted mt-1">Must not exceed appraised value</p>
              </div>
              <div>
                <label className="label">Offered Amount (optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-medium">₱</span>
                  <input type="number" step="0.01" value={approveForm.offered_amount}
                    onChange={e => setApproveForm(f => ({ ...f, offered_amount: e.target.value }))}
                    className="input w-full pl-8" />
                </div>
              </div>
              <div>
                <label className="label">Storage Location (optional)</label>
                <input type="text" value={approveForm.storage_location}
                  onChange={e => setApproveForm(f => ({ ...f, storage_location: e.target.value }))}
                  className="input w-full" placeholder="e.g., Vault A - Shelf 3" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setApproveModal({ open: false, item: null })} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleApprove} disabled={actionLoading || !approveForm.principal_loan || Number(approveForm.principal_loan) > Number(approveModal.item.appraised_value)}
                className="btn-primary text-sm disabled:opacity-40">
                {actionLoading ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRejectModal({ open: false, item: null })}>
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-heading mb-4">Reject Appraisal</h3>
            <p className="text-sm text-muted mb-4">Rejecting: <strong>{rejectModal.item.general_desc}</strong></p>
            <div>
              <label className="label">Reason (optional)</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                rows={3} className="input w-full" placeholder="Reason for rejection..." />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setRejectModal({ open: false, item: null }); setRejectReason('') }} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleReject} disabled={actionLoading}
                className="text-sm px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors">
                {actionLoading ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the component renders**

Run: `npm run dev`
Expected: Visiting `/admin/appraisals` as a MANAGER role shows the Manager Workspace.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/appraisals/ManagerWorkspace.jsx
git commit -m "feat: add ManagerWorkspace with approval queue and approve/reject modals"
```

---

## Task 9: Frontend — Issue Ticket Modal

The cashier issuance modal shows a ticket summary, disbursement record, and confirm button.

**Files:**
- Create: `src/pages/owner/appraisals/IssueTicketModal.jsx`

- [ ] **Step 1: Create the IssueTicketModal component**

```jsx
import { useState } from 'react'
import { appraisalsApi } from '../../../lib/api'

const formatCurrency = (val) => {
  const num = Number(val) || 0
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function IssueTicketModal({ item, onClose, onSuccess }) {
  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(false)

  if (!item) return null

  const loanTerms = item.specific_attrs?.loan_terms
  if (!loanTerms) return null

  const handleIssue = async () => {
    if (loading) return
    setLoading(true)
    try {
      const result = await appraisalsApi.issue(item.id, { remarks: remarks.trim() || null })
      onSuccess(result)
    } catch (err) {
      console.error('[IssueTicketModal] issue error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-heading mb-6">Issue Pawn Ticket</h3>

        {/* Section 1: Ticket Summary */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Ticket Summary</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 bg-surface-alt rounded-lg">
              <p className="text-muted text-xs">Customer</p>
              <p className="font-medium">{item.customers?.first_name} {item.customers?.last_name}</p>
            </div>
            <div className="p-3 bg-surface-alt rounded-lg">
              <p className="text-muted text-xs">Customer ID</p>
              <p className="font-medium font-mono">{item.customer_id?.slice(0, 8)}</p>
            </div>
            <div className="col-span-2 p-3 bg-surface-alt rounded-lg">
              <p className="text-muted text-xs">Item</p>
              <p className="font-medium">{item.general_desc}</p>
              <p className="text-xs text-muted">{item.category} · {item.item_condition}</p>
            </div>
            <div className="p-3 bg-surface-alt rounded-lg">
              <p className="text-muted text-xs">Appraised Value</p>
              <p className="font-medium">{formatCurrency(item.appraised_value)}</p>
            </div>
            <div className="p-3 bg-surface-alt rounded-lg">
              <p className="text-muted text-xs">Ticket Number</p>
              <p className="font-medium font-mono">{loanTerms.ticket_number}</p>
            </div>
          </div>
        </div>

        {/* Loan Details */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Loan Details</h4>
          <div className="bg-surface-alt rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Principal Loan</span><span className="font-medium">{formatCurrency(loanTerms.principal_loan)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Interest Rate</span><span className="font-medium">{loanTerms.interest_rate}% / month</span></div>
            <div className="flex justify-between"><span className="text-muted">Advance Interest</span><span className="font-medium">{formatCurrency(loanTerms.advance_interest)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Service Charge</span><span className="font-medium">{formatCurrency(loanTerms.service_charge)}</span></div>
            <div className="border-t border-border my-2" />
            <div className="flex justify-between text-base"><span className="font-semibold text-heading">Net Proceeds</span><span className="font-bold text-primary">{formatCurrency(loanTerms.net_proceeds)}</span></div>
            <div className="border-t border-border my-2" />
            <div className="flex justify-between"><span className="text-muted">Loan Date</span><span className="font-medium">{formatDate(loanTerms.loan_date)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Maturity Date</span><span className="font-medium">{formatDate(loanTerms.maturity_date)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Expiry Date</span><span className="font-medium">{formatDate(loanTerms.expiry_date)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Grace Period</span><span className="font-medium">{loanTerms.grace_period_days} days</span></div>
          </div>
        </div>

        {/* Section 2: Disbursement Record */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Disbursement</h4>
          <div className="bg-primary/10 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Amount to Disburse</span><span className="font-bold text-primary text-lg">{formatCurrency(loanTerms.net_proceeds)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Payment Method</span><span className="font-medium">CASH</span></div>
          </div>
          <div className="mt-3">
            <label className="label">Remarks (optional)</label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
              rows={2} className="input w-full" placeholder="e.g., Customer received cash" />
          </div>
        </div>

        {/* Section 3: Confirm */}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={handleIssue} disabled={loading}
            className="btn-primary text-sm disabled:opacity-40">
            {loading ? 'Issuing...' : 'Issue Pawn Ticket'}
            <span className="material-symbols-rounded text-base ml-1">receipt_long</span>
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/owner/appraisals/IssueTicketModal.jsx
git commit -m "feat: add IssueTicketModal for cashier pawn ticket issuance"
```

---

## Task 10: Frontend — Cashier Workspace

The Cashier sees: KPI cards, an issuance queue of `READY_FOR_RELEASE` items, and the issue/decline actions.

**Files:**
- Create: `src/pages/owner/appraisals/CashierWorkspace.jsx`

- [ ] **Step 1: Create the CashierWorkspace component**

```jsx
import { useState, useEffect, useCallback } from 'react'
import { appraisalsApi } from '../../../lib/api'
import IssueTicketModal from './IssueTicketModal'
import PawnTicketPrint from './PawnTicketPrint'

const formatCurrency = (val) => {
  const num = Number(val) || 0
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_STYLES = {
  READY_FOR_RELEASE: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', label: 'Ready for Release' },
  VAULT: { bg: 'bg-primary/10', text: 'text-primary', label: 'Issued' },
  DECLINED: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400', label: 'Declined' },
}

export default function CashierWorkspace() {
  const [stats, setStats] = useState({})
  const [queue, setQueue] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('ready')
  const limit = 10

  // Modal states
  const [issueModal, setIssueModal] = useState({ open: false, item: null })
  const [declineModal, setDeclineModal] = useState({ open: false, item: null })
  const [declineReason, setDeclineReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Print state
  const [printTicket, setPrintTicket] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const statusFilter = activeTab === 'ready' ? 'READY_FOR_RELEASE' : ''
      const [statsRes, queueRes] = await Promise.all([
        appraisalsApi.stats(),
        appraisalsApi.queue({ page, limit, ...(statusFilter && { status: statusFilter }) }),
      ])
      setStats(statsRes)
      setQueue(queueRes.data || [])
      setTotal(queueRes.total || 0)
    } catch (err) {
      console.error('[CashierWorkspace] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  useEffect(() => { fetchData() }, [fetchData])

  const handleIssueSuccess = (result) => {
    setIssueModal({ open: false, item: null })
    setPrintTicket(result.ticket)
    fetchData()
  }

  const handleDecline = async () => {
    if (actionLoading) return
    setActionLoading(true)
    try {
      await appraisalsApi.decline(declineModal.item.id, { reason: declineReason.trim() })
      setDeclineModal({ open: false, item: null })
      setDeclineReason('')
      fetchData()
    } catch (err) {
      console.error('[CashierWorkspace] decline error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  // Print view
  if (printTicket) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-4 mb-6 print:hidden">
          <button onClick={() => setPrintTicket(null)} className="btn-secondary text-sm">
            <span className="material-symbols-rounded text-base mr-1">arrow_back</span> Back to Queue
          </button>
          <button onClick={() => window.print()} className="btn-primary text-sm">
            <span className="material-symbols-rounded text-base mr-1">print</span> Print Ticket
          </button>
        </div>
        <PawnTicketPrint ticket={printTicket} item={issueModal.item} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-heading mb-6">Cashier Workspace</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-emerald-500">local_shipping</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.readyForRelease || 0}</p>
              <p className="text-xs text-muted">Ready for Release</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-primary">receipt_long</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{stats.issuedToday || 0}</p>
              <p className="text-xs text-muted">Issued Today</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-blue-500">payments</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{formatCurrency(stats.cashDisbursedToday || 0)}</p>
              <p className="text-xs text-muted">Cash Disbursed Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setActiveTab('ready'); setPage(1) }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'ready' ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>
          Issuance Queue
        </button>
        <button onClick={() => { setActiveTab('all'); setPage(1) }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>
          History
        </button>
      </div>

      {/* Queue Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">Loading...</div>
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-muted">No items in queue.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt text-left">
                  <th className="px-4 py-3 text-muted font-medium">Item</th>
                  <th className="px-4 py-3 text-muted font-medium">Customer</th>
                  <th className="px-4 py-3 text-muted font-medium">Appraised Value</th>
                  <th className="px-4 py-3 text-muted font-medium">Net Proceeds</th>
                  <th className="px-4 py-3 text-muted font-medium">Status</th>
                  <th className="px-4 py-3 text-muted font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => {
                  const style = STATUS_STYLES[item.inventory_status] || STATUS_STYLES.DECLINED
                  const loanTerms = item.specific_attrs?.loan_terms
                  return (
                    <tr key={item.id} className="border-b border-border hover:bg-surface-alt/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-heading">{item.general_desc}</p>
                        <p className="text-xs text-muted">{item.category} · {item.item_condition}</p>
                      </td>
                      <td className="px-4 py-3 text-muted">{item.customers?.first_name} {item.customers?.last_name}</td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(item.appraised_value)}</td>
                      <td className="px-4 py-3 font-medium text-primary">{loanTerms ? formatCurrency(loanTerms.net_proceeds) : '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>{style.label}</span></td>
                      <td className="px-4 py-3">
                        {item.inventory_status === 'READY_FOR_RELEASE' && (
                          <div className="flex gap-2">
                            <button onClick={() => setIssueModal({ open: true, item })}
                              className="text-xs px-3 py-1.5 rounded bg-primary text-black hover:bg-primary/80 transition-colors font-medium">
                              Issue Ticket
                            </button>
                            <button onClick={() => setDeclineModal({ open: true, item })}
                              className="text-xs px-3 py-1.5 rounded bg-neutral-200 dark:bg-neutral-700 text-muted hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors">
                              Decline
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > limit && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} className="btn-secondary text-sm disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= total} className="btn-secondary text-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Issue Ticket Modal */}
      {issueModal.open && (
        <IssueTicketModal
          item={issueModal.item}
          onClose={() => setIssueModal({ open: false, item: null })}
          onSuccess={handleIssueSuccess}
        />
      )}

      {/* Decline Modal */}
      {declineModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeclineModal({ open: false, item: null })}>
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-heading mb-4">Decline Item</h3>
            <p className="text-sm text-muted mb-4">Customer refuses the offer for: <strong>{declineModal.item.general_desc}</strong></p>
            <div>
              <label className="label">Reason (optional)</label>
              <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)}
                rows={3} className="input w-full" placeholder="Reason for decline..." />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setDeclineModal({ open: false, item: null }); setDeclineReason('') }} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleDecline} disabled={actionLoading}
                className="btn-secondary text-sm disabled:opacity-40">
                {actionLoading ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/owner/appraisals/CashierWorkspace.jsx
git commit -m "feat: add CashierWorkspace with issuance queue, issue/decline actions"
```

---

## Task 11: Frontend — Pawn Ticket Print Component

Print-ready pawn ticket with `@media print` CSS, matching the BSP-compliant layout from the spec.

**Files:**
- Create: `src/pages/owner/appraisals/PawnTicketPrint.jsx`

- [ ] **Step 1: Create the PawnTicketPrint component**

```jsx
import { useAuth } from '../../../context/AuthContext'

const formatCurrency = (val) => {
  const num = Number(val) || 0
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function PawnTicketPrint({ ticket, item }) {
  const { profile } = useAuth()
  const tenant = profile?.tenants
  const branch = profile?.branches

  if (!ticket) return null

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .pawn-ticket-print, .pawn-ticket-print * { visibility: visible; }
          .pawn-ticket-print { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>

      <div className="pawn-ticket-print max-w-2xl mx-auto bg-white text-black p-8 border border-neutral-300 rounded-lg text-sm leading-relaxed">
        {/* Header */}
        <div className="text-center border-b-2 border-black pb-4 mb-4">
          <h1 className="text-xl font-bold uppercase">{tenant?.business_name || 'Pawnshop'}</h1>
          {branch && <p className="text-sm">{branch.branch_name} — {branch.city_municipality || ''}</p>}
          {tenant?.bsp_registration_no && <p className="text-xs mt-1">BSP Registration No: {tenant.bsp_registration_no}</p>}
        </div>

        {/* Title */}
        <div className="text-center mb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide">Pawn Ticket</h2>
          <p className="font-mono font-semibold">{ticket.ticket_number}</p>
          <p className="text-xs">{formatDate(ticket.loan_date)}</p>
        </div>

        {/* Pawner Info */}
        <div className="border border-neutral-300 rounded p-3 mb-4">
          <h3 className="text-xs font-bold uppercase text-neutral-500 mb-2">Pawner</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-neutral-500">Name:</span> {item?.customers?.first_name} {item?.customers?.last_name}</div>
            <div><span className="text-neutral-500">Customer ID:</span> <span className="font-mono">{item?.customer_id?.slice(0, 8)}</span></div>
          </div>
        </div>

        {/* Pledged Item */}
        <div className="border border-neutral-300 rounded p-3 mb-4">
          <h3 className="text-xs font-bold uppercase text-neutral-500 mb-2">Pledged Item</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="col-span-2"><span className="text-neutral-500">Description:</span> {item?.general_desc}</div>
            <div><span className="text-neutral-500">Category:</span> {item?.category}</div>
            <div><span className="text-neutral-500">Condition:</span> {item?.item_condition}</div>
            {item?.weight_grams && <div><span className="text-neutral-500">Weight:</span> {item.weight_grams}g</div>}
            {item?.karat && <div><span className="text-neutral-500">Karat:</span> {item.karat}K</div>}
            <div><span className="text-neutral-500">Appraised Value:</span> <strong>{formatCurrency(item?.appraised_value)}</strong></div>
          </div>
        </div>

        {/* Loan Details */}
        <div className="border border-neutral-300 rounded p-3 mb-4">
          <h3 className="text-xs font-bold uppercase text-neutral-500 mb-2">Loan Details</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Principal Loan:</span><span className="font-medium">{formatCurrency(ticket.principal_loan)}</span></div>
            <div className="flex justify-between"><span>Interest Rate:</span><span>{ticket.interest_rate}% / month</span></div>
            <div className="flex justify-between"><span>Advance Interest:</span><span>{formatCurrency(ticket.advance_interest)}</span></div>
            <div className="flex justify-between"><span>Service Charge:</span><span>{formatCurrency(ticket.service_charge)}</span></div>
            <div className="flex justify-between border-t border-neutral-300 pt-1 mt-1 font-bold"><span>Net Proceeds:</span><span>{formatCurrency(ticket.net_proceeds)}</span></div>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between"><span>Loan Date:</span><span>{formatDate(ticket.loan_date)}</span></div>
              <div className="flex justify-between"><span>Maturity Date:</span><span>{formatDate(ticket.maturity_date)}</span></div>
              <div className="flex justify-between"><span>Expiry Date:</span><span>{formatDate(ticket.expiry_date)}</span></div>
              <div className="flex justify-between"><span>Grace Period:</span><span>{ticket.grace_period_days} days</span></div>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-8 mt-8 text-center text-xs">
          <div>
            <div className="border-b border-black mb-1 h-8" />
            <p>Appraiser</p>
          </div>
          <div>
            <div className="border-b border-black mb-1 h-8" />
            <p>Cashier</p>
          </div>
          <div>
            <div className="border-b border-black mb-1 h-8" />
            <p>Customer Signature</p>
          </div>
        </div>

        {/* Legal Footer */}
        <div className="mt-6 pt-4 border-t border-neutral-300 text-[10px] text-neutral-500 text-center leading-tight">
          <p>This pawn ticket is not transferable. Sinumpaang Salaysay: Ang may-ari nito ay nangangako na ang sangla ay kanyang pag-aari at walang ibang may karapatan dito.</p>
          <p className="mt-1">In case of loss, notify the pawnshop immediately. Redemption only upon presentation of this ticket and valid ID.</p>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/owner/appraisals/PawnTicketPrint.jsx
git commit -m "feat: add PawnTicketPrint component with @media print CSS for BSP-compliant ticket"
```

---

## Task 12: Frontend — Owner Workspace

The Owner gets full access to all views and actions across all phases, with combined KPIs.

**Files:**
- Create: `src/pages/owner/appraisals/OwnerWorkspace.jsx`

- [ ] **Step 1: Create the OwnerWorkspace component**

The Owner workspace combines all functionalities: submit appraisals (like Appraiser), approve/reject (like Manager), and issue tickets (like Cashier).

```jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { appraisalsApi, customersApi } from '../../../lib/api'
import IssueTicketModal from './IssueTicketModal'
import PawnTicketPrint from './PawnTicketPrint'

const CATEGORIES = ['JEWELRY', 'VEHICLE', 'GADGET', 'APPLIANCE', 'OTHER']
const CONDITIONS = ['MINT', 'GOOD', 'FAIR', 'POOR']
const KARAT_OPTIONS = [24, 22, 21, 18, 14, 10]

const formatCurrency = (val) => {
  const num = Number(val) || 0
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_STYLES = {
  PENDING_APPROVAL: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'Pending Approval' },
  READY_FOR_RELEASE: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', label: 'Ready for Release' },
  VAULT: { bg: 'bg-primary/10', text: 'text-primary', label: 'Vault' },
  REJECTED: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Rejected' },
  DECLINED: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400', label: 'Declined' },
}

export default function OwnerWorkspace() {
  const { profile } = useAuth()
  const [view, setView] = useState('list')
  const [stats, setStats] = useState({})
  const [queue, setQueue] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const limit = 10

  // Multi-step form state (same as AppraiserWorkspace)
  const [step, setStep] = useState(0)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [formData, setFormData] = useState({
    category: '', general_desc: '', item_condition: '', condition_notes: '',
    brand: '', model: '', serial_number: '', weight_grams: '', karat: '',
    accessories: [], appraised_value: '', fair_market_value: '', notes: '',
    gadget_color: '', storage_capacity: '',
    appliance_brand: '', appliance_model: '', appliance_serial: '', size_capacity: '', wattage: '', appliance_color: '',
    vehicle_make: '', vehicle_model: '', vehicle_year: '', vehicle_color: '', plate_number: '',
    engine_number: '', chassis_number: '', mileage: '', transmission: '', fuel_type: '',
  })
  const [calcResult, setCalcResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const searchTimeout = useRef(null)

  // Modal states
  const [approveModal, setApproveModal] = useState({ open: false, item: null })
  const [rejectModal, setRejectModal] = useState({ open: false, item: null })
  const [issueModal, setIssueModal] = useState({ open: false, item: null })
  const [declineModal, setDeclineModal] = useState({ open: false, item: null })
  const [approveForm, setApproveForm] = useState({ principal_loan: '', offered_amount: '', storage_location: '' })
  const [rejectReason, setRejectReason] = useState('')
  const [declineReason, setDeclineReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [printTicket, setPrintTicket] = useState(null)
  const [printItem, setPrintItem] = useState(null)

  const steps = [
    { id: 'customer', label: 'Customer' },
    { id: 'item', label: 'Item Details' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'review', label: 'Review & Submit' },
  ]

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, queueRes] = await Promise.all([
        appraisalsApi.stats(),
        appraisalsApi.queue({ page, limit, ...(statusFilter && { status: statusFilter }) }),
      ])
      setStats(statsRes)
      setQueue(queueRes.data || [])
      setTotal(queueRes.total || 0)
    } catch (err) {
      console.error('[OwnerWorkspace] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // Customer search
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) { setCustomerResults([]); return }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await customersApi.list({ search: customerSearch, limit: 10 })
        setCustomerResults(res.data || [])
      } catch (err) { console.error(err) }
      finally { setSearchLoading(false) }
    }, 400)
    return () => clearTimeout(searchTimeout.current)
  }, [customerSearch])

  const handleFieldChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  const toggleAccessory = (acc) => {
    setFormData(prev => ({
      ...prev,
      accessories: prev.accessories.includes(acc) ? prev.accessories.filter(a => a !== acc) : [...prev.accessories, acc],
    }))
  }

  const handleCalculate = async () => {
    if (!formData.weight_grams || !formData.karat) return
    try {
      const result = await appraisalsApi.calculate({ weight_grams: Number(formData.weight_grams), karat: Number(formData.karat), item_condition: formData.item_condition || 'GOOD' })
      setCalcResult(result)
      if (result.appraised_value) setFormData(prev => ({ ...prev, appraised_value: String(result.appraised_value), fair_market_value: String(result.fair_market_value || result.appraised_value) }))
    } catch (err) { console.error(err) }
  }

  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedCustomer
      case 1: return formData.category && formData.item_condition && formData.general_desc.trim()
      case 2: return Number(formData.appraised_value) > 0
      case 3: return true
      default: return false
    }
  }

  const resetForm = () => {
    setStep(0); setSelectedCustomer(null); setCustomerSearch(''); setCustomerResults([]); setCalcResult(null)
    setFormData({ category: '', general_desc: '', item_condition: '', condition_notes: '', brand: '', model: '', serial_number: '', weight_grams: '', karat: '', accessories: [], appraised_value: '', fair_market_value: '', notes: '', gadget_color: '', storage_capacity: '', appliance_brand: '', appliance_model: '', appliance_serial: '', size_capacity: '', wattage: '', appliance_color: '', vehicle_make: '', vehicle_model: '', vehicle_year: '', vehicle_color: '', plate_number: '', engine_number: '', chassis_number: '', mileage: '', transmission: '', fuel_type: '' })
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const payload = {
        customer_id: selectedCustomer.id, category: formData.category,
        general_desc: formData.general_desc.trim(), item_condition: formData.item_condition,
        condition_notes: formData.condition_notes?.trim() || null,
        brand: formData.brand?.trim() || null, model: formData.model?.trim() || null,
        serial_number: formData.serial_number?.trim() || null,
        weight_grams: formData.weight_grams ? Number(formData.weight_grams) : null,
        karat: formData.karat ? Number(formData.karat) : null,
        accessories: formData.accessories.length > 0 ? formData.accessories : null,
        appraised_value: Number(formData.appraised_value),
        fair_market_value: formData.fair_market_value ? Number(formData.fair_market_value) : null,
        notes: formData.notes?.trim() || null,
        specific_attrs: {
          ...(formData.category === 'GADGET' && { gadget_color: formData.gadget_color, storage_capacity: formData.storage_capacity }),
          ...(formData.category === 'APPLIANCE' && { appliance_brand: formData.appliance_brand, appliance_model: formData.appliance_model, appliance_serial: formData.appliance_serial, size_capacity: formData.size_capacity, wattage: formData.wattage, appliance_color: formData.appliance_color }),
          ...(formData.category === 'VEHICLE' && { vehicle_make: formData.vehicle_make, vehicle_model: formData.vehicle_model, vehicle_year: formData.vehicle_year, vehicle_color: formData.vehicle_color, plate_number: formData.plate_number, engine_number: formData.engine_number, chassis_number: formData.chassis_number, mileage: formData.mileage, transmission: formData.transmission, fuel_type: formData.fuel_type }),
        },
      }
      await appraisalsApi.submit(payload)
      resetForm(); setView('list'); fetchData()
    } catch (err) { console.error(err) }
    finally { setSubmitting(false) }
  }

  // Action handlers
  const handleApprove = async () => {
    if (actionLoading || !approveForm.principal_loan) return
    setActionLoading(true)
    try {
      await appraisalsApi.approve(approveModal.item.id, {
        principal_loan: Number(approveForm.principal_loan),
        offered_amount: approveForm.offered_amount ? Number(approveForm.offered_amount) : null,
        storage_location: approveForm.storage_location?.trim() || null,
      })
      setApproveModal({ open: false, item: null }); setApproveForm({ principal_loan: '', offered_amount: '', storage_location: '' }); fetchData()
    } catch (err) { console.error(err) }
    finally { setActionLoading(false) }
  }

  const handleReject = async () => {
    if (actionLoading) return
    setActionLoading(true)
    try {
      await appraisalsApi.reject(rejectModal.item.id, { reason: rejectReason.trim() })
      setRejectModal({ open: false, item: null }); setRejectReason(''); fetchData()
    } catch (err) { console.error(err) }
    finally { setActionLoading(false) }
  }

  const handleDecline = async () => {
    if (actionLoading) return
    setActionLoading(true)
    try {
      await appraisalsApi.decline(declineModal.item.id, { reason: declineReason.trim() })
      setDeclineModal({ open: false, item: null }); setDeclineReason(''); fetchData()
    } catch (err) { console.error(err) }
    finally { setActionLoading(false) }
  }

  const handleIssueSuccess = (result) => {
    setPrintItem(issueModal.item)
    setIssueModal({ open: false, item: null })
    setPrintTicket(result.ticket)
    fetchData()
  }

  const openApproveModal = (item) => {
    setApproveForm({ principal_loan: String(item.appraised_value || ''), offered_amount: '', storage_location: '' })
    setApproveModal({ open: true, item })
  }

  const getActions = (item) => {
    const actions = []
    if (item.inventory_status === 'PENDING_APPROVAL') {
      actions.push({ label: 'Approve', color: 'bg-emerald-500 text-white hover:bg-emerald-600', onClick: () => openApproveModal(item) })
      actions.push({ label: 'Reject', color: 'bg-red-500 text-white hover:bg-red-600', onClick: () => setRejectModal({ open: true, item }) })
    }
    if (item.inventory_status === 'READY_FOR_RELEASE') {
      actions.push({ label: 'Issue Ticket', color: 'bg-primary text-black hover:bg-primary/80', onClick: () => setIssueModal({ open: true, item }) })
      actions.push({ label: 'Decline', color: 'bg-neutral-200 dark:bg-neutral-700 text-muted hover:bg-neutral-300', onClick: () => setDeclineModal({ open: true, item }) })
    }
    return actions
  }

  // Print view
  if (printTicket) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-4 mb-6 print:hidden">
          <button onClick={() => { setPrintTicket(null); setPrintItem(null) }} className="btn-secondary text-sm">
            <span className="material-symbols-rounded text-base mr-1">arrow_back</span> Back
          </button>
          <button onClick={() => window.print()} className="btn-primary text-sm">
            <span className="material-symbols-rounded text-base mr-1">print</span> Print Ticket
          </button>
        </div>
        <PawnTicketPrint ticket={printTicket} item={printItem} />
      </div>
    )
  }

  // Submit view (same form as AppraiserWorkspace)
  if (view === 'submit') {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-heading">New Appraisal</h1>
          <button onClick={() => { resetForm(); setView('list') }} className="btn-secondary text-sm">
            <span className="material-symbols-rounded text-base mr-1">arrow_back</span> Back
          </button>
        </div>
        {/* Step Nav */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {steps.map((s, i) => (
            <button key={s.id} onClick={() => i <= step && setStep(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${i === step ? 'bg-primary text-black' : i < step ? 'bg-primary/20 text-primary' : 'bg-surface-alt text-muted'}`}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span> {s.label}
            </button>
          ))}
        </div>
        {/* Step 0: Customer */}
        {step === 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-heading mb-4">Select Customer</h2>
            <div className="relative">
              <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-muted">search</span>
              <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search by name, email, or ID..." className="input pl-10 w-full" />
            </div>
            {searchLoading && <p className="text-sm text-muted mt-2">Searching...</p>}
            {customerResults.length > 0 && !selectedCustomer && (
              <div className="mt-2 border border-border rounded-lg max-h-60 overflow-y-auto">
                {customerResults.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerResults([]) }} className="w-full text-left px-4 py-3 hover:bg-surface-alt transition-colors border-b border-border last:border-0">
                    <p className="font-medium text-heading">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-muted">{c.email || c.mobile_number} · {c.id.slice(0, 8)}</p>
                  </button>
                ))}
              </div>
            )}
            {selectedCustomer && (
              <div className="mt-4 p-4 bg-primary/10 rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-semibold text-heading">{selectedCustomer.first_name} {selectedCustomer.last_name}</p>
                  <p className="text-sm text-muted">{selectedCustomer.email || selectedCustomer.mobile_number}</p>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }} className="text-sm text-red-500 hover:underline">Change</button>
              </div>
            )}
          </div>
        )}
        {/* Step 1: Item */}
        {step === 1 && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-heading mb-4">Item Details</h2>
            <div>
              <label className="label">Category</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (<button key={cat} onClick={() => handleFieldChange('category', cat)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${formData.category === cat ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>{cat}</button>))}
              </div>
            </div>
            <div>
              <label className="label">Condition</label>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map(cond => (<button key={cond} onClick={() => handleFieldChange('item_condition', cond)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${formData.item_condition === cond ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>{cond}</button>))}
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <input type="text" value={formData.general_desc} onChange={e => handleFieldChange('general_desc', e.target.value)} maxLength={100} placeholder="Brief item description" className="input w-full" />
              <p className="text-xs text-muted mt-1">{formData.general_desc.length}/100</p>
            </div>
            {formData.category === 'JEWELRY' && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Weight (grams)</label><input type="number" step="0.01" value={formData.weight_grams} onChange={e => handleFieldChange('weight_grams', e.target.value)} className="input w-full" /></div>
                <div><label className="label">Karat</label><div className="flex flex-wrap gap-2">{KARAT_OPTIONS.map(k => (<button key={k} onClick={() => handleFieldChange('karat', String(k))} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${String(formData.karat) === String(k) ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>{k}K</button>))}</div></div>
              </div>
            )}
            {['GADGET', 'APPLIANCE', 'VEHICLE'].includes(formData.category) && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Brand</label><input type="text" value={formData.brand} onChange={e => handleFieldChange('brand', e.target.value)} className="input w-full" /></div>
                <div><label className="label">Model</label><input type="text" value={formData.model} onChange={e => handleFieldChange('model', e.target.value)} className="input w-full" /></div>
                {formData.category !== 'VEHICLE' && (<div><label className="label">Serial Number</label><input type="text" value={formData.serial_number} onChange={e => handleFieldChange('serial_number', e.target.value)} className="input w-full" /></div>)}
              </div>
            )}
          </div>
        )}
        {/* Step 2: Valuation */}
        {step === 2 && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-heading mb-4">Valuation</h2>
            {formData.category === 'JEWELRY' && formData.weight_grams && formData.karat && (
              <button onClick={handleCalculate} className="btn-primary text-sm mb-4"><span className="material-symbols-rounded text-base mr-1">calculate</span> Auto-Calculate</button>
            )}
            {calcResult && (
              <div className="grid grid-cols-2 gap-3 p-4 bg-surface-alt rounded-lg text-sm mb-4">
                <div><span className="text-muted">Gold Rate:</span> <span className="font-medium">{formatCurrency(calcResult.gold_rate_used || calcResult.rate_per_gram)}/g</span></div>
                <div><span className="text-muted">Melt Value:</span> <span className="font-medium">{formatCurrency(calcResult.melt_value)}</span></div>
              </div>
            )}
            <div>
              <label className="label">Appraised Value</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-medium">₱</span><input type="number" step="0.01" value={formData.appraised_value} onChange={e => handleFieldChange('appraised_value', e.target.value)} className="input w-full pl-8" placeholder="0.00" /></div>
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <textarea value={formData.notes} onChange={e => handleFieldChange('notes', e.target.value)} rows={2} className="input w-full" placeholder="Appraisal notes..." />
            </div>
          </div>
        )}
        {/* Step 3: Review */}
        {step === 3 && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-heading mb-4">Review & Submit</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-surface-alt rounded-lg"><p className="text-muted text-xs mb-1">Customer</p><p className="font-medium">{selectedCustomer?.first_name} {selectedCustomer?.last_name}</p></div>
              <div className="p-3 bg-surface-alt rounded-lg"><p className="text-muted text-xs mb-1">Category</p><p className="font-medium">{formData.category}</p></div>
              <div className="p-3 bg-surface-alt rounded-lg"><p className="text-muted text-xs mb-1">Condition</p><p className="font-medium">{formData.item_condition}</p></div>
              <div className="p-3 bg-surface-alt rounded-lg"><p className="text-muted text-xs mb-1">Appraised Value</p><p className="font-medium text-primary">{formatCurrency(formData.appraised_value)}</p></div>
              <div className="col-span-2 p-3 bg-surface-alt rounded-lg"><p className="text-muted text-xs mb-1">Description</p><p className="font-medium">{formData.general_desc}</p></div>
            </div>
          </div>
        )}
        {/* Nav Buttons */}
        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(s => s - 1)} disabled={step === 0} className="btn-secondary text-sm disabled:opacity-40">
            <span className="material-symbols-rounded text-base mr-1">arrow_back</span> Previous
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="btn-primary text-sm disabled:opacity-40">Next <span className="material-symbols-rounded text-base ml-1">arrow_forward</span></button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting || !canProceed()} className="btn-primary text-sm disabled:opacity-40">{submitting ? 'Submitting...' : 'Submit Appraisal'}</button>
          )}
        </div>
      </div>
    )
  }

  // ── List View ──
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-heading">Appraisals</h1>
        <button onClick={() => setView('submit')} className="btn-primary text-sm">
          <span className="material-symbols-rounded text-base mr-1">add_circle</span> New Appraisal
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center"><span className="material-symbols-rounded text-blue-500">pending_actions</span></div>
            <div><p className="text-2xl font-bold text-heading">{stats.pendingApproval || 0}</p><p className="text-xs text-muted">Pending Approval</p></div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center"><span className="material-symbols-rounded text-emerald-500">local_shipping</span></div>
            <div><p className="text-2xl font-bold text-heading">{stats.readyForRelease || 0}</p><p className="text-xs text-muted">Ready for Release</p></div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center"><span className="material-symbols-rounded text-primary">receipt_long</span></div>
            <div><p className="text-2xl font-bold text-heading">{stats.issuedToday || 0}</p><p className="text-xs text-muted">Issued Today</p></div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center"><span className="material-symbols-rounded text-red-500">cancel</span></div>
            <div><p className="text-2xl font-bold text-heading">{stats.rejected || 0}</p><p className="text-xs text-muted">Rejected</p></div>
          </div>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { value: '', label: 'All' },
          { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
          { value: 'READY_FOR_RELEASE', label: 'Ready for Release' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'DECLINED', label: 'Declined' },
        ].map(f => (
          <button key={f.value} onClick={() => { setStatusFilter(f.value); setPage(1) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${statusFilter === f.value ? 'bg-primary text-black' : 'bg-surface-alt text-muted'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Queue Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">Loading...</div>
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-muted">No items found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt text-left">
                  <th className="px-4 py-3 text-muted font-medium">Item</th>
                  <th className="px-4 py-3 text-muted font-medium">Customer</th>
                  <th className="px-4 py-3 text-muted font-medium">Category</th>
                  <th className="px-4 py-3 text-muted font-medium">Value</th>
                  <th className="px-4 py-3 text-muted font-medium">Status</th>
                  <th className="px-4 py-3 text-muted font-medium">Date</th>
                  <th className="px-4 py-3 text-muted font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => {
                  const style = STATUS_STYLES[item.inventory_status] || STATUS_STYLES.DECLINED
                  const actions = getActions(item)
                  return (
                    <tr key={item.id} className="border-b border-border hover:bg-surface-alt/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-heading">{item.general_desc}</td>
                      <td className="px-4 py-3 text-muted">{item.customers?.first_name} {item.customers?.last_name}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-surface-alt">{item.category}</span></td>
                      <td className="px-4 py-3 font-medium">{item.appraised_value ? formatCurrency(item.appraised_value) : '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>{style.label}</span></td>
                      <td className="px-4 py-3 text-muted">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {actions.map(a => (
                            <button key={a.label} onClick={a.onClick} className={`text-xs px-3 py-1.5 rounded transition-colors font-medium ${a.color}`}>{a.label}</button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > limit && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} className="btn-secondary text-sm disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= total} className="btn-secondary text-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {approveModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setApproveModal({ open: false, item: null })}>
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-heading mb-4">Approve Appraisal</h3>
            <div className="space-y-3 mb-4 text-sm">
              <div className="p-3 bg-surface-alt rounded-lg"><p className="text-muted text-xs">Item</p><p className="font-medium">{approveModal.item.general_desc} — {approveModal.item.category}</p></div>
              <div className="p-3 bg-surface-alt rounded-lg"><p className="text-muted text-xs">Appraised Value</p><p className="font-medium text-primary">{formatCurrency(approveModal.item.appraised_value)}</p></div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Principal Loan Amount *</label>
                <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-medium">₱</span>
                  <input type="number" step="0.01" value={approveForm.principal_loan} onChange={e => setApproveForm(f => ({ ...f, principal_loan: e.target.value }))} className="input w-full pl-8" max={approveModal.item.appraised_value} /></div>
                <p className="text-xs text-muted mt-1">Must not exceed appraised value</p>
              </div>
              <div><label className="label">Offered Amount (optional)</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-medium">₱</span><input type="number" step="0.01" value={approveForm.offered_amount} onChange={e => setApproveForm(f => ({ ...f, offered_amount: e.target.value }))} className="input w-full pl-8" /></div></div>
              <div><label className="label">Storage Location (optional)</label><input type="text" value={approveForm.storage_location} onChange={e => setApproveForm(f => ({ ...f, storage_location: e.target.value }))} className="input w-full" placeholder="e.g., Vault A - Shelf 3" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setApproveModal({ open: false, item: null })} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleApprove} disabled={actionLoading || !approveForm.principal_loan || Number(approveForm.principal_loan) > Number(approveModal.item.appraised_value)} className="btn-primary text-sm disabled:opacity-40">{actionLoading ? 'Approving...' : 'Approve'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRejectModal({ open: false, item: null })}>
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-heading mb-4">Reject Appraisal</h3>
            <p className="text-sm text-muted mb-4">Rejecting: <strong>{rejectModal.item.general_desc}</strong></p>
            <div><label className="label">Reason (optional)</label><textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} className="input w-full" placeholder="Reason for rejection..." /></div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setRejectModal({ open: false, item: null }); setRejectReason('') }} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleReject} disabled={actionLoading} className="text-sm px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors">{actionLoading ? 'Rejecting...' : 'Reject'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Ticket Modal */}
      {issueModal.open && <IssueTicketModal item={issueModal.item} onClose={() => setIssueModal({ open: false, item: null })} onSuccess={handleIssueSuccess} />}

      {/* Decline Modal */}
      {declineModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeclineModal({ open: false, item: null })}>
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-heading mb-4">Decline Item</h3>
            <p className="text-sm text-muted mb-4">Customer refuses the offer for: <strong>{declineModal.item.general_desc}</strong></p>
            <div><label className="label">Reason (optional)</label><textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} rows={3} className="input w-full" placeholder="Reason for decline..." /></div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setDeclineModal({ open: false, item: null }); setDeclineReason('') }} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleDecline} disabled={actionLoading} className="btn-secondary text-sm disabled:opacity-40">{actionLoading ? 'Declining...' : 'Confirm Decline'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the component renders**

Run: `npm run dev`
Expected: Visiting `/admin/appraisals` as OWNER shows the full workspace with all actions available.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/appraisals/OwnerWorkspace.jsx
git commit -m "feat: add OwnerWorkspace with combined views and all phase actions"
```

---

## Task 13: Update Dashboard References

The admin dashboard may reference `pendingAppraisal` stats that no longer exist. Update any dashboard references.

**Files:**
- Modify: `src/pages/owner/AdminDash.jsx` (if it references appraisal stats)
- Modify: `server/routes/dashboard.js` (if it queries `PENDING_APPRAISAL` status)

- [ ] **Step 1: Search for `PENDING_APPRAISAL` references in dashboard files**

Search for `PENDING_APPRAISAL` or `pendingAppraisal` in:
- `src/pages/owner/AdminDash.jsx`
- `server/routes/dashboard.js`

Replace any `PENDING_APPRAISAL` references with `PENDING_APPROVAL` and add `READY_FOR_RELEASE` where appropriate.

- [ ] **Step 2: Search for references in reports and exports**

Check `server/routes/reports.js` and `server/routes/exports.js` for any `PENDING_APPRAISAL` references and update them.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix: update dashboard and reports to use new appraisal statuses"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Verify backend starts cleanly**

Run: `node server/index.js`
Expected: Server starts without errors on port 5000.

- [ ] **Step 2: Verify frontend builds**

Run: `npm run build`
Expected: No compilation errors.

- [ ] **Step 3: Test the complete flow manually**

1. Log in as APPRAISER → submit a new appraisal with valuation → verify it appears in queue as PENDING_APPROVAL
2. Log in as MANAGER → approve the item with loan amount → verify it moves to READY_FOR_RELEASE
3. Log in as CASHIER → issue the ticket → verify pawn ticket is created and item moves to VAULT
4. Verify the print ticket view renders correctly
5. Log in as OWNER → verify all actions are available

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete appraisal workflow redesign with role-based workspaces"
```
