const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/dashboard — Aggregated KPI + recent activity
router.get('/', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const [kpiResult, chartResult, activitiesResult] = await Promise.all([
    supabaseAdmin.rpc('get_tenant_kpis', { p_tenant_id: tenantId }),
    supabaseAdmin.rpc('get_dashboard_chart_data', { p_tenant_id: tenantId, p_days: 7 }),
    supabaseAdmin
      .from('transactions')
      .select(`
        id, trans_type, payment_method, principal_paid, interest_paid, penalty_paid,
        trans_date, receipt_number, processed_by,
        pawn_tickets!inner(ticket_number, principal_loan, status,
          customers!inner(first_name, last_name),
          pawn_items!inner(general_desc, category)
        )
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('trans_date', { ascending: false })
      .limit(10),
  ]);

  if (kpiResult.error) return res.status(400).json({ error: kpiResult.error.message });

  const kpis = kpiResult.data;
  const chartData = chartResult.data || [];
  const recentActivities = activitiesResult.data || [];

  // Resolve processor names via RPC
  const processorIds = [...new Set(recentActivities.map(t => t.processed_by).filter(Boolean))];
  let nameMap = {};
  if (processorIds.length > 0) {
    const { data: names } = await supabaseAdmin.rpc('resolve_user_names', { p_user_ids: processorIds });
    nameMap = names || {};
  }

  recentActivities.forEach(t => {
    const user = nameMap[t.processed_by] || {};
    t.processed_by_name = user.full_name || 'System';
    t.tenant_users = { full_name: user.full_name || 'System' };
  });

  const portfolio = {
    ACTIVE: kpis.active_loans || 0,
    REDEEMED: kpis.redeemed_loans || 0,
    EXPIRED: kpis.expired_loans || 0,
    FORFEITED: kpis.forfeited_loans || 0,
    RENEWED: kpis.renewed_loans || 0,
  };

  res.json({
    stats: {
      totalActiveLoanValue: kpis.total_principal_outstanding || 0,
      activeLoansCount: kpis.active_loans || 0,
      inventoryValue: kpis.total_inventory_value || 0,
      newCustomers: kpis.total_customers || 0,
      pendingAppraisals: kpis.pending_appraisals || 0,
    },
    portfolio,
    recentActivities,
    chartData,
  });
}));

module.exports = router;
