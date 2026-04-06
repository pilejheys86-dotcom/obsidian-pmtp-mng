const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');
const { sendLoanNoticeEmail } = require('../services/email');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/notices — List notices
router.get('/', async (req, res) => {
  const { page = 1, limit = 10, notice_type, status } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));

  let query = supabaseAdmin
    .from('notices_log')
    .select(`
      *,
      pawn_tickets(ticket_number, customers(first_name, last_name, email))
    `, { count: 'exact' })
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .range(from, to);

  if (notice_type) query = query.eq('notice_type', notice_type);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });

  res.json({ data: data || [], total: count, page: Number(page), limit: Number(limit) });
});

// POST /api/notices — Send a notice
router.post('/', async (req, res) => {
  const { ticket_id, notice_type, delivery_method } = req.body;

  // Get ticket and customer info
  const { data: ticket } = await supabaseAdmin
    .from('pawn_tickets')
    .select('ticket_number, maturity_date, customers(first_name, last_name, email)')
    .eq('id', ticket_id)
    .eq('tenant_id', req.tenantId)
    .single();

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  let deliveryStatus = 'PENDING';

  // If delivery method is EMAIL, send via NodeMailer
  if (delivery_method === 'EMAIL' && ticket.customers?.email) {
    try {
      await sendLoanNoticeEmail(
        ticket.customers.email,
        `${ticket.customers.first_name} ${ticket.customers.last_name}`,
        notice_type,
        ticket.ticket_number,
        { maturityDate: ticket.maturity_date }
      );
      deliveryStatus = 'DELIVERED';
    } catch (emailErr) {
      console.error('[EMAIL] Notice delivery failed:', emailErr.message);
      deliveryStatus = 'FAILED';
    }
  }

  const { data: notice, error } = await supabaseAdmin
    .from('notices_log')
    .insert({
      tenant_id: req.tenantId,
      ticket_id,
      notice_type,
      delivery_method,
      sent_at: new Date().toISOString(),
      status: deliveryStatus,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(notice);
});

// POST /api/notices/auto-check — Run auto-notice check for expiring/overdue tickets
router.post('/auto-check', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  // Find tickets maturing in 7 days (MATURITY_WARNING)
  const { data: maturingTickets } = await supabaseAdmin
    .from('pawn_tickets')
    .select('id, ticket_number, maturity_date, customers(first_name, last_name, email)')
    .eq('tenant_id', tenantId)
    .eq('status', 'ACTIVE')
    .lte('maturity_date', in7Days.toISOString())
    .gte('maturity_date', now.toISOString())
    .is('deleted_at', null);

  const ticketIds = (maturingTickets || []).map(t => t.id);
  let noticesCreated = 0;
  if (ticketIds.length > 0) {
    const { data: result, error } = await supabaseAdmin.rpc('batch_send_notices', {
      p_tenant_id: tenantId,
      p_ticket_ids: ticketIds,
      p_notice_type: 'MATURITY_WARNING',
      p_delivery_method: 'IN_APP',
    });
    if (error) return res.status(400).json({ error: error.message });
    noticesCreated = result?.notices_created || 0;
  }

  res.json({ processed: ticketIds.length, notices_created: noticesCreated });
}));

module.exports = router;
