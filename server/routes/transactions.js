const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination, generateReceiptNumber } = require('../utils/helpers');
const { sendTransactionReceiptEmail } = require('../services/email');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/transactions — List transactions
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, trans_type, payment_method } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));

  let query = supabaseAdmin
    .from('transactions')
    .select(`
      *,
      pawn_tickets(ticket_number, customers(first_name, last_name, email))
    `, { count: 'exact' })
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('trans_date', { ascending: false })
    .range(from, to);

  if (trans_type) query = query.eq('trans_type', trans_type);
  if (payment_method) query = query.eq('payment_method', payment_method);

  const { data, error, count } = await query;
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

  res.json({ data: items, total: count, page: Number(page), limit: Number(limit) });
}));

// POST /api/transactions — Create transaction (disbursement, renewal, redemption, auction_sale)
router.post('/', async (req, res) => {
  const {
    ticket_id, trans_type, payment_method,
    principal_paid, interest_paid, penalty_paid
  } = req.body;

  const receiptNumber = generateReceiptNumber();

  const { data: transaction, error } = await supabaseAdmin
    .from('transactions')
    .insert({
      tenant_id: req.tenantId,
      ticket_id,
      processed_by: req.userId,
      trans_type,
      payment_method,
      principal_paid: principal_paid || 0,
      interest_paid: interest_paid || 0,
      penalty_paid: penalty_paid || 0,
      trans_date: new Date().toISOString(),
      receipt_number: receiptNumber,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Update ticket status based on transaction type
  let newTicketStatus = null;
  let newItemStatus = null;

  if (trans_type === 'REDEMPTION') {
    newTicketStatus = 'REDEEMED';
    newItemStatus = 'REDEEMED';
  } else if (trans_type === 'RENEWAL') {
    newTicketStatus = 'RENEWED';
  }

  if (newTicketStatus) {
    await supabaseAdmin
      .from('pawn_tickets')
      .update({ status: newTicketStatus, updated_at: new Date().toISOString() })
      .eq('id', ticket_id)
      .eq('tenant_id', req.tenantId);
  }

  if (newItemStatus) {
    // Get item_id from ticket
    const { data: ticket } = await supabaseAdmin
      .from('pawn_tickets')
      .select('item_id')
      .eq('id', ticket_id)
      .single();

    if (ticket) {
      await supabaseAdmin
        .from('pawn_items')
        .update({ inventory_status: newItemStatus, updated_at: new Date().toISOString() })
        .eq('id', ticket.item_id)
        .eq('tenant_id', req.tenantId);
    }
  }

  // Send receipt email to customer
  const { data: ticketInfo } = await supabaseAdmin
    .from('pawn_tickets')
    .select('customers(first_name, last_name, email)')
    .eq('id', ticket_id)
    .single();

  if (ticketInfo?.customers?.email) {
    try {
      await sendTransactionReceiptEmail(
        ticketInfo.customers.email,
        `${ticketInfo.customers.first_name} ${ticketInfo.customers.last_name}`,
        transaction
      );
    } catch (emailErr) {
      console.error('[EMAIL] Receipt email failed:', emailErr.message);
    }
  }

  res.status(201).json(transaction);
});

// GET /api/transactions/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select(`
      *,
      pawn_tickets(*, customers(*), pawn_items(*))
    `)
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .single();

  if (error) return res.status(404).json({ error: 'Transaction not found' });

  if (data && data.processed_by) {
    const { data: names } = await supabaseAdmin.rpc('resolve_user_names', { p_user_ids: [data.processed_by] });
    const nameMap = names || {};
    data.processed_by_name = (nameMap[data.processed_by] || {}).full_name || 'System';
  }

  res.json(data);
}));

module.exports = router;
