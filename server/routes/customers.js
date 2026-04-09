const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination, sanitizeSearch, buildSearchFilter, generateTempPassword } = require('../utils/helpers');
const { sendCustomerWelcomeEmail } = require('../services/email');
const { logTenantAudit } = require('../utils/auditLog');

const CUSTOMER_SORT_FIELDS = new Set(['created_at', 'first_name', 'last_name', 'risk_rating']);
const CUSTOMER_RISK_VALUES = new Set(['LOW', 'MEDIUM', 'HIGH']);
const MAX_LIMIT = 100;

const logEvent = (event, meta = {}) => {
  console.info(JSON.stringify({ level: 'info', scope: 'customers', event, ...meta }));
};

const logError = (event, err, meta = {}) => {
  console.error(JSON.stringify({
    level: 'error',
    scope: 'customers',
    event,
    message: err && err.message ? err.message : String(err),
    ...meta,
  }));
};

const isValidUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const normalizeString = (value) => (typeof value === 'string' ? value.trim() : value);
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
const isValidMobile = (value) => /^\+?[0-9]{10,15}$/.test(String(value || ''));

const parsePagination = (query) => {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 10);

  if (!Number.isInteger(page) || page < 1) {
    return { error: 'Invalid page parameter. Must be an integer >= 1.' };
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { error: `Invalid limit parameter. Must be an integer between 1 and ${MAX_LIMIT}.` };
  }

  return { page, limit };
};

const validateCustomerPayload = (payload, mode = 'create') => {
  const requiredFields = ['first_name', 'last_name', 'date_of_birth', 'nationality', 'present_address', 'mobile_number'];
  const errors = [];

  if (mode === 'create') {
    for (const field of requiredFields) {
      if (!normalizeString(payload[field])) {
        errors.push(`${field} is required`);
      }
    }
  }

  if (payload.email && !isValidEmail(payload.email)) {
    errors.push('email must be a valid email address');
  }

  if (payload.mobile_number && !isValidMobile(payload.mobile_number)) {
    errors.push('mobile_number must contain 10 to 15 digits');
  }

  if (payload.risk_rating && !CUSTOMER_RISK_VALUES.has(payload.risk_rating)) {
    errors.push('risk_rating must be LOW, MEDIUM, or HIGH');
  }

  if (payload.kyc_documents !== undefined) {
    if (!Array.isArray(payload.kyc_documents)) {
      errors.push('kyc_documents must be an array');
    } else {
      payload.kyc_documents.forEach((doc, index) => {
        if (!normalizeString(doc.id_type)) errors.push(`kyc_documents[${index}].id_type is required`);
        if (!normalizeString(doc.id_number)) errors.push(`kyc_documents[${index}].id_number is required`);
        if (!normalizeString(doc.image_front_url)) errors.push(`kyc_documents[${index}].image_front_url is required`);
        if (!normalizeString(doc.specimen_sig_url)) errors.push(`kyc_documents[${index}].specimen_sig_url is required`);
      });
    }
  }

  return errors;
};

const ensureCustomerUniqueness = async ({ tenantId, mobile_number, email, excludeId }) => {
  if (mobile_number) {
    let mobileQuery = supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('mobile_number', mobile_number)
      .is('deleted_at', null);

    if (excludeId) {
      mobileQuery = mobileQuery.neq('id', excludeId);
    }

    const { count: mobileCount, error: mobileErr } = await mobileQuery;
    if (mobileErr) throw mobileErr;
    if ((mobileCount || 0) > 0) {
      return { error: 'A customer with this mobile_number already exists.' };
    }
  }

  if (email) {
    let emailQuery = supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .ilike('email', email)
      .is('deleted_at', null);

    if (excludeId) {
      emailQuery = emailQuery.neq('id', excludeId);
    }

    const { count: emailCount, error: emailErr } = await emailQuery;
    if (emailErr) throw emailErr;
    if ((emailCount || 0) > 0) {
      return { error: 'A customer with this email already exists.' };
    }
  }

  return { error: null };
};

// GET /api/customers — List customers with pagination
router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination.error) {
    return res.status(422).json({ error: pagination.error });
  }

  const { page, limit } = pagination;
  const { from, to } = getPagination(page, limit);
  const search = normalizeString(req.query.search || '');
  const riskRating = normalizeString(req.query.risk_rating || '');
  const sortBy = normalizeString(req.query.sort_by || 'created_at');
  const sortOrder = normalizeString(req.query.sort_order || 'desc').toLowerCase();

  if (!CUSTOMER_SORT_FIELDS.has(sortBy)) {
    return res.status(422).json({ error: 'Invalid sort_by parameter.' });
  }

  if (sortOrder !== 'asc' && sortOrder !== 'desc') {
    return res.status(422).json({ error: 'Invalid sort_order parameter.' });
  }

  try {
    let query = supabaseAdmin
      .from('customers')
      .select('*, pawn_tickets!pawn_tickets_customer_id_fkey(id, status)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (search) {
      const filter = buildSearchFilter(search, ['first_name', 'last_name', 'email', 'mobile_number']);
      if (filter) query = query.or(filter);
    }

    if (riskRating) {
      if (!CUSTOMER_RISK_VALUES.has(riskRating)) {
        return res.status(422).json({ error: 'Invalid risk_rating filter.' });
      }
      query = query.eq('risk_rating', riskRating);
    }

    const { data, error, count } = await query;

    if (error) {
      logError('customers_list_failed', error, { tenantId: req.tenantId });
      console.error('[customers] LIST query error detail:', JSON.stringify(error));
      return res.status(400).json({ error: error.message || 'Unable to fetch customers.' });
    }

    if (data && data.length > 0) {
      const customerIds = data.map(c => c.id);
      const { data: kycMedia } = await supabaseAdmin
        .from('media')
        .select('*')
        .eq('ref_type', 'CUSTOMER_KYC')
        .eq('tenant_id', req.tenantId)
        .in('ref_id', customerIds)
        .is('deleted_at', null);

      data.forEach(c => {
        c.kyc_documents = (kycMedia || []).filter(m => m.ref_id === c.id);
      });
    }

    const customers = (data || []).map(c => ({
      ...c,
      activeLoans: (c.pawn_tickets || []).filter(t => t.status === 'ACTIVE').length,
      totalLoans: (c.pawn_tickets || []).length,
    }));

    res.json({ data: customers, total: count, page, limit });
  } catch (err) {
    logError('customers_list_unhandled', err, { tenantId: req.tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/stats — KPI stats
router.get('/stats', async (req, res) => {
  const tenantId = req.tenantId;

  try {
    const { count: totalCustomers } = await supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    const { data: activeLoanHolders } = await supabaseAdmin
      .from('pawn_tickets')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null);

    const uniqueActive = new Set((activeLoanHolders || []).map(t => t.customer_id)).size;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: newThisMonth } = await supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', startOfMonth.toISOString())
      .is('deleted_at', null);

    res.json({
      totalCustomers: totalCustomers || 0,
      activeLoanHolders: uniqueActive,
      newThisMonth: newThisMonth || 0,
    });
  } catch (err) {
    logError('customers_stats_failed', err, { tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/archived — List archived (soft-deleted) customers
router.get('/archived', async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination.error) {
    return res.status(422).json({ error: pagination.error });
  }

  const { page, limit } = pagination;
  const { from, to } = getPagination(page, limit);
  const search = normalizeString(req.query.search || '');

  try {
    let query = supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .range(from, to);

    if (search) {
      const filter = buildSearchFilter(search, ['first_name', 'last_name', 'email', 'mobile_number']);
      if (filter) query = query.or(filter);
    }

    const { data, error, count } = await query;

    if (error) {
      logError('customers_archived_list_failed', error, { tenantId: req.tenantId });
      return res.status(400).json({ error: error.message || 'Unable to fetch archived customers.' });
    }

    res.json({ data: data || [], total: count, page, limit });
  } catch (err) {
    logError('customers_archived_list_unhandled', err, { tenantId: req.tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/:id/restore — Restore archived customer
router.post('/:id/restore', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid customer id.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .not('deleted_at', 'is', null)
      .select()
      .single();

    if (error || !data) {
      return res.status(400).json({ error: 'Unable to restore customer.' });
    }

    logEvent('customer_restored', { tenantId: req.tenantId, customerId: req.params.id });
    res.json(data);
  } catch (err) {
    logError('customer_restore_unhandled', err, { tenantId: req.tenantId, customerId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:id/permanent — Permanently delete archived customer
router.delete('/:id/permanent', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid customer id.' });
  }

  try {
    // Verify the customer is archived before allowing permanent delete
    const { data: customer, error: findErr } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .not('deleted_at', 'is', null)
      .single();

    if (findErr || !customer) {
      return res.status(404).json({ error: 'Archived customer not found. Only archived customers can be permanently deleted.' });
    }

    // Delete related media/KYC documents
    await supabaseAdmin
      .from('media')
      .delete()
      .eq('ref_type', 'CUSTOMER_KYC')
      .eq('ref_id', req.params.id)
      .eq('tenant_id', req.tenantId);

    // Delete the customer record
    const { error } = await supabaseAdmin
      .from('customers')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId);

    if (error) {
      logError('customer_permanent_delete_failed', error, { tenantId: req.tenantId, customerId: req.params.id });
      return res.status(400).json({ error: 'Unable to permanently delete customer.' });
    }

    logEvent('customer_permanently_deleted', { tenantId: req.tenantId, customerId: req.params.id });
    res.json({ message: 'Customer permanently deleted' });
  } catch (err) {
    logError('customer_permanent_delete_unhandled', err, { tenantId: req.tenantId, customerId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/:id — Single customer with full details
router.get('/:id', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid customer id.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select(`
        *,
        pawn_tickets!pawn_tickets_customer_id_fkey(*, pawn_items(*), transactions(*))
      `)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { data: kycMedia } = await supabaseAdmin
      .from('media')
      .select('*')
      .eq('ref_type', 'CUSTOMER_KYC')
      .eq('tenant_id', req.tenantId)
      .eq('ref_id', data.id)
      .is('deleted_at', null);

    data.kyc_documents = kycMedia || [];

    res.json(data);
  } catch (err) {
    logError('customer_details_failed', err, { tenantId: req.tenantId, customerId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers — Create customer + KYC documents
router.post('/', async (req, res) => {
  const {
    first_name, middle_name, last_name, date_of_birth, nationality,
    present_address, present_address_line1, present_address_line2,
    present_province_code, present_province, present_city_code, present_city,
    present_barangay, present_zip_code,
    mobile_number, email,
    risk_rating, kyc_documents
  } = req.body;

  const payload = {
    first_name: normalizeString(first_name),
    middle_name: normalizeString(middle_name) || null,
    last_name: normalizeString(last_name),
    date_of_birth,
    nationality: normalizeString(nationality),
    present_address: normalizeString(present_address),
    present_address_line1: normalizeString(present_address_line1) || null,
    present_address_line2: normalizeString(present_address_line2) || null,
    present_province_code: normalizeString(present_province_code) || null,
    present_province: normalizeString(present_province) || null,
    present_city_code: normalizeString(present_city_code) || null,
    present_city: normalizeString(present_city) || null,
    present_barangay: normalizeString(present_barangay) || null,
    present_zip_code: normalizeString(present_zip_code) || null,
    mobile_number: normalizeString(mobile_number),
    email: normalizeString(email),
    risk_rating: risk_rating || 'LOW',
    kyc_documents,
  };

  const errors = validateCustomerPayload(payload, 'create');
  if (errors.length > 0) {
    return res.status(422).json({ error: errors.join('; ') });
  }

  try {
    const uniqueness = await ensureCustomerUniqueness({
      tenantId: req.tenantId,
      mobile_number: payload.mobile_number,
      email: payload.email,
    });

    if (uniqueness.error) {
      return res.status(409).json({ error: uniqueness.error });
    }

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .insert({
        tenant_id: req.tenantId,
        first_name: payload.first_name,
        last_name: payload.last_name,
        date_of_birth: payload.date_of_birth,
        nationality: payload.nationality,
        present_address: payload.present_address || [payload.present_address_line1, payload.present_address_line2].filter(Boolean).join(', ') || '',
        province: payload.present_province || payload.province || null,
        city_municipality: payload.present_city || payload.city_municipality || null,
        barangay: payload.present_barangay || payload.barangay || null,
        zip_code: payload.present_zip_code || payload.zip_code || null,
        mobile_number: payload.mobile_number,
        email: payload.email || null,
        risk_rating: payload.risk_rating,
      })
      .select()
      .single();

    if (error || !customer) {
      logError('customer_create_failed', error, { tenantId: req.tenantId });
      return res.status(400).json({ error: 'Unable to create customer.' });
    }

    if (Array.isArray(payload.kyc_documents) && payload.kyc_documents.length > 0) {
      const mediaRecords = payload.kyc_documents.flatMap(doc => {
        const records = [];
        const meta = { id_type: doc.id_type, id_number: doc.id_number, expiry_date: doc.expiry_date || null };
        if (doc.image_front_url) {
          records.push({
            tenant_id: req.tenantId,
            ref_type: 'CUSTOMER_KYC',
            ref_id: customer.id,
            image_url: doc.image_front_url,
            label: 'front',
            metadata: meta,
          });
        }
        if (doc.image_back_url) {
          records.push({
            tenant_id: req.tenantId,
            ref_type: 'CUSTOMER_KYC',
            ref_id: customer.id,
            image_url: doc.image_back_url,
            label: 'back',
            metadata: meta,
          });
        }
        if (doc.specimen_sig_url) {
          records.push({
            tenant_id: req.tenantId,
            ref_type: 'CUSTOMER_KYC',
            ref_id: customer.id,
            image_url: doc.specimen_sig_url,
            label: 'signature',
            metadata: meta,
          });
        }
        return records;
      });

      if (mediaRecords.length > 0) {
        const { error: mediaError } = await supabaseAdmin.from('media').insert(mediaRecords);
        if (mediaError) console.error('KYC media insert error:', mediaError.message);
      }
    }

    // Create auth account + send welcome email with temp credentials (if email provided)
    if (payload.email) {
      try {
        const tempPassword = generateTempPassword();
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: payload.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: `${payload.first_name} ${payload.last_name}`,
            role: 'customer',
          },
        });

        if (authData?.user) {
          // Link auth_id to customer record
          await supabaseAdmin
            .from('customers')
            .update({ auth_id: authData.user.id })
            .eq('id', customer.id);

          // Send welcome email with temporary credentials
          const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('business_name')
            .eq('id', req.tenantId)
            .single();

          await sendCustomerWelcomeEmail({
            to: payload.email,
            fullName: `${payload.first_name} ${payload.last_name}`,
            email: payload.email,
            tempPassword,
            businessName: tenant?.business_name || 'Obsidian',
          });

          logEvent('customer_welcome_sent', { email: payload.email, customerId: customer.id });
        } else if (authError) {
          // Auth user may already exist (customer registered at another tenant) — try to link instead
          if (authError.message?.includes('already been registered')) {
            try {
              const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
              const existingAuth = existingUsers?.users?.find(u => u.email?.toLowerCase() === payload.email.toLowerCase());
              if (existingAuth) {
                await supabaseAdmin.from('customers').update({ auth_id: existingAuth.id }).eq('id', customer.id);
                // Sync profile data from any existing tenant record for this auth user
                try { await supabaseAdmin.rpc('sync_customer_profile', { p_auth_id: existingAuth.id, p_source_customer_id: customer.id }); } catch (_) {}
                logEvent('customer_linked_to_existing_auth', { email: payload.email, customerId: customer.id });
              } else {
                logError('customer_auth_create_failed', authError, { email: payload.email });
              }
            } catch (linkErr) {
              logError('customer_auth_link_failed', linkErr, { email: payload.email });
            }
          } else {
            logError('customer_auth_create_failed', authError, { email: payload.email });
          }
        }
      } catch (authErr) {
        logError('customer_auth_setup_failed', authErr, { email: payload.email });
        // Non-blocking: customer record exists, auth/email just failed
      }
    }

    logEvent('customer_created', { tenantId: req.tenantId, customerId: customer.id });
    logTenantAudit(req, {
      action: 'CUSTOMER_CREATED', category: 'CUSTOMER',
      description: `Created customer ${customer.first_name} ${customer.last_name}`,
      target_type: 'customer', target_id: customer.id,
    });
    res.status(201).json(customer);
  } catch (err) {
    logError('customer_create_unhandled', err, { tenantId: req.tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/customers/:id — Update customer
router.patch('/:id', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid customer id.' });
  }

  const payload = { ...req.body };
  if (payload.first_name !== undefined) payload.first_name = normalizeString(payload.first_name);
  if (payload.last_name !== undefined) payload.last_name = normalizeString(payload.last_name);
  if (payload.nationality !== undefined) payload.nationality = normalizeString(payload.nationality);
  if (payload.present_address !== undefined) payload.present_address = normalizeString(payload.present_address);
  if (payload.mobile_number !== undefined) payload.mobile_number = normalizeString(payload.mobile_number);
  if (payload.email !== undefined) payload.email = normalizeString(payload.email);

  const errors = validateCustomerPayload(payload, 'update');
  if (errors.length > 0) {
    return res.status(422).json({ error: errors.join('; ') });
  }

  try {
    const uniqueness = await ensureCustomerUniqueness({
      tenantId: req.tenantId,
      mobile_number: payload.mobile_number,
      email: payload.email,
      excludeId: req.params.id,
    });

    if (uniqueness.error) {
      return res.status(409).json({ error: uniqueness.error });
    }

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !data) {
      return res.status(400).json({ error: 'Unable to update customer.' });
    }

    logEvent('customer_updated', { tenantId: req.tenantId, customerId: req.params.id });
    logTenantAudit(req, {
      action: 'CUSTOMER_UPDATED', category: 'CUSTOMER',
      description: `Updated customer ${data.first_name} ${data.last_name}`,
      target_type: 'customer', target_id: data.id,
    });
    res.json(data);
  } catch (err) {
    logError('customer_update_unhandled', err, { tenantId: req.tenantId, customerId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:id — Soft delete
router.delete('/:id', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid customer id.' });
  }

  try {
    const { error } = await supabaseAdmin
      .from('customers')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null);

    if (error) {
      logError('customer_soft_delete_failed', error, { tenantId: req.tenantId, customerId: req.params.id });
      return res.status(400).json({ error: 'Unable to delete customer.' });
    }

    logEvent('customer_soft_deleted', { tenantId: req.tenantId, customerId: req.params.id });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    logError('customer_soft_delete_unhandled', err, { tenantId: req.tenantId, customerId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/:id/resend-otp — Resend OTP to customer
router.post('/:id/resend-otp', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid customer id.' });
  }

  try {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, first_name, last_name, email, auth_id')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .single();

    if (!customer || !customer.email) {
      return res.status(404).json({ error: 'Customer not found or no email on file.' });
    }

    if (!customer.auth_id) {
      return res.status(400).json({ error: 'Customer has no portal account.' });
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_name')
      .eq('id', req.tenantId)
      .single();

    const fullName = `${customer.first_name} ${customer.last_name}`;
    const otp = generateOtp();
    const stored = storeRegistrationOtp(customer.email, otp, {
      type: 'customer',
      userId: customer.auth_id,
      tenantId: req.tenantId,
      fullName,
    });

    if (!stored.stored) {
      return res.status(429).json({ error: stored.reason });
    }

    await sendCustomerOtpEmail({
      to: customer.email,
      fullName,
      businessName: tenant?.business_name || 'Obsidian',
      otp,
    });

    res.json({ message: 'Verification code resent.' });
  } catch (err) {
    logError('customer_resend_otp_failed', err);
    res.status(500).json({ error: 'Failed to resend code.' });
  }
});

module.exports = router;
