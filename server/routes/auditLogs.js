const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');

// GET /api/audit-logs — Owner-only, paginated, filterable
router.get('/', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the owner can view audit logs' });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { category, user_id, from_date, to_date } = req.query;

  let query = supabaseAdmin
    .from('tenant_audit_logs')
    .select('*, user:tenant_users(full_name)', { count: 'exact' })
    .eq('tenant_id', req.tenantId);

  if (category) query = query.eq('category', category);
  if (user_id) query = query.eq('user_id', user_id);
  if (from_date) query = query.gte('created_at', from_date);
  if (to_date) query = query.lte('created_at', `${to_date}T23:59:59.999Z`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ data: data || [], total: count || 0, page, limit });
});

module.exports = router;
