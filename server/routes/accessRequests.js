// server/routes/accessRequests.js
const express  = require('express');
const { supabaseAdmin } = require('../config/db');
const { generateTempPassword } = require('../utils/helpers');
const { sendCustomerWelcomeEmail } = require('../services/email');

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
const isValidUuid  = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));

// Simple in-memory rate limiter: 5 requests per IP per hour
const _rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const WINDOW = 60 * 60 * 1000;
  const entry = _rateLimitMap.get(ip) || { count: 0, resetAt: now + WINDOW };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + WINDOW; }
  entry.count++;
  _rateLimitMap.set(ip, entry);
  return entry.count <= 5;
}

// ── Public POST ──────────────────────────────────────────────────────────────
const handlePublicPost = async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { tenant_id, full_name, email, mobile_number, request_data } = req.body;

  if (!tenant_id || !isValidUuid(tenant_id)) return res.status(400).json({ error: 'Invalid tenant_id' });
  if (!full_name || !full_name.trim())        return res.status(400).json({ error: 'full_name is required' });
  if (!email || !isValidEmail(email))         return res.status(400).json({ error: 'A valid email is required' });

  try {
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants').select('id').eq('id', tenant_id).eq('status', 'ACTIVE').single();
    if (tErr || !tenant) return res.status(404).json({ error: 'Tenant not found' });

    const { data, error } = await supabaseAdmin
      .from('customer_access_requests')
      .insert({
        tenant_id,
        full_name: full_name.trim(),
        email: email.toLowerCase().trim(),
        mobile_number: mobile_number?.trim() || null,
        request_data: request_data || null,
      })
      .select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    console.error('[AccessRequests POST]', err.message);
    res.status(500).json({ error: 'Failed to submit request' });
  }
};

// ── Public GET tenant info (for request-access page) ────────────────────────
const handlePublicTenantInfo = async (req, res) => {
  const { tenantId } = req.params;
  if (!tenantId || !isValidUuid(tenantId)) return res.status(400).json({ error: 'Invalid tenant_id' });

  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name, logo_url')
      .eq('id', tenantId)
      .eq('status', 'ACTIVE')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Tenant not found' });

    // Fetch brand_color from tenant_branding if available
    const { data: branding } = await supabaseAdmin
      .from('tenant_branding')
      .select('brand_color, subdomain')
      .eq('tenant_id', tenantId)
      .eq('is_published', true)
      .single();

    res.json({
      ...data,
      brand_color: branding?.brand_color || null,
      subdomain: branding?.subdomain || null,
    });
  } catch (err) {
    console.error('[AccessRequests TENANT]', err.message);
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
};

// ── Admin Router ─────────────────────────────────────────────────────────────
const adminRouter = express.Router();

// GET /api/access-requests/admin
adminRouter.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let q = supabaseAdmin
      .from('customer_access_requests')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('requested_at', { ascending: false });
    if (status) q = q.eq('status', status.toUpperCase());

    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('[AccessRequests LIST]', err.message);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// GET /api/access-requests/admin/:id
adminRouter.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('customer_access_requests')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Request not found' });
    res.json(data);
  } catch (err) {
    console.error('[AccessRequests GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch request' });
  }
});

// PATCH /api/access-requests/admin/:id/approve
adminRouter.patch('/:id/approve', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can approve requests' });
  }
  try {
    const { data: ar, error: arErr } = await supabaseAdmin
      .from('customer_access_requests')
      .select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('status', 'PENDING').single();
    if (arErr || !ar) return res.status(404).json({ error: 'Pending request not found' });

    // Create customer record — use request_data if available for richer profile
    const rd = ar.request_data;
    const personal = rd?.personalInfo;
    const address = rd?.address;

    const customerPayload = {
      tenant_id: req.tenantId,
      first_name: personal?.firstName || ar.full_name.trim().split(' ')[0],
      middle_name: personal?.middleName || null,
      last_name: personal?.lastName || ar.full_name.trim().split(' ').slice(1).join(' ') || '-',
      email: personal?.email || ar.email,
      mobile_number: personal?.mobileNumber || ar.mobile_number,
      date_of_birth: personal?.dateOfBirth || null,
      risk_rating: 'LOW',
    };

    if (address) {
      customerPayload.address_line1 = address.addressLine1 || null;
      customerPayload.address_line2 = address.addressLine2 || null;
      customerPayload.province = address.provinceText || address.province || null;
      customerPayload.city = address.cityText || address.city || null;
      customerPayload.barangay = address.barangay || null;
      customerPayload.zip_code = address.zipCode || null;
    }

    const { data: customer, error: custErr } = await supabaseAdmin
      .from('customers')
      .insert(customerPayload)
      .select().single();
    if (custErr) return res.status(400).json({ error: custErr.message });

    // Create Supabase auth user
    const tempPassword = generateTempPassword();
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: ar.email, password: tempPassword, email_confirm: true,
    });
    if (authErr) {
      await supabaseAdmin.from('customers').delete().eq('id', customer.id);
      return res.status(400).json({ error: authErr.message });
    }

    await supabaseAdmin.from('customers').update({ auth_id: authData.user.id }).eq('id', customer.id);

    const { data: tenant } = await supabaseAdmin.from('tenants').select('business_name').eq('id', req.tenantId).single();

    sendCustomerWelcomeEmail({
      to: ar.email, fullName: ar.full_name, email: ar.email,
      tempPassword, businessName: tenant?.business_name || 'Our Business',
    }).catch((e) => console.error('[AccessRequests email]', e.message));

    const { data: updated } = await supabaseAdmin
      .from('customer_access_requests')
      .update({ status: 'APPROVED', reviewed_by: req.userId, reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();

    res.json({ ...updated, status: 'APPROVED' });
  } catch (err) {
    console.error('[AccessRequests APPROVE]', err.message);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// PATCH /api/access-requests/admin/:id/reject
adminRouter.patch('/:id/reject', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can reject requests' });
  }
  try {
    const { notes } = req.body;
    const { data, error } = await supabaseAdmin
      .from('customer_access_requests')
      .update({ status: 'REJECTED', reviewed_by: req.userId, reviewed_at: new Date().toISOString(), notes: notes?.trim() || null })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('status', 'PENDING')
      .select().single();
    if (error || !data) return res.status(404).json({ error: 'Pending request not found' });
    res.json({ ...data, status: 'REJECTED' });
  } catch (err) {
    console.error('[AccessRequests REJECT]', err.message);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

module.exports = { handlePublicPost, handlePublicTenantInfo, adminRouter };
