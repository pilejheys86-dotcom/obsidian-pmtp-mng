const { supabaseAdmin } = require('../config/db');

/**
 * After auth middleware — verifies the user is a platform super admin.
 * Attaches req.adminProfile with { id, email, full_name, is_active }.
 */
const superAdminScope = async (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { data: admin, error } = await supabaseAdmin
    .from('super_admins')
    .select('id, email, full_name, is_active')
    .eq('id', req.userId)
    .single();

  if (error || !admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  if (!admin.is_active) {
    return res.status(403).json({ error: 'Super admin account is deactivated' });
  }

  req.adminProfile = admin;
  req.isSuperAdmin = true;
  next();
};

module.exports = superAdminScope;
