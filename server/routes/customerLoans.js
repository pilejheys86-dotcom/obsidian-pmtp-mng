const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');

router.get('/', async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));
  let query = supabaseAdmin.from('pawn_tickets')
    .select('*, pawn_items(id, general_desc, category)', { count: 'exact' })
    .eq('customer_id', req.customerId).eq('tenant_id', req.activeTenantId)
    .is('deleted_at', null).order('loan_date', { ascending: false }).range(from, to);
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });

  // Fetch media for all pawn_items
  const itemIds = (data || []).map(d => d.pawn_items?.id).filter(Boolean);
  if (itemIds.length > 0) {
    const { data: photos } = await supabaseAdmin.from('media')
      .select('*').eq('ref_type', 'ITEM_PHOTO').in('ref_id', itemIds).is('deleted_at', null);
    (data || []).forEach(ticket => {
      if (ticket.pawn_items) {
        ticket.pawn_items.item_images = (photos || []).filter(p => p.ref_id === ticket.pawn_items.id);
      }
    });
  }

  res.json({ data: data || [], total: count, page: Number(page), limit: Number(limit) });
});

router.get('/:ticketId', async (req, res) => {
  const { data: ticket, error } = await supabaseAdmin.from('pawn_tickets')
    .select('*, pawn_items(*)').eq('id', req.params.ticketId)
    .eq('customer_id', req.customerId).eq('tenant_id', req.activeTenantId).is('deleted_at', null).single();
  if (error || !ticket) return res.status(404).json({ error: 'Loan not found' });

  // Fetch media for the pawn item
  if (ticket.pawn_items?.id) {
    const { data: photos } = await supabaseAdmin.from('media')
      .select('*').eq('ref_type', 'ITEM_PHOTO').eq('ref_id', ticket.pawn_items.id).is('deleted_at', null);
    ticket.pawn_items.item_images = photos || [];
  }

  const { data: payments } = await supabaseAdmin.from('transactions')
    .select('id, trans_type, principal_paid, interest_paid, penalty_paid, trans_date, receipt_number, payment_method')
    .eq('ticket_id', req.params.ticketId).eq('tenant_id', req.activeTenantId)
    .is('deleted_at', null).order('trans_date', { ascending: false });
  res.json({ ticket, payments: payments || [] });
});

module.exports = router;
