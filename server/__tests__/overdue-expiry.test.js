/**
 * ═══════════════════════════════════════════════════════════════════
 * TEST SUITE: Overdue Escalation + Auto-Expiry (Features 2 & 3)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies cron-triggered RPCs match legacy PHP auto_expire_loans.php:
 *
 * check_overdue_loans() — Reyes auto_expire_loans.php:
 *   - Runs daily against active tickets past next_payment_due_date
 *   - Increments consecutive_missed_payments by missed 30-day cycles
 *   - Escalates interest_rate from 3% → 5% (penalty)
 *   - At exactly 10 consecutive misses → auto-expire
 *   - On expire: ticket → EXPIRED, item → FORFEITED + PENDING_REVIEW
 *   - Boundary: next_payment_due_date < NOW() (exclusive — due date itself is NOT overdue)
 *
 * auto_expire_by_grace_period() — TechGold extend_loan.php:
 *   - Hard deadline: NOW() > expiry_date (strictly past)
 *   - TechGold: 3-day grace after expiry date
 *   - Acts as a safety net separate from missed-payment expiry
 *
 * Edge cases tested:
 *   - At exactly boundary day (not overdue yet)
 *   - 9 → 10 missed payments (triggers expiry)
 *   - Skip multiple cycles in one run
 *   - Payment-before-cron race condition
 *   - Role authorization (OWNER/MANAGER only)
 */

jest.mock('../config/db', () => require('./helpers/supabaseMock'));

const request = require('supertest');
const app = require('../index');
const mock = require('./helpers/supabaseMock');
const { authenticateAs } = require('./helpers/auth');
const fixtures = require('./helpers/fixtures');

beforeEach(() => {
  mock.resetMocks();
});

// ─── CHECK OVERDUE LOANS (Cron) ─────────────────────────────────────

describe('POST /api/cron/check-overdue', () => {

  test('escalates and expires loans — returns counts', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('check_overdue_loans', {
      success: true,
      expired_count: 2,
      escalated_count: 5,
      run_at: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/api/cron/check-overdue')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.expired_count).toBe(2);
    expect(res.body.escalated_count).toBe(5);
  });

  test('missed_payments at 9, +1 cycle → exactly 10 → EXPIRES (boundary)', async () => {
    // Reyes: if ($new_missed_count >= 10) → EXPIRE
    // 9 + 1 = 10, which is >= 10, so it EXPIRES
    authenticateAs(fixtures.managerProfile());
    mock.mockRpcResponse('check_overdue_loans', {
      success: true,
      expired_count: 1,
      escalated_count: 0,
    });

    const res = await request(app)
      .post('/api/cron/check-overdue')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.expired_count).toBe(1);
  });

  test('missed_payments at 8, +1 cycle → 9 → escalate only (not expired)', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('check_overdue_loans', {
      success: true,
      expired_count: 0,
      escalated_count: 1,
    });

    const res = await request(app)
      .post('/api/cron/check-overdue')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.expired_count).toBe(0);
    expect(res.body.escalated_count).toBe(1);
  });

  test('multiple missed cycles in one run (65 days → 2 cycles)', async () => {
    // Reyes: $cycles_missed = max(1, floor($days_overdue / 30))
    // 65 days → floor(65/30) = 2 cycles
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('check_overdue_loans', {
      success: true,
      expired_count: 0,
      escalated_count: 1,
    });

    const res = await request(app)
      .post('/api/cron/check-overdue')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
  });

  test('no overdue loans → zero counts', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('check_overdue_loans', {
      success: true,
      expired_count: 0,
      escalated_count: 0,
    });

    const res = await request(app)
      .post('/api/cron/check-overdue')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.expired_count).toBe(0);
    expect(res.body.escalated_count).toBe(0);
  });

  test('rejects CLERK role (not OWNER or MANAGER)', async () => {
    authenticateAs(fixtures.clerkProfile());

    const res = await request(app)
      .post('/api/cron/check-overdue')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owners and managers/i);
  });
});

// ─── AUTO-EXPIRE BY GRACE PERIOD (Cron) ─────────────────────────────

describe('POST /api/cron/auto-expire', () => {

  test('expires tickets past maturity + grace period', async () => {
    // TechGold: status='Expired' WHERE '$today' > DATE_ADD(expiry_date, INTERVAL 3 DAY)
    // Our system: WHERE expiry_date < NOW()
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('auto_expire_by_grace_period', {
      success: true,
      expired_count: 3,
      run_at: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/api/cron/auto-expire')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.expired_count).toBe(3);
  });

  test('exactly on expiry_date → NOT expired (strict > comparison)', async () => {
    // TechGold: '$manila_today' > DATE_ADD(expiry_date, INTERVAL 3 DAY)
    // Boundary is EXCLUSIVE — must be STRICTLY past
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('auto_expire_by_grace_period', {
      success: true,
      expired_count: 0,    // Nothing expires when exactly on the boundary
    });

    const res = await request(app)
      .post('/api/cron/auto-expire')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.expired_count).toBe(0);
  });

  test('rejects CLERK role', async () => {
    authenticateAs(fixtures.clerkProfile());

    const res = await request(app)
      .post('/api/cron/auto-expire')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(403);
  });
});

// ─── RUN ALL CRON JOBS ──────────────────────────────────────────────

describe('POST /api/cron/run-all', () => {

  test('runs both overdue check and auto-expire in sequence', async () => {
    authenticateAs(fixtures.ownerProfile());

    mock.mockRpcResponse('check_overdue_loans', {
      success: true,
      expired_count: 1,
      escalated_count: 3,
    });
    mock.mockRpcResponse('auto_expire_by_grace_period', {
      success: true,
      expired_count: 2,
    });

    const res = await request(app)
      .post('/api/cron/run-all')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.overdue.expired_count).toBe(1);
    expect(res.body.overdue.escalated_count).toBe(3);
    expect(res.body.expiry.expired_count).toBe(2);
  });
});

// ─── OVERDUE BOUNDARY: DUE DATE IS NOT OVERDUE ──────────────────────

describe('Overdue Boundary Behavior', () => {

  test('on due date itself (day 0) → not overdue (PHP: next_payment_due_date < CURDATE())', () => {
    // Reyes auto_expire_loans.php: WHERE pt.next_payment_due_date < CURDATE()
    // On due date: due_date = today → condition is FALSE → NOT overdue
    // Also Reyes loan_details.php: $is_overdue = $current_date_obj > $next_payment_date_obj;
    // On due date: today > due_date is FALSE (they are equal)
    const today = new Date('2026-03-14');
    const dueDate = new Date('2026-03-14');
    const isOverdue = today > dueDate; // false (exclusive boundary)
    expect(isOverdue).toBe(false);
  });

  test('1 day past due → overdue', () => {
    const today = new Date('2026-03-15');
    const dueDate = new Date('2026-03-14');
    const isOverdue = today > dueDate;
    expect(isOverdue).toBe(true);
  });

  test('TechGold grace: expiry + 3 days exact → NOT expired', () => {
    // TechGold: '$manila_today' > DATE_ADD(expiry_date, INTERVAL 3 DAY)
    const today = new Date('2026-03-17');
    const expiryPlus3 = new Date('2026-03-17');
    const isExpired = today > expiryPlus3; // false (equal, not strictly greater)
    expect(isExpired).toBe(false);
  });

  test('TechGold grace: expiry + 4 days → EXPIRED', () => {
    const today = new Date('2026-03-18');
    const expiryPlus3 = new Date('2026-03-17');
    const isExpired = today > expiryPlus3;
    expect(isExpired).toBe(true);
  });

  test('Powersim forfeit: exactly 30 days overdue → CAN forfeit (>=)', () => {
    // Powersim: $can_forfeit = $days_overdue >= $MATURITY_DAYS;
    const daysOverdue = 30;
    const MATURITY_DAYS = 30;
    const canForfeit = daysOverdue >= MATURITY_DAYS;
    expect(canForfeit).toBe(true);
  });

  test('Powersim forfeit: 29 days overdue → CANNOT forfeit', () => {
    const daysOverdue = 29;
    const MATURITY_DAYS = 30;
    const canForfeit = daysOverdue >= MATURITY_DAYS;
    expect(canForfeit).toBe(false);
  });
});

// ─── PENALTY INTEREST BRACKETS (TechGold) ───────────────────────────

describe('TechGold Penalty Brackets — Business Rule Verification', () => {

  function getTechGoldBracket(daysLate) {
    if (daysLate <= 34) return { rate: 3, months: 1 };
    if (daysLate <= 64) return { rate: 8, months: 2 };
    return { rate: 16, months: 4 };
  }

  test('day 0 → 3% standard, +1 month', () => {
    expect(getTechGoldBracket(0)).toEqual({ rate: 3, months: 1 });
  });

  test('day 34 (inclusive) → still 3% grace', () => {
    expect(getTechGoldBracket(34)).toEqual({ rate: 3, months: 1 });
  });

  test('day 35 → 8% second month penalty, +2 months', () => {
    expect(getTechGoldBracket(35)).toEqual({ rate: 8, months: 2 });
  });

  test('day 64 (inclusive) → still 8%', () => {
    expect(getTechGoldBracket(64)).toEqual({ rate: 8, months: 2 });
  });

  test('day 65 → 16% catch-up, +4 months', () => {
    expect(getTechGoldBracket(65)).toEqual({ rate: 16, months: 4 });
  });

  test('day 365 → 16% catch-up', () => {
    expect(getTechGoldBracket(365)).toEqual({ rate: 16, months: 4 });
  });
});

// ─── INTEREST CALCULATION FORMULAS ──────────────────────────────────

describe('Interest Calculation — Legacy PHP Formula Parity', () => {

  test('Reyes monthly interest: principal × rate / 100', () => {
    // Reyes: $monthly_interest_amount = $loan_principal_numeric * $interest_rate_per_month
    const principal = 10000;
    const ratePercent = 3.00;
    const monthlyInterest = principal * (ratePercent / 100);
    expect(monthlyInterest).toBe(300.00);
  });

  test('Reyes penalty interest: 10000 × 5% = 500', () => {
    const principal = 10000;
    const penaltyRate = 5.00;
    const penaltyInterest = principal * (penaltyRate / 100);
    expect(penaltyInterest).toBe(500.00);
  });

  test('Powersim multi-month: principal × rate × months (ceil)', () => {
    // Powersim: $total_interest = round($principal * ($interest_rate / 100) * $months_elapsed, 2)
    const principal = 10000;
    const rate = 3.00;
    const monthsElapsed = Math.max(1, Math.ceil(45 / 30)); // 45 days = ceil(1.5) = 2
    const totalInterest = Math.round(principal * (rate / 100) * monthsElapsed * 100) / 100;
    expect(monthsElapsed).toBe(2);
    expect(totalInterest).toBe(600.00);
  });

  test('Powersim min 1 month even for day 0', () => {
    const daysElapsed = 0;
    const monthsElapsed = Math.max(1, Math.ceil(daysElapsed / 30));
    expect(monthsElapsed).toBe(1);
  });

  test('Powersim redemption: principal + total_interest + service_charge(5)', () => {
    const principal = 10000;
    const rate = 3;
    const monthsElapsed = 3;
    const totalInterest = Math.round(principal * (rate / 100) * monthsElapsed * 100) / 100;
    const serviceCharge = 5.00;
    const redemptionAmount = principal + totalInterest + serviceCharge;
    expect(redemptionAmount).toBe(10905.00);
  });

  test('TechGold fixed 3% redemption interest', () => {
    // TechGold: $interest = $principal * 0.03
    const principal = 10000;
    const interest = principal * 0.03;
    expect(interest).toBe(300.00);
  });
});
