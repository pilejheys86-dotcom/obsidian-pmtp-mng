const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination, buildSearchFilter } = require('../utils/helpers');
const { sendEmployeeWelcomeEmail } = require('../services/email');
const crypto = require('crypto');
const { logTenantAudit } = require('../utils/auditLog');

const EMPLOYEE_SORT_FIELDS = new Set(['created_at', 'full_name', 'role', 'is_active']);
const EMPLOYEE_ROLES = new Set(['ADMIN', 'MANAGER', 'AUDITOR', 'APPRAISER', 'CASHIER']);
const MAX_LIMIT = 100;

const logEvent = (event, meta = {}) => {
  console.info(JSON.stringify({ level: 'info', scope: 'employees', event, ...meta }));
};

const logError = (event, err, meta = {}) => {
  console.error(JSON.stringify({
    level: 'error',
    scope: 'employees',
    event,
    message: err && err.message ? err.message : String(err),
    ...meta,
  }));
};

const isValidUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const normalizeString = (value) => (typeof value === 'string' ? value.trim() : value);
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
const isValidPHPhone = (value) => /^\+639\d{9}$/.test(String(value || ''));

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

/**
 * Generate a default password: 12 chars, mix of upper/lower/digits/special
 */
const generateDefaultPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const special = '!@#$&*';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars[crypto.randomInt(chars.length)];
  }
  password += special[crypto.randomInt(special.length)];
  password += String(crypto.randomInt(10));
  return password;
};

/**
 * Generate a work email from name + business name
 * Format: lastnameinitialsoffirstname@businessname.obsidian.tech
 * e.g. "Matthew Marc Santua" + "PawnHub" → santuamm@pawnhub.obsidian.tech
 * e.g. "Maria Santos" + "Golden Pawn" → santosm@goldenpawn.obsidian.tech
 */
const generateWorkEmail = (firstName, lastName, businessName) => {
  const clean = (n) => n.toLowerCase().replace(/[^a-z]/g, '');
  const cleanLast = clean(lastName);
  const initials = firstName.trim().split(/\s+/).map(n => n[0]?.toLowerCase() || '').join('');
  const cleanBiz = businessName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return `${cleanLast}${initials}@${cleanBiz}.obsidian.tech`;
};

const validateEmployeePayload = (payload, mode = 'create') => {
  const errors = [];

  if (mode === 'create') {
    if (!normalizeString(payload.first_name)) errors.push('first_name is required');
    if (!normalizeString(payload.last_name)) errors.push('last_name is required');
    if (!normalizeString(payload.email)) errors.push('email is required');
    if (!normalizeString(payload.phone_number)) errors.push('phone_number is required');
    if (!normalizeString(payload.role)) errors.push('role is required');
    if (!normalizeString(payload.address_line_1)) errors.push('address_line_1 is required');
    if (!normalizeString(payload.province)) errors.push('province is required');
    if (!normalizeString(payload.city_municipality)) errors.push('city_municipality is required');
    if (!normalizeString(payload.barangay)) errors.push('barangay is required');
    if (!normalizeString(payload.zip_code)) errors.push('zip_code is required');
  }

  if (payload.email && !isValidEmail(payload.email)) {
    errors.push('email must be a valid email address');
  }

  if (payload.phone_number && !isValidPHPhone(payload.phone_number)) {
    errors.push('phone_number must be in +639XXXXXXXXX format');
  }

  if (payload.role && !EMPLOYEE_ROLES.has(payload.role)) {
    errors.push(`role must be one of: ${[...EMPLOYEE_ROLES].join(', ')}`);
  }

  if (payload.branch_id !== undefined && payload.branch_id !== null && !isValidUuid(payload.branch_id)) {
    errors.push('branch_id must be a valid UUID');
  }

  if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
    errors.push('is_active must be a boolean');
  }

  return errors;
};

const ensureBranchBelongsToTenant = async (tenantId, branchId, currentBranchId) => {
  if (!branchId) return { ok: true };
  if (currentBranchId && branchId === currentBranchId) return { ok: true };

  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return { ok: Boolean(data) };
};

// GET /api/employees — List tenant users (employees)
router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination.error) {
    return res.status(422).json({ error: pagination.error });
  }

  const { page, limit } = pagination;
  const { from, to } = getPagination(page, limit);
  const search = normalizeString(req.query.search || '');
  const role = normalizeString(req.query.role || '');
  const sortBy = normalizeString(req.query.sort_by || 'created_at');
  const sortOrder = normalizeString(req.query.sort_order || 'desc').toLowerCase();
  const active = normalizeString(req.query.active || '');

  if (!EMPLOYEE_SORT_FIELDS.has(sortBy)) {
    return res.status(422).json({ error: 'Invalid sort_by parameter.' });
  }

  if (sortOrder !== 'asc' && sortOrder !== 'desc') {
    return res.status(422).json({ error: 'Invalid sort_order parameter.' });
  }

  if (role && !EMPLOYEE_ROLES.has(role)) {
    return res.status(422).json({ error: 'Invalid role filter.' });
  }

  if (active && active !== 'true' && active !== 'false') {
    return res.status(422).json({ error: 'Invalid active filter.' });
  }

  try {
    let query = supabaseAdmin
      .from('tenant_users')
      .select('*, branches(branch_name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .neq('role', 'OWNER')
      .is('deleted_at', null)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (search) {
      const filter = buildSearchFilter(search, ['full_name', 'email', 'email']);
      if (filter) query = query.or(filter);
    }

    if (role) {
      query = query.eq('role', role);
    }

    if (active) {
      query = query.eq('is_active', active === 'true');
    }

    const { data, error, count } = await query;
    if (error) {
      logError('employees_list_failed', error, { tenantId: req.tenantId });
      return res.status(400).json({ error: 'Unable to fetch employees.' });
    }

    res.json({ data: data || [], total: count || 0, page, limit });
  } catch (err) {
    logError('employees_list_unhandled', err, { tenantId: req.tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/employees/stats — KPI stats
router.get('/stats', async (req, res) => {
  const tenantId = req.tenantId;

  try {
    const { count: total } = await supabaseAdmin
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .neq('role', 'OWNER')
      .is('deleted_at', null);

    const { count: active } = await supabaseAdmin
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .neq('role', 'OWNER')
      .eq('is_active', true)
      .is('deleted_at', null);

    const { data: roles } = await supabaseAdmin
      .from('tenant_users')
      .select('role')
      .eq('tenant_id', tenantId)
      .neq('role', 'OWNER')
      .is('deleted_at', null);

    const roleRows = Array.isArray(roles) ? roles : [];
    const uniqueRoles = new Set(roleRows.map(r => r.role)).size;

    res.json({
      totalEmployees: total || 0,
      activeStaff: active || 0,
      roles: uniqueRoles,
    });
  } catch (err) {
    logError('employees_stats_failed', err, { tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid employee id.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tenant_users')
      .select('*, branches(*)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Employee not found' });
    res.json(data);
  } catch (err) {
    logError('employee_details_failed', err, { tenantId: req.tenantId, employeeId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/employees — Add employee
router.post('/', async (req, res) => {
  const payload = {
    first_name: normalizeString(req.body.first_name),
    last_name: normalizeString(req.body.last_name),
    email: normalizeString(req.body.email),
    phone_number: normalizeString(req.body.phone_number),
    date_of_birth: req.body.date_of_birth || null,
    address_line_1: normalizeString(req.body.address_line_1),
    address_line_2: normalizeString(req.body.address_line_2) || null,
    province: normalizeString(req.body.province),
    city_municipality: normalizeString(req.body.city_municipality),
    barangay: normalizeString(req.body.barangay),
    zip_code: normalizeString(req.body.zip_code),
    role: normalizeString(req.body.role),
    branch_id: req.body.branch_id || null,
    send_welcome: req.body.send_welcome !== false,
    ssn_tax_id: normalizeString(req.body.ssn_tax_id) || null,
    id_type: normalizeString(req.body.id_type) || null,
    id_front_url: normalizeString(req.body.id_front_url) || null,
    id_back_url: normalizeString(req.body.id_back_url) || null,
  };

  // Only OWNER can add employees
  if (req.userRole !== 'OWNER' && req.userRole !== 'ADMIN' && req.userRole !== 'MANAGER') {
    return res.status(403).json({ error: 'Only owners, admins, or managers can add employees' });
  }

  // Managers cannot create MANAGER or ADMIN roles
  if (req.userRole === 'MANAGER' && (payload.role === 'MANAGER' || payload.role === 'ADMIN')) {
    return res.status(403).json({ error: 'Managers cannot assign Manager or Admin roles.' });
  }

  const errors = validateEmployeePayload(payload, 'create');
  if (errors.length > 0) {
    return res.status(422).json({ error: errors.join('; ') });
  }

  try {
    const branchCheck = await ensureBranchBelongsToTenant(req.tenantId, payload.branch_id || req.branchId, req.branchId);
    if (!branchCheck.ok) {
      return res.status(422).json({ error: 'branch_id is not valid for this tenant.' });
    }

    // Get tenant business name for work email generation
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_name')
      .eq('id', req.tenantId)
      .single();

    const businessName = tenant?.business_name || 'obsidian';
    const fullName = `${payload.first_name} ${payload.last_name}`;
    const baseWorkEmail = generateWorkEmail(payload.first_name, payload.last_name, businessName);
    let workEmail = baseWorkEmail;
    const defaultPassword = generateDefaultPassword();

    // Create auth user — retry with suffixed email on collision (handles orphans + same-name employees)
    let authData, authError;
    const [baseLocal, domain] = baseWorkEmail.split('@');

    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await supabaseAdmin.auth.admin.createUser({
        email: workEmail,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      authData = result.data;
      authError = result.error;

      if (!authError) break; // success
      if (!/already registered|already exists|already been registered/i.test(authError.message)) break; // non-duplicate error

      // Email taken — try next suffix (maria.santos2@, maria.santos3@, …)
      workEmail = `${baseLocal}${attempt + 2}@${domain}`;
    }

    if (authError || !authData || !authData.user) {
      logError('employee_create_auth_failed', authError, { tenantId: req.tenantId });
      return res.status(400).json({ error: authError?.message || 'Unable to create employee account.' });
    }

    // Insert employees record (retry once after delay for auth.users FK propagation)
    const employeeRow = {
      id: authData.user.id,
      tenant_id: req.tenantId,
      branch_id: payload.branch_id || req.branchId,
      role: payload.role,
      full_name: fullName,
      email: workEmail,
      phone_number: payload.phone_number,
      date_of_birth: payload.date_of_birth,
      address_line_1: payload.address_line_1,
      address_line_2: payload.address_line_2,
      province: payload.province,
      city_municipality: payload.city_municipality,
      barangay: payload.barangay,
      zip_code: payload.zip_code,
      ssn_tax_id: payload.ssn_tax_id,
      id_type: payload.id_type,
      id_front_url: payload.id_front_url,
      id_back_url: payload.id_back_url,
      kyc_status: (payload.id_front_url && payload.id_back_url) ? 'SUBMITTED' : 'PENDING',
      is_active: true,
      must_change_password: true,
    };

    let employee, dbError;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await supabaseAdmin.from('tenant_users').insert(employeeRow).select().single();
      employee = result.data;
      dbError = result.error;
      if (!dbError) break;
      // If FK violation on auth.users, wait and retry
      if (dbError.code === '23503' && dbError.message.includes('_id_fkey') && attempt < 2) {
        logEvent('employee_insert_retry', { attempt: attempt + 1, tenantId: req.tenantId });
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      break;
    }

    if (dbError || !employee) {
      logError('employee_create_profile_failed', dbError, { tenantId: req.tenantId, authUserId: authData.user.id });

      try {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        logEvent('employee_create_rollback_auth_deleted', { tenantId: req.tenantId, authUserId: authData.user.id });
      } catch (rollbackErr) {
        logError('employee_create_rollback_failed', rollbackErr, { tenantId: req.tenantId, authUserId: authData.user.id });
        return res.status(500).json({ error: 'Internal server error' });
      }

      return res.status(400).json({ error: 'Unable to create employee profile.' });
    }

    // Send temporary credentials email
    if (payload.send_welcome && payload.email) {
      try {
        const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`;
        await sendEmployeeWelcomeEmail({
          to: payload.email,
          fullName,
          role: payload.role,
          workEmail,
          defaultPassword,
          businessName,
          loginUrl,
        });
        logEvent('employee_credentials_sent', { email: payload.email });
      } catch (emailErr) {
        logError('employee_credentials_email_failed', emailErr, { email: payload.email });
      }
    }

    logEvent('employee_created', { tenantId: req.tenantId, employeeId: employee.id, role: employee.role });
    logTenantAudit(req, {
      action: 'EMPLOYEE_CREATED', category: 'EMPLOYEE',
      description: `Created employee ${employee.full_name} (${employee.role})`,
      target_type: 'tenant_user', target_id: employee.id,
    });
    res.status(201).json(employee);
  } catch (err) {
    logError('employee_create_unhandled', err, { tenantId: req.tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/employees/:id — Update employee
router.patch('/:id', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid employee id.' });
  }

  if (req.userRole !== 'OWNER' && req.userRole !== 'ADMIN' && req.userRole !== 'MANAGER') {
    return res.status(403).json({ error: 'Only owners, admins, or managers can modify employees' });
  }

  const payload = { ...req.body };

  // Normalize string fields
  const stringFields = ['full_name', 'role', 'branch_id', 'email', 'phone_number',
    'address_line_1', 'address_line_2', 'province', 'city_municipality', 'barangay', 'zip_code'];
  for (const key of stringFields) {
    if (payload[key] !== undefined) payload[key] = normalizeString(payload[key]);
  }

  const errors = validateEmployeePayload(payload, 'update');
  if (errors.length > 0) {
    return res.status(422).json({ error: errors.join('; ') });
  }

  try {
    if (payload.branch_id) {
      const branchCheck = await ensureBranchBelongsToTenant(req.tenantId, payload.branch_id, req.branchId);
      if (!branchCheck.ok) {
        return res.status(422).json({ error: 'branch_id is not valid for this tenant.' });
      }
    }

    const ALLOWED_FIELDS = new Set([
      'full_name', 'role', 'branch_id', 'is_active',
      'email', 'phone_number', 'date_of_birth',
      'address_line_1', 'address_line_2', 'province',
      'city_municipality', 'barangay', 'zip_code',
      'ssn_tax_id',
    ]);
    const safeUpdate = { updated_at: new Date().toISOString() };
    for (const key of Object.keys(payload)) {
      if (ALLOWED_FIELDS.has(key)) safeUpdate[key] = payload[key];
    }

    const { data, error } = await supabaseAdmin
      .from('tenant_users')
      .update(safeUpdate)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !data) return res.status(400).json({ error: 'Unable to update employee.' });

    logEvent('employee_updated', { tenantId: req.tenantId, employeeId: req.params.id });
    res.json(data);
  } catch (err) {
    logError('employee_update_failed', err, { tenantId: req.tenantId, employeeId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/employees/:id/kyc-approve — Approve employee KYC
router.post('/:id/kyc-approve', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid employee id.' });
  }

  // Fetch the target employee to check their role
  const { data: target } = await supabaseAdmin
    .from('tenant_users')
    .select('id, role, kyc_status')
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .single();

  if (!target) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Manager KYC can only be approved by OWNER or ADMIN
  if (target.role === 'MANAGER' && req.userRole !== 'OWNER' && req.userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Only Owner or Admin can approve Manager KYC.' });
  }

  // Non-manager KYC can be approved by OWNER, ADMIN, or MANAGER
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'You do not have permission to approve KYC.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tenant_users')
      .update({ kyc_status: 'VERIFIED', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !data) return res.status(400).json({ error: 'Unable to approve KYC.' });

    logEvent('employee_kyc_approved', { tenantId: req.tenantId, employeeId: req.params.id, approvedBy: req.userId });
    res.json(data);
  } catch (err) {
    logError('employee_kyc_approve_failed', err, { tenantId: req.tenantId, employeeId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/employees/:id/kyc-reject — Reject employee KYC
router.post('/:id/kyc-reject', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid employee id.' });
  }

  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'You do not have permission to reject KYC.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tenant_users')
      .update({ kyc_status: 'REJECTED', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !data) return res.status(400).json({ error: 'Unable to reject KYC.' });

    logEvent('employee_kyc_rejected', { tenantId: req.tenantId, employeeId: req.params.id, rejectedBy: req.userId });
    res.json(data);
  } catch (err) {
    logError('employee_kyc_reject_failed', err, { tenantId: req.tenantId, employeeId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/employees/:id — Soft deactivate
router.delete('/:id', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid employee id.' });
  }

  if (req.userRole !== 'OWNER' && req.userRole !== 'ADMIN' && req.userRole !== 'MANAGER') {
    return res.status(403).json({ error: 'Only owners, admins, or managers can deactivate employees' });
  }

  try {
    const { error } = await supabaseAdmin
      .from('tenant_users')
      .update({ is_active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null);

    if (error) return res.status(400).json({ error: 'Unable to deactivate employee.' });

    logEvent('employee_deactivated', { tenantId: req.tenantId, employeeId: req.params.id });
    logTenantAudit(req, {
      action: 'EMPLOYEE_DEACTIVATED', category: 'EMPLOYEE',
      description: 'Deactivated employee',
      target_type: 'tenant_user', target_id: req.params.id,
    });
    res.json({ message: 'Employee deactivated' });
  } catch (err) {
    logError('employee_deactivate_failed', err, { tenantId: req.tenantId, employeeId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/employees/:id/resend-otp — Resend OTP to employee
router.post('/:id/resend-otp', async (req, res) => {
  if (req.userRole !== 'OWNER' && req.userRole !== 'ADMIN' && req.userRole !== 'MANAGER') {
    return res.status(403).json({ error: 'Only owners, admins, or managers can resend credentials' });
  }

  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid employee id.' });
  }

  try {
    const { data: employee } = await supabaseAdmin
      .from('tenant_users')
      .select('id, full_name, role, email')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .single();

    if (!employee || !employee.email) {
      return res.status(404).json({ error: 'Employee not found or no email on file.' });
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_name')
      .eq('id', req.tenantId)
      .single();

    const otp = generateOtp();
    const stored = storeRegistrationOtp(employee.email, otp, {
      type: 'employee',
      userId: employee.id,
      tenantId: req.tenantId,
      fullName: employee.full_name,
    });

    if (!stored.stored) {
      return res.status(429).json({ error: stored.reason });
    }

    await sendEmployeeOtpEmail({
      to: employee.email,
      fullName: employee.full_name,
      role: employee.role,
      businessName: tenant?.business_name || 'Obsidian',
      otp,
    });

    res.json({ message: 'Verification code resent.' });
  } catch (err) {
    logError('employee_resend_otp_failed', err);
    res.status(500).json({ error: 'Failed to resend code.' });
  }
});

module.exports = router;
