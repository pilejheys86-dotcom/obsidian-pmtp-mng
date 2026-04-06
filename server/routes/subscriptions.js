const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');

const PLANS = {
  STARTER: { name: 'Starter', monthlyPrice: 149900, yearlyPrice: 1499900, description: 'Obsidian PMS - Starter Plan' },
  PROFESSIONAL: { name: 'Professional', monthlyPrice: 299900, yearlyPrice: 2999900, description: 'Obsidian PMS - Professional Plan' },
  ENTERPRISE: { name: 'Enterprise', monthlyPrice: 499900, yearlyPrice: 4999900, description: 'Obsidian PMS - Enterprise Plan' },
};

// GET /api/subscriptions — Current subscription
router.get('/', async (req, res) => {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return res.json(null);
  res.json(data);
});

// GET /api/subscriptions/status — Quick subscription status check
router.get('/status', async (req, res) => {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('id, plan_name, payment_status, end_date')
    .eq('tenant_id', req.tenantId)
    .eq('payment_status', 'PAID')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return res.json({ active: false });

  const isExpired = data.end_date && new Date(data.end_date) < new Date();
  res.json({
    active: !isExpired,
    plan_name: data.plan_name,
    end_date: data.end_date,
    expired: isExpired,
  });
});

// POST /api/subscriptions/checkout — Create PayMongo checkout session
router.post('/checkout', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only owners can manage subscriptions' });
  }

  const { plan_name, billing_cycle } = req.body || {};
  const plan = PLANS[plan_name];
  if (!plan) {
    console.error('[CHECKOUT] Invalid plan:', { plan_name, body: req.body });
    return res.status(400).json({ error: `Invalid plan: ${plan_name}` });
  }

  const cycle = billing_cycle || 'MONTHLY';
  const amountCentavos = cycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;

  const now = new Date();
  const endDate = new Date(now);
  if (cycle === 'YEARLY') endDate.setFullYear(endDate.getFullYear() + 1);
  else endDate.setMonth(endDate.getMonth() + 1);

  // Create pending subscription record
  const { data: subscription, error: subErr } = await supabaseAdmin
    .from('subscriptions')
    .insert({
      tenant_id: req.tenantId,
      plan_name,
      billing_cycle: cycle,
      start_date: now.toISOString(),
      end_date: endDate.toISOString(),
      payment_status: 'PENDING',
    })
    .select()
    .single();

  if (subErr) {
    console.error('[CHECKOUT] Supabase insert failed:', subErr.message);
    return res.status(400).json({ error: 'Unable to create subscription record. Please try again.' });
  }

  // Create PayMongo checkout session
  try {
    const PAYMONGO_API = 'https://api.paymongo.com/v1';
    const key = process.env.PAYMONGO_SECRET_KEY;
    if (!key) throw new Error('PAYMONGO_SECRET_KEY not set');
    const authHeader = 'Basic ' + Buffer.from(key + ':').toString('base64');

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    const response = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [{
              name: `${plan.name} Plan (${cycle === 'YEARLY' ? 'Annual' : 'Monthly'})`,
              amount: amountCentavos,
              currency: 'PHP',
              quantity: 1,
            }],
            payment_method_types: ['gcash', 'grab_pay', 'paymaya', 'card'],
            description: plan.description,
            send_email_receipt: false,
            metadata: { subscription_id: subscription.id, tenant_id: req.tenantId },
            success_url: `${clientUrl}/admin/subscription?status=success&sub=${subscription.id}`,
            cancel_url: `${clientUrl}/admin/subscription?status=cancelled`,
          },
        },
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      const pmCode = json.errors?.[0]?.code || 'unknown';
      console.error('[CHECKOUT] PayMongo error:', { code: pmCode, detail: json.errors?.[0]?.detail });
      throw new Error('Unable to create checkout session. Please try again.');
    }

    // Save checkout ID to subscription
    await supabaseAdmin
      .from('subscriptions')
      .update({ paymongo_checkout_id: json.data.id, updated_at: new Date().toISOString() })
      .eq('id', subscription.id);

    res.status(201).json({
      checkout_url: json.data.attributes.checkout_url,
      checkout_id: json.data.id,
      subscription_id: subscription.id,
    });
  } catch (err) {
    // Clean up failed subscription
    await supabaseAdmin.from('subscriptions').delete().eq('id', subscription.id);
    console.error('[CHECKOUT] Error:', err.message);
    res.status(500).json({ error: 'Unable to create checkout session. Please try again.' });
  }
});

// POST /api/subscriptions/verify — Verify checkout payment with PayMongo and mark as paid
router.post('/verify', async (req, res) => {
  const { subscription_id } = req.body;
  if (!subscription_id) return res.status(400).json({ error: 'Missing subscription_id' });

  // Fetch the pending subscription
  const { data: subscription, error: fetchErr } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('id', subscription_id)
    .eq('tenant_id', req.tenantId)
    .maybeSingle();

  if (fetchErr || !subscription) return res.status(404).json({ error: 'Subscription not found' });
  if (subscription.payment_status === 'PAID') return res.json({ verified: true, already_paid: true });
  if (!subscription.paymongo_checkout_id) return res.status(400).json({ error: 'No checkout session found' });

  // Check PayMongo checkout session status
  try {
    const key = process.env.PAYMONGO_SECRET_KEY;
    if (!key) throw new Error('PAYMONGO_SECRET_KEY not set');
    const authHeader = 'Basic ' + Buffer.from(key + ':').toString('base64');

    const pmRes = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${subscription.paymongo_checkout_id}`, {
      headers: { 'Authorization': authHeader },
    });
    const pmData = await pmRes.json();
    if (!pmRes.ok) {
      const pmCode = pmData.errors?.[0]?.code || 'unknown';
      const pmDetail = pmData.errors?.[0]?.detail || 'PayMongo API error';
      console.error('[SUBSCRIPTION VERIFY] PayMongo error:', { code: pmCode, detail: pmDetail });
      return res.status(400).json({
        verified: false,
        error: 'Payment verification failed. Please try again or contact support.',
        paymongo_code: pmCode,
      });
    }

    const status = pmData.data?.attributes?.status;
    const payments = pmData.data?.attributes?.payments;
    const isPaid = status === 'active' || (payments && payments.length > 0 && payments[0]?.attributes?.status === 'paid');

    if (!isPaid) return res.json({ verified: false, checkout_status: status });

    // Mark subscription as paid
    await supabaseAdmin
      .from('subscriptions')
      .update({
        payment_status: 'PAID',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);

    console.log(`[SUBSCRIPTION VERIFY] Subscription ${subscription.id} verified & marked PAID`);
    return res.json({ verified: true });
  } catch (err) {
    console.error('[SUBSCRIPTION VERIFY] Error:', err.message);
    return res.status(500).json({
      verified: false,
      error: 'Unable to verify payment at this time. Please try again later.',
    });
  }
});

// POST /api/subscriptions — Create or update subscription
router.post('/', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only owners can manage subscriptions' });
  }

  const { plan_name, billing_cycle, start_date, end_date, payment_status } = req.body;

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .insert({
      tenant_id: req.tenantId,
      plan_name,
      billing_cycle,
      start_date,
      end_date,
      payment_status: payment_status || 'PAID',
    })
    .select()
    .single();

  if (error) {
    console.error('[SUBSCRIPTION CREATE] Error:', error.message);
    return res.status(400).json({ error: 'Unable to create subscription. Please try again.' });
  }
  res.status(201).json(data);
});

// PATCH /api/subscriptions/:id — Update subscription
router.patch('/:id', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only owners can manage subscriptions' });
  }

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .select()
    .single();

  if (error) {
    console.error('[SUBSCRIPTION UPDATE] Error:', error.message);
    return res.status(400).json({ error: 'Unable to update subscription. Please try again.' });
  }
  res.json(data);
});

module.exports = router;
