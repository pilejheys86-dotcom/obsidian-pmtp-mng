const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { generateReceiptNumber } = require('../utils/helpers');
const { sendTransactionReceiptEmail } = require('../services/email');
const asyncHandler = require('../utils/asyncHandler');
const { logTenantAudit } = require('../utils/auditLog');

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

  logTenantAudit(req, {
    action: 'LOAN_RENEWED', category: 'LOAN',
    description: 'Renewed loan',
    target_type: 'pawn_ticket', target_id: req.body.ticket_id,
  });

  res.status(201).json({
    ...data,
    receipt_number: txn?.receipt_number || receiptNumber,
    transaction_id: txn?.id || null,
    trans_date: txn?.trans_date || new Date().toISOString(),
  });
});

// GET /api/renewals/history/:ticketId — Renewal chain for a ticket
router.get('/history/:ticketId', asyncHandler(async (req, res) => {
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
  let nameMap = {};
  if (processorIds.length > 0) {
    const { data: names } = await supabaseAdmin.rpc('resolve_user_names', { p_user_ids: processorIds });
    nameMap = names || {};
  }
  items.forEach(t => {
    t.processed_by_name = (nameMap[t.processed_by] || {}).full_name || 'System';
  });

  res.json(items);
}));

module.exports = router;
