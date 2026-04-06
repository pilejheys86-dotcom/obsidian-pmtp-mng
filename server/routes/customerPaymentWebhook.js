const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { verifyWebhookSignature } = require('../services/paymongo');
const { generateReceiptNumber } = require('../utils/helpers');

const PAYMONGO_METHOD_MAP = { gcash: 'GCASH', grab_pay: 'GCASH', paymaya: 'PAYMAYA', maya: 'PAYMAYA', card: 'BANK_TRANSFER', bank: 'BANK_TRANSFER' };
function mapPaymentMethod(raw) { return PAYMONGO_METHOD_MAP[(raw || '').toLowerCase()] || 'GCASH'; }

router.post('/', async (req, res) => {
  const signature = req.headers['paymongo-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing signature' });
  try {
    if (!verifyWebhookSignature(req.body, signature)) return res.status(401).json({ error: 'Invalid signature' });
  } catch { return res.status(500).json({ error: 'Signature verification failed' }); }

  const event = JSON.parse(req.body.toString());
  if (event.data?.attributes?.type !== 'checkout_session.payment.paid') return res.status(200).json({ received: true });

  const checkoutId = event.data?.attributes?.data?.id;
  const rawMethod = event.data?.attributes?.data?.attributes?.payment_method_used;
  if (!checkoutId) return res.status(400).json({ error: 'Missing checkout ID' });

  const { data: intent, error: intentErr } = await supabaseAdmin.from('customer_payment_intents').select('*').eq('paymongo_checkout_id', checkoutId).single();
  console.log('[webhook] lookup intent:', { checkoutId, found: !!intent, intentErr: intentErr?.message });
  if (!intent) return res.status(200).json({ received: true });
  if (intent.status === 'PAID') return res.status(200).json({ received: true, already_processed: true });

  const mappedMethod = mapPaymentMethod(rawMethod);
  console.log('[webhook] calling RPC:', { ticketId: intent.ticket_id, customerId: intent.customer_id, amount: intent.amount, paymentType: intent.payment_type, method: mappedMethod });
  const { data: result, error: rpcErr } = await supabaseAdmin.rpc('process_customer_payment', {
    p_ticket_id: intent.ticket_id, p_customer_id: intent.customer_id, p_amount_paid: intent.amount,
    p_payment_type: intent.payment_type, p_payment_method: mappedMethod,
    p_receipt_number: generateReceiptNumber(), p_paymongo_checkout_id: checkoutId,
  });
  console.log('[webhook] RPC result:', { result, rpcErr: rpcErr?.message });

  if (rpcErr || !result?.success) {
    console.error('[webhook] RPC FAILED:', rpcErr?.message || result);
    await supabaseAdmin.from('customer_payment_intents').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', intent.id);
    return res.status(200).json({ received: true });
  }

  await supabaseAdmin.from('customer_payment_intents').update({
    status: 'PAID', payment_method: mappedMethod, paid_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', intent.id);

  await supabaseAdmin.from('customer_notifications').insert({
    tenant_id: intent.tenant_id, customer_id: intent.customer_id, title: 'Payment Confirmed',
    body: `Your payment of ₱${Number(intent.amount).toFixed(2)} has been processed successfully.`,
    type: 'PAYMENT_CONFIRMED', reference_type: 'TRANSACTION', reference_id: intent.ticket_id,
  });

  res.status(200).json({ received: true, processed: true });
});

module.exports = router;
