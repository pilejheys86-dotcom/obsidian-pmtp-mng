/**
 * Sets up the mock auth + tenantScope middleware bypass for supertest
 * requests. Call `authenticateAs(profile)` before each request block
 * to simulate a logged-in user with a specific role and tenant.
 */

const mock = require('./supabaseMock');

/**
 * Configures the Supabase mock so that the `auth` and `tenantScope`
 * middleware will authenticate the request as the given profile.
 *
 * @param {object} profile - A fixtures profile (ownerProfile, clerkProfile, etc.)
 */
function authenticateAs(profile) {
  // auth middleware calls supabaseAdmin.auth.getUser(token)
  mock.mockAuthUser({ id: profile.id, email: `${profile.full_name.replace(' ', '.')}@test.com` });

  // tenantScope middleware calls supabaseAdmin.from('tenant_users').select(...).eq('id', userId).single()
  mock.mockQueryResponse('tenant_users', { data: profile, error: null });
}

/**
 * IMPORTANT: The mock system stores one response per table name. Since both
 * customerScope middleware and route handlers query the 'customers' table,
 * tests must set the customers mock to serve BOTH.
 */
function authenticateAsCustomer(customer, allCustomerRecords = [customer]) {
  mock.mockAuthUser({ id: customer.auth_id, email: customer.email });
  mock.mockQueryResponse('customers', { data: allCustomerRecords, error: null });
}

module.exports = { authenticateAs, authenticateAsCustomer };
