const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { sendOwnerWelcomeEmail, sendPasswordResetEmail, sendSignupOtpEmail } = require('../services/email');
const { generateOtp, generateResetToken, storeOtp, verifyOtp, storeResetToken, verifyResetToken, storeRegistrationOtp, verifyRegistrationOtp } = require('../utils/helpers');
const auth = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { logTenantAudit } = require('../utils/auditLog');

// In-memory rate limiter for signup OTP
const _signupRateLimit = new Map();
const SIGNUP_RATE_LIMIT = 3;
const SIGNUP_RATE_WINDOW = 10 * 60 * 1000;

// Temporary store for signup data pending OTP verification
const _signupPendingStore = new Map();
const SIGNUP_PENDING_EXPIRY = 10 * 60 * 1000;

// POST /api/auth/register — Owner registration (creates tenant, branch, user)
router.post('/register', async (req, res) => {
  const {
    fullName, email, password,
    businessName, businessType, bspRegNo, secDtiRegNo, tinNumber,
    businessPhone, businessEmail,
    streetAddress, barangay, cityMunicipality, province, zipCode
  } = req.body;

  // Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  // Call register_owner RPC (also seeds tenant defaults internally)
  const { error: rpcError } = await supabaseAdmin.rpc('register_owner', {
    p_user_id:                 authData.user.id,
    p_full_name:               fullName,
    p_email:                   email,
    p_business_name:           businessName,
    p_business_type:           businessType || 'SOLE_PROPRIETOR',
    p_bsp_registration_no:     bspRegNo,
    p_sec_dti_registration_no: secDtiRegNo,
    p_tin_number:              tinNumber,
    p_business_phone:          businessPhone,
    p_business_email:          businessEmail,
    p_street_address:          streetAddress,
    p_barangay:                barangay,
    p_city_municipality:       cityMunicipality,
    p_province:                province,
    p_zip_code:                zipCode,
  });

  if (rpcError) {
    // Cleanup: delete the auth user if RPC fails
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(400).json({ error: rpcError.message });
  }

  // Send welcome email with sign-in link
  const loginUrl = `${process.env.CLIENT_URL}/login`;
  try {
    await sendOwnerWelcomeEmail({ to: email, fullName, businessName, loginUrl });
  } catch (emailErr) {
    console.error('[EMAIL] Welcome email failed:', emailErr.message);
  }

  res.status(201).json({ message: 'Registration successful.', userId: authData.user.id });
});

// POST /api/auth/welcome-email — Send welcome email (called from frontend after signup)
router.post('/welcome-email', async (req, res) => {
  const { email, fullName, businessName } = req.body;
  if (!email || !fullName || !businessName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const loginUrl = `${process.env.CLIENT_URL}/login`;
  try {
    await sendOwnerWelcomeEmail({ to: email, fullName, businessName, loginUrl });
    res.json({ sent: true });
  } catch (err) {
    console.error('[EMAIL] Welcome email failed:', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// POST /api/auth/resolve-email — Resolve email for login
router.post('/resolve-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(422).json({ error: 'Email is required.' });

  const { data: match } = await supabaseAdmin
    .from('tenant_users')
    .select('email')
    .eq('email', email.trim().toLowerCase())
    .is('deleted_at', null)
    .maybeSingle();

  res.json({ loginEmail: match?.email || email.trim().toLowerCase() });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) {
    return res.status(401).json({ error: error.message });
  }

  // Block customers from logging into the web management app
  const { data: customerRecord } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('auth_id', data.user.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (customerRecord) {
    return res.status(403).json({ error: 'This account is registered as a customer. Please use the mobile app to log in.' });
  }

  // Check if user is a super admin first
  const { data: adminProfile } = await supabaseAdmin
    .from('super_admins')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (adminProfile) {
    // Audit log — super admin login (wrap in try/catch to never block login)
    try {
      await supabaseAdmin.from('platform_audit_logs').insert({
        admin_id: adminProfile.id,
        action: 'ADMIN_LOGIN',
        target_type: 'SUPER_ADMIN',
        target_id: adminProfile.id,
        details: { email: adminProfile.email, full_name: adminProfile.full_name },
        ip_address: req.ip || null,
      });
    } catch (auditErr) {
      console.error('[AUTH] Login audit error:', auditErr.message);
    }

    return res.json({
      session: data.session,
      user: data.user,
      profile: {
        id: adminProfile.id,
        full_name: adminProfile.full_name,
        role: 'superadmin',
        is_active: adminProfile.is_active,
        tenant_id: null,
        branch_id: null,
      },
    });
  }

  const { data: tuProfile } = await supabaseAdmin
    .from('tenant_users')
    .select('*, tenants(*), branches(*)')
    .eq('id', data.user.id)
    .is('deleted_at', null)
    .single();

  // Audit log — tenant user login (admin_id = null, actor info in details)
  if (tuProfile) {
    try {
      await supabaseAdmin.from('platform_audit_logs').insert({
        admin_id: null,
        action: 'USER_LOGIN',
        target_type: 'TENANT_USER',
        target_id: tuProfile.id,
        details: {
          email: tuProfile.email || email,
          full_name: tuProfile.full_name,
          role: tuProfile.role,
          tenant_id: tuProfile.tenant_id,
        },
        ip_address: req.ip || null,
      });
    } catch (auditErr) {
      console.error('[AUTH] Login audit error:', auditErr.message);
    }
  }

  // Tenant audit log
  if (tuProfile) {
    logTenantAudit(
      { ...req, tenantId: tuProfile.tenant_id, userId: tuProfile.id },
      { action: 'LOGIN_SUCCESS', category: 'AUTH', description: `${tuProfile.full_name} logged in`, target_type: 'tenant_user', target_id: tuProfile.id }
    );
  }

  res.json({
    session: data.session,
    user: data.user,
    profile: tuProfile || null,
  });
});

// POST /api/auth/logout — Log the logout event
router.post('/logout', auth, async (req, res) => {
  try {
    const userId = req.userId;

    // Check if super admin
    const { data: adminProfile } = await supabaseAdmin
      .from('super_admins')
      .select('id, email, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (adminProfile) {
      await supabaseAdmin.from('platform_audit_logs').insert({
        admin_id: adminProfile.id,
        action: 'ADMIN_LOGOUT',
        target_type: 'SUPER_ADMIN',
        target_id: adminProfile.id,
        details: { email: adminProfile.email, full_name: adminProfile.full_name },
        ip_address: req.ip || null,
      });
    } else {
      // Tenant user logout
      const { data: tuProfile } = await supabaseAdmin
        .from('tenant_users')
        .select('id, email, full_name, role, tenant_id')
        .eq('id', userId)
        .is('deleted_at', null)
        .maybeSingle();

      if (tuProfile) {
        await supabaseAdmin.from('platform_audit_logs').insert({
          admin_id: null,
          action: 'USER_LOGOUT',
          target_type: 'TENANT_USER',
          target_id: tuProfile.id,
          details: {
            email: tuProfile.email,
            full_name: tuProfile.full_name,
            role: tuProfile.role,
            tenant_id: tuProfile.tenant_id,
          },
          ip_address: req.ip || null,
        });
        logTenantAudit(
          { ...req, tenantId: tuProfile.tenant_id, userId: tuProfile.id },
          { action: 'LOGOUT', category: 'AUTH', description: `${tuProfile.full_name} logged out` }
        );
      }
    }

    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    console.error('[AUTH] Logout audit error:', err.message);
    // Don't fail the logout — just log the error
    res.json({ message: 'Logged out.' });
  }
});

// POST /api/auth/recover — Generate OTP and send password reset email
router.post('/recover', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(422).json({ error: 'Email is required.' });

  // Always return success to prevent email enumeration
  const successMsg = 'If an account exists with this email, a verification code has been sent.';

  let userName = 'User';
  let userExists = false;
  try {
    // Look up name directly by email — avoids listUsers loose text search bug
    const { data: adminRec } = await supabaseAdmin
      .from('super_admins')
      .select('full_name')
      .eq('email', email)
      .maybeSingle();
    if (adminRec) {
      userExists = true;
      userName = adminRec.full_name;
    } else {
      const { data: tuRec } = await supabaseAdmin
        .from('tenant_users')
        .select('full_name')
        .eq('email', email)
        .maybeSingle();
      if (tuRec) {
        userExists = true;
        userName = tuRec.full_name;
      } else {
        // Check customers table
        const { data: custRec } = await supabaseAdmin
          .from('customers')
          .select('first_name, last_name')
          .eq('email', email)
          .maybeSingle();
        if (custRec) {
          userExists = true;
          userName = `${custRec.first_name} ${custRec.last_name}`;
        }
      }
    }
  } catch {}

  if (!userExists) return res.json({ message: successMsg });

  const otp = generateOtp();
  storeOtp(email, otp);

  try {
    await sendPasswordResetEmail(email, userName, otp);
  } catch (emailErr) {
    console.error('[EMAIL] Reset OTP email failed:', emailErr.message);
  }

  res.json({ message: successMsg });
});

// POST /api/auth/verify-otp — Validate OTP and return a short-lived reset token
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(422).json({ error: 'Email and OTP are required.' });

  const result = verifyOtp(email, otp);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason });
  }

  const resetToken = generateResetToken();
  storeResetToken(resetToken, email);

  res.json({ resetToken });
});

// POST /api/auth/reset-password — Set new password using a verified reset token
router.post('/reset-password', async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) return res.status(422).json({ error: 'Reset token and new password are required.' });
  if (newPassword.length < 8) return res.status(422).json({ error: 'Password must be at least 8 characters.' });

  const result = verifyResetToken(resetToken);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason });
  }

  // Look up auth user by email
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ filter: result.email });
  const authUser = users?.find(u => u.email?.toLowerCase() === result.email);
  if (!authUser) {
    return res.status(400).json({ error: 'Account not found.' });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
    password: newPassword,
  });

  if (updateError) {
    console.error('[AUTH] Password update failed:', updateError.message);
    return res.status(500).json({ error: 'Failed to update password. Please try again.' });
  }

  res.json({ message: 'Password updated successfully. You can now sign in.' });
});

// POST /api/auth/force-change-password — First-login password setup
router.post('/force-change-password', auth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(422).json({ error: 'New password is required.' });
    if (newPassword.length < 8) return res.status(422).json({ error: 'Password must be at least 8 characters.' });

    // Verify user actually needs to change password
    const { data: userRow } = await supabaseAdmin
      .from('tenant_users')
      .select('must_change_password')
      .eq('id', req.userId)
      .single();

    if (!userRow?.must_change_password) {
      return res.status(400).json({ error: 'Password change not required.' });
    }

    // Update Supabase auth password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(req.userId, {
      password: newPassword,
    });

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update password.' });
    }

    // Clear the flag
    const { error: flagError } = await supabaseAdmin
      .from('tenant_users')
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq('id', req.userId);

    if (flagError) {
      console.error('Failed to clear must_change_password flag:', flagError);
      // Password was already changed in Auth — log anomaly but return success
    }

    logTenantAudit(req, { action: 'PASSWORD_CHANGED', category: 'AUTH', description: 'Changed password' });
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Force change password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/auth/profile — Get current user profile
router.get('/profile', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check super admin first
  const { data: adminProfile } = await supabaseAdmin
    .from('super_admins')
    .select('*')
    .eq('id', user.id)
    .single();

  if (adminProfile) {
    return res.json({
      user,
      profile: {
        id: adminProfile.id,
        full_name: adminProfile.full_name,
        role: 'superadmin',
        is_active: adminProfile.is_active,
        tenant_id: null,
        branch_id: null,
      },
    });
  }

  const { data: tuProf } = await supabaseAdmin
    .from('tenant_users')
    .select('*, tenants(*), branches(*)')
    .eq('id', user.id)
    .is('deleted_at', null)
    .single();

  res.json({ user, profile: tuProf || null });
});

// POST /api/auth/verify-registration-otp — Verify OTP from employee/customer registration
router.post('/verify-registration-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(422).json({ error: 'Email and verification code are required.' });

  const result = verifyRegistrationOtp(email, otp);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason });
  }

  // Return a short-lived reset token so the user can set their password
  const resetToken = generateResetToken();
  storeResetToken(resetToken, email);

  res.json({
    resetToken,
    userType: result.context.type,      // 'employee' or 'customer'
    fullName: result.context.fullName,
  });
});

// POST /api/auth/set-password — Set password after OTP verification (first-time login)
router.post('/set-password', async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) return res.status(422).json({ error: 'Token and password are required.' });
  if (newPassword.length < 8) return res.status(422).json({ error: 'Password must be at least 8 characters.' });

  const result = verifyResetToken(resetToken);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason });
  }

  // Find auth user by email
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ filter: result.email });
  const authUser = users?.find(u => u.email?.toLowerCase() === result.email.toLowerCase());
  if (!authUser) {
    return res.status(400).json({ error: 'Account not found.' });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
    password: newPassword,
  });

  if (updateError) {
    return res.status(500).json({ error: 'Failed to set password. Please try again.' });
  }

  res.json({ message: 'Password set successfully. You can now sign in.' });
});

// POST /api/auth/check-email — Check if email is already registered
router.post('/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(422).json({ error: 'A valid email address is required.' });
  }
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const taken = users?.some(u => u.email?.toLowerCase() === email.toLowerCase());
    if (taken) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    res.json({ available: true });
  } catch (err) {
    res.status(500).json({ error: 'Unable to verify email. Please try again.' });
  }
});

// POST /api/auth/signup-init — Validate signup data, rate-limit, send OTP
router.post('/signup-init', async (req, res) => {
  const { fullName, email, phone, password } = req.body;

  // Validate required fields
  if (!fullName || fullName.trim().length < 2) {
    return res.status(422).json({ error: 'Full name must be at least 2 characters.' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(422).json({ error: 'A valid email address is required.' });
  }
  if (!phone || !/^\+639\d{9}$/.test(phone)) {
    return res.status(422).json({ error: 'Phone number must be in +639XXXXXXXXX format.' });
  }
  if (!password || password.length < 8) {
    return res.status(422).json({ error: 'Password must be at least 8 characters.' });
  }

  const emailKey = email.toLowerCase();

  // Rate limit: max 3 OTP sends per email per 10 minutes
  const now = Date.now();
  const rateEntry = _signupRateLimit.get(emailKey);
  if (rateEntry) {
    // Remove attempts outside the window
    rateEntry.attempts = rateEntry.attempts.filter(t => now - t < SIGNUP_RATE_WINDOW);
    if (rateEntry.attempts.length >= SIGNUP_RATE_LIMIT) {
      return res.status(429).json({ error: 'Too many verification attempts. Please wait 10 minutes before trying again.' });
    }
    rateEntry.attempts.push(now);
  } else {
    _signupRateLimit.set(emailKey, { attempts: [now] });
  }

  // Check if email is already registered
  try {
    const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
    const emailTaken = existingUsers?.some(u => u.email?.toLowerCase() === emailKey);
    if (emailTaken) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
  } catch (err) {
    console.error('[SIGNUP-INIT] listUsers error:', err.message);
  }

  // Generate and store OTP
  const otp = generateOtp();
  storeOtp(emailKey, otp);

  // Store pending signup data
  _signupPendingStore.set(emailKey, {
    fullName: fullName.trim(),
    phone,
    password,
    expiresAt: Date.now() + SIGNUP_PENDING_EXPIRY,
  });

  // Send OTP email
  try {
    await sendSignupOtpEmail({ to: emailKey, fullName: fullName.trim(), otp });
  } catch (emailErr) {
    console.error('[SIGNUP-INIT] OTP email failed:', emailErr.message);
    return res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }

  res.json({ message: 'Verification code sent to your email.' });
});

// POST /api/auth/verify-signup-otp — Verify OTP and create the auth user + tenant_users row
router.post('/verify-signup-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(422).json({ error: 'Email and verification code are required.' });
  }

  const emailKey = email.toLowerCase();

  // Validate OTP
  const otpResult = verifyOtp(emailKey, otp);
  if (!otpResult.valid) {
    return res.status(400).json({ error: otpResult.reason });
  }

  // Retrieve pending signup data
  const pending = _signupPendingStore.get(emailKey);
  if (!pending || Date.now() > pending.expiresAt) {
    _signupPendingStore.delete(emailKey);
    return res.status(400).json({ error: 'Signup session expired. Please start over.' });
  }

  const { fullName, phone, password } = pending;

  // Re-check email uniqueness (race condition guard)
  try {
    const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
    const emailTaken = existingUsers?.some(u => u.email?.toLowerCase() === emailKey);
    if (emailTaken) {
      _signupPendingStore.delete(emailKey);
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
  } catch (err) {
    console.error('[VERIFY-SIGNUP-OTP] listUsers error:', err.message);
  }

  // Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: emailKey,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  // Insert tenant_users row (no tenant_id or branch_id — KYC pending)
  const { error: tuError } = await supabaseAdmin
    .from('tenant_users')
    .insert({
      id: authData.user.id,
      role: 'OWNER',
      full_name: fullName,
      email: emailKey,
      phone_number: phone,
      kyc_status: 'PENDING',
    });

  if (tuError) {
    // Rollback: delete the auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    console.error('[VERIFY-SIGNUP-OTP] tenant_users insert failed:', tuError.message);
    return res.status(500).json({ error: 'Failed to create account profile. Please try again.' });
  }

  // Cleanup pending store
  _signupPendingStore.delete(emailKey);

  res.json({ success: true, message: 'Account created successfully.' });
});

// POST /api/auth/complete-kyc — Complete KYC by creating tenant + branch (requires auth)
router.post('/complete-kyc', auth, tenantScope, async (req, res) => {
  const {
    businessName, businessType, bspRegNo, secDtiRegNo, tinNumber,
    branchName, streetAddress, province, cityMunicipality, barangay, zipCode, branchPhone,
    idType, idFrontUrl, idBackUrl,
  } = req.body;

  // Validate required fields
  const missing = [];
  if (!businessName) missing.push('businessName');
  if (!bspRegNo) missing.push('bspRegNo');
  if (!tinNumber) missing.push('tinNumber');
  if (!branchName) missing.push('branchName');
  if (!streetAddress) missing.push('streetAddress');
  if (!province) missing.push('province');
  if (!cityMunicipality) missing.push('cityMunicipality');
  if (!barangay) missing.push('barangay');
  if (!zipCode) missing.push('zipCode');
  if (!idType) missing.push('idType');
  if (!idFrontUrl) missing.push('idFrontUrl');

  if (missing.length > 0) {
    return res.status(422).json({ error: `Missing required fields: ${missing.join(', ')}.` });
  }

  // Check if this is an UPDATE (tenant already exists) vs first-time KYC
  const { data: currentUser, error: lookupErr } = await supabaseAdmin
    .from('tenant_users')
    .select('tenant_id, kyc_status')
    .eq('id', req.userId)
    .single();

  console.log('[COMPLETE-KYC] userId:', req.userId, 'tenant_id:', currentUser?.tenant_id, 'kyc_status:', currentUser?.kyc_status, 'lookupErr:', lookupErr?.message);

  let rpcResult;

  if (currentUser?.tenant_id) {
    // UPDATE existing tenant + branch
    const { error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .update({
        business_name: businessName,
        business_type: businessType,
        bsp_registration_no: bspRegNo,
        sec_dti_registration_no: secDtiRegNo || null,
        tin_number: tinNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.tenant_id);

    if (tenantErr) {
      console.error('[COMPLETE-KYC] Tenant update error:', tenantErr.message);
      return res.status(400).json({ error: tenantErr.message });
    }

    // Update main branch
    const { error: branchErr } = await supabaseAdmin
      .from('branches')
      .update({
        branch_name: branchName,
        address: streetAddress,
        province,
        city_municipality: cityMunicipality,
        barangay,
        zip_code: zipCode,
        phone: branchPhone || null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', currentUser.tenant_id)
      .eq('is_main_branch', true);

    if (branchErr) {
      console.error('[COMPLETE-KYC] Branch update error:', branchErr.message);
      return res.status(400).json({ error: branchErr.message });
    }

    rpcResult = { success: true, tenant_id: currentUser.tenant_id };
  } else {
    // FIRST-TIME KYC — create tenant + branch via RPC
    const { data, error: rpcError } = await supabaseAdmin.rpc('complete_owner_kyc', {
      p_user_id: req.userId,
      p_business_name: businessName,
      p_business_type: businessType,
      p_bsp_registration_no: bspRegNo,
      p_sec_dti_registration_no: secDtiRegNo || null,
      p_tin_number: tinNumber,
      p_branch_name: branchName,
      p_street_address: streetAddress,
      p_province: province,
      p_city_municipality: cityMunicipality,
      p_barangay: barangay,
      p_zip_code: zipCode,
      p_branch_phone: branchPhone || null,
    });

    if (rpcError) {
      if (rpcError.message && rpcError.message.includes('duplicate') && rpcError.message.includes('bsp')) {
        return res.status(409).json({ error: 'A business with this BSP registration number already exists.' });
      }
      console.error('[COMPLETE-KYC] RPC error:', rpcError.message);
      return res.status(400).json({ error: rpcError.message });
    }
    rpcResult = data;
  }

  // Store KYC ID data on tenant_users
  if (idType && idFrontUrl) {
    const { error: idErr } = await supabaseAdmin
      .from('tenant_users')
      .update({
        id_type: idType,
        id_front_url: idFrontUrl,
        id_back_url: idBackUrl || null,
      })
      .eq('id', req.userId);

    if (idErr) {
      console.error('[COMPLETE-KYC] ID update error:', idErr.message);
      // Non-blocking: KYC tenant/branch already created
    }
  }

  res.json(rpcResult);
});

// GET /api/auth/kyc-status — Get current KYC status for the logged-in owner
router.get('/kyc-status', auth, tenantScope, async (req, res) => {
  const { data: tuRow, error } = await supabaseAdmin
    .from('tenant_users')
    .select('kyc_status, tenant_id')
    .eq('id', req.userId)
    .single();

  if (error || !tuRow) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  res.json({ kyc_status: tuRow.kyc_status, tenant_id: tuRow.tenant_id });
});

// ── Update Profile ─────────────────────────────────────
// PATCH /api/auth/profile — update current user's profile fields
router.patch('/profile', auth, async (req, res) => {
  try {
    const allowedFields = ['full_name', 'phone_number', 'avatar_url'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('tenant_users')
      .update(updates)
      .eq('id', req.userId)
      .select('*')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (err) {
    console.error('[Profile PATCH]', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
