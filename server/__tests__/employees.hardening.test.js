/**
 * ═══════════════════════════════════════════════════════════════════
 * TEST SUITE: Employees Hardening (CRUD, RBAC, Tenant Isolation, Rollback)
 * ═══════════════════════════════════════════════════════════════════
 */

jest.mock('../config/db', () => require('./helpers/supabaseMock'));
jest.mock('../services/email', () => ({
  sendEmployeeInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../index');
const mock = require('./helpers/supabaseMock');
const { authenticateAs } = require('./helpers/auth');
const fixtures = require('./helpers/fixtures');
const { sendEmployeeInviteEmail } = require('../services/email');

beforeEach(() => {
  mock.resetMocks();
  jest.clearAllMocks();
  authenticateAs(fixtures.ownerProfile());
});

function makeChain(response) {
  const chain = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'is', 'not', 'in', 'or', 'ilike',
    'order', 'range', 'limit',
  ];

  methods.forEach((method) => {
    chain[method] = jest.fn().mockReturnValue(chain);
  });

  chain.single = jest.fn().mockImplementation(() => ({
    then: (resolve) => (resolve ? resolve(response) : response),
    catch: () => {},
  }));
  chain.maybeSingle = chain.single;

  chain.then = (resolve) => (resolve ? resolve(response) : response);
  chain.catch = () => {};

  return chain;
}

function useTenantUsersSequence(responses) {
  let tenantUsersCall = 0;
  const defaultFrom = mock.supabaseAdmin.from.getMockImplementation();

  mock.supabaseAdmin.from.mockImplementation((table) => {
    if (table !== 'tenant_users') {
      return defaultFrom ? defaultFrom(table) : makeChain({ data: null, error: null, count: 0 });
    }

    const index = Math.min(tenantUsersCall, responses.length - 1);
    const response = responses[index];
    tenantUsersCall += 1;
    return makeChain(response);
  });
}

describe('Employees — Happy Path CRUD', () => {
  test('POST /api/employees creates auth user + tenant employee profile', async () => {
    const newAuthId = fixtures.uuid();

    mock.supabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: newAuthId } },
      error: null,
    });

    const createdEmployee = {
      id: newAuthId,
      tenant_id: fixtures.TENANT_A,
      branch_id: fixtures.BRANCH_A,
      role: 'CLERK',
      full_name: 'New Clerk',
      is_active: true,
    };

    let tenantUsersCall = 0;
    mock.supabaseAdmin.from.mockImplementation((table) => {
      if (table !== 'tenant_users') {
        return makeChain({ data: null, error: null, count: 0 });
      }

      tenantUsersCall += 1;

      if (tenantUsersCall === 1) {
        return makeChain({ data: fixtures.ownerProfile(), error: null });
      }

      return makeChain({ data: createdEmployee, error: null });
    });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', 'Bearer test-token')
      .send({
        full_name: 'New Clerk',
        email: 'new.clerk@example.com',
        password: 'StrongPass123!',
        role: 'CLERK',
        branch_id: fixtures.BRANCH_A,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(newAuthId);
    expect(mock.supabaseAdmin.auth.admin.createUser).toHaveBeenCalledTimes(1);
    expect(mock.supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(sendEmployeeInviteEmail).toHaveBeenCalledTimes(1);
  });

  test('GET /api/employees returns paginated employees', async () => {
    useTenantUsersSequence([
      { data: fixtures.ownerProfile(), error: null },
      {
        data: [
          {
            id: fixtures.uuid(),
            tenant_id: fixtures.TENANT_A,
            full_name: 'A Employee',
            role: 'MANAGER',
            is_active: true,
            branches: { branch_name: 'Main' },
          },
        ],
        error: null,
        count: 1,
      },
    ]);

    const res = await request(app)
      .get('/api/employees?page=1&limit=10&search=employee&role=MANAGER')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
  });

  test('GET /api/employees/:id returns employee details', async () => {
    const employeeId = fixtures.uuid();

    useTenantUsersSequence([
      { data: fixtures.ownerProfile(), error: null },
      {
        data: {
          id: employeeId,
          tenant_id: fixtures.TENANT_A,
          role: 'APPRAISER',
          full_name: 'Appraiser A',
          is_active: true,
          branches: { id: fixtures.BRANCH_A, branch_name: 'Main' },
        },
        error: null,
      },
    ]);

    const res = await request(app)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(employeeId);
    expect(res.body.role).toBe('APPRAISER');
  });

  test('PATCH /api/employees/:id updates employee as OWNER', async () => {
    const employeeId = fixtures.uuid();

    useTenantUsersSequence([
      { data: fixtures.ownerProfile(), error: null },
      {
        data: {
          id: employeeId,
          tenant_id: fixtures.TENANT_A,
          role: 'MANAGER',
          full_name: 'Updated Name',
          is_active: true,
        },
        error: null,
      },
    ]);

    const res = await request(app)
      .patch(`/api/employees/${employeeId}`)
      .set('Authorization', 'Bearer test-token')
      .send({ role: 'MANAGER', full_name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(employeeId);
    expect(res.body.role).toBe('MANAGER');
  });

  test('DELETE /api/employees/:id deactivates employee as OWNER', async () => {
    useTenantUsersSequence([
      { data: fixtures.ownerProfile(), error: null },
      { data: null, error: null },
    ]);

    const res = await request(app)
      .delete(`/api/employees/${fixtures.uuid()}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deactivated/i);
  });
});

describe('Employees — Validation Failures (Hardened Contract)', () => {
  test('POST /api/employees rejects missing required fields', async () => {
    useTenantUsersSequence([{ data: fixtures.ownerProfile(), error: null }]);

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', 'Bearer test-token')
      .send({
        full_name: 'Incomplete Employee',
        // missing email, password, role
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.error).toBeDefined();
  });

  test('PATCH /api/employees/:id rejects invalid role value', async () => {
    useTenantUsersSequence([
      { data: fixtures.ownerProfile(), error: null },
      { data: null, error: { message: 'invalid role' } },
    ]);

    const res = await request(app)
      .patch(`/api/employees/${fixtures.uuid()}`)
      .set('Authorization', 'Bearer test-token')
      .send({ role: 'SUPERADMIN' });

    expect([400, 422]).toContain(res.status);
  });

  test('GET /api/employees rejects invalid pagination params', async () => {
    useTenantUsersSequence([
      { data: fixtures.ownerProfile(), error: null },
      { data: [], error: null, count: 0 },
    ]);

    const res = await request(app)
      .get('/api/employees?page=0&limit=9999')
      .set('Authorization', 'Bearer test-token');

    expect([400, 422]).toContain(res.status);
  });
});

describe('Employees — RBAC Enforcement', () => {
  test('MANAGER cannot create employee', async () => {
    authenticateAs(fixtures.managerProfile());

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', 'Bearer test-token')
      .send({
        full_name: 'New Staff',
        email: 'staff@example.com',
        password: 'StrongPass123!',
        role: 'CLERK',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  test('CLERK cannot update employee', async () => {
    authenticateAs(fixtures.clerkProfile());

    const res = await request(app)
      .patch(`/api/employees/${fixtures.uuid()}`)
      .set('Authorization', 'Bearer test-token')
      .send({ role: 'MANAGER' });

    expect(res.status).toBe(403);
  });

  test('MANAGER cannot deactivate employee', async () => {
    authenticateAs(fixtures.managerProfile());

    const res = await request(app)
      .delete(`/api/employees/${fixtures.uuid()}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(403);
  });
});

describe('Employees — Strict Tenant Isolation', () => {
  test('GET /api/employees/:id returns 404 for employee outside tenant', async () => {
    useTenantUsersSequence([
      { data: fixtures.ownerProfile(), error: null },
      { data: null, error: { message: 'No rows found' } },
    ]);

    const res = await request(app)
      .get(`/api/employees/${fixtures.uuid()}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('Tenant A list only includes Tenant A employees', async () => {
    useTenantUsersSequence([
      { data: fixtures.ownerProfile(), error: null },
      {
        data: [
          { id: fixtures.uuid(), tenant_id: fixtures.TENANT_A, role: 'CLERK', full_name: 'A1' },
          { id: fixtures.uuid(), tenant_id: fixtures.TENANT_A, role: 'MANAGER', full_name: 'A2' },
        ],
        error: null,
        count: 2,
      },
    ]);

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    res.body.data.forEach((emp) => {
      expect(emp.tenant_id).toBe(fixtures.TENANT_A);
    });
  });

  test('Tenant B receives Tenant B employee stats', async () => {
    authenticateAs(fixtures.tenantBUser());

    useTenantUsersSequence([
      { data: fixtures.tenantBUser(), error: null },
      { data: null, error: null, count: 2 },
      { data: null, error: null, count: 2 },
      { data: [{ role: 'OWNER' }, { role: 'CLERK' }], error: null, count: 2 },
    ]);

    const res = await request(app)
      .get('/api/employees/stats')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.totalEmployees).toBe(2);
    expect(res.body.activeStaff).toBe(2);
    expect(res.body.roles).toBe(2);
  });
});

describe('Employees — Rollback Behavior on Creation Failure', () => {
  test('rolls back auth user when tenant_users insert fails', async () => {
    const createdAuthUserId = fixtures.uuid();

    mock.supabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: createdAuthUserId } },
      error: null,
    });
    mock.supabaseAdmin.auth.admin.deleteUser.mockResolvedValue({ error: null });

    let tenantUsersCall = 0;
    mock.supabaseAdmin.from.mockImplementation((table) => {
      if (table !== 'tenant_users') {
        return makeChain({ data: null, error: null, count: 0 });
      }

      tenantUsersCall += 1;

      if (tenantUsersCall === 1) {
        return makeChain({ data: fixtures.ownerProfile(), error: null });
      }

      return makeChain({ data: null, error: { message: 'duplicate key value violates unique constraint' } });
    });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', 'Bearer test-token')
      .send({
        full_name: 'Rollback Candidate',
        email: 'rollback@example.com',
        password: 'StrongPass123!',
        role: 'CLERK',
        branch_id: fixtures.BRANCH_A,
      });

    expect([400, 409, 422]).toContain(res.status);
    expect(mock.supabaseAdmin.auth.admin.createUser).toHaveBeenCalledTimes(1);
    expect(mock.supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
    expect(mock.supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(createdAuthUserId);
  });

  test('returns server error when rollback delete auth user also fails', async () => {
    const createdAuthUserId = fixtures.uuid();

    mock.supabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: createdAuthUserId } },
      error: null,
    });
    mock.supabaseAdmin.auth.admin.deleteUser.mockRejectedValue(new Error('delete failed'));

    let tenantUsersCall = 0;
    mock.supabaseAdmin.from.mockImplementation((table) => {
      if (table !== 'tenant_users') {
        return makeChain({ data: null, error: null, count: 0 });
      }

      tenantUsersCall += 1;

      if (tenantUsersCall === 1) {
        return makeChain({ data: fixtures.ownerProfile(), error: null });
      }

      return makeChain({ data: null, error: { message: 'insert failed' } });
    });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', 'Bearer test-token')
      .send({
        full_name: 'Rollback Hard Failure',
        email: 'rollback-hard@example.com',
        password: 'StrongPass123!',
        role: 'CLERK',
        branch_id: fixtures.BRANCH_A,
      });

    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
