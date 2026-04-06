// server/__tests__/pricing.test.js
jest.mock('../config/db', () => require('./helpers/supabaseMock'));

const request = require('supertest');
const app = require('../index');
const mock = require('./helpers/supabaseMock');
const { authenticateAs } = require('./helpers/auth');
const fixtures = require('./helpers/fixtures');

beforeEach(() => mock.resetMocks());

// ── Silver Rates ─────────────────────────────────────────────────────────────

describe('GET /api/pricing/silver-rates', () => {
  test('returns silver rates for tenant', async () => {
    authenticateAs(fixtures.ownerProfile());
    const rates = [
      { id: fixtures.uuid(), tenant_id: fixtures.uuid(), purity_mark: '925', purity_pct: 92.5, common_name: 'Sterling Silver', rate_per_gram: 45.00 },
    ];
    mock.mockQueryResponse('silver_rates', { data: rates, error: null });

    const res = await request(app)
      .get('/api/pricing/silver-rates')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('MANAGER can read silver rates', async () => {
    authenticateAs(fixtures.managerProfile());
    mock.mockQueryResponse('silver_rates', { data: [], error: null });
    // empty array triggers seed path; seed insert also returns empty in mock
    mock.mockQueryResponse('silver_rates', { data: [], error: null });

    const res = await request(app)
      .get('/api/pricing/silver-rates')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
  });
});

describe('PUT /api/pricing/silver-rates/bulk', () => {
  test('OWNER can bulk update silver rates', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockQueryResponse('silver_rates', { data: [], error: null });
    mock.mockQueryResponse('silver_rates', { data: null, error: null }); // upsert
    mock.mockQueryResponse('silver_rate_history', { data: null, error: null });

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '925', rate_per_gram: 48.50 }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('MANAGER can bulk update silver rates', async () => {
    authenticateAs(fixtures.managerProfile());
    mock.mockQueryResponse('silver_rates', { data: [], error: null });
    mock.mockQueryResponse('silver_rates', { data: null, error: null });
    mock.mockQueryResponse('silver_rate_history', { data: null, error: null });

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '999', rate_per_gram: 55.00 }] });

    expect(res.status).toBe(200);
  });

  test('CASHIER cannot update silver rates', async () => {
    authenticateAs({ ...fixtures.clerkProfile(), role: 'CASHIER' });

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '925', rate_per_gram: 48.50 }] });

    expect(res.status).toBe(403);
  });

  test('rejects invalid purity mark', async () => {
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '999X', rate_per_gram: 48.50 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid purity_mark/);
  });

  test('rejects negative rate_per_gram', async () => {
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/pricing/silver-rates/bulk')
      .set('Authorization', 'Bearer test-token')
      .send({ rates: [{ purity_mark: '925', rate_per_gram: -5 }] });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/pricing/silver-rates/history', () => {
  test('OWNER can view history', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockQueryResponse('silver_rate_history', {
      data: [{ id: fixtures.uuid(), purity_mark: '925', old_rate: 44.00, new_rate: 48.50, changed_at: new Date().toISOString() }],
      error: null,
      count: 1,
    });

    const res = await request(app)
      .get('/api/pricing/silver-rates/history')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  test('MANAGER cannot view history', async () => {
    authenticateAs(fixtures.managerProfile());

    const res = await request(app)
      .get('/api/pricing/silver-rates/history')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner/i);
  });
});

// ── Item Conditions ───────────────────────────────────────────────────────────

describe('GET /api/pricing/item-conditions', () => {
  test('returns seeded defaults when none exist', async () => {
    authenticateAs(fixtures.ownerProfile());
    // First query returns empty → triggers seed
    mock.mockQueryResponse('item_conditions', { data: [], error: null });

    const res = await request(app)
      .get('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token');

    // Seed insert returns mock response; status 200 regardless
    expect(res.status).toBe(200);
  });

  test('returns existing conditions', async () => {
    authenticateAs(fixtures.managerProfile());
    const conditions = [
      { id: fixtures.uuid(), condition_name: 'Excellent', multiplier_pct: 100, is_active: true, sort_order: 1 },
      { id: fixtures.uuid(), condition_name: 'Good',      multiplier_pct: 70,  is_active: true, sort_order: 3 },
    ];
    mock.mockQueryResponse('item_conditions', { data: conditions, error: null });

    const res = await request(app)
      .get('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('PUT /api/pricing/item-conditions', () => {
  test('OWNER can update conditions', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockQueryResponse('item_conditions', { data: null, error: null });

    const res = await request(app)
      .put('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token')
      .send({ conditions: [
        { condition_name: 'Excellent', multiplier_pct: 100, is_active: true },
        { condition_name: 'Good',      multiplier_pct: 72,  is_active: true },
      ]});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('rejects invalid condition name', async () => {
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token')
      .send({ conditions: [{ condition_name: 'Mint', multiplier_pct: 100, is_active: true }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid condition_name/);
  });

  test('rejects multiplier_pct > 100', async () => {
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token')
      .send({ conditions: [{ condition_name: 'Excellent', multiplier_pct: 110, is_active: true }] });

    expect(res.status).toBe(400);
  });

  test('CASHIER cannot update conditions', async () => {
    authenticateAs({ ...fixtures.clerkProfile(), role: 'CASHIER' });

    const res = await request(app)
      .put('/api/pricing/item-conditions')
      .set('Authorization', 'Bearer test-token')
      .send({ conditions: [{ condition_name: 'Good', multiplier_pct: 70, is_active: true }] });

    expect(res.status).toBe(403);
  });
});
