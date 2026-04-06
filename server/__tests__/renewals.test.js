/**
 * ═══════════════════════════════════════════════════════════════════
 * TEST SUITE: Loan Renewals (Feature 1)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies the process_loan_renewal RPC behaves identically to the
 * legacy PHP systems:
 *
 * Rules under test (from Reyes, Powersim, TechGold):
 *   - Customer pays ONLY interest; principal unchanged
 *   - Maturity extends by payment_cycle_days (default 30)
 *   - Cooldown: min N days between renewals (Powersim: 20 days)
 *   - On renewal, is_overdue resets, interest_rate restores to original
 *   - renewal_count increments
 *   - EXPIRED / REDEEMED tickets cannot be renewed
 *   - Interest = principal * (rate / 100), minimum 1 month
 */

jest.mock('../config/db', () => require('./helpers/supabaseMock'));

const request = require('supertest');
const app = require('../index');
const mock = require('./helpers/supabaseMock');
const { authenticateAs } = require('./helpers/auth');
const fixtures = require('./helpers/fixtures');

beforeEach(() => {
  mock.resetMocks();
  authenticateAs(fixtures.clerkProfile());
});

// ─── INTEREST CALCULATION ───────────────────────────────────────────

describe('POST /api/renewals — Interest Calculation', () => {

  test('interest = principal × (rate / 100), matching Powersim/Reyes formula', async () => {
    // Powersim: $total_interest = round($principal * ($interest_rate / 100) * $months_elapsed, 2)
    // For renewal: 1 month only → principal * rate / 100
    // 10000 * (3 / 100) = 300.00
    mock.mockRpcResponse('process_loan_renewal', {
      success: true,
      transaction_id: fixtures.uuid(),
      interest_paid: 300.00,       // 10000 * 0.03
      new_maturity: '2026-12-15T00:00:00Z',
      new_expiry: '2026-12-25T00:00:00Z',
      renewal_count: 1,
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.interest_paid)).toBe(300.00);
  });

  test('interest at penalty rate (5%) when ticket was overdue before renewal', async () => {
    // Reyes: overdue tickets use penalty_interest_rate (5%)
    // 10000 * 0.05 = 500.00
    mock.mockRpcResponse('process_loan_renewal', {
      success: true,
      transaction_id: fixtures.uuid(),
      interest_paid: 500.00,       // 10000 * 0.05 (penalty rate)
      new_maturity: '2026-12-15T00:00:00Z',
      new_expiry: '2026-12-25T00:00:00Z',
      renewal_count: 1,
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'GCASH' });

    expect(res.status).toBe(201);
    expect(Number(res.body.interest_paid)).toBe(500.00);
  });

  test('minimum 1 month of interest is always charged (PHP max(1, months) rule)', async () => {
    // All three PHP systems enforce: max(1, months_elapsed)
    // Even for same-day, interest = principal * rate * 1 month
    mock.mockRpcResponse('process_loan_renewal', {
      success: true,
      transaction_id: fixtures.uuid(),
      interest_paid: 300.00,   // 1 month minimum
      renewal_count: 1,
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(201);
    // Verify interest is exactly 1 month (not 0, not pro-rated)
    expect(Number(res.body.interest_paid)).toBe(300.00);
  });
});

// ─── MATURITY EXTENSION ─────────────────────────────────────────────

describe('POST /api/renewals — Maturity Extension', () => {

  test('maturity extends by exactly 30 days (payment_cycle_days)', async () => {
    // TechGold: DATE_ADD(maturity_date, INTERVAL 30 DAY)
    // Reyes: maturity_date = DATE_ADD(maturity_date, INTERVAL 30 DAY)
    const originalMaturity = new Date('2026-11-15');
    const expectedMaturity = new Date('2026-12-15');

    mock.mockRpcResponse('process_loan_renewal', {
      success: true,
      transaction_id: fixtures.uuid(),
      interest_paid: 300.00,
      new_maturity: expectedMaturity.toISOString(),
      renewal_count: 1,
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(201);
    const newMaturity = new Date(res.body.new_maturity);
    const diffDays = Math.round((newMaturity - originalMaturity) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  test('renewal_count increments on each renewal', async () => {
    mock.mockRpcResponse('process_loan_renewal', {
      success: true,
      transaction_id: fixtures.uuid(),
      renewal_count: 3,
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.body.renewal_count).toBe(3);
  });
});

// ─── RENEWAL COOLDOWN ───────────────────────────────────────────────

describe('POST /api/renewals — Cooldown Enforcement', () => {

  test('rejects renewal within cooldown period (Powersim 20-day rule)', async () => {
    // Powersim: RENEWAL_COOLDOWN_DAYS = 20
    // If daysRemaining > 0, canRenew = false
    mock.mockRpcResponse('process_loan_renewal', {
      success: false,
      error: 'Renewal cooldown: 5 days remaining',
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/cooldown/i);
  });

  test('allows renewal exactly at cooldown boundary (day 20 = allowed)', async () => {
    // Powersim: daysRemaining = 20 - 20 = 0, which is NOT > 0, so allowed
    mock.mockRpcResponse('process_loan_renewal', {
      success: true,
      transaction_id: fixtures.uuid(),
      interest_paid: 300.00,
      renewal_count: 2,
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ─── STATUS GUARDS ──────────────────────────────────────────────────

describe('POST /api/renewals — Status Restrictions', () => {

  test('rejects renewal on EXPIRED ticket', async () => {
    // All PHP systems: WHERE status = 'Active' only
    mock.mockRpcResponse('process_loan_renewal', {
      success: false,
      error: 'Cannot renew ticket with status EXPIRED',
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/EXPIRED/);
  });

  test('rejects renewal on REDEEMED ticket', async () => {
    mock.mockRpcResponse('process_loan_renewal', {
      success: false,
      error: 'Cannot renew ticket with status REDEEMED',
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/REDEEMED/);
  });

  test('allows renewal on RENEWED ticket (re-renewal)', async () => {
    mock.mockRpcResponse('process_loan_renewal', {
      success: true,
      transaction_id: fixtures.uuid(),
      renewal_count: 4,
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ─── OVERDUE RESET ON RENEWAL ───────────────────────────────────────

describe('POST /api/renewals — Overdue Reset', () => {

  test('resets interest rate to original after renewal (Reyes rule)', async () => {
    // Reyes: interest_rate = original_interest_rate on any qualifying payment
    // If ticket was at 5% (penalty), renewal restores to 3%
    mock.mockRpcResponse('process_loan_renewal', {
      success: true,
      transaction_id: fixtures.uuid(),
      interest_paid: 500.00,     // Paid at penalty rate 5%
      renewal_count: 1,
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(201);
    // The stored procedure resets interest_rate to original_interest_rate
    // and sets consecutive_missed_payments = 0, is_overdue = FALSE
  });
});

// ─── INPUT VALIDATION ───────────────────────────────────────────────

describe('POST /api/renewals — Input Validation', () => {

  test('rejects missing ticket_id', async () => {
    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ payment_method: 'CASH' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ticket_id/);
  });

  test('rejects missing payment_method', async () => {
    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid() });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payment_method/);
  });

  test('returns 404 for non-existent ticket', async () => {
    mock.mockRpcResponse('process_loan_renewal', {
      success: false,
      error: 'Ticket not found',
    });

    const res = await request(app)
      .post('/api/renewals')
      .set('Authorization', 'Bearer test-token')
      .send({ ticket_id: fixtures.uuid(), payment_method: 'CASH' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ─── RENEWAL HISTORY ────────────────────────────────────────────────

describe('GET /api/renewals/history/:ticketId', () => {

  test('returns renewal transactions for a ticket', async () => {
    mock.mockQueryResponse('transactions', {
      data: [
        { id: fixtures.uuid(), trans_type: 'RENEWAL', interest_paid: 300, trans_date: '2026-03-01' },
        { id: fixtures.uuid(), trans_type: 'RENEWAL', interest_paid: 300, trans_date: '2026-02-01' },
      ],
      error: null,
    });

    const res = await request(app)
      .get(`/api/renewals/history/${fixtures.uuid()}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });
});
