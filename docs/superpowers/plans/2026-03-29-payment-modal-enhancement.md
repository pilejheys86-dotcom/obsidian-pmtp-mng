# Payment Modal Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the RenewModal and RedeemModal in ActiveLoans with a 2-step payment flow (form → success receipt), reference number input for non-cash payments, penalty-aware calculations, service charge fix, and email confirmations.

**Architecture:** In-place enhancement of existing modals in `ActiveLoans.jsx`. Backend routes (`payments.js`, `renewals.js`) gain reference number + email sending. One small migration adds `reference_number` column to `transactions`.

**Tech Stack:** React 18, Express.js, Supabase (PostgreSQL), existing `sendTransactionReceiptEmail` email service.

**Spec:** `docs/superpowers/specs/2026-03-29-payment-modal-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `sql/107_transaction_reference_number.sql` | Add `reference_number` column to transactions |
| Modify | `server/routes/payments.js` | Accept `reference_number`, return receipt data, send email |
| Modify | `server/routes/renewals.js` | Accept `reference_number` + payment details, return receipt data, send email |
| Modify | `src/pages/owner/ActiveLoans.jsx` | Enhanced RenewModal, RedeemModal with 2-step flow |

---

## Task 1: Database Migration — Add `reference_number` to transactions

**Files:**
- Create: `sql/107_transaction_reference_number.sql`

- [ ] **Step 1: Create migration file**

Create `sql/107_transaction_reference_number.sql`:

```sql
-- 107: Add reference_number column to transactions for GCash/Bank Transfer tracking
ALTER TABLE transactions
ADD COLUMN reference_number VARCHAR(100) DEFAULT NULL;

COMMENT ON COLUMN transactions.reference_number IS 'External payment reference (GCash ref, bank transfer ref). NULL for cash payments.';
```

- [ ] **Step 2: Run migration against Supabase**

Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor → paste and execute). Verify the column exists:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name = 'reference_number';
```

Expected: one row with `character varying`, `YES`.

- [ ] **Step 3: Commit**

```bash
git add sql/107_transaction_reference_number.sql
git commit -m "feat: add reference_number column to transactions table"
```

---

## Task 2: Backend — Enhance Payments Route

**Files:**
- Modify: `server/routes/payments.js`

- [ ] **Step 1: Add email import and reference_number to POST handler**

In `server/routes/payments.js`, add the email import at top and enhance the POST handler to accept `reference_number`, fetch the created transaction, update its `reference_number`, and send an email.

Replace the entire file with:

```javascript
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { generateReceiptNumber } = require('../utils/helpers');
const { sendTransactionReceiptEmail } = require('../services/email');

// POST /api/payments — Process any payment type via stored procedure
router.post('/', async (req, res) => {
  const { ticket_id, amount_paid, payment_type, payment_method, reference_number, notes } = req.body;

  if (!ticket_id || amount_paid == null || !payment_type || !payment_method) {
    return res.status(400).json({
      error: 'ticket_id, amount_paid, payment_type, and payment_method are required',
    });
  }

  if (Number(amount_paid) <= 0) {
    return res.status(400).json({ error: 'amount_paid must be a positive number' });
  }

  const validTypes = ['INTEREST_ONLY', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION', 'PARTIAL_PAYMENT'];
  if (!validTypes.includes(payment_type)) {
    return res.status(400).json({
      error: `payment_type must be one of: ${validTypes.join(', ')}`,
    });
  }

  const receiptNumber = generateReceiptNumber();

  const { data, error } = await supabaseAdmin.rpc('process_payment', {
    p_ticket_id: ticket_id,
    p_processed_by: req.userId,
    p_amount_paid: amount_paid,
    p_payment_type: payment_type,
    p_payment_method: payment_method,
    p_receipt_number: receiptNumber,
    p_notes: notes || null,
  });

  if (error) return res.status(400).json({ error: error.message });
  if (!data.success) return res.status(422).json({ error: data.error });

  // Fetch the created transaction to get full details + update reference_number
  const { data: txn } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('ticket_id', ticket_id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (txn && reference_number) {
    await supabaseAdmin
      .from('transactions')
      .update({ reference_number })
      .eq('id', txn.id);
  }

  // Send email confirmation (fire-and-forget)
  const { data: ticketInfo } = await supabaseAdmin
    .from('pawn_tickets')
    .select('customers(first_name, last_name, email)')
    .eq('id', ticket_id)
    .single();

  if (ticketInfo?.customers?.email) {
    sendTransactionReceiptEmail(
      ticketInfo.customers.email,
      `${ticketInfo.customers.first_name} ${ticketInfo.customers.last_name}`,
      txn || { receipt_number: receiptNumber, trans_type: payment_type, payment_method, principal_paid: 0, interest_paid: amount_paid, penalty_paid: 0, trans_date: new Date().toISOString() }
    ).catch(err => console.error('[EMAIL] Payment receipt email failed:', err.message));
  }

  res.status(201).json({
    ...data,
    receipt_number: txn?.receipt_number || receiptNumber,
    transaction_id: txn?.id || null,
    trans_date: txn?.trans_date || new Date().toISOString(),
  });
});

// GET /api/payments/summary/:ticketId — Payment summary for a ticket
router.get('/summary/:ticketId', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('trans_type, principal_paid, interest_paid, penalty_paid, months_covered, trans_date')
    .eq('ticket_id', req.params.ticketId)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('trans_date', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });

  const rows = data || [];
  const totalPrincipal = rows.reduce((sum, r) => sum + Number(r.principal_paid), 0);
  const totalInterest = rows.reduce((sum, r) => sum + Number(r.interest_paid), 0);
  const totalPenalty = rows.reduce((sum, r) => sum + Number(r.penalty_paid), 0);
  const totalMonths = rows.reduce((sum, r) => sum + (r.months_covered || 0), 0);

  res.json({
    payments: rows,
    totals: {
      principal_paid: totalPrincipal,
      interest_paid: totalInterest,
      penalty_paid: totalPenalty,
      months_covered: totalMonths,
      total_paid: totalPrincipal + totalInterest + totalPenalty,
    },
  });
});

module.exports = router;
```

- [ ] **Step 2: Verify server starts**

Run: `node server/index.js` (or restart dev server)
Expected: No startup errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes/payments.js
git commit -m "feat: payments route returns receipt data, stores reference_number, sends email"
```

---

## Task 3: Backend — Enhance Renewals Route

**Files:**
- Modify: `server/routes/renewals.js`

- [ ] **Step 1: Enhance POST handler with reference_number, receipt data return, and email**

Replace the entire file with:

```javascript
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { generateReceiptNumber } = require('../utils/helpers');
const { sendTransactionReceiptEmail } = require('../services/email');

// POST /api/renewals — Process a loan renewal via stored procedure
router.post('/', async (req, res) => {
  const { ticket_id, payment_method, reference_number } = req.body;

  if (!ticket_id || !payment_method) {
    return res.status(400).json({ error: 'ticket_id and payment_method are required' });
  }

  const receiptNumber = generateReceiptNumber();

  const { data, error } = await supabaseAdmin.rpc('process_loan_renewal', {
    p_ticket_id: ticket_id,
    p_processed_by: req.userId,
    p_payment_method: payment_method,
    p_receipt_number: receiptNumber,
  });

  if (error) return res.status(400).json({ error: error.message });
  if (!data.success) return res.status(422).json({ error: data.error });

  // Fetch the created transaction to get full details + update reference_number
  const { data: txn } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('ticket_id', ticket_id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (txn && reference_number) {
    await supabaseAdmin
      .from('transactions')
      .update({ reference_number })
      .eq('id', txn.id);
  }

  // Send email confirmation (fire-and-forget)
  const { data: ticketInfo } = await supabaseAdmin
    .from('pawn_tickets')
    .select('customers(first_name, last_name, email)')
    .eq('id', ticket_id)
    .single();

  if (ticketInfo?.customers?.email) {
    sendTransactionReceiptEmail(
      ticketInfo.customers.email,
      `${ticketInfo.customers.first_name} ${ticketInfo.customers.last_name}`,
      txn || { receipt_number: receiptNumber, trans_type: 'RENEWAL', payment_method, principal_paid: 0, interest_paid: 0, penalty_paid: 0, trans_date: new Date().toISOString() }
    ).catch(err => console.error('[EMAIL] Renewal receipt email failed:', err.message));
  }

  res.status(201).json({
    ...data,
    receipt_number: txn?.receipt_number || receiptNumber,
    transaction_id: txn?.id || null,
    trans_date: txn?.trans_date || new Date().toISOString(),
  });
});

// GET /api/renewals/history/:ticketId — Renewal chain for a ticket
router.get('/history/:ticketId', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('ticket_id', req.params.ticketId)
    .eq('tenant_id', req.tenantId)
    .eq('trans_type', 'RENEWAL')
    .is('deleted_at', null)
    .order('trans_date', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  const items = data || [];
  const processorIds = [...new Set(items.map(t => t.processed_by).filter(Boolean))];
  if (processorIds.length > 0) {
    const { data: owners } = await supabaseAdmin.from('tenant_owners')
      .select('id, full_name').in('id', processorIds);
    const { data: emps } = await supabaseAdmin.from('employees')
      .select('id, full_name').in('id', processorIds);
    const nameMap = {};
    (owners || []).forEach(o => nameMap[o.id] = o.full_name);
    (emps || []).forEach(e => nameMap[e.id] = e.full_name);
    items.forEach(t => {
      t.processed_by_name = nameMap[t.processed_by] || 'System';
      t.tenant_users = { full_name: nameMap[t.processed_by] || 'System' };
    });
  }

  res.json(items);
});

module.exports = router;
```

- [ ] **Step 2: Verify server starts**

Run: `node server/index.js`
Expected: No startup errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes/renewals.js
git commit -m "feat: renewals route returns receipt data, stores reference_number, sends email"
```

---

## Task 4: Frontend — Enhance RenewModal with Penalty, Reference Number, and Success Step

**Files:**
- Modify: `src/pages/owner/ActiveLoans.jsx` (lines 400–605)

- [ ] **Step 1: Remove SERVICE_CHARGE constant and update RenewModal props at render site**

In `ActiveLoans.jsx`, find the modal render sites (around line 1054–1065) and add `loanSettings` prop to both modals:

Find:
```jsx
      <RedeemModal
        open={redeemModal.open}
        onClose={() => setRedeemModal({ open: false, loan: null })}
        loan={redeemModal.loan}
        onSuccess={handleModalSuccess}
      />
      <RenewModal
        open={renewModal.open}
        onClose={() => setRenewModal({ open: false, loan: null })}
        loan={renewModal.loan}
        onSuccess={handleModalSuccess}
      />
```

Replace with:
```jsx
      <RedeemModal
        open={redeemModal.open}
        onClose={() => setRedeemModal({ open: false, loan: null })}
        loan={redeemModal.loan}
        loanSettings={loanSettings}
        onSuccess={handleModalSuccess}
      />
      <RenewModal
        open={renewModal.open}
        onClose={() => setRenewModal({ open: false, loan: null })}
        loan={renewModal.loan}
        loanSettings={loanSettings}
        onSuccess={handleModalSuccess}
      />
```

- [ ] **Step 2: Delete the SERVICE_CHARGE constant**

Find and remove this line (line 25-26):
```javascript
// Service charge constant
const SERVICE_CHARGE = 5;
```

- [ ] **Step 3: Replace the entire RenewModal component**

Replace the `RenewModal` component (lines 411–605) with the enhanced version that includes penalty-awareness, reference number input, and 2-step form→success flow:

```jsx
const RenewModal = ({ open, onClose, loan, loanSettings, onSuccess }) => {
  const [step, setStep] = useState('form');
  const [mode, setMode] = useState('principal_interest');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [partialAmount, setPartialAmount] = useState(0);
  const [receiptData, setReceiptData] = useState(null);

  const principal = Number(loan?.principalRaw || 0);
  const interestRate = Number(loan?.interestRateRaw || 0);
  const monthlyInterest = principal * (interestRate / 100);
  const interestAccrued = Number(loan?.interestAccruedRaw || 0);
  const penaltyRate = loanSettings?.penalty_interest_rate ?? 3;

  // Penalty computation
  const computePenaltyAmount = () => {
    if (!loan?.maturityRaw) return 0;
    const now = new Date();
    const maturity = new Date(loan.maturityRaw);
    if (now <= maturity) return 0;
    const overdueMs = now - maturity;
    const overdueMonths = Math.ceil(overdueMs / (30 * 24 * 60 * 60 * 1000));
    return principal * (penaltyRate / 100) * overdueMonths;
  };

  const penaltyAmount = computePenaltyAmount();
  const isOverdue = penaltyAmount > 0;

  useEffect(() => {
    if (open) {
      setStep('form');
      setMode('principal_interest');
      setPaymentMethod('CASH');
      setReferenceNumber('');
      setReceiptData(null);
      setPartialAmount(interestAccrued > 0 ? Math.min(interestAccrued, monthlyInterest) : monthlyInterest);
    }
  }, [open, interestAccrued, monthlyInterest]);

  if (!loan) return null;

  const currentMaturity = new Date(loan.maturityRaw);
  const newMaturity = new Date(currentMaturity);
  newMaturity.setDate(newMaturity.getDate() + 30);
  const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const amountByMode = {
    principal_interest: principal + monthlyInterest + penaltyAmount,
    interest_only: monthlyInterest + penaltyAmount,
    partial_interest: partialAmount + penaltyAmount,
  };
  const totalAmount = amountByMode[mode];

  const paymentTypeByMode = {
    principal_interest: 'RENEWAL',
    interest_only: 'INTEREST_ONLY',
    partial_interest: 'PARTIAL_PAYMENT',
  };

  const needsReference = paymentMethod !== 'CASH';
  const canSubmit = !processing
    && !(mode === 'partial_interest' && partialAmount <= 0)
    && !(needsReference && !referenceNumber.trim());

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      let result;
      if (mode === 'principal_interest') {
        result = await renewalsApi.process({
          ticket_id: loan.rawId,
          payment_method: paymentMethod,
          reference_number: referenceNumber.trim() || undefined,
        });
      } else {
        result = await paymentsApi.process({
          ticket_id: loan.rawId,
          amount_paid: totalAmount,
          payment_type: paymentTypeByMode[mode],
          payment_method: paymentMethod,
          reference_number: referenceNumber.trim() || undefined,
        });
      }
      setReceiptData(result);
      setStep('success');
    } catch (err) {
      console.error('Renewal error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const modeLabels = {
    principal_interest: 'Principal + Interest',
    interest_only: 'Interest Only',
    partial_interest: 'Partial Interest',
  };

  // ── Success Receipt Step ──
  if (step === 'success') {
    return (
      <Modal open={open} onClose={onClose} title="Renewal Successful" size="md">
        <div className="space-y-5">
          {/* Success header */}
          <div className="flex flex-col items-center py-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-3xl text-emerald-500">check_circle</span>
            </div>
            <p className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Payment Processed</p>
            <p className="text-xs text-neutral-500 mt-1">Receipt #{receiptData?.receipt_number || '—'}</p>
          </div>

          {/* Receipt details */}
          <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Ticket</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{loan.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Customer</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{loan.customerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Item</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate ml-4">{loan.itemDescription}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Payment Mode</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{modeLabels[mode]}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            {mode === 'principal_interest' && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Principal</span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{principal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Monthly Interest ({interestRate}%)</span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{monthlyInterest.toLocaleString()}</span>
                </div>
              </>
            )}
            {mode === 'interest_only' && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Monthly Interest ({interestRate}%)</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{monthlyInterest.toLocaleString()}</span>
              </div>
            )}
            {mode === 'partial_interest' && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Partial Payment</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{partialAmount.toLocaleString()}</span>
              </div>
            )}
            {isOverdue && (
              <div className="flex justify-between text-sm">
                <span className="text-red-500 dark:text-red-400">Penalty</span>
                <span className="font-medium text-red-500 dark:text-red-400">{'\u20B1'}{penaltyAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5 flex justify-between items-baseline">
              <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">Total Paid</span>
              <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{'\u20B1'}{totalAmount.toLocaleString()}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Payment Method</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label || paymentMethod}
              </span>
            </div>
            {needsReference && referenceNumber.trim() && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Reference #</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{referenceNumber}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Date</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">New Maturity</span>
              <span className="font-medium text-blue-500">{fmtDate(newMaturity)}</span>
            </div>
          </div>

          <button
            onClick={() => { onClose(); onSuccess(); }}
            className="w-full py-3 text-sm font-bold rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  // ── Payment Form Step ──
  return (
    <Modal open={open} onClose={onClose} title="Renew Pawn Ticket" size="md">
      <div className="space-y-5">
        {/* Loan info */}
        <div className="flex items-center gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-700/50">
          <div className="w-10 h-10 rounded-sm bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-blue-500">autorenew</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 truncate">{loan.id}</p>
            <p className="text-xs text-neutral-500 truncate">{loan.customerName} — {loan.itemDescription}</p>
          </div>
        </div>

        {/* Overdue warning */}
        {isOverdue && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/15 border border-red-200/50 dark:border-red-800/30">
            <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">This loan is overdue. Penalty of {'\u20B1'}{penaltyAmount.toLocaleString()} is included.</p>
          </div>
        )}

        {/* Mode selector — radio cards */}
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-3">Payment Mode</label>
          <div className="space-y-2">
            {RENEW_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-lg border-2 text-left transition-all ${
                  mode === m.key
                    ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10'
                    : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  mode === m.key
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                }`}>
                  <span className="material-symbols-outlined text-lg">{m.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${mode === m.key ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-700 dark:text-neutral-300'}`}>{m.label}</p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{m.desc}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  mode === m.key ? 'border-blue-500' : 'border-neutral-300 dark:border-neutral-600'
                }`}>
                  {mode === m.key && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Partial interest amount input */}
        {mode === 'partial_interest' && (
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Interest Amount to Pay</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">{'\u20B1'}</span>
              <input
                type="number"
                value={partialAmount}
                onChange={(e) => setPartialAmount(Math.max(0, Number(e.target.value)))}
                min={0}
                step={0.01}
                className={`pl-8 pr-3 ${selectClass}`}
              />
            </div>
            {interestAccrued > 0 && (
              <p className="text-[11px] text-neutral-400 mt-1.5">Accumulated interest: {'\u20B1'}{interestAccrued.toLocaleString()}</p>
            )}
          </div>
        )}

        {/* Calculation breakdown */}
        <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
          {mode === 'principal_interest' && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Principal</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{principal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Monthly Interest ({interestRate}%)</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{monthlyInterest.toLocaleString()}</span>
              </div>
            </>
          )}
          {mode === 'interest_only' && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Monthly Interest ({interestRate}%)</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{monthlyInterest.toLocaleString()}</span>
            </div>
          )}
          {mode === 'partial_interest' && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Partial Payment</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{partialAmount.toLocaleString()}</span>
            </div>
          )}
          {isOverdue && (
            <div className="flex justify-between text-sm">
              <span className="text-red-500 dark:text-red-400">Penalty ({penaltyRate}%)</span>
              <span className="font-medium text-red-500 dark:text-red-400">{'\u20B1'}{penaltyAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5 flex justify-between items-baseline">
            <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">Total</span>
            <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{'\u20B1'}{totalAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs pt-1">
            <span className="text-neutral-400">{loan.dueDate}</span>
            <span className="text-neutral-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">arrow_forward</span>
              <span className="text-blue-500 font-semibold">{fmtDate(newMaturity)}</span>
            </span>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Payment Method</label>
          <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setReferenceNumber(''); }} className={selectClass}>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* Reference number (non-cash) */}
        {needsReference && (
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Reference Number</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Enter payment reference number"
              className={selectClass}
            />
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 text-sm font-bold rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
              Processing...
            </span>
          ) : `Pay ${'\u20B1'}${totalAmount.toLocaleString()}`}
        </button>
      </div>
    </Modal>
  );
};
```

- [ ] **Step 4: Verify the app builds**

Run: `npx vite build` (or check dev server for compilation errors)
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/owner/ActiveLoans.jsx
git commit -m "feat: RenewModal with penalty, reference number, and success receipt step"
```

---

## Task 5: Frontend — Enhance RedeemModal with Service Charge Fix, Penalty, Reference Number, and Success Step

**Files:**
- Modify: `src/pages/owner/ActiveLoans.jsx` (lines 608–703)

- [ ] **Step 1: Replace the entire RedeemModal component**

Replace the `RedeemModal` component with:

```jsx
const RedeemModal = ({ open, onClose, loan, loanSettings, onSuccess }) => {
  const [step, setStep] = useState('form');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    if (open) {
      setStep('form');
      setPaymentMethod('CASH');
      setReferenceNumber('');
      setReceiptData(null);
    }
  }, [open]);

  if (!loan) return null;

  const principal = Number(loan.principalRaw || 0);
  const interestAccrued = Number(loan.interestAccruedRaw || 0);
  const serviceChargePct = loanSettings?.service_charge_pct ?? 5;
  const serviceChargeAmount = principal * (serviceChargePct / 100);
  const penaltyRate = loanSettings?.penalty_interest_rate ?? 3;

  // Penalty computation
  const computePenaltyAmount = () => {
    if (!loan.maturityRaw) return 0;
    const now = new Date();
    const maturity = new Date(loan.maturityRaw);
    if (now <= maturity) return 0;
    const overdueMs = now - maturity;
    const overdueMonths = Math.ceil(overdueMs / (30 * 24 * 60 * 60 * 1000));
    return principal * (penaltyRate / 100) * overdueMonths;
  };

  const penaltyAmount = computePenaltyAmount();
  const isOverdue = penaltyAmount > 0;
  const totalDue = principal + interestAccrued + penaltyAmount + serviceChargeAmount;

  const needsReference = paymentMethod !== 'CASH';
  const canSubmit = !processing && !(needsReference && !referenceNumber.trim());

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      const result = await paymentsApi.process({
        ticket_id: loan.rawId,
        amount_paid: totalDue,
        payment_type: 'FULL_REDEMPTION',
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim() || undefined,
      });
      setReceiptData(result);
      setStep('success');
    } catch (err) {
      console.error('Redemption error:', err);
    } finally {
      setProcessing(false);
    }
  };

  // ── Success Receipt Step ──
  if (step === 'success') {
    return (
      <Modal open={open} onClose={onClose} title="Redemption Successful" size="sm">
        <div className="space-y-5">
          {/* Success header */}
          <div className="flex flex-col items-center py-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-3xl text-emerald-500">check_circle</span>
            </div>
            <p className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Item Redeemed</p>
            <p className="text-xs text-neutral-500 mt-1">Receipt #{receiptData?.receipt_number || '—'}</p>
          </div>

          {/* Receipt details */}
          <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Ticket</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{loan.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Customer</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{loan.customerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Item</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate ml-4">{loan.itemDescription}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Principal</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{principal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Interest Accrued</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{interestAccrued.toLocaleString()}</span>
            </div>
            {isOverdue && (
              <div className="flex justify-between text-sm">
                <span className="text-red-500 dark:text-red-400">Penalty ({penaltyRate}%)</span>
                <span className="font-medium text-red-500 dark:text-red-400">{'\u20B1'}{penaltyAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Service Charge ({serviceChargePct}%)</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{serviceChargeAmount.toLocaleString()}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5 flex justify-between items-baseline">
              <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">Total Paid</span>
              <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{'\u20B1'}{totalDue.toLocaleString()}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Payment Method</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label || paymentMethod}
              </span>
            </div>
            {needsReference && referenceNumber.trim() && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Reference #</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{referenceNumber}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Date</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
          </div>

          <button
            onClick={() => { onClose(); onSuccess(); }}
            className="w-full py-3 text-sm font-bold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  // ── Payment Form Step ──
  return (
    <Modal open={open} onClose={onClose} title="Redeem Pawn Ticket" size="sm">
      <div className="space-y-5">
        {/* Loan info */}
        <div className="flex items-center gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-700/50">
          <div className="w-10 h-10 rounded-sm bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-emerald-500">redeem</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 truncate">{loan.id}</p>
            <p className="text-xs text-neutral-500 truncate">{loan.customerName} — {loan.itemDescription}</p>
          </div>
        </div>

        {/* Mode label */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200/50 dark:border-emerald-800/30">
          <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Full payment of principal + accumulated interest</p>
        </div>

        {/* Overdue warning */}
        {isOverdue && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/15 border border-red-200/50 dark:border-red-800/30">
            <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">This loan is overdue. Penalty of {'\u20B1'}{penaltyAmount.toLocaleString()} is included.</p>
          </div>
        )}

        {/* Calculation breakdown */}
        <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">Principal</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{principal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">Interest Accrued</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{interestAccrued.toLocaleString()}</span>
          </div>
          {isOverdue && (
            <div className="flex justify-between text-sm">
              <span className="text-red-500 dark:text-red-400">Penalty ({penaltyRate}%)</span>
              <span className="font-medium text-red-500 dark:text-red-400">{'\u20B1'}{penaltyAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">Service Charge ({serviceChargePct}%)</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{serviceChargeAmount.toLocaleString()}</span>
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5 flex justify-between items-baseline">
            <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">Total Due</span>
            <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{'\u20B1'}{totalDue.toLocaleString()}</span>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Payment Method</label>
          <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setReferenceNumber(''); }} className={selectClass}>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* Reference number (non-cash) */}
        {needsReference && (
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Reference Number</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Enter payment reference number"
              className={selectClass}
            />
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 text-sm font-bold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
              Processing...
            </span>
          ) : `Redeem — ${'\u20B1'}${totalDue.toLocaleString()}`}
        </button>
      </div>
    </Modal>
  );
};
```

- [ ] **Step 2: Verify the app builds**

Run: `npx vite build`
Expected: No errors. The `SERVICE_CHARGE` constant was removed in Task 4 Step 2.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/ActiveLoans.jsx
git commit -m "feat: RedeemModal with service charge %, penalty, reference number, and success receipt"
```

---

## Task 6: Manual Smoke Test

- [ ] **Step 1: Test RenewModal — Cash payment**

1. Open Active Loans → click a loan → click "Renew"
2. Select "Principal + Interest" mode
3. Payment method = Cash
4. Verify no reference number field appears
5. Click "Pay" → verify success receipt shows with receipt number, breakdown, date
6. Click "Done" → verify modal closes and list refreshes

- [ ] **Step 2: Test RenewModal — GCash payment**

1. Open the same flow, select GCash
2. Verify reference number field appears
3. Verify submit is disabled until reference is entered
4. Enter a reference, submit → verify success receipt shows reference number

- [ ] **Step 3: Test RedeemModal — Verify service charge is percentage**

1. Open a loan → click "Redeem"
2. Verify service charge line shows percentage (e.g., "Service Charge (5%)") with computed peso amount
3. Verify total = principal + interest + service charge (+ penalty if overdue)

- [ ] **Step 4: Test overdue loan — Penalty display**

1. Find or create an overdue loan (past maturity date)
2. Open renewal modal → verify penalty row appears in red
3. Verify total includes penalty
4. Open redeem modal → verify same penalty row

- [ ] **Step 5: Commit final verification**

```bash
git add -A
git commit -m "chore: manual smoke test verified for payment modal enhancements"
```

(Only if there were any fixes during testing.)
