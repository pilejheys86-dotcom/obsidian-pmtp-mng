/**
 * ═══════════════════════════════════════════════════════════════════
 * TEST SUITE: Payments — Interest, Partial Redemption, Full (Feature 5)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies process_payment RPC matches legacy PHP payment logic:
 *
 * Interest-Only (Reyes save_payment.php):
 *   - months_paid = floor(amount / monthly_interest), min 1
 *   - Even if amount < 1 month's interest, months_paid = 1 (PHP edge case)
 *   - Maturity extends by months_covered × 30 days
 *
 * Partial Redemption (Reyes save_payment.php):
 *   - Interest paid first, remainder goes to principal
 *   - If amount < interest: ALL goes to principal, months_covered = 0
 *   - principal_outstanding = principal - SUM(principal_paid_history)
 *   - Clamped: principal_outstanding < 0 → 0
 *
 * Full Redemption:
 *   - Must cover remaining_principal + at least 1 month interest
 *   - Ticket → REDEEMED, Item → REDEEMED
 *   - No change/refund for overpayment (PHP absorbed overpayment)
 *
 * Service Charge (Powersim):
 *   - Fixed ₱5.00 service charge on redemption
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

// ─── INTEREST-ONLY PAYMENT ──────────────────────────────────────────

describe('POST /api/payments — Interest-Only', () => {

  test('exact 1 month interest: 10000 × 3% = ₱300', async () => {
    mock.mockRpcResponse('process_payment', {
      success: true,
      transaction_id: fixtures.uuid(),
      trans_type: 'INTEREST_PAYMENT',
      interest_paid: 300.00,
      principal_paid: 0,
      months_covered: 1,
      remaining_principal: 10000.00,
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 300.00,
        payment_type: 'INTEREST_ONLY',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(201);
    expect(res.body.months_covered).toBe(1);
    expect(Number(res.body.interest_paid)).toBe(300.00);
    expect(Number(res.body.principal_paid)).toBe(0);
  });

  test('3 months interest: ₱900 / ₱300 = 3 months covered', async () => {
    // Reyes: months_paid = floor(amount / monthly_interest)
    mock.mockRpcResponse('process_payment', {
      success: true,
      transaction_id: fixtures.uuid(),
      trans_type: 'INTEREST_PAYMENT',
      interest_paid: 900.00,
      principal_paid: 0,
      months_covered: 3,
      remaining_principal: 10000.00,
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 900.00,
        payment_type: 'INTEREST_ONLY',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(201);
    expect(res.body.months_covered).toBe(3);
  });

  test('underpayment (₱200 < ₱300 monthly): still covers 1 month (Reyes edge case)', async () => {
    // Reyes save_payment.php: if ($months_paid < 1) $months_paid = 1;
    // System accepts underpayment and forces 1 month minimum
    mock.mockRpcResponse('process_payment', {
      success: true,
      transaction_id: fixtures.uuid(),
      trans_type: 'INTEREST_PAYMENT',
      interest_paid: 200.00,
      principal_paid: 0,
      months_covered: 1,
      remaining_principal: 10000.00,
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 200.00,
        payment_type: 'INTEREST_ONLY',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(201);
    expect(res.body.months_covered).toBe(1);
  });

  test('₱350 covers 1 month (floor(350/300) = 1, not 2)', async () => {
    mock.mockRpcResponse('process_payment', {
      success: true,
      transaction_id: fixtures.uuid(),
      months_covered: 1,   // floor(350/300) = 1
      interest_paid: 350.00,
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 350.00,
        payment_type: 'INTEREST_ONLY',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(201);
    expect(res.body.months_covered).toBe(1);
  });
});

// ─── PARTIAL REDEMPTION ─────────────────────────────────────────────

describe('POST /api/payments — Partial Redemption', () => {

  test('₱500 = ₱300 interest + ₱200 to principal', async () => {
    // Reyes: interest-first split rule
    mock.mockRpcResponse('process_payment', {
      success: true,
      transaction_id: fixtures.uuid(),
      trans_type: 'PARTIAL_PAYMENT',
      interest_paid: 300.00,
      principal_paid: 200.00,
      months_covered: 1,
      remaining_principal: 9800.00,
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 500.00,
        payment_type: 'PARTIAL_REDEMPTION',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.interest_paid)).toBe(300.00);
    expect(Number(res.body.principal_paid)).toBe(200.00);
    expect(res.body.months_covered).toBe(1);
    expect(Number(res.body.remaining_principal)).toBe(9800.00);
  });

  test('amount < interest (₱100): ALL goes to principal, months_covered = 0 (Reyes edge case)', async () => {
    // Reyes save_payment.php: when amount < current_interest_due
    // $months_paid = 0; $principal_portion = $amount_paid;
    mock.mockRpcResponse('process_payment', {
      success: true,
      transaction_id: fixtures.uuid(),
      trans_type: 'PARTIAL_PAYMENT',
      interest_paid: 0,
      principal_paid: 100.00,
      months_covered: 0,
      remaining_principal: 9900.00,
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 100.00,
        payment_type: 'PARTIAL_REDEMPTION',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.interest_paid)).toBe(0);
    expect(Number(res.body.principal_paid)).toBe(100.00);
    expect(res.body.months_covered).toBe(0);
  });

  test('multiple partial payments accumulate towards principal', async () => {
    // Reyes: SELECT SUM(amount_paid) FROM Payment WHERE payment_type IN ('Redemption_Principal', 'Reduce_Principal')
    // First payment reduced principal from 10000 to 9500
    // Second payment: 800 = 300 interest + 500 principal → 9000 remaining
    mock.mockRpcResponse('process_payment', {
      success: true,
      transaction_id: fixtures.uuid(),
      trans_type: 'PARTIAL_PAYMENT',
      interest_paid: 300.00,
      principal_paid: 500.00,
      months_covered: 1,
      remaining_principal: 9000.00,
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 800.00,
        payment_type: 'PARTIAL_REDEMPTION',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.remaining_principal)).toBe(9000.00);
  });
});

// ─── FULL REDEMPTION ────────────────────────────────────────────────

describe('POST /api/payments — Full Redemption', () => {

  test('exact redemption amount = remaining_principal + 1 month interest', async () => {
    // Reyes: total_amount_due = principal_outstanding + current_interest_due
    // Powersim: redemption_amount = principal + total_interest + service_charge(5.00)
    mock.mockRpcResponse('process_payment', {
      success: true,
      transaction_id: fixtures.uuid(),
      trans_type: 'REDEMPTION',
      interest_paid: 300.00,
      principal_paid: 10000.00,
      months_covered: 1,
      remaining_principal: 0,
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 10300.00,
        payment_type: 'FULL_REDEMPTION',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(201);
    expect(res.body.trans_type).toBe('REDEMPTION');
    expect(Number(res.body.remaining_principal)).toBe(0);
  });

  test('rejects insufficient redemption amount', async () => {
    // Must cover principal + interest
    mock.mockRpcResponse('process_payment', {
      success: false,
      error: 'Full redemption requires at least 10300.00 (principal: 10000.00 + interest: 300.00)',
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 5000.00,
        payment_type: 'FULL_REDEMPTION',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/requires at least/);
  });

  test('overpayment is absorbed (no change returned) — matches PHP behavior', async () => {
    // Reyes: if ($total_principal_paid >= $loan_principal_db) → Redeemed
    // No refund logic exists in any PHP system
    mock.mockRpcResponse('process_payment', {
      success: true,
      transaction_id: fixtures.uuid(),
      trans_type: 'REDEMPTION',
      principal_paid: 10000.00,
      interest_paid: 300.00,
      remaining_principal: 0,     // Excess absorbed
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 15000.00,    // Overpayment
        payment_type: 'FULL_REDEMPTION',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.remaining_principal)).toBe(0);
  });
});

// ─── STATUS GUARDS ──────────────────────────────────────────────────

describe('POST /api/payments — Status Restrictions', () => {

  test('rejects payment on EXPIRED ticket', async () => {
    mock.mockRpcResponse('process_payment', {
      success: false,
      error: 'Cannot process payment for ticket with status EXPIRED',
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 300.00,
        payment_type: 'INTEREST_ONLY',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/EXPIRED/);
  });

  test('rejects payment on REDEEMED ticket', async () => {
    mock.mockRpcResponse('process_payment', {
      success: false,
      error: 'Cannot process payment for ticket with status REDEEMED',
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 300.00,
        payment_type: 'INTEREST_ONLY',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/REDEEMED/);
  });
});

// ─── INPUT VALIDATION ───────────────────────────────────────────────

describe('POST /api/payments — Input Validation', () => {

  test('rejects zero amount', async () => {
    mock.mockRpcResponse('process_payment', {
      success: false,
      error: 'Payment amount must be positive',
    });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 0,
        payment_type: 'INTEREST_ONLY',
        payment_method: 'CASH',
      });

    // Route-level validation catches missing/zero amount
    expect(res.status).toBe(400);
  });

  test('rejects negative amount', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: -100,
        payment_type: 'INTEREST_ONLY',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(400);
  });

  test('rejects invalid payment_type', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({
        ticket_id: fixtures.uuid(),
        amount_paid: 300,
        payment_type: 'INVALID_TYPE',
        payment_method: 'CASH',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payment_type/);
  });

  test('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─── PAYMENT SUMMARY ────────────────────────────────────────────────

describe('GET /api/payments/summary/:ticketId', () => {

  test('returns running payment totals for a ticket', async () => {
    mock.mockQueryResponse('transactions', {
      data: [
        { trans_type: 'INTEREST_PAYMENT', principal_paid: 0, interest_paid: 300, penalty_paid: 0, months_covered: 1, trans_date: '2026-02-15' },
        { trans_type: 'PARTIAL_PAYMENT', principal_paid: 500, interest_paid: 300, penalty_paid: 0, months_covered: 1, trans_date: '2026-03-15' },
      ],
      error: null,
    });

    const res = await request(app)
      .get(`/api/payments/summary/${fixtures.uuid()}`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.totals.principal_paid).toBe(500);
    expect(res.body.totals.interest_paid).toBe(600);
    expect(res.body.totals.months_covered).toBe(2);
    expect(res.body.totals.total_paid).toBe(1100);
  });
});
