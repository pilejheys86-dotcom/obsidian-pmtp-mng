const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/reports/loans — Loan reports
router.get('/loans', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { period = '30' } = req.query; // days

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(period));

  // Loan volume
  const { count: totalLoans } = await supabaseAdmin
    .from('pawn_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('loan_date', startDate.toISOString())
    .is('deleted_at', null);

  // Redemption rate
  const { count: redeemed } = await supabaseAdmin
    .from('pawn_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'REDEEMED')
    .gte('updated_at', startDate.toISOString())
    .is('deleted_at', null);

  // Default/forfeited rate
  const { count: forfeited } = await supabaseAdmin
    .from('pawn_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'FORFEITED')
    .gte('updated_at', startDate.toISOString())
    .is('deleted_at', null);

  const { count: expired } = await supabaseAdmin
    .from('pawn_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'EXPIRED')
    .gte('updated_at', startDate.toISOString())
    .is('deleted_at', null);

  res.json({
    period: Number(period),
    totalLoans: totalLoans || 0,
    redeemed: redeemed || 0,
    forfeited: forfeited || 0,
    expired: expired || 0,
    redemptionRate: totalLoans ? ((redeemed / totalLoans) * 100).toFixed(1) : 0,
    defaultRate: totalLoans ? (((forfeited + expired) / totalLoans) * 100).toFixed(1) : 0,
  });
}));

// GET /api/reports/revenue — Revenue reports
router.get('/revenue', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { period = '30' } = req.query;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(period));

  const { data: transactions } = await supabaseAdmin
    .from('transactions')
    .select('trans_type, principal_paid, interest_paid, penalty_paid')
    .eq('tenant_id', tenantId)
    .gte('trans_date', startDate.toISOString())
    .is('deleted_at', null);

  const revenue = {
    totalInterest: 0,
    totalPenalties: 0,
    totalDisbursed: 0,
    totalRedeemed: 0,
    totalAuctionSales: 0,
  };

  (transactions || []).forEach(t => {
    revenue.totalInterest += Number(t.interest_paid);
    revenue.totalPenalties += Number(t.penalty_paid);

    if (t.trans_type === 'DISBURSEMENT') {
      revenue.totalDisbursed += Number(t.principal_paid);
    } else if (t.trans_type === 'REDEMPTION') {
      revenue.totalRedeemed += Number(t.principal_paid);
    } else if (t.trans_type === 'AUCTION_SALE') {
      revenue.totalAuctionSales += Number(t.principal_paid);
    }
  });

  res.json({ period: Number(period), ...revenue });
}));

// GET /api/reports/customers — Customer reports
router.get('/customers', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  // Risk distribution
  const { data: riskDist } = await supabaseAdmin.rpc('get_risk_distribution', { p_tenant_id: tenantId });

  res.json({ riskDistribution: riskDist });
}));

// GET /api/reports/inventory — Inventory reports
router.get('/inventory', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const { data: catDist } = await supabaseAdmin.rpc('get_category_distribution', { p_tenant_id: tenantId });

  res.json({ categoryDistribution: catDist });
}));

// GET /api/reports/daily-transactions — Daily transaction summary
router.get('/daily-transactions', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { branch_id } = req.query;
  const dateParam = req.query.date || new Date().toISOString().slice(0, 10);

  const dayStart = new Date(`${dateParam}T00:00:00.000Z`).toISOString();
  const dayEnd   = new Date(`${dateParam}T23:59:59.999Z`).toISOString();

  try {
    let query = supabaseAdmin
      .from('transactions')
      .select(`
        id, trans_type, principal_paid, interest_paid, penalty_paid,
        amount_paid, trans_date, created_at, notes,
        pawn_tickets (
          id, ticket_number, branch_id,
          pawn_items ( item_name, category ),
          customers ( first_name, last_name )
        ),
        tenant_users ( full_name )
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const { data: transactions, error } = await query;
    if (error) throw error;

    const rows = transactions || [];

    // Apply branch filter in JS (branch_id is on pawn_tickets)
    const filtered = branch_id
      ? rows.filter(t => t.pawn_tickets?.branch_id === branch_id)
      : rows;

    const summary = filtered.reduce(
      (acc, t) => {
        acc.transaction_count += 1;
        const principal = Number(t.principal_paid || 0);
        const interest  = Number(t.interest_paid  || 0);
        const penalty   = Number(t.penalty_paid   || 0);
        acc.total_interest  += interest;
        acc.total_penalties += penalty;
        if (t.trans_type === 'DISBURSEMENT') acc.total_disbursed    += principal;
        if (t.trans_type === 'PAYMENT')      acc.total_collected    += principal + interest + penalty;
        if (t.trans_type === 'REDEMPTION')   acc.total_redemptions  += principal + interest + penalty;
        return acc;
      },
      { total_disbursed: 0, total_collected: 0, total_interest: 0, total_penalties: 0, total_redemptions: 0, transaction_count: 0 }
    );

    res.json({ transactions: filtered, summary });
  } catch (err) {
    console.error('[REPORTS] daily-transactions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch daily transactions' });
  }
}));

// GET /api/reports/overdue-loans — Active loans that are overdue or expiring soon
router.get('/overdue-loans', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { branch_id } = req.query;

  try {
    let query = supabaseAdmin
      .from('pawn_tickets')
      .select(`
        id, ticket_number, loan_amount, maturity_date, status, created_at,
        pawn_items ( item_name, category, appraised_value ),
        customers ( id, first_name, last_name, mobile_number ),
        branches ( id, branch_name )
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .order('maturity_date', { ascending: true });

    if (branch_id) query = query.eq('branch_id', branch_id);

    const { data: loans, error } = await query;
    if (error) throw error;

    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const enriched = (loans || []).map(loan => {
      const maturity = new Date(loan.maturity_date);
      const msPerDay = 1000 * 60 * 60 * 24;
      const diffDays = Math.floor((now - maturity) / msPerDay);
      let overdue_category = null;

      if (maturity < now) {
        overdue_category = 'OVERDUE';
      } else if (maturity <= sevenDaysOut) {
        overdue_category = 'EXPIRING_SOON';
      }

      return {
        ...loan,
        days_overdue: Math.max(0, diffDays),
        overdue_category,
      };
    }).filter(l => l.overdue_category !== null);

    const summary = enriched.reduce(
      (acc, l) => {
        if (l.overdue_category === 'OVERDUE')        acc.total_overdue        += 1;
        if (l.overdue_category === 'EXPIRING_SOON')  acc.total_expiring_soon  += 1;
        acc.total_at_risk_value += Number(l.loan_amount || 0);
        return acc;
      },
      { total_overdue: 0, total_expiring_soon: 0, total_at_risk_value: 0 }
    );

    res.json({ loans: enriched, summary });
  } catch (err) {
    console.error('[REPORTS] overdue-loans error:', err.message);
    res.status(500).json({ error: 'Failed to fetch overdue loans' });
  }
}));

// GET /api/reports/branch-comparison — Per-branch performance comparison
router.get('/branch-comparison', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const period = parseInt(req.query.period) || 30;

  const since = new Date();
  since.setDate(since.getDate() - period);
  const startDate = since.toISOString();
  const endDate = new Date().toISOString();

  try {
    const { data: branches } = await supabaseAdmin.rpc('get_branch_comparison', {
      p_tenant_id: tenantId,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    });

    res.json({ branches });
  } catch (err) {
    console.error('[REPORTS] branch-comparison error:', err.message);
    res.status(500).json({ error: 'Failed to fetch branch comparison' });
  }
}));

// GET /api/reports/customer-history — Full loan history for a customer
router.get('/customer-history', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { customer_id } = req.query;

  if (!customer_id) {
    return res.status(400).json({ error: 'customer_id is required' });
  }

  try {
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('id, first_name, last_name, mobile_number, email, risk_rating, total_loans, created_at')
      .eq('tenant_id', tenantId)
      .eq('id', customer_id)
      .is('deleted_at', null)
      .single();

    if (custErr || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { data: rawTickets, error: ticketErr } = await supabaseAdmin
      .from('pawn_tickets')
      .select(`
        id, ticket_number, loan_amount, interest_rate, maturity_date,
        loan_date, status, created_at,
        pawn_items ( item_name, category, appraised_value ),
        branches ( branch_name )
      `)
      .eq('tenant_id', tenantId)
      .eq('customer_id', customer_id)
      .is('deleted_at', null)
      .order('loan_date', { ascending: false });

    if (ticketErr) throw ticketErr;

    // Fetch transactions for each ticket
    const tickets = await Promise.all((rawTickets || []).map(async (ticket) => {
      const { data: transactions } = await supabaseAdmin
        .from('transactions')
        .select('id, trans_type, principal_paid, interest_paid, penalty_paid, amount_paid, trans_date, notes')
        .eq('tenant_id', tenantId)
        .eq('pawn_ticket_id', ticket.id)
        .is('deleted_at', null)
        .order('trans_date', { ascending: true });

      return { ...ticket, transactions: transactions || [] };
    }));

    const totals = tickets.reduce(
      (acc, ticket) => {
        acc.total_borrowed += Number(ticket.loan_amount || 0);
        if (ticket.status === 'ACTIVE')    acc.active_loans    += 1;
        if (ticket.status === 'REDEEMED')  acc.redeemed_loans  += 1;
        if (ticket.status === 'FORFEITED') acc.forfeited_loans += 1;
        ticket.transactions.forEach(t => {
          acc.total_interest_paid  += Number(t.interest_paid  || 0);
          acc.total_penalties_paid += Number(t.penalty_paid   || 0);
        });
        return acc;
      },
      { total_borrowed: 0, total_interest_paid: 0, total_penalties_paid: 0, active_loans: 0, redeemed_loans: 0, forfeited_loans: 0 }
    );

    res.json({ customer, tickets, totals });
  } catch (err) {
    console.error('[REPORTS] customer-history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch customer history' });
  }
}));

module.exports = router;

