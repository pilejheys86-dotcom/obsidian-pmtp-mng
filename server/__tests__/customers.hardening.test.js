/**
 * ═══════════════════════════════════════════════════════════════════
 * TEST SUITE: Customers Hardening (CRUD, Validation, Tenant Isolation)
 * ═══════════════════════════════════════════════════════════════════
 */

jest.mock('../config/db', () => require('./helpers/supabaseMock'));

const request = require('supertest');
const app = require('../index');
const mock = require('./helpers/supabaseMock');
const { authenticateAs } = require('./helpers/auth');
const fixtures = require('./helpers/fixtures');

beforeEach(() => {
  mock.resetMocks();
  authenticateAs(fixtures.ownerProfile());
});

describe('Customers — Happy Path CRUD', () => {
  test('POST /api/customers creates customer with KYC docs', async () => {
    const createdCustomer = {
      id: fixtures.uuid(),
      tenant_id: fixtures.TENANT_A,
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      email: 'juan@example.com',
      mobile_number: '09171234567',
      risk_rating: 'LOW',
    };

    mock.mockQueryResponse('customers', { data: createdCustomer, error: null });
    mock.mockQueryResponse('kyc_documents', { data: [{ id: fixtures.uuid() }], error: null });

    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', 'Bearer test-token')
      .send({
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        date_of_birth: '1995-05-10',
        nationality: 'Filipino',
        present_address: 'Quezon City',
        mobile_number: '09171234567',
        email: 'juan@example.com',
        employment_nature: 'Employed',
        risk_rating: 'LOW',
        kyc_documents: [
          {
            id_type: 'UMID',
            id_number: 'UMID-123456',
            expiry_date: '2030-01-01',
            image_front_url: 'https://example.com/front.jpg',
            image_back_url: 'https://example.com/back.jpg',
            specimen_sig_url: 'https://example.com/sig.jpg',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.first_name).toBe('Juan');
    expect(mock.supabaseAdmin.from).toHaveBeenCalledWith('customers');
    expect(mock.supabaseAdmin.from).toHaveBeenCalledWith('kyc_documents');
  });

  test('GET /api/customers returns paginated list with computed loan counters', async () => {
    mock.mockQueryResponse('customers', {
      data: [
        {
          id: fixtures.uuid(),
          tenant_id: fixtures.TENANT_A,
          first_name: 'Ana',
          last_name: 'Santos',
          email: 'ana@example.com',
          mobile_number: '09180000001',
          pawn_tickets: [
            { id: fixtures.uuid(), status: 'ACTIVE' },
            { id: fixtures.uuid(), status: 'REDEEMED' },
          ],
          kyc_documents: [],
        },
      ],
      error: null,
      count: 1,
    });

    const res = await request(app)
      .get('/api/customers?page=1&limit=10&search=ana')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
    expect(res.body.data[0].activeLoans).toBe(1);
    expect(res.body.data[0].totalLoans).toBe(2);
  });

  test('GET /api/customers/:id returns customer details with relations', async () => {
    const customerId = fixtures.uuid();

    mock.mockQueryResponse('customers', {
      data: {
        id: customerId,
        tenant_id: fixtures.TENANT_A,
        first_name: 'Rico',
        last_name: 'Reyes',
        kyc_documents: [{ id: fixtures.uuid(), id_type: 'PASSPORT' }],
        pawn_tickets: [{ id: fixtures.uuid(), transactions: [] }],
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/customers/${customerId}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(customerId);
    expect(Array.isArray(res.body.kyc_documents)).toBe(true);
  });

  test('PATCH /api/customers/:id updates customer', async () => {
    const customerId = fixtures.uuid();

    mock.mockQueryResponse('customers', {
      data: {
        id: customerId,
        tenant_id: fixtures.TENANT_A,
        first_name: 'Maria',
        last_name: 'Lopez',
        risk_rating: 'MEDIUM',
      },
      error: null,
    });

    const res = await request(app)
      .patch(`/api/customers/${customerId}`)
      .set('Authorization', 'Bearer test-token')
      .send({ risk_rating: 'MEDIUM' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(customerId);
    expect(res.body.risk_rating).toBe('MEDIUM');
  });

  test('DELETE /api/customers/:id performs soft delete', async () => {
    mock.mockQueryResponse('customers', { data: null, error: null });

    const res = await request(app)
      .delete(`/api/customers/${fixtures.uuid()}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

describe('Customers — Validation Failures (Hardened Contract)', () => {
  test('POST /api/customers rejects missing required KYC fields', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', 'Bearer test-token')
      .send({
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        date_of_birth: '1995-05-10',
        nationality: 'Filipino',
        present_address: 'Quezon City',
        mobile_number: '09171234567',
        employment_nature: 'Employed',
        kyc_documents: [
          {
            id_type: 'UMID',
            // missing id_number
            image_front_url: 'https://example.com/front.jpg',
            specimen_sig_url: 'https://example.com/sig.jpg',
          },
        ],
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.error).toBeDefined();
  });

  test('GET /api/customers rejects invalid pagination params', async () => {
    const res = await request(app)
      .get('/api/customers?page=-1&limit=10000')
      .set('Authorization', 'Bearer test-token');

    expect([400, 422]).toContain(res.status);
  });

  test('PATCH /api/customers/:id rejects malformed id', async () => {
    const res = await request(app)
      .patch('/api/customers/not-a-uuid')
      .set('Authorization', 'Bearer test-token')
      .send({ risk_rating: 'LOW' });

    expect([400, 422]).toContain(res.status);
  });
});

describe('Customers — Strict Tenant Isolation', () => {
  test('GET /api/customers/:id returns 404 when customer is outside tenant scope', async () => {
    mock.mockQueryResponse('customers', {
      data: null,
      error: { message: 'No rows found' },
    });

    const res = await request(app)
      .get(`/api/customers/${fixtures.uuid()}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('GET /api/customers returns only current tenant records', async () => {
    mock.mockQueryResponse('customers', {
      data: [
        { id: fixtures.uuid(), tenant_id: fixtures.TENANT_A, pawn_tickets: [] },
        { id: fixtures.uuid(), tenant_id: fixtures.TENANT_A, pawn_tickets: [] },
      ],
      error: null,
      count: 2,
    });

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    res.body.data.forEach((row) => {
      expect(row.tenant_id).toBe(fixtures.TENANT_A);
    });
  });

  test('GET /api/customers/stats returns tenant-scoped totals', async () => {
    mock.mockQueryResponse('customers', { data: null, error: null, count: 12 });
    mock.mockQueryResponse('pawn_tickets', {
      data: [
        { customer_id: 'cust-1' },
        { customer_id: 'cust-1' },
        { customer_id: 'cust-2' },
      ],
      error: null,
      count: 3,
    });

    const res = await request(app)
      .get('/api/customers/stats')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.totalCustomers).toBe(12);
    expect(res.body.activeLoanHolders).toBe(2);
    expect(res.body.newThisMonth).toBe(12);
  });

  test('Tenant B receives Tenant B customer stats, not Tenant A', async () => {
    authenticateAs(fixtures.tenantBUser());
    mock.mockQueryResponse('customers', { data: null, error: null, count: 3 });
    mock.mockQueryResponse('pawn_tickets', {
      data: [{ customer_id: 'b-customer-1' }],
      error: null,
      count: 1,
    });

    const res = await request(app)
      .get('/api/customers/stats')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.totalCustomers).toBe(3);
    expect(res.body.activeLoanHolders).toBe(1);
  });
});
