const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');

router.post('/', async (req, res) => {
  const { token, deviceName } = req.body;
  if (!token) return res.status(400).json({ error: 'Push token is required' });
  const { data, error } = await supabaseAdmin.from('customer_push_tokens').upsert({
    customer_id: req.customerId, tenant_id: req.activeTenantId,
    expo_push_token: token, device_name: deviceName || null, is_active: true,
  }, { onConflict: 'customer_id,tenant_id,expo_push_token' }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Push token registered', data });
});

router.delete('/', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Push token is required' });
  const { error } = await supabaseAdmin.from('customer_push_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('customer_id', req.customerId).eq('expo_push_token', token);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Push token deactivated' });
});

module.exports = router;
