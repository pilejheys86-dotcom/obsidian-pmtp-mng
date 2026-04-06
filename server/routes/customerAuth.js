const express = require('express');
const router = express.Router();
const { supabaseAdmin, supabaseAnon } = require('../config/db');
const { sanitizeSearch, isValidUuid } = require('../utils/helpers');

router.get('/search-tenants', async (req, res) => {
  const q = sanitizeSearch(req.query.q);
  if (!q) return res.status(400).json({ error: 'Search query (q) is required' });
  const { data, error } = await supabaseAdmin.from('tenants')
    .select('id, business_name, city_municipality:branches(city_municipality)')
    .ilike('business_name', `%${q}%`).eq('status', 'ACTIVE').is('deleted_at', null).limit(20);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data: data || [] });
});

router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName, dateOfBirth, nationality, presentAddress, mobileNumber, employmentNature, tenantId } = req.body;
  if (!email || !password || !firstName || !lastName || !dateOfBirth || !tenantId)
    return res.status(400).json({ error: 'email, password, firstName, lastName, dateOfBirth, and tenantId are required' });
  if (!isValidUuid(tenantId)) return res.status(400).json({ error: 'Invalid tenantId' });

  const { data: tenant, error: tenantError } = await supabaseAdmin.from('tenants')
    .select('id, business_name').eq('id', tenantId).eq('status', 'ACTIVE').is('deleted_at', null).single();
  if (tenantError || !tenant) return res.status(400).json({ error: 'Pawnshop not found or inactive' });

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `${firstName} ${lastName}`, role: 'customer' },
  });
  if (authError) return res.status(400).json({ error: authError.message });

  // Check if a staff-created customer already exists for this tenant (unlinked — no auth_id)
  const { data: existing } = await supabaseAdmin.from('customers')
    .select('id').eq('tenant_id', tenantId).is('auth_id', null).is('deleted_at', null)
    .or(`email.ilike.${email},and(first_name.ilike.${firstName},last_name.ilike.${lastName})`)
    .limit(1).maybeSingle();

  let customer;
  if (existing) {
    // Link the existing staff-created customer to this auth account
    const { data: updated, error: linkError } = await supabaseAdmin.from('customers')
      .update({ auth_id: authData.user.id, email, mobile_number: mobileNumber || '', present_address: presentAddress || '', nationality: nationality || 'Filipino' })
      .eq('id', existing.id).select().single();
    if (linkError) { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); return res.status(400).json({ error: linkError.message }); }
    customer = updated;
  } else {
    // No existing record — create a new customer
    const { data: created, error: custError } = await supabaseAdmin.from('customers').insert({
      auth_id: authData.user.id, tenant_id: tenantId, first_name: firstName, last_name: lastName,
      date_of_birth: dateOfBirth, nationality: nationality || 'Filipino', present_address: presentAddress || '',
      mobile_number: mobileNumber || '', email, risk_rating: 'LOW',
    }).select().single();
    if (custError) { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); return res.status(400).json({ error: custError.message }); }
    customer = created;
  }

  const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (signInError) return res.status(201).json({ message: 'Account created. Please log in.', customerId: customer.id });
  res.status(201).json({ session: signInData.session, user: signInData.user, profile: customer, tenant });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  // Use anon client for auth so the admin client's service-role key isn't overridden by a user session
  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error || !data.session) return res.status(401).json({ error: error?.message || 'Invalid credentials' });

  // Use admin client for DB query to bypass RLS
  let { data: customers, error: custError } = await supabaseAdmin.from('customers')
    .select('*, tenants(id, business_name)').eq('auth_id', data.user.id).is('deleted_at', null);

  // If no linked customers found, try to link unlinked staff-created customers by email
  if ((!customers || customers.length === 0) && data.user.email) {
    const { data: unlinked } = await supabaseAdmin.from('customers')
      .select('id').is('auth_id', null).ilike('email', data.user.email).is('deleted_at', null);
    if (unlinked && unlinked.length > 0) {
      await supabaseAdmin.from('customers')
        .update({ auth_id: data.user.id })
        .in('id', unlinked.map(c => c.id));
      const refetch = await supabaseAdmin.from('customers')
        .select('*, tenants(id, business_name)').eq('auth_id', data.user.id).is('deleted_at', null);
      customers = refetch.data;
      custError = refetch.error;
    }
  }

  if (custError || !customers || customers.length === 0)
    return res.status(403).json({ error: 'No customer profile found. Are you a pawnshop staff member?' });

  const tenants = customers.map(c => ({ tenantId: c.tenant_id, customerId: c.id, businessName: c.tenants?.business_name }));
  const defaultCustomer = customers[0];
  res.json({ session: data.session, user: data.user, tenants, defaultTenant: tenants[0], firstName: defaultCustomer.first_name, lastName: defaultCustomer.last_name, avatarUrl: defaultCustomer.avatar_url });
});

const auth = require('../middleware/auth');
const customerScope = require('../middleware/customerScope');

router.get('/profile', auth, customerScope, async (req, res) => {
  const { data: customer, error } = await supabaseAdmin.from('customers')
    .select('*, tenants(id, business_name)').eq('id', req.customerId).eq('tenant_id', req.activeTenantId).is('deleted_at', null).single();
  if (error || !customer) return res.status(404).json({ error: 'Customer profile not found' });
  res.json({ profile: customer });
});

router.post('/link-tenant', auth, customerScope, async (req, res) => {
  const { tenantId } = req.body;
  if (!tenantId || !isValidUuid(tenantId)) return res.status(400).json({ error: 'Valid tenantId is required' });
  const { data: tenant, error: tenantError } = await supabaseAdmin.from('tenants')
    .select('id, business_name').eq('id', tenantId).eq('status', 'ACTIVE').is('deleted_at', null).single();
  if (tenantError || !tenant) return res.status(400).json({ error: 'Pawnshop not found or inactive' });
  if (req.customerTenants.some(c => c.tenant_id === tenantId)) return res.status(409).json({ error: 'Already linked to this pawnshop' });

  const source = req.customerProfile;
  const { data: newCustomer, error: insertError } = await supabaseAdmin.from('customers').insert({
    auth_id: req.userId, tenant_id: tenantId, first_name: source.first_name, last_name: source.last_name,
    date_of_birth: source.date_of_birth || '1990-01-01', nationality: source.nationality || 'Filipino',
    present_address: source.present_address || '', mobile_number: source.mobile_number || '',
    email: source.email, risk_rating: 'LOW',
  }).select().single();
  if (insertError) return res.status(400).json({ error: insertError.message });
  res.status(201).json({ message: 'Successfully linked to pawnshop', customer: newCustomer, tenant });
});

router.get('/tenants', auth, async (req, res) => {
  const { data: customers, error } = await supabaseAdmin.from('customers')
    .select('id, tenant_id, first_name, last_name').eq('auth_id', req.userId).is('deleted_at', null);
  if (error || !customers || customers.length === 0) return res.status(404).json({ error: 'No customer profiles found' });
  const tenantIds = customers.map(c => c.tenant_id);
  const { data: tenantDetails } = await supabaseAdmin.from('tenants').select('id, business_name').in('id', tenantIds).is('deleted_at', null);
  const tenants = customers.map(c => ({ tenantId: c.tenant_id, customerId: c.id, businessName: tenantDetails?.find(td => td.id === c.tenant_id)?.business_name }));
  const defaultCustomer = customers[0];
  res.json({ tenants, firstName: defaultCustomer.first_name, lastName: defaultCustomer.last_name, avatarUrl: defaultCustomer.avatar_url });
});

module.exports = router;
