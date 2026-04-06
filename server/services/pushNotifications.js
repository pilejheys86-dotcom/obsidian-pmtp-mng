const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPushNotifications(messages) {
  if (!messages || messages.length === 0) return [];
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(messages),
  });
  const json = await response.json();
  return json.data || [];
}

async function notifyCustomer(supabaseAdmin, customerId, tenantId, notification) {
  const { data: tokens } = await supabaseAdmin
    .from('customer_push_tokens').select('expo_push_token')
    .eq('customer_id', customerId).eq('tenant_id', tenantId).eq('is_active', true);
  if (!tokens || tokens.length === 0) return;
  const messages = tokens.map(t => ({
    to: t.expo_push_token, sound: 'default',
    title: notification.title, body: notification.body, data: notification.data || {},
  }));
  return sendPushNotifications(messages);
}

module.exports = { sendPushNotifications, notifyCustomer };
