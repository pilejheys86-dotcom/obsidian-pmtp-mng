const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');

router.get('/', async (req, res) => {
  const { customerId, activeTenantId } = req;
  const { data: tickets, error: ticketErr } = await supabaseAdmin.from('pawn_tickets')
    .select('id, principal_loan, interest_rate, status, maturity_date, next_payment_due_date, is_overdue')
    .eq('customer_id', customerId).eq('tenant_id', activeTenantId)
    .in('status', ['ACTIVE', 'RENEWED']).is('deleted_at', null)
    .order('next_payment_due_date', { ascending: true });
  if (ticketErr) return res.status(400).json({ error: ticketErr.message });

  const activeLoans = (tickets || []).length;
  const totalBalance = (tickets || []).reduce((sum, t) => sum + Number(t.principal_loan), 0);
  const nextDue = tickets && tickets.length > 0 ? tickets[0] : null;

  const { data: transactions } = await supabaseAdmin.from('transactions')
    .select('id, trans_type, principal_paid, interest_paid, penalty_paid, trans_date, receipt_number')
    .eq('tenant_id', activeTenantId)
    .in('ticket_id', (tickets || []).map(t => t.id).concat(['00000000-0000-0000-0000-000000000000']))
    .is('deleted_at', null).order('trans_date', { ascending: false }).limit(5);

  res.json({
    activeLoans, totalBalance,
    nextDueDate: nextDue?.next_payment_due_date || null,
    nextDueAmount: nextDue ? Number(nextDue.principal_loan) * (Number(nextDue.interest_rate) / 100) : null,
    recentTransactions: transactions || [],
  });
});

module.exports = router;
