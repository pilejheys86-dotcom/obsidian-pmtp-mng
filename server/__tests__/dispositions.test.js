/**
 * ═══════════════════════════════════════════════════════════════════
 * TEST SUITE: Item Disposition Pipeline (Feature 3)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies approve_item_disposition RPC matches legacy PHP rules:
 *
 * Reyes update_item_disposition.php:
 *   - Only FORFEITED items with PENDING_REVIEW can be moved
 *   - Two paths: FOR_AUCTION (requires auction_base_price > 0)
 *                FOR_MELTING (requires melting_value > 0)
 *   - Manager/Owner approval gate
 *   - Records who approved and when
 *
 * TechGold foreclose.php + auction.php:
 *   - Manual foreclosure: Active → Foreclosed, Item → For Auction
 *   - Batch auction: Expired/Foreclosed items → Auctioned
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

// ─── FOR_AUCTION PATH ───────────────────────────────────────────────

describe('POST /api/dispositions/approve — FOR_AUCTION', () => {

  test('approves item for auction with valid base price', async () => {
    authenticateAs(fixtures.managerProfile());
    mock.mockRpcResponse('approve_item_disposition', {
      success: true,
      item_id: fixtures.uuid(),
      disposition: 'FOR_AUCTION',
      approved_by: fixtures.USER_MANAGER,
    });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_AUCTION',
        auction_base_price: 15000.00,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.disposition).toBe('FOR_AUCTION');
  });

  test('rejects auction without base price', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('approve_item_disposition', {
      success: false,
      error: 'auction_base_price must be > 0 for auction',
    });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_AUCTION',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/auction_base_price/);
  });

  test('rejects auction with zero base price', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('approve_item_disposition', {
      success: false,
      error: 'auction_base_price must be > 0 for auction',
    });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_AUCTION',
        auction_base_price: 0,
      });

    expect(res.status).toBe(422);
  });
});

// ─── FOR_MELTING PATH ───────────────────────────────────────────────

describe('POST /api/dispositions/approve — FOR_MELTING', () => {

  test('approves item for melting with valid melting value', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('approve_item_disposition', {
      success: true,
      item_id: fixtures.uuid(),
      disposition: 'FOR_MELTING',
    });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_MELTING',
        melting_value: 8500.00,
      });

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('FOR_MELTING');
  });

  test('rejects melting without melting value', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('approve_item_disposition', {
      success: false,
      error: 'melting_value must be > 0 for melting',
    });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_MELTING',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/melting_value/);
  });
});

// ─── STATUS GUARDS ──────────────────────────────────────────────────

describe('POST /api/dispositions/approve — Status Guards', () => {

  test('rejects disposition on non-FORFEITED item', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('approve_item_disposition', {
      success: false,
      error: 'Item must be FORFEITED to set disposition. Current: VAULT',
    });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_AUCTION',
        auction_base_price: 10000,
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/FORFEITED/);
  });

  test('rejects re-disposition on already-approved item', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('approve_item_disposition', {
      success: false,
      error: 'Disposition already set to FOR_AUCTION',
    });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_MELTING',
        melting_value: 5000,
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/already set/);
  });

  test('rejects invalid disposition path', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('approve_item_disposition', {
      success: false,
      error: 'Invalid disposition path: SELL. Must be FOR_AUCTION or FOR_MELTING',
    });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'SELL',
      });

    expect(res.status).toBe(422);
  });
});

// ─── ROLE AUTHORIZATION ─────────────────────────────────────────────

describe('POST /api/dispositions/approve — Role Authorization', () => {

  test('CLERK cannot approve dispositions', async () => {
    authenticateAs(fixtures.clerkProfile());

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_AUCTION',
        auction_base_price: 10000,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/managers and owners/i);
  });

  test('MANAGER can approve dispositions', async () => {
    authenticateAs(fixtures.managerProfile());
    mock.mockRpcResponse('approve_item_disposition', { success: true, disposition: 'FOR_AUCTION' });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_AUCTION',
        auction_base_price: 10000,
      });

    expect(res.status).toBe(200);
  });

  test('OWNER can approve dispositions', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockRpcResponse('approve_item_disposition', { success: true, disposition: 'FOR_MELTING' });

    const res = await request(app)
      .post('/api/dispositions/approve')
      .set('Authorization', 'Bearer test-token')
      .send({
        item_id: fixtures.uuid(),
        disposition_path: 'FOR_MELTING',
        melting_value: 8000,
      });

    expect(res.status).toBe(200);
  });
});

// ─── DISPOSITION LIST ───────────────────────────────────────────────

describe('GET /api/dispositions', () => {

  test('lists forfeited items with disposition status', async () => {
    authenticateAs(fixtures.ownerProfile());
    mock.mockQueryResponse('pawn_items', {
      data: [
        fixtures.pawnItem({ inventory_status: 'FORFEITED', disposition: 'PENDING_REVIEW' }),
        fixtures.pawnItem({ inventory_status: 'FORFEITED', disposition: 'FOR_AUCTION', auction_base_price: 15000 }),
      ],
      error: null,
      count: 2,
    });

    const res = await request(app)
      .get('/api/dispositions')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.total).toBe(2);
  });
});
