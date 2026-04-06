const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { generateReceiptNumber } = require('../utils/helpers');
const { sendTransactionReceiptEmail } = require('../services/email');
const { logTenantAudit } = require('../utils/auditLog');

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

  logTenantAudit(req, {
    action: 'PAYMENT_PROCESSED', category: 'PAYMENT',
    description: `Processed ₱${Number(req.body.amount_paid || 0).toLocaleString()} payment`,
    target_type: 'pawn_ticket', target_id: req.body.ticket_id,
  });

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
    .select('trans_type, payment_method, principal_paid, interest_paid, penalty_paid, service_charge_paid, months_covered, trans_date, receipt_number')
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
