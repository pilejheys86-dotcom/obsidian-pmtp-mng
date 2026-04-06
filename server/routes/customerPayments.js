const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { generateReceiptNumber, getPagination } = require('../utils/helpers');
const { createCheckoutSession, retrieveCheckoutSession } = require('../services/paymongo');

const VALID_PAYMENT_TYPES = ['INTEREST_ONLY', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION'];
const PAYMONGO_METHOD_MAP = { gcash: 'GCASH', grab_pay: 'GCASH', paymaya: 'PAYMAYA', maya: 'PAYMAYA', card: 'BANK_TRANSFER', bank: 'BANK_TRANSFER' };
function mapPaymentMethod(raw) { return PAYMONGO_METHOD_MAP[(raw || '').toLowerCase()] || 'GCASH'; }

router.post('/create', async (req, res) => {
  const { ticketId, amount, paymentType } = req.body;
  if (!ticketId || !amount || !paymentType) return res.status(400).json({ error: 'ticketId, amount, and paymentType are required' });
  if (!VALID_PAYMENT_TYPES.includes(paymentType)) return res.status(400).json({ error: `paymentType must be one of: ${VALID_PAYMENT_TYPES.join(', ')}` });
  if (Number(amount) <= 0) return res.status(400).json({ error: 'amount must be positive' });

  const { data: ticket, error: ticketErr } = await supabaseAdmin.from('pawn_tickets')
    .select('id, ticket_number, principal_loan, status').eq('id', ticketId)
    .eq('customer_id', req.customerId).eq('tenant_id', req.activeTenantId)
    .in('status', ['ACTIVE', 'RENEWED']).is('deleted_at', null).single();
  if (ticketErr || !ticket) return res.status(404).json({ error: 'Loan not found or not in payable state' });

  const { data: intent, error: intentErr } = await supabaseAdmin.from('customer_payment_intents').insert({
    tenant_id: req.activeTenantId, customer_id: req.customerId, ticket_id: ticketId,
    paymongo_checkout_id: 'pending', amount: Number(amount), payment_type: paymentType, status: 'PENDING',
  }).select().single();
  if (intentErr) return res.status(400).json({ error: intentErr.message });

  try {
    const { checkoutUrl, checkoutId } = await createCheckoutSession({
      ticketNumber: ticket.ticket_number, amountCentavos: Math.round(Number(amount) * 100),
      intentId: intent.id, description: `${paymentType} payment for ${ticket.ticket_number}`,
    });
    await supabaseAdmin.from('customer_payment_intents')
      .update({ paymongo_checkout_id: checkoutId, updated_at: new Date().toISOString() }).eq('id', intent.id);
    res.status(201).json({ checkoutUrl, intentId: intent.id });
  } catch (err) {
    await supabaseAdmin.from('customer_payment_intents')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', intent.id);
    res.status(502).json({ error: 'Payment gateway error: ' + err.message });
  }
});

router.get('/history', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));
  const { data: tickets } = await supabaseAdmin.from('pawn_tickets').select('id')
    .eq('customer_id', req.customerId).eq('tenant_id', req.activeTenantId).is('deleted_at', null);
  const ticketIds = (tickets || []).map(t => t.id);
  if (ticketIds.length === 0) return res.json({ data: [], total: 0, page: Number(page), limit: Number(limit) });

  const { data, error, count } = await supabaseAdmin.from('transactions')
    .select('*, pawn_tickets(ticket_number)', { count: 'exact' })
    .eq('tenant_id', req.activeTenantId).in('ticket_id', ticketIds)
    .is('deleted_at', null).order('trans_date', { ascending: false }).range(from, to);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data: data || [], total: count, page: Number(page), limit: Number(limit) });
});

router.get('/intent/:intentId', async (req, res) => {
  const { data: intent, error } = await supabaseAdmin.from('customer_payment_intents')
    .select('*').eq('id', req.params.intentId).eq('customer_id', req.customerId).single();
  if (error || !intent) {
    console.log('[poll] intent not found:', { intentId: req.params.intentId, customerId: req.customerId, error: error?.message });
    return res.status(404).json({ error: 'Payment intent not found' });
  }

  // If already resolved, return immediately
  if (intent.status === 'PAID' || intent.status === 'FAILED' || intent.status === 'EXPIRED') {
    return res.json({ id: intent.id, status: intent.status, amount: intent.amount, payment_type: intent.payment_type, paid_at: intent.paid_at });
  }

  // Still PENDING — check PayMongo directly as a webhook fallback
  if (intent.paymongo_checkout_id && intent.paymongo_checkout_id !== 'pending') {
    try {
      const checkout = await retrieveCheckoutSession(intent.paymongo_checkout_id);
      const payments = checkout.attributes?.payments || [];
      const paidPayment = payments.find(p => p.attributes?.status === 'paid');

      if (paidPayment) {
        const rawMethod = paidPayment.attributes?.source?.type || '';
        const mappedMethod = mapPaymentMethod(rawMethod);

        console.log('[poll] PayMongo shows paid, calling RPC:', { intentId: intent.id, method: mappedMethod });
        const { data: result, error: rpcErr } = await supabaseAdmin.rpc('process_customer_payment', {
          p_ticket_id: intent.ticket_id, p_customer_id: intent.customer_id, p_amount_paid: intent.amount,
          p_payment_type: intent.payment_type, p_payment_method: mappedMethod,
          p_receipt_number: generateReceiptNumber(), p_paymongo_checkout_id: intent.paymongo_checkout_id,
        });

        if (!rpcErr && result?.success) {
          await supabaseAdmin.from('customer_payment_intents').update({
            status: 'PAID', payment_method: mappedMethod, paid_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq('id', intent.id);

          await supabaseAdmin.from('customer_notifications').insert({
            tenant_id: intent.tenant_id, customer_id: intent.customer_id, title: 'Payment Confirmed',
            body: `Your payment of ₱${Number(intent.amount).toFixed(2)} has been processed successfully.`,
            type: 'PAYMENT_CONFIRMED', reference_type: 'TRANSACTION', reference_id: intent.ticket_id,
          });

          console.log('[poll] Payment processed successfully via fallback');
          return res.json({ id: intent.id, status: 'PAID', amount: intent.amount, payment_type: intent.payment_type, paid_at: new Date().toISOString() });
        } else {
          // Don't set FAILED — let the webhook retry or next poll retry
          console.error('[poll] RPC failed, keeping PENDING:', rpcErr?.message || JSON.stringify(result));
        }
      }
    } catch (err) {
      console.warn('[poll] PayMongo check failed, returning DB status:', err.message);
    }
  }

  // Return current DB status (still PENDING if fallback didn't succeed)
  res.json({ id: intent.id, status: intent.status, amount: intent.amount, payment_type: intent.payment_type, paid_at: intent.paid_at });
});

module.exports = router;
