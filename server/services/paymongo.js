const PAYMONGO_API = 'https://api.paymongo.com/v1';

function getAuthHeader() {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error('PAYMONGO_SECRET_KEY not set');
  return 'Basic ' + Buffer.from(key + ':').toString('base64');
}

async function createCheckoutSession({ ticketNumber, amountCentavos, intentId, description }) {
  const response = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ name: `Loan Payment - ${ticketNumber}`, amount: amountCentavos, currency: 'PHP', quantity: 1 }],
          payment_method_types: ['gcash', 'grab_pay', 'paymaya', 'card'],
          description,
          send_email_receipt: true,
          metadata: { intent_id: intentId },
          success_url: `obsidian://payment-success?intent=${intentId}`,
          cancel_url: `obsidian://payment-cancel?intent=${intentId}`,
        },
      },
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.errors?.[0]?.detail || 'PayMongo checkout creation failed');
  return { checkoutUrl: json.data.attributes.checkout_url, checkoutId: json.data.id };
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  const crypto = require('crypto');
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  // Skip verification in test mode when no webhook secret is configured
  if (!secret) {
    console.warn('[PAYMONGO] No PAYMONGO_WEBHOOK_SECRET set — skipping signature verification (test mode)');
    return true;
  }
  const parts = {};
  signatureHeader.split(',').forEach(part => { const [key, value] = part.split('='); parts[key] = value; });
  const timestamp = parts.t;
  const signature = parts.te || parts.li;
  const payload = `${timestamp}.${rawBody.toString()}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function retrieveCheckoutSession(checkoutId) {
  const response = await fetch(`${PAYMONGO_API}/checkout_sessions/${checkoutId}`, {
    headers: { 'Authorization': getAuthHeader() },
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.errors?.[0]?.detail || 'Failed to retrieve checkout session');
  return json.data;
}

module.exports = { createCheckoutSession, verifyWebhookSignature, retrieveCheckoutSession };
