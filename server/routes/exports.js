const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const auth = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const superAdminScope = require('../middleware/superAdminScope');
const { toCsv } = require('../utils/csvHelper');

function sendCsv(res, filename, headers, rows) {
  const csv = toCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// ── Tenant Exports ──────────────────────────────────────────────────────────

// GET /api/exports/daily-transactions
router.get('/daily-transactions', auth, tenantScope, async (req, res) => {
  const tenantId = req.tenantId;
  const { branch_id } = req.query;
  const dateParam = req.query.date || new Date().toISOString().slice(0, 10);
  const dayStart  = new Date(`${dateParam}T00:00:00.000Z`).toISOString();
  const dayEnd    = new Date(`${dateParam}T23:59:59.999Z`).toISOString();

  try {
    const { data: transactions, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        id, trans_type, principal_paid, interest_paid, penalty_paid,
        amount_paid, trans_date, created_at, notes,
        pawn_tickets ( id, ticket_number, branch_id,
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

    if (error) throw error;

    const rows = (transactions || []);
    const filtered = branch_id
      ? rows.filter(t => t.pawn_tickets?.branch_id === branch_id)
      : rows;

    const flatRows = filtered.map(t => ({
      transaction_id:  t.id,
      trans_type:      t.trans_type,
      ticket_number:   t.pawn_tickets?.ticket_number || '',
      customer_name:   t.pawn_tickets?.customers
        ? `${t.pawn_tickets.customers.first_name} ${t.pawn_tickets.customers.last_name}`
        : '',
      item_name:       t.pawn_tickets?.pawn_items?.item_name || '',
      category:        t.pawn_tickets?.pawn_items?.category  || '',
      principal_paid:  t.principal_paid,
      interest_paid:   t.interest_paid,
      penalty_paid:    t.penalty_paid,
      amount_paid:     t.amount_paid,
      processed_by:    t.tenant_users?.full_name || '',
      trans_date:      t.trans_date,
      created_at:      t.created_at,
      notes:           t.notes || '',
    }));

    const headers = [
      'transaction_id', 'trans_type', 'ticket_number', 'customer_name',
      'item_name', 'category', 'principal_paid', 'interest_paid',
      'penalty_paid', 'amount_paid', 'processed_by', 'trans_date',
      'created_at', 'notes',
    ];

    sendCsv(res, `daily-transactions-${dateParam}.csv`, headers, flatRows);
  } catch (err) {
    console.error('[EXPORTS] daily-transactions error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/exports/overdue-loans
router.get('/overdue-loans', auth, tenantScope, async (req, res) => {
  const tenantId = req.tenantId;
  const { branch_id } = req.query;

  try {
    let query = supabaseAdmin
      .from('pawn_tickets')
      .select(`
        id, ticket_number, loan_amount, maturity_date, status, created_at,
        pawn_items ( item_name, category, appraised_value ),
        customers ( first_name, last_name, mobile_number ),
        branches ( branch_name )
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .order('maturity_date', { ascending: true });

    if (branch_id) query = query.eq('branch_id', branch_id);

    const { data: loans, error } = await query;
    if (error) throw error;

    const now          = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const msPerDay     = 1000 * 60 * 60 * 24;

    const enriched = (loans || []).map(l => {
      const maturity = new Date(l.maturity_date);
      const diffDays = Math.floor((now - maturity) / msPerDay);
      let overdue_category = null;
      if (maturity < now)           overdue_category = 'OVERDUE';
      else if (maturity <= sevenDaysOut) overdue_category = 'EXPIRING_SOON';
      return { ...l, days_overdue: Math.max(0, diffDays), overdue_category };
    }).filter(l => l.overdue_category !== null);

    const flatRows = enriched.map(l => ({
      ticket_number:    l.ticket_number,
      customer_name:    l.customers ? `${l.customers.first_name} ${l.customers.last_name}` : '',
      mobile_number:    l.customers?.mobile_number || '',
      branch_name:      l.branches?.branch_name || '',
      item_name:        l.pawn_items?.item_name  || '',
      category:         l.pawn_items?.category   || '',
      appraised_value:  l.pawn_items?.appraised_value || '',
      loan_amount:      l.loan_amount,
      maturity_date:    l.maturity_date,
      days_overdue:     l.days_overdue,
      overdue_category: l.overdue_category,
    }));

    const headers = [
      'ticket_number', 'customer_name', 'mobile_number', 'branch_name',
      'item_name', 'category', 'appraised_value', 'loan_amount',
      'maturity_date', 'days_overdue', 'overdue_category',
    ];

    sendCsv(res, 'overdue-loans.csv', headers, flatRows);
  } catch (err) {
    console.error('[EXPORTS] overdue-loans error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/exports/branch-comparison
router.get('/branch-comparison', auth, tenantScope, async (req, res) => {
  const tenantId  = req.tenantId;
  const period    = parseInt(req.query.period) || 30;
  const since     = new Date();
  since.setDate(since.getDate() - period);
  const sinceIso  = since.toISOString();

  try {
    const { data: branches, error: branchErr } = await supabaseAdmin
      .from('branches')
      .select('id, branch_name, branch_code')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('branch_name', { ascending: true });

    if (branchErr) throw branchErr;

    const result = await Promise.all((branches || []).map(async (branch) => {
      const [
        { data: ticketsActive },
        { data: branchTicketsFull },
      ] = await Promise.all([
        supabaseAdmin
          .from('pawn_tickets')
          .select('loan_amount')
          .eq('tenant_id', tenantId)
          .eq('branch_id', branch.id)
          .eq('status', 'ACTIVE')
          .is('deleted_at', null),
        supabaseAdmin
          .from('pawn_tickets')
          .select('id, loan_amount, customer_id')
          .eq('tenant_id', tenantId)
          .eq('branch_id', branch.id)
          .gte('loan_date', sinceIso)
          .is('deleted_at', null),
      ]);

      const branchTicketIdSet = (branchTicketsFull || []).map(t => t.id);

      const { data: branchTx } = await supabaseAdmin
        .from('transactions')
        .select('trans_type, principal_paid, interest_paid, penalty_paid')
        .eq('tenant_id', tenantId)
        .gte('created_at', sinceIso)
        .in('pawn_ticket_id', branchTicketIdSet.length > 0 ? branchTicketIdSet : ['00000000-0000-0000-0000-000000000000'])
        .is('deleted_at', null);

      const total_disbursed    = (branchTicketsFull || []).reduce((s, t) => s + Number(t.loan_amount || 0), 0);
      const total_collected    = (branchTx || []).filter(t => t.trans_type !== 'DISBURSEMENT').reduce((s, t) =>
        s + Number(t.principal_paid || 0) + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0), 0);
      const active_loans_value = (ticketsActive || []).reduce((s, t) => s + Number(t.loan_amount || 0), 0);
      const uniqueCustomers    = new Set((branchTicketsFull || []).map(t => t.customer_id)).size;

      return {
        branch_name:        branch.branch_name,
        branch_code:        branch.branch_code,
        loan_count:         (branchTicketsFull || []).length,
        total_disbursed:    Math.round(total_disbursed    * 100) / 100,
        total_collected:    Math.round(total_collected    * 100) / 100,
        active_loans_value: Math.round(active_loans_value * 100) / 100,
        customer_count:     uniqueCustomers,
        transaction_count:  (branchTx || []).length,
      };
    }));

    const headers = [
      'branch_name', 'branch_code', 'loan_count', 'total_disbursed',
      'total_collected', 'active_loans_value', 'customer_count', 'transaction_count',
    ];

    sendCsv(res, `branch-comparison-${period}d.csv`, headers, result);
  } catch (err) {
    console.error('[EXPORTS] branch-comparison error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/exports/customer-history
router.get('/customer-history', auth, tenantScope, async (req, res) => {
  const tenantId    = req.tenantId;
  const { customer_id } = req.query;

  if (!customer_id) {
    return res.status(400).json({ error: 'customer_id is required' });
  }

  try {
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('id, first_name, last_name, mobile_number, email, risk_rating')
      .eq('tenant_id', tenantId)
      .eq('id', customer_id)
      .is('deleted_at', null)
      .single();

    if (custErr || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { data: rawTickets } = await supabaseAdmin
      .from('pawn_tickets')
      .select(`
        id, ticket_number, loan_amount, interest_rate, maturity_date, loan_date, status,
        pawn_items ( item_name, category ),
        branches ( branch_name )
      `)
      .eq('tenant_id', tenantId)
      .eq('customer_id', customer_id)
      .is('deleted_at', null)
      .order('loan_date', { ascending: false });

    // Flatten: one row per transaction, with ticket info repeated
    const flatRows = [];
    await Promise.all((rawTickets || []).map(async (ticket) => {
      const { data: txs } = await supabaseAdmin
        .from('transactions')
        .select('id, trans_type, principal_paid, interest_paid, penalty_paid, amount_paid, trans_date')
        .eq('tenant_id', tenantId)
        .eq('pawn_ticket_id', ticket.id)
        .is('deleted_at', null)
        .order('trans_date', { ascending: true });

      if ((txs || []).length === 0) {
        flatRows.push({
          customer_name:   `${customer.first_name} ${customer.last_name}`,
          ticket_number:   ticket.ticket_number,
          loan_amount:     ticket.loan_amount,
          interest_rate:   ticket.interest_rate,
          loan_date:       ticket.loan_date,
          maturity_date:   ticket.maturity_date,
          ticket_status:   ticket.status,
          branch_name:     ticket.branches?.branch_name || '',
          item_name:       ticket.pawn_items?.item_name || '',
          trans_id:        '',
          trans_type:      '',
          principal_paid:  '',
          interest_paid:   '',
          penalty_paid:    '',
          amount_paid:     '',
          trans_date:      '',
        });
      } else {
        (txs || []).forEach(t => {
          flatRows.push({
            customer_name:   `${customer.first_name} ${customer.last_name}`,
            ticket_number:   ticket.ticket_number,
            loan_amount:     ticket.loan_amount,
            interest_rate:   ticket.interest_rate,
            loan_date:       ticket.loan_date,
            maturity_date:   ticket.maturity_date,
            ticket_status:   ticket.status,
            branch_name:     ticket.branches?.branch_name || '',
            item_name:       ticket.pawn_items?.item_name || '',
            trans_id:        t.id,
            trans_type:      t.trans_type,
            principal_paid:  t.principal_paid,
            interest_paid:   t.interest_paid,
            penalty_paid:    t.penalty_paid,
            amount_paid:     t.amount_paid,
            trans_date:      t.trans_date,
          });
        });
      }
    }));

    const headers = [
      'customer_name', 'ticket_number', 'loan_amount', 'interest_rate',
      'loan_date', 'maturity_date', 'ticket_status', 'branch_name', 'item_name',
      'trans_id', 'trans_type', 'principal_paid', 'interest_paid',
      'penalty_paid', 'amount_paid', 'trans_date',
    ];

    const customerSlug = `${customer.first_name}-${customer.last_name}`.replace(/\s+/g, '-').toLowerCase();
    sendCsv(res, `customer-history-${customerSlug}.csv`, headers, flatRows);
  } catch (err) {
    console.error('[EXPORTS] customer-history error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── Super Admin Exports ─────────────────────────────────────────────────────

// GET /api/exports/tenant-health
router.get('/tenant-health', auth, superAdminScope, async (req, res) => {
  try {
    const { status } = req.query;

    let tenantQuery = supabaseAdmin
      .from('tenants')
      .select('id, business_name, status, created_at')
      .is('deleted_at', null);

    if (status) tenantQuery = tenantQuery.eq('status', status);

    const { data: tenants, error: tenantErr } = await tenantQuery;
    if (tenantErr) throw tenantErr;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sinceIso = thirtyDaysAgo.toISOString();

    const rows = await Promise.all((tenants || []).map(async (tenant) => {
      const [
        { data: sub },
        { count: txCount },
        { count: activeLoans },
      ] = await Promise.all([
        supabaseAdmin
          .from('subscriptions')
          .select('payment_status, plan_name')
          .eq('tenant_id', tenant.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('created_at', sinceIso)
          .is('deleted_at', null),
        supabaseAdmin
          .from('pawn_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'ACTIVE')
          .is('deleted_at', null),
      ]);

      const paymentStatus = sub?.payment_status || 'PENDING';
      const txCountVal    = txCount  || 0;
      const activeLoanVal = activeLoans || 0;

      let activityScore = 0;
      if (txCountVal >= 11) activityScore = 40;
      else if (txCountVal >= 1) activityScore = 20;

      let subScore = 0;
      if (paymentStatus === 'PAID')    subScore = 30;
      else if (paymentStatus === 'PENDING') subScore = 15;

      const loanScore   = activeLoanVal > 0 ? 30 : 0;
      const health_score = activityScore + subScore + loanScore;
      let health_status = 'critical';
      if (health_score >= 70)      health_status = 'healthy';
      else if (health_score >= 30) health_status = 'warning';

      return {
        business_name:   tenant.business_name,
        tenant_status:   tenant.status,
        plan_name:       sub?.plan_name || '',
        payment_status:  paymentStatus,
        tx_count_30d:    txCountVal,
        active_loans:    activeLoanVal,
        health_score,
        health_status,
      };
    }));

    rows.sort((a, b) => b.health_score - a.health_score);

    const headers = [
      'business_name', 'tenant_status', 'plan_name', 'payment_status',
      'tx_count_30d', 'active_loans', 'health_score', 'health_status',
    ];

    sendCsv(res, 'tenant-health.csv', headers, rows);
  } catch (err) {
    console.error('[EXPORTS] tenant-health error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/exports/subscription-analytics
router.get('/subscription-analytics', auth, superAdminScope, async (req, res) => {
  try {
    const { data: subs, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, tenant_id, plan_name, billing_cycle, payment_status, created_at, end_date')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (subErr) throw subErr;

    // Fetch tenant names
    const tenantIds = [...new Set((subs || []).map(s => s.tenant_id))];
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name')
      .in('id', tenantIds.length > 0 ? tenantIds : ['00000000-0000-0000-0000-000000000000']);

    const tenantMap = {};
    (tenants || []).forEach(t => { tenantMap[t.id] = t.business_name; });

    const flatRows = (subs || []).map(s => {
      const planPrices = { free: 0, basic: 29, professional: 79, enterprise: 199 };
      const monthly = planPrices[(s.plan_name || 'free').toLowerCase()] || 0;
      const mrr = s.billing_cycle === 'YEARLY' ? monthly : monthly;

      return {
        tenant_name:    tenantMap[s.tenant_id] || s.tenant_id,
        plan_name:      s.plan_name,
        billing_cycle:  s.billing_cycle,
        payment_status: s.payment_status,
        mrr_contribution: mrr,
        created_at:     s.created_at,
        end_date:       s.end_date || '',
      };
    });

    const headers = [
      'tenant_name', 'plan_name', 'billing_cycle', 'payment_status',
      'mrr_contribution', 'created_at', 'end_date',
    ];

    sendCsv(res, 'subscription-analytics.csv', headers, flatRows);
  } catch (err) {
    console.error('[EXPORTS] subscription-analytics error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/exports/pawn-volume
router.get('/pawn-volume', auth, superAdminScope, async (req, res) => {
  try {
    const periodDays = parseInt(req.query.period) || 30;

    const since    = new Date();
    since.setDate(since.getDate() - periodDays);
    const sinceIso = since.toISOString();

    const { data: tickets } = await supabaseAdmin
      .from('pawn_tickets')
      .select('loan_amount, loan_date, tenant_id')
      .gte('loan_date', sinceIso)
      .is('deleted_at', null);

    // Build daily trend
    const trendMap = {};
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      trendMap[key] = { date: key, loans_issued: 0, disbursed: 0 };
    }

    (tickets || []).forEach(t => {
      const day = (t.loan_date || '').slice(0, 10);
      if (trendMap[day]) {
        trendMap[day].loans_issued += 1;
        trendMap[day].disbursed    += Number(t.loan_amount || 0);
      }
    });

    const flatRows = Object.values(trendMap).map(r => ({
      date:         r.date,
      loans_issued: r.loans_issued,
      disbursed:    Math.round(r.disbursed * 100) / 100,
    }));

    const headers = ['date', 'loans_issued', 'disbursed'];
    sendCsv(res, `pawn-volume-${periodDays}d.csv`, headers, flatRows);
  } catch (err) {
    console.error('[EXPORTS] pawn-volume error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/exports/tenant-rankings
router.get('/tenant-rankings', auth, superAdminScope, async (req, res) => {
  try {
    const { metric = 'revenue', limit: limitParam = '10' } = req.query;
    const periodDays = parseInt(req.query.period) || 30;
    const topN        = Math.min(parseInt(limitParam) || 10, 100);

    const validMetrics = ['revenue', 'loans', 'customers', 'transactions'];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({ error: `Invalid metric. Valid: ${validMetrics.join(', ')}` });
    }

    const since    = new Date();
    since.setDate(since.getDate() - periodDays);
    const sinceIso = since.toISOString();

    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name')
      .is('deleted_at', null);

    const tenantValues = await Promise.all((tenants || []).map(async (tenant) => {
      let value = 0;

      if (metric === 'revenue') {
        const { data: txs } = await supabaseAdmin
          .from('transactions')
          .select('interest_paid, penalty_paid')
          .eq('tenant_id', tenant.id)
          .gte('created_at', sinceIso)
          .is('deleted_at', null);
        value = (txs || []).reduce((s, t) => s + Number(t.interest_paid || 0) + Number(t.penalty_paid || 0), 0);
      } else if (metric === 'loans') {
        const { count } = await supabaseAdmin
          .from('pawn_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('loan_date', sinceIso)
          .is('deleted_at', null);
        value = count || 0;
      } else if (metric === 'customers') {
        const { count } = await supabaseAdmin
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .is('deleted_at', null);
        value = count || 0;
      } else if (metric === 'transactions') {
        const { count } = await supabaseAdmin
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('created_at', sinceIso)
          .is('deleted_at', null);
        value = count || 0;
      }

      return { tenant_id: tenant.id, business_name: tenant.business_name, value };
    }));

    tenantValues.sort((a, b) => b.value - a.value);

    const platform_total = tenantValues.reduce((s, t) => s + t.value, 0);

    const rows = tenantValues.slice(0, topN).map((t, i) => ({
      rank:              i + 1,
      business_name:     t.business_name,
      value:             Math.round(t.value * 100) / 100,
      pct_of_platform:   platform_total > 0 ? Number(((t.value / platform_total) * 100).toFixed(1)) : 0,
    }));

    const headers = ['rank', 'business_name', 'value', 'pct_of_platform'];
    sendCsv(res, `tenant-rankings-${metric}-${periodDays}d.csv`, headers, rows);
  } catch (err) {
    console.error('[EXPORTS] tenant-rankings error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;
