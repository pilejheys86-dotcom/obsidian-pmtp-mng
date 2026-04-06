const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');

router.get('/', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));
  const { data, error, count } = await supabaseAdmin.from('customer_notifications')
    .select('*', { count: 'exact' }).eq('customer_id', req.customerId).eq('tenant_id', req.activeTenantId)
    .order('created_at', { ascending: false }).range(from, to);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data: data || [], total: count, page: Number(page), limit: Number(limit) });
});

router.get('/unread-count', async (req, res) => {
  const { count, error } = await supabaseAdmin.from('customer_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', req.customerId).eq('tenant_id', req.activeTenantId).eq('is_read', false);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ count: count || 0 });
});

router.patch('/:id/read', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('customer_notifications')
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('customer_id', req.customerId).select().single();
  if (error || !data) return res.status(404).json({ error: 'Notification not found' });
  res.json(data);
});

router.post('/mark-all-read', async (req, res) => {
  const { error } = await supabaseAdmin.from('customer_notifications')
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('customer_id', req.customerId).eq('tenant_id', req.activeTenantId).eq('is_read', false);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'All notifications marked as read' });
});

module.exports = router;
