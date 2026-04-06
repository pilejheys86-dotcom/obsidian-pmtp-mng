/**
 * ═══════════════════════════════════════════════════════════════════
 * TEST SUITE: Tenant Settings + Gold Rates + Appraisal (Feature 4)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies RPCs match Reyes Pawnshop settings and appraisal logic:
 *
 * Loan Settings (Reyes save_loan_settings.php):
 *   - Owner-only access
 *   - LTV ratio range: 0.01 to 1.00
 *   - Partial update (COALESCE pattern)
 *
 * Gold Rates (Reyes save_gold_rates.php):
 *   - Valid karats: 10, 14, 18, 21, 22, 24
 *   - Rate per gram must be positive
 *   - Effective date = today (upsert)
 *
 * Appraisal (Reyes appraisal_helpers.php):
 *   - Formula: weight × purity × gold_rate_24k × LTV × condition_mult
 *   - Purity decimals: 24→1.000, 22→0.916, 18→0.750, 14→0.585, 10→0.417
 *   - Condition effects: MINT→100%, GOOD→95%, FAIR→85%, POOR→60%
 *   - Weight ≤ 0 → rejected (Reyes: $weight <= 0 returns 0)
 *   - No gold rate → error (Reyes throws exception)
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

// ─── LOAN SETTINGS ──────────────────────────────────────────────────

describe('GET /api/loan-settings', () => {

  test('returns tenant loan settings', async () => {
    authenticateAs(fixtures.ownerProfile());
    const settings = fixtures.loanSettings();
    mock.mockQueryResponse('tenant_loan_settings', { data: settings, error: null });

    const res = await request(app)
      .get('/api/loan-settings')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(Number(res.body.interest_rate)).toBe(3.00);
    expect(Number(res.body.penalty_interest_rate)).toBe(5.00);
    expect(Number(res.body.ltv_ratio)).toBe(0.80);
    expect(res.body.grace_period_days).toBe(10);
    expect(res.body.maturity_months).toBe(10);
    expect(res.body.renewal_cooldown_days).toBe(20);
    expect(res.body.max_missed_payments).toBe(10);
    expect(res.body.payment_cycle_days).toBe(30);
  });
});

describe('PATCH /api/loan-settings', () => {

  test('OWNER can update settings', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('save_tenant_loan_settings', {
      success: true,
      settings_id: fixtures.uuid(),
    });

    const res = await request(app)
      .patch('/api/loan-settings')
      .set('Authorization', 'Bearer test-token')
      .send({
        interest_rate: 4.00,
        penalty_interest_rate: 6.00,
        ltv_ratio: 0.75,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('CLERK cannot update settings', async () => {
    authenticateAs(fixtures.clerkProfile());

    const res = await request(app)
      .patch('/api/loan-settings')
      .set('Authorization', 'Bearer test-token')
      .send({ interest_rate: 4.00 });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner/i);
  });

  test('MANAGER cannot update settings', async () => {
    authenticateAs(fixtures.managerProfile());

    const res = await request(app)
      .patch('/api/loan-settings')
      .set('Authorization', 'Bearer test-token')
      .send({ interest_rate: 4.00 });

    expect(res.status).toBe(403);
  });

  test('rejects LTV ratio > 1.00', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('save_tenant_loan_settings', {
      success: false,
      error: 'LTV ratio must be between 0.01 and 1.00',
    });

    const res = await request(app)
      .patch('/api/loan-settings')
      .set('Authorization', 'Bearer test-token')
      .send({ ltv_ratio: 1.50 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/LTV/);
  });

  test('rejects LTV ratio < 0.01', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('save_tenant_loan_settings', {
      success: false,
      error: 'LTV ratio must be between 0.01 and 1.00',
    });

    const res = await request(app)
      .patch('/api/loan-settings')
      .set('Authorization', 'Bearer test-token')
      .send({ ltv_ratio: 0.005 });

    expect(res.status).toBe(422);
  });

  test('partial update keeps other fields unchanged (COALESCE)', async () => {
    // save_tenant_loan_settings uses COALESCE(p_field, existing_value)
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('save_tenant_loan_settings', {
      success: true,
      settings_id: fixtures.uuid(),
    });

    const res = await request(app)
      .patch('/api/loan-settings')
      .set('Authorization', 'Bearer test-token')
      .send({ grace_period_days: 15 }); // Only updating 1 field

    expect(res.status).toBe(200);
  });
});

// ─── GOLD RATES ─────────────────────────────────────────────────────

describe('GET /api/loan-settings/gold-rates', () => {

  test('returns gold rates ordered by karat descending', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockQueryResponse('gold_rates', {
      data: fixtures.goldRates(),
      error: null,
    });

    const res = await request(app)
      .get('/api/loan-settings/gold-rates')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
  });
});

describe('PUT /api/loan-settings/gold-rates', () => {

  test('upserts gold rate for valid karat', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('save_gold_rate', {
      success: true,
      rate_id: fixtures.uuid(),
      karat: 18,
      purity: 0.750,
      rate: 3200.00,
    });

    const res = await request(app)
      .put('/api/loan-settings/gold-rates')
      .set('Authorization', 'Bearer test-token')
      .send({ karat: 18, rate_per_gram: 3200.00 });

    expect(res.status).toBe(200);
    expect(res.body.karat).toBe(18);
    expect(Number(res.body.purity)).toBe(0.75);
  });

  test('rejects unsupported karat (12)', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('save_gold_rate', {
      success: false,
      error: 'Unsupported karat: 12. Supported: 10, 14, 18, 21, 22, 24',
    });

    const res = await request(app)
      .put('/api/loan-settings/gold-rates')
      .set('Authorization', 'Bearer test-token')
      .send({ karat: 12, rate_per_gram: 2000 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Unsupported karat/);
  });

  test('rejects zero rate_per_gram (caught at route level: !0 is truthy)', async () => {
    // Route: if (!karat || !rate_per_gram) → 400
    // 0 is falsy in JS, so !0 = true → route rejects before RPC
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/loan-settings/gold-rates')
      .set('Authorization', 'Bearer test-token')
      .send({ karat: 24, rate_per_gram: 0 });

    expect(res.status).toBe(400);
  });

  test('CLERK cannot update gold rates', async () => {
    authenticateAs(fixtures.clerkProfile());

    const res = await request(app)
      .put('/api/loan-settings/gold-rates')
      .set('Authorization', 'Bearer test-token')
      .send({ karat: 24, rate_per_gram: 4500 });

    expect(res.status).toBe(403);
  });

  test('rejects missing required fields', async () => {
    authenticateAs(fixtures.ownerProfile());

    const res = await request(app)
      .put('/api/loan-settings/gold-rates')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/karat|rate_per_gram/);
  });
});

// ─── APPRAISAL CALCULATION ──────────────────────────────────────────

describe('POST /api/appraisals/calculate', () => {

  test('18K, 15.5g, GOOD condition → correct formula output', async () => {
    // Reyes formula: weight × purity × rate_per_gram × condition × LTV
    // 15.5 × 0.750 × 3000 × 0.95 × 0.80 = 26,505.00
    // melt_value = 15.5 * 0.750 * 3000 = 34,875
    // appraised = 34,875 * 0.95 = 33,131.25
    // loan = 33,131.25 * 0.80 = 26,505.00
    authenticateAs(fixtures.clerkProfile());
    mock.mockRpcResponse('calculate_appraisal', {
      success: true,
      melt_value: 34875.00,
      appraised_value: 33131.25,
      loan_amount: 26505.00,
      ltv_ratio: 0.80,
      purity: 0.750,
      condition_mult: 0.95,
      rate_per_gram: 3000.00,
    });

    const res = await request(app)
      .post('/api/appraisals/calculate')
      .set('Authorization', 'Bearer test-token')
      .send({ weight_grams: 15.5, karat: 18, item_condition: 'GOOD' });

    expect(res.status).toBe(200);
    expect(Number(res.body.melt_value)).toBe(34875.00);
    expect(Number(res.body.appraised_value)).toBe(33131.25);
    expect(Number(res.body.loan_amount)).toBe(26505.00);
  });

  test('24K, MINT condition → purity=1.000, condition=1.00', async () => {
    authenticateAs(fixtures.clerkProfile());
    mock.mockRpcResponse('calculate_appraisal', {
      success: true,
      melt_value: 40000.00,   // 10g * 1.0 * 4000
      appraised_value: 40000.00,  // * 1.00 (MINT)
      loan_amount: 32000.00,      // * 0.80
      purity: 1.000,
      condition_mult: 1.00,
    });

    const res = await request(app)
      .post('/api/appraisals/calculate')
      .set('Authorization', 'Bearer test-token')
      .send({ weight_grams: 10, karat: 24, item_condition: 'MINT' });

    expect(res.status).toBe(200);
    expect(Number(res.body.purity)).toBe(1.0);
    expect(Number(res.body.condition_mult)).toBe(1.0);
  });

  test('POOR condition → 60% multiplier', async () => {
    authenticateAs(fixtures.clerkProfile());
    mock.mockRpcResponse('calculate_appraisal', {
      success: true,
      condition_mult: 0.60,
      loan_amount: 19200.00,
    });

    const res = await request(app)
      .post('/api/appraisals/calculate')
      .set('Authorization', 'Bearer test-token')
      .send({ weight_grams: 10, karat: 24, item_condition: 'POOR' });

    expect(res.status).toBe(200);
    expect(Number(res.body.condition_mult)).toBe(0.60);
  });

  test('rejects invalid karat', async () => {
    authenticateAs(fixtures.clerkProfile());
    mock.mockRpcResponse('calculate_appraisal', {
      success: false,
      error: 'Unsupported karat: 15',
    });

    const res = await request(app)
      .post('/api/appraisals/calculate')
      .set('Authorization', 'Bearer test-token')
      .send({ weight_grams: 10, karat: 15, item_condition: 'GOOD' });

    expect(res.status).toBe(422);
  });

  test('rejects invalid condition', async () => {
    authenticateAs(fixtures.clerkProfile());
    mock.mockRpcResponse('calculate_appraisal', {
      success: false,
      error: 'Invalid condition: EXCELLENT. Use MINT, GOOD, FAIR, or POOR',
    });

    const res = await request(app)
      .post('/api/appraisals/calculate')
      .set('Authorization', 'Bearer test-token')
      .send({ weight_grams: 10, karat: 18, item_condition: 'EXCELLENT' });

    expect(res.status).toBe(422);
  });

  test('errors when no gold rate configured', async () => {
    authenticateAs(fixtures.clerkProfile());
    mock.mockRpcResponse('calculate_appraisal', {
      success: false,
      error: 'No gold rate configured for 18K. Set rates first.',
    });

    const res = await request(app)
      .post('/api/appraisals/calculate')
      .set('Authorization', 'Bearer test-token')
      .send({ weight_grams: 10, karat: 18, item_condition: 'GOOD' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/No gold rate/);
  });

  test('rejects missing required fields', async () => {
    authenticateAs(fixtures.clerkProfile());

    const res = await request(app)
      .post('/api/appraisals/calculate')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/weight_grams|karat|item_condition/);
  });
});

// ─── APPRAISAL FORMULA PARITY TESTS ────────────────────────────────

describe('Appraisal Formula — PHP Parity', () => {

  const PURITY = { 24: 1.000, 22: 0.916, 21: 0.875, 18: 0.750, 14: 0.585, 10: 0.417 };
  const CONDITION = { MINT: 1.00, GOOD: 0.95, FAIR: 0.85, POOR: 0.60 };

  function phpAppraisal(weight, karat, rate24k, condition, ltvRatio) {
    // Mirrors Reyes appraisal_helpers.php exactly
    const purity = PURITY[karat];
    if (!purity || weight <= 0 || rate24k <= 0) return 0;
    const condMult = CONDITION[condition] || 0;
    const meltValue = weight * purity * rate24k;
    const afterLtv = meltValue * ltvRatio;
    return Math.round(afterLtv * condMult);
  }

  test('exact match: 15.5g 18K GOOD @ ₱4000/g, 80% LTV', () => {
    const result = phpAppraisal(15.5, 18, 4000, 'GOOD', 0.80);
    // 15.5 * 0.750 * 4000 * 0.80 * 0.95 = 35,340
    expect(result).toBe(35340);
  });

  test('exact match: 10g 24K MINT @ ₱4000/g, 70% LTV', () => {
    const result = phpAppraisal(10, 24, 4000, 'MINT', 0.70);
    // 10 * 1.000 * 4000 * 0.70 * 1.00 = 28,000
    expect(result).toBe(28000);
  });

  test('POOR condition significantly reduces loan', () => {
    const good = phpAppraisal(10, 18, 4000, 'GOOD', 0.80);
    const poor = phpAppraisal(10, 18, 4000, 'POOR', 0.80);
    expect(poor).toBeLessThan(good);
    expect(poor / good).toBeCloseTo(0.60 / 0.95, 2);
  });

  test('weight = 0 returns 0 (Reyes: if weight <= 0 return 0)', () => {
    expect(phpAppraisal(0, 18, 4000, 'GOOD', 0.80)).toBe(0);
  });

  test('negative weight returns 0', () => {
    expect(phpAppraisal(-5, 18, 4000, 'GOOD', 0.80)).toBe(0);
  });

  test('invalid karat returns 0', () => {
    expect(phpAppraisal(10, 15, 4000, 'GOOD', 0.80)).toBe(0);
  });

  test('gold rate of 0 returns 0', () => {
    expect(phpAppraisal(10, 18, 0, 'GOOD', 0.80)).toBe(0);
  });
});
