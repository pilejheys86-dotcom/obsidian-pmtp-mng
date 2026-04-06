const { supabaseAdmin } = require('../config/db');

/**
 * After auth middleware — resolves the customer's records from the
 * customers table and validates the active tenant from X-Tenant-Id header.
 *
 * Sets: req.customerId, req.customerTenants, req.activeTenantId
 */
const customerScope = async (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Fetch all customer records linked to this auth user
  const { data: customers, error } = await supabaseAdmin
    .from('customers')
    .select('id, tenant_id, first_name, last_name, email, mobile_number')
    .eq('auth_id', req.userId)
    .is('deleted_at', null);

  if (error || !customers || customers.length === 0) {
    return res.status(403).json({ error: 'Customer profile not found' });
  }

  // Read active tenant from header
  const activeTenantId = req.headers['x-tenant-id'];
  if (!activeTenantId) {
    return res.status(400).json({ error: 'X-Tenant-Id header is required' });
  }

  // Validate customer is linked to the requested tenant
  const activeCustomer = customers.find(c => c.tenant_id === activeTenantId);
  if (!activeCustomer) {
    return res.status(403).json({ error: 'Customer is not linked to this pawnshop' });
  }

  req.customerId = activeCustomer.id;
  req.activeTenantId = activeTenantId;
  req.customerTenants = customers;
  req.customerProfile = activeCustomer;
  next();
};

module.exports = customerScope;
