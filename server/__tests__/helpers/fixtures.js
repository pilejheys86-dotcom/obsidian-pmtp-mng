/**
 * Test fixture factory functions.
 * Produces realistic pawnshop entities with sensible defaults.
 * Every entity includes tenant_id for multi-tenant isolation tests.
 */

const crypto = require('crypto');
const uuid = () => crypto.randomUUID();

const TENANT_A = uuid();
const TENANT_B = uuid();
const BRANCH_A = uuid();
const BRANCH_B = uuid();
const USER_OWNER = uuid();
const USER_MANAGER = uuid();
const USER_CLERK = uuid();
const USER_TENANT_B = uuid();
const CUSTOMER_A = uuid();
const CUSTOMER_B = uuid();
const CUSTOMER_AUTH_ID = uuid();

// ── Tenants ─────────────────────────────────────────────────────────
function tenantA() {
  return { id: TENANT_A, business_name: 'Pawnshop A', status: 'ACTIVE' };
}
function tenantB() {
  return { id: TENANT_B, business_name: 'Pawnshop B', status: 'ACTIVE' };
}

// ── Users ───────────────────────────────────────────────────────────
function ownerProfile() {
  return {
    id: USER_OWNER, tenant_id: TENANT_A, branch_id: BRANCH_A,
    role: 'OWNER', full_name: 'Owner A', is_active: true,
  };
}
function managerProfile() {
  return {
    id: USER_MANAGER, tenant_id: TENANT_A, branch_id: BRANCH_A,
    role: 'MANAGER', full_name: 'Manager A', is_active: true,
  };
}
function clerkProfile() {
  return {
    id: USER_CLERK, tenant_id: TENANT_A, branch_id: BRANCH_A,
    role: 'CLERK', full_name: 'Clerk A', is_active: true,
  };
}
function tenantBUser() {
  return {
    id: USER_TENANT_B, tenant_id: TENANT_B, branch_id: BRANCH_B,
    role: 'OWNER', full_name: 'Owner B', is_active: true,
  };
}

// ── Loan Settings (mirrors tenant_loan_settings table defaults) ─────
function loanSettings(overrides = {}) {
  return {
    id: uuid(),
    tenant_id: TENANT_A,
    interest_rate: 3.00,
    penalty_interest_rate: 5.00,
    ltv_ratio: 0.8000,
    grace_period_days: 10,
    maturity_months: 10,
    renewal_cooldown_days: 20,
    max_missed_payments: 10,
    payment_cycle_days: 30,
    service_charge: 5.00,
    affidavit_fee: 100.00,
    advance_interest_months: 1,
    ...overrides,
  };
}

// ── Pawn Ticket ─────────────────────────────────────────────────────
function pawnTicket(overrides = {}) {
  const loanDate = new Date('2026-01-15');
  const maturityDate = new Date('2026-11-15'); // 10 months
  const expiryDate = new Date('2026-11-25');   // +10 days grace
  return {
    id: uuid(),
    tenant_id: TENANT_A,
    ticket_number: `TKT-202601-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
    customer_id: uuid(),
    item_id: uuid(),
    appraiser_id: USER_OWNER,
    principal_loan: 10000.00,
    interest_rate: 3.00,
    original_interest_rate: 3.00,
    penalty_rate: 5.00,
    advance_interest: 300.00,
    service_charge: 5.00,
    loan_date: loanDate.toISOString(),
    maturity_date: maturityDate.toISOString(),
    expiry_date: expiryDate.toISOString(),
    status: 'ACTIVE',
    is_overdue: false,
    consecutive_missed_payments: 0,
    renewal_count: 0,
    next_payment_due_date: new Date('2026-02-14').toISOString(),
    last_payment_date: null,
    grace_period_days: 10,
    net_proceeds: 9695.00,   // 10000 - 300 (advance interest) - 5 (service charge)
    parent_ticket_id: null,
    forfeited_at: null,
    forfeiture_reason: null,
    deleted_at: null,
    ...overrides,
  };
}

// ── Pawn Item ───────────────────────────────────────────────────────
function pawnItem(overrides = {}) {
  return {
    id: uuid(),
    tenant_id: TENANT_A,
    customer_id: uuid(),
    branch_id: BRANCH_A,
    category: 'JEWELRY',
    general_desc: '18K Gold Necklace, 15.5g',
    appraised_value: 12500.00,
    specific_attrs: { karat: 18, weight_grams: 15.5, condition: 'GOOD' },
    condition_notes: null,
    inventory_status: 'VAULT',
    disposition: null,
    disposition_approved_by: null,
    disposition_approved_at: null,
    auction_base_price: null,
    melting_value: null,
    deleted_at: null,
    ...overrides,
  };
}

// ── Gold Rates ──────────────────────────────────────────────────────
function goldRates(tenantId = TENANT_A) {
  return [
    { tenant_id: tenantId, karat: 24, purity_decimal: 1.000, rate_per_gram: 4000.00 },
    { tenant_id: tenantId, karat: 22, purity_decimal: 0.916, rate_per_gram: 3664.00 },
    { tenant_id: tenantId, karat: 18, purity_decimal: 0.750, rate_per_gram: 3000.00 },
    { tenant_id: tenantId, karat: 14, purity_decimal: 0.585, rate_per_gram: 2340.00 },
  ];
}

// ── Customers ──────────────────────────────────────────────────────
function customerA(overrides = {}) {
  return {
    id: CUSTOMER_A, tenant_id: TENANT_A, auth_id: CUSTOMER_AUTH_ID,
    first_name: 'Juan', last_name: 'Dela Cruz', date_of_birth: '1990-01-15',
    nationality: 'Filipino', present_address: '123 Rizal St, Manila',
    mobile_number: '+639171234567', email: 'juan@test.com',
    employment_nature: 'EMPLOYED', risk_rating: 'LOW', deleted_at: null,
    ...overrides,
  };
}

function customerB(overrides = {}) {
  return {
    id: CUSTOMER_B, tenant_id: TENANT_B, auth_id: CUSTOMER_AUTH_ID,
    first_name: 'Juan', last_name: 'Dela Cruz', date_of_birth: '1990-01-15',
    nationality: 'Filipino', present_address: '456 Mabini St, Quezon City',
    mobile_number: '+639171234567', email: 'juan@test.com',
    employment_nature: 'EMPLOYED', risk_rating: 'LOW', deleted_at: null,
    ...overrides,
  };
}

function auctionLot(overrides = {}) {
  return {
    id: uuid(), tenant_id: TENANT_A, auction_id: uuid(), item_id: uuid(),
    base_price: 5000.00, sold_price: null, buyer_id: null,
    lot_number: 'LOT-001', approval_status: 'APPROVED', ...overrides,
  };
}

function auction(overrides = {}) {
  return {
    id: uuid(), tenant_id: TENANT_A,
    auction_date: new Date('2026-04-15').toISOString(),
    publication_date: new Date('2026-03-15').toISOString(),
    venue: 'Pawnshop A Main Branch', status: 'SCHEDULED', total_lots: 10,
    ...overrides,
  };
}

module.exports = {
  TENANT_A, TENANT_B, BRANCH_A, BRANCH_B,
  USER_OWNER, USER_MANAGER, USER_CLERK, USER_TENANT_B,
  CUSTOMER_A, CUSTOMER_B, CUSTOMER_AUTH_ID,
  tenantA, tenantB,
  ownerProfile, managerProfile, clerkProfile, tenantBUser,
  customerA, customerB, auction, auctionLot,
  loanSettings, pawnTicket, pawnItem, goldRates,
  uuid,
};
