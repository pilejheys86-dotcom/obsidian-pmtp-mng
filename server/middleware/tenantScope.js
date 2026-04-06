const { supabaseAdmin } = require('../config/db');

// Endpoints accessible to pre-KYC owners (no tenant required)
const KYC_WHITELIST = [
  '/api/auth/complete-kyc',
  '/api/auth/kyc-status',
  '/api/auth/profile',
];

const tenantScope = async (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Query tenant_users (unified table — replaces old tenant_owners + employees)
  const { data: user, error } = await supabaseAdmin
    .from('tenant_users')
    .select('id, tenant_id, branch_id, role, full_name, is_active, kyc_status')
    .eq('id', req.userId)
    .is('deleted_at', null)
    .single();

  if (error || !user) {
    return res.status(403).json({ error: 'User profile not found or deactivated' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  req.userRole = user.role;
  req.profile = user;

  // Non-owner employees must have VERIFIED KYC to access the system
  if (user.role !== 'OWNER' && user.kyc_status !== 'VERIFIED') {
    // Allow profile and auth endpoints so they can see their status
    const requestPath = req.baseUrl + req.path;
    const employeeWhitelist = ['/api/auth/profile', '/api/auth/logout'];
    const isAllowed = employeeWhitelist.some(p => requestPath.startsWith(p));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Your account is pending verification by your manager or admin.', kycUnverified: true });
    }
  }

  // Pre-KYC owner: tenant_id is NULL
  if (!user.tenant_id) {
    req.tenantId = null;
    req.branchId = null;
    req.kycPending = true;

    // Only allow whitelisted endpoints
    const requestPath = req.baseUrl + req.path;
    const isWhitelisted = KYC_WHITELIST.some(p => requestPath.startsWith(p));
    if (!isWhitelisted) {
      return res.status(403).json({ error: 'Complete KYC first', kycPending: true });
    }

    return next();
  }

  // Normal flow: tenant exists
  req.tenantId = user.tenant_id;
  req.branchId = user.branch_id;
  req.kycPending = false;

  // Attach subscription status
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('id, plan_name, payment_status, end_date')
    .eq('tenant_id', user.tenant_id)
    .eq('payment_status', 'PAID')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const isExpired = sub?.end_date && new Date(sub.end_date) < new Date();
  req.subscriptionActive = sub && !isExpired;
  req.profile.subscription_active = req.subscriptionActive;
  req.profile.subscription_plan = sub?.plan_name || null;

  next();
};

module.exports = tenantScope;
