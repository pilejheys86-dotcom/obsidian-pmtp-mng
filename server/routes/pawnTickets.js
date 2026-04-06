const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination, generateTicketNumber, buildSearchFilter, sanitizeSearch } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const { logTenantAudit } = require('../utils/auditLog');

// GET /api/pawn-tickets — List pawn tickets with pagination
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search = '', status } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));

  // If search is provided, find matching customer IDs and item IDs first
  // since Supabase .or() can't filter on foreign table columns directly
  const searchTerm = sanitizeSearch(search);
  let matchingCustomerIds = [];
  let matchingItemIds = [];

  if (searchTerm) {
    const [customerRes, itemRes] = await Promise.all([
      supabaseAdmin
        .from('customers')
        .select('id')
        .eq('tenant_id', req.tenantId)
        .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`),
      supabaseAdmin
        .from('pawn_items')
        .select('id')
        .eq('tenant_id', req.tenantId)
        .ilike('general_desc', `%${searchTerm}%`),
    ]);
    matchingCustomerIds = (customerRes.data || []).map(c => c.id);
    matchingItemIds = (itemRes.data || []).map(i => i.id);
  }

  let query = supabaseAdmin
    .from('pawn_tickets')
    .select(`
      *,
      customers(first_name, last_name),
      pawn_items(general_desc, category, appraised_value)
    `, { count: 'exact' })
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (searchTerm) {
    // Build combined OR filter: ticket_number, customer_id (by name match), item_id (by description match)
    const orParts = [`ticket_number.ilike.%${searchTerm}%`];
    if (matchingCustomerIds.length > 0) {
      orParts.push(`customer_id.in.(${matchingCustomerIds.join(',')})`);
    }
    if (matchingItemIds.length > 0) {
      orParts.push(`item_id.in.(${matchingItemIds.join(',')})`);
    }
    query = query.or(orParts.join(','));
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });

  // Resolve appraiser names via RPC
  const tickets = data || [];
  const processorIds = [...new Set(tickets.map(t => t.appraiser_id).filter(Boolean))];
  let nameMap = {};
  if (processorIds.length > 0) {
    const { data: names } = await supabaseAdmin.rpc('resolve_user_names', { p_user_ids: processorIds });
    nameMap = names || {};
  }
  tickets.forEach(t => {
    t.appraiser_name = (nameMap[t.appraiser_id] || {}).full_name || 'Unknown';
  });

  // Enrich with computed fields
  const enriched = tickets.map(t => {
    const now = new Date();
    const maturity = new Date(t.maturity_date);
    const daysUntilMaturity = Math.ceil((maturity - now) / (1000 * 60 * 60 * 24));

    // Calculate interest accrued
    // Minimum 1 month — even on day 1, the current month's interest applies
    const loanDate = new Date(t.loan_date);
    const lastPaid = t.last_payment_date ? new Date(t.last_payment_date) : loanDate;
    const daysSinceLastPayment = Math.max(0, Math.ceil((now - lastPaid) / (1000 * 60 * 60 * 24)));
    const monthsUnpaid = Math.max(1, Math.ceil(daysSinceLastPayment / 30));
    const interestAccrued = Number(t.principal_loan) * (Number(t.interest_rate) / 100) * monthsUnpaid;

    return {
      ...t,
      daysUntilMaturity,
      interestAccrued: interestAccrued.toFixed(2),
      isExpiringSoon: daysUntilMaturity <= 7 && daysUntilMaturity > 0 && t.status === 'ACTIVE',
      isOverdue: daysUntilMaturity < 0 && t.status === 'ACTIVE',
    };
  });

  res.json({ data: enriched, total: count, page: Number(page), limit: Number(limit) });
}));

// GET /api/pawn-tickets/stats — KPI stats
router.get('/stats', async (req, res) => {
  const tenantId = req.tenantId;
  const now = new Date();

  const { count: active } = await supabaseAdmin
    .from('pawn_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'ACTIVE')
    .is('deleted_at', null);

  // Expiring soon (within 7 days)
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  const { count: expiringSoon } = await supabaseAdmin
    .from('pawn_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'ACTIVE')
    .lte('maturity_date', in7Days.toISOString())
    .gte('maturity_date', now.toISOString())
    .is('deleted_at', null);

  // Overdue
  const { count: overdue } = await supabaseAdmin
    .from('pawn_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'ACTIVE')
    .lt('maturity_date', now.toISOString())
    .is('deleted_at', null);

  // Renewed this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: renewedThisMonth } = await supabaseAdmin
    .from('pawn_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'RENEWED')
    .gte('updated_at', startOfMonth.toISOString())
    .is('deleted_at', null);

  res.json({
    active: active || 0,
    expiringSoon: expiringSoon || 0,
    overdue: overdue || 0,
    renewedThisMonth: renewedThisMonth || 0,
  });
});

// GET /api/pawn-tickets/:id — Single ticket with full detail
router.get('/:id', asyncHandler(async (req, res, next) => {
  // Skip non-UUID paths so named routes below (like /overdue) can match
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(req.params.id)) return next();

  const { data, error } = await supabaseAdmin
    .from('pawn_tickets')
    .select(`
      *,
      customers(*),
      pawn_items(*),
      transactions(*),
      notices_log(*)
    `)
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .single();

  if (error) return res.status(404).json({ error: 'Ticket not found' });

  // Resolve appraiser name via RPC
  if (data && data.appraiser_id) {
    const { data: names } = await supabaseAdmin.rpc('resolve_user_names', { p_user_ids: [data.appraiser_id] });
    const nameMap = names || {};
    data.appraiser_name = (nameMap[data.appraiser_id] || {}).full_name || 'Unknown';
  }

  // Resolve KYC documents for customer
  if (data && data.customers) {
    const { data: kycDocs } = await supabaseAdmin
      .from('media')
      .select('*')
      .eq('ref_type', 'CUSTOMER_KYC')
      .eq('ref_id', data.customers.id)
      .is('deleted_at', null);
    data.customers.kyc_documents = kycDocs || [];
  }

  // Resolve item images
  if (data && data.pawn_items) {
    const { data: photos } = await supabaseAdmin
      .from('media')
      .select('*')
      .eq('ref_type', 'ITEM_PHOTO')
      .eq('ref_id', data.pawn_items.id)
      .is('deleted_at', null);
    data.pawn_items.item_images = photos || [];
  }

  res.json(data);
}));

// POST /api/pawn-tickets — Create new pawn ticket
router.post('/', async (req, res) => {
  const {
    customer_id, item_id, appraiser_id,
    principal_loan, interest_rate, advance_interest,
    service_charge, loan_date, maturity_date
  } = req.body;

  const { data, error } = await supabaseAdmin
    .from('pawn_tickets')
    .insert({
      tenant_id: req.tenantId,
      ticket_number: generateTicketNumber(),
      customer_id,
      item_id,
      appraiser_id: appraiser_id || req.userId,
      principal_loan,
      interest_rate,
      advance_interest,
      service_charge,
      loan_date: loan_date || new Date().toISOString(),
      maturity_date,
      status: 'ACTIVE',
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Update item status to VAULT
  await supabaseAdmin
    .from('pawn_items')
    .update({ inventory_status: 'IN_VAULT', updated_at: new Date().toISOString() })
    .eq('id', item_id)
    .eq('tenant_id', req.tenantId);

  logTenantAudit(req, {
    action: 'TICKET_ISSUED', category: 'LOAN',
    description: `Issued pawn ticket ${data.ticket_number} — ₱${Number(data.principal_loan).toLocaleString()}`,
    target_type: 'pawn_ticket', target_id: data.id,
  });

  res.status(201).json(data);
});

// PATCH /api/pawn-tickets/:id — Update ticket (whitelist fields, OWNER/MANAGER only)
router.patch('/:id', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const ALLOWED = new Set(['notes', 'next_payment_due_date', 'grace_period_days']);
  const updates = { updated_at: new Date().toISOString() };
  for (const key of Object.keys(req.body)) {
    if (ALLOWED.has(key)) updates[key] = req.body[key];
  }

  const { data, error } = await supabaseAdmin
    .from('pawn_tickets')
    .update(updates)
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── OVERDUE ENDPOINTS ────────────────────────────────────

// GET /api/pawn-tickets/overdue/stats — Overdue KPIs
router.get('/overdue/stats', async (req, res) => {
  try {
    const { data: settings } = await supabaseAdmin
      .from('tenant_loan_settings')
      .select('grace_period_days')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();
    const graceDays = settings?.grace_period_days || 10;

    const { data: tickets, error } = await supabaseAdmin
      .from('pawn_tickets')
      .select('id, principal_loan, maturity_date')
      .eq('tenant_id', req.tenantId)
      .in('status', ['ACTIVE', 'RENEWED'])
      .lt('maturity_date', new Date().toISOString());

    if (error) return res.status(400).json({ error: 'Unable to fetch overdue stats.' });

    const now = Date.now();
    let inGrace = 0, readyToForfeit = 0, valueAtRisk = 0;
    for (const t of (tickets || [])) {
      const daysOverdue = Math.ceil((now - new Date(t.maturity_date).getTime()) / 86400000);
      valueAtRisk += Number(t.principal_loan) || 0;
      if (daysOverdue >= graceDays) readyToForfeit++;
      else inGrace++;
    }

    res.json({
      totalOverdue: (tickets || []).length,
      inGracePeriod: inGrace,
      readyToForfeit,
      valueAtRisk,
      gracePeriodDays: graceDays,
    });
  } catch (err) {
    console.error('[pawnTickets] overdue stats error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/pawn-tickets/overdue — List overdue tickets
router.get('/overdue', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const { from, to } = getPagination(page, limit);

  try {
    const { data: settings } = await supabaseAdmin
      .from('tenant_loan_settings')
      .select('grace_period_days')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();
    const graceDays = settings?.grace_period_days || 10;

    const { data, error, count } = await supabaseAdmin
      .from('pawn_tickets')
      .select('*, customers(id, first_name, last_name), pawn_items(id, general_desc, category, appraised_value)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .in('status', ['ACTIVE', 'RENEWED'])
      .lt('maturity_date', new Date().toISOString())
      .order('maturity_date', { ascending: true })
      .range(from, to);

    if (error) return res.status(400).json({ error: 'Unable to fetch overdue tickets.' });

    const now = Date.now();
    const enriched = (data || []).map((t) => {
      const daysOverdue = Math.ceil((now - new Date(t.maturity_date).getTime()) / 86400000);
      return {
        ...t,
        days_overdue: daysOverdue,
        grace_period_days: graceDays,
        days_until_forfeit: Math.max(0, graceDays - daysOverdue),
        can_forfeit: daysOverdue >= graceDays,
      };
    });

    res.json({ data: enriched, total: count || 0, page, limit, gracePeriodDays: graceDays });
  } catch (err) {
    console.error('[pawnTickets] overdue list error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pawn-tickets/overdue/:id/forfeit — Manual forfeit
router.post('/overdue/:id/forfeit', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can forfeit items' });
  }

  try {
    const { data: ticket } = await supabaseAdmin
      .from('pawn_tickets')
      .select('id, item_id, principal_loan, interest_rate, maturity_date')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .in('status', ['ACTIVE', 'RENEWED'])
      .maybeSingle();

    if (!ticket) return res.status(404).json({ error: 'Ticket not found or not eligible for forfeiture' });

    // Update ticket
    await supabaseAdmin
      .from('pawn_tickets')
      .update({
        status: 'FORFEITED',
        is_overdue: true,
        forfeited_at: new Date().toISOString(),
        forfeiture_reason: req.body.reason || 'Manual forfeiture after grace period',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.id);

    // Update item
    await supabaseAdmin
      .from('pawn_items')
      .update({
        inventory_status: 'FORFEITED',
        disposition: 'PENDING_REVIEW',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.item_id)
      .eq('tenant_id', req.tenantId);

    // Create forfeiture transaction
    const { generateReceiptNumber } = require('../utils/helpers');
    await supabaseAdmin
      .from('transactions')
      .insert({
        tenant_id: req.tenantId,
        ticket_id: ticket.id,
        processed_by: req.userId,
        trans_type: 'FORFEITURE',
        payment_method: 'CASH',
        principal_paid: 0,
        interest_paid: 0,
        penalty_paid: 0,
        service_charge_paid: 0,
        receipt_number: generateReceiptNumber(),
        trans_date: new Date().toISOString(),
        notes: req.body.reason || 'Forfeited after maturity grace period',
      });

    res.json({ success: true, message: 'Item forfeited successfully' });
  } catch (err) {
    console.error('[pawnTickets] forfeit error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
