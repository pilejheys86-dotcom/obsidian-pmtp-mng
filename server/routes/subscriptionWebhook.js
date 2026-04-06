const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { verifyWebhookSignature } = require('../services/paymongo');

router.post('/', async (req, res) => {
  const signature = req.headers['paymongo-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing signature' });

  try {
    if (!verifyWebhookSignature(req.body, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch {
    return res.status(500).json({ error: 'Signature verification failed' });
  }

  const event = JSON.parse(req.body.toString());
  const eventType = event.data?.attributes?.type;

  if (eventType !== 'checkout_session.payment.paid') {
    return res.status(200).json({ received: true });
  }

  const checkoutId = event.data?.attributes?.data?.id;
  if (!checkoutId) return res.status(400).json({ error: 'Missing checkout ID' });

  // Find the pending subscription with this checkout ID
  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('paymongo_checkout_id', checkoutId)
    .maybeSingle();

  if (!subscription) return res.status(200).json({ received: true });
  if (subscription.payment_status === 'PAID') {
    return res.status(200).json({ received: true, already_processed: true });
  }

  // Mark subscription as paid
  const { error: updateErr } = await supabaseAdmin
    .from('subscriptions')
    .update({
      payment_status: 'PAID',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.id);

  if (updateErr) {
    console.error('[SUBSCRIPTION WEBHOOK] Update failed:', updateErr.message);
    return res.status(200).json({ received: true, error: updateErr.message });
  }

  console.log(`[SUBSCRIPTION WEBHOOK] Subscription ${subscription.id} marked as PAID for tenant ${subscription.tenant_id}`);
  res.status(200).json({ received: true, processed: true });
});

module.exports = router;
