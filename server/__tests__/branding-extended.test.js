jest.mock('../config/db', () => require('./helpers/supabaseMock'));

const request  = require('supertest');
const app      = require('../index');
const mock     = require('./helpers/supabaseMock');
const { authenticateAs } = require('./helpers/auth');
const fixtures = require('./helpers/fixtures');

beforeEach(() => { mock.resetMocks(); authenticateAs(fixtures.ownerProfile()); });

describe('Branding — extended fields', () => {
  test('PUT /api/branding accepts brand_color, font_family, services_enabled', async () => {
    const result = {
      tenant_id: fixtures.TENANT_A, brand_color: '#FF5733',
      font_family: 'Playfair Display', services_enabled: ['gold_jewelry'],
      tenants: { business_name: 'Test', logo_url: null },
    };
    mock.mockQueryResponse('tenant_branding', { data: result, error: null });

    const res = await request(app)
      .put('/api/branding')
      .set('Authorization', 'Bearer test-token')
      .send({ brand_color: '#FF5733', font_family: 'Playfair Display', services_enabled: ['gold_jewelry'] });

    expect(res.status).toBe(200);
    expect(res.body.brand_color).toBe('#FF5733');
    expect(res.body.font_family).toBe('Playfair Display');
  });

  test('PUT /api/branding rejects invalid hex color', async () => {
    const res = await request(app)
      .put('/api/branding')
      .set('Authorization', 'Bearer test-token')
      .send({ brand_color: 'notacolor' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid.*color/i);
  });

  test('PUT /api/branding rejects non-array services_enabled', async () => {
    const res = await request(app)
      .put('/api/branding')
      .set('Authorization', 'Bearer test-token')
      .send({ services_enabled: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/services_enabled/i);
  });

  test('PUT /api/branding accepts logo_url and business_name', async () => {
    mock.mockQueryResponse('tenants', { data: { id: fixtures.TENANT_A }, error: null });
    mock.mockQueryResponse('tenant_branding', {
      data: { tenant_id: fixtures.TENANT_A, tenants: { business_name: 'New Name', logo_url: 'https://ex.com/logo.png' } },
      error: null,
    });

    const res = await request(app)
      .put('/api/branding')
      .set('Authorization', 'Bearer test-token')
      .send({ logo_url: 'https://ex.com/logo.png', business_name: 'New Name' });

    expect(res.status).toBe(200);
  });
});
