-- ============================================================================
-- MIGRATION 103: Business Logic Tables
-- Source of Truth: MasterSchema.md (v5)
-- Date: 2026-03-22
--
-- INSTRUCTIONS:
--   1. Run SECTION A (ENUMs) FIRST — each CREATE TYPE individually
--   2. Run SECTIONS B–E together as one block
-- ============================================================================


-- ============================================================================
-- SECTION A: ENUM TYPES
-- >>> Run each statement INDIVIDUALLY in Supabase SQL Editor <<<
-- ============================================================================

DO $$ BEGIN CREATE TYPE item_category AS ENUM ('JEWELRY','VEHICLE','GADGET','APPLIANCE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE inventory_status AS ENUM ('PENDING_APPRAISAL','PENDING_APPROVAL','VAULT','REDEEMED','FORFEITED','AUCTIONED','MELTED','DECLINED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ticket_status AS ENUM ('ACTIVE','RENEWED','REDEEMED','EXPIRED','FORFEITED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE trans_type AS ENUM ('DISBURSEMENT','RENEWAL','REDEMPTION','AUCTION_SALE','INTEREST_PAYMENT','PARTIAL_PAYMENT','FORFEITURE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_method AS ENUM ('CASH','GCASH','PAYMAYA','BANK_TRANSFER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notice_type AS ENUM ('MATURITY_WARNING','GRACE_PERIOD_START','AUCTION_NOTICE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE delivery_method AS ENUM ('SMS','EMAIL','APP_PUSH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE delivery_status AS ENUM ('DELIVERED','FAILED','PENDING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE auction_status AS ENUM ('SCHEDULED','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE disposition_status AS ENUM ('PENDING_REVIEW','FOR_AUCTION','FOR_MELTING','MELTED','RETURNED_TO_OWNER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION B: BUSINESS CONFIG TABLES
-- ============================================================================

-- B1: Tenant Loan Settings
CREATE TABLE IF NOT EXISTS tenant_loan_settings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) UNIQUE,
    interest_rate           DECIMAL(5,2) NOT NULL DEFAULT 3.00,
    penalty_interest_rate   DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    ltv_ratio               DECIMAL(5,4) NOT NULL DEFAULT 0.8000,
    grace_period_days       INTEGER NOT NULL DEFAULT 10,
    maturity_months         INTEGER NOT NULL DEFAULT 10,
    renewal_cooldown_days   INTEGER NOT NULL DEFAULT 20,
    max_missed_payments     INTEGER NOT NULL DEFAULT 10,
    payment_cycle_days      INTEGER NOT NULL DEFAULT 30,
    service_charge          DECIMAL(15,2) NOT NULL DEFAULT 5.00,
    affidavit_fee           DECIMAL(15,2) NOT NULL DEFAULT 100.00,
    advance_interest_months INTEGER NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

-- B2: Gold Rates
CREATE TABLE IF NOT EXISTS gold_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    karat           INTEGER NOT NULL,
    purity_decimal  DECIMAL(5,3) NOT NULL,
    rate_per_gram   DECIMAL(15,2) NOT NULL,
    effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE(tenant_id, karat, effective_date)
);


-- ============================================================================
-- SECTION C: PAWN OPERATIONS TABLES
-- ============================================================================

-- C1: Pawn Items (collateral)
CREATE TABLE IF NOT EXISTS pawn_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    customer_id             UUID NOT NULL REFERENCES customers(id),
    branch_id               UUID NOT NULL REFERENCES branches(id),
    category                item_category NOT NULL,
    general_desc            TEXT NOT NULL,
    item_condition          TEXT CHECK (item_condition IN ('MINT','GOOD','FAIR','POOR')),
    condition_notes         TEXT,
    specific_attrs          JSONB DEFAULT '{}',
    -- Structured fields
    brand                   TEXT,
    model                   TEXT,
    serial_number           TEXT,
    weight_grams            NUMERIC(10,4),
    karat                   INTEGER,
    accessories             TEXT[],
    -- Valuation
    appraised_value         DECIMAL(15,2),
    fair_market_value       DECIMAL(12,2),
    offered_amount          DECIMAL(12,2),
    storage_location        TEXT,
    -- Status
    inventory_status        inventory_status NOT NULL DEFAULT 'PENDING_APPRAISAL',
    -- Disposition pipeline
    disposition             disposition_status,
    disposition_approved_by UUID REFERENCES tenant_users(id),
    disposition_approved_at TIMESTAMPTZ,
    auction_base_price      DECIMAL(15,2),
    melting_value           DECIMAL(15,2),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

-- C2: Appraisal Assessments (audit trail per valuation attempt)
CREATE TABLE IF NOT EXISTS appraisal_assessments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    item_id               UUID NOT NULL REFERENCES pawn_items(id),
    assessed_by           UUID NOT NULL REFERENCES tenant_users(id),
    category              TEXT NOT NULL,
    weight_grams          NUMERIC(10,4),
    karat                 INTEGER,
    item_condition        TEXT CHECK (item_condition IN ('MINT','GOOD','FAIR','POOR')),
    gold_rate_used        NUMERIC(12,2),
    purity_decimal_used   NUMERIC(6,4),
    condition_multiplier  NUMERIC(4,2),
    ltv_ratio_used        NUMERIC(5,4),
    melt_value            NUMERIC(12,2),
    fair_market_value     NUMERIC(12,2) NOT NULL,
    appraised_value       NUMERIC(12,2) NOT NULL,
    offered_amount        NUMERIC(12,2),
    notes                 TEXT,
    outcome               TEXT CHECK (outcome IN ('PENDING','APPROVED','REJECTED','DECLINED'))
                          DEFAULT 'PENDING',
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- C3: Pawn Tickets (loan contracts)
CREATE TABLE IF NOT EXISTS pawn_tickets (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id),
    ticket_number               VARCHAR(50) UNIQUE NOT NULL,
    customer_id                 UUID NOT NULL REFERENCES customers(id),
    item_id                     UUID NOT NULL REFERENCES pawn_items(id),
    appraiser_id                UUID NOT NULL REFERENCES tenant_users(id),
    principal_loan              DECIMAL(15,2) NOT NULL,
    interest_rate               DECIMAL(5,2) NOT NULL,
    advance_interest            DECIMAL(15,2) NOT NULL DEFAULT 0,
    service_charge              DECIMAL(15,2) NOT NULL DEFAULT 0,
    net_proceeds                DECIMAL(15,2),
    loan_date                   TIMESTAMPTZ NOT NULL,
    maturity_date               TIMESTAMPTZ NOT NULL,
    status                      ticket_status NOT NULL DEFAULT 'ACTIVE',
    -- Renewal chain
    parent_ticket_id            UUID REFERENCES pawn_tickets(id),
    renewal_count               INTEGER NOT NULL DEFAULT 0,
    -- Overdue tracking
    original_interest_rate      DECIMAL(5,2),
    penalty_rate                DECIMAL(5,2),
    is_overdue                  BOOLEAN NOT NULL DEFAULT FALSE,
    consecutive_missed_payments INTEGER NOT NULL DEFAULT 0,
    last_payment_date           TIMESTAMPTZ,
    next_payment_due_date       TIMESTAMPTZ,
    -- Expiry / forfeiture
    expiry_date                 TIMESTAMPTZ,
    grace_period_days           INTEGER,
    forfeited_at                TIMESTAMPTZ,
    forfeiture_reason           TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);

-- C4: Transactions (payment records)
CREATE TABLE IF NOT EXISTS transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    ticket_id           UUID NOT NULL REFERENCES pawn_tickets(id),
    processed_by        UUID NOT NULL REFERENCES tenant_users(id),
    trans_type          trans_type NOT NULL,
    payment_method      payment_method NOT NULL,
    principal_paid      DECIMAL(15,2) NOT NULL DEFAULT 0,
    interest_paid       DECIMAL(15,2) NOT NULL DEFAULT 0,
    penalty_paid        DECIMAL(15,2) NOT NULL DEFAULT 0,
    service_charge_paid DECIMAL(15,2) NOT NULL DEFAULT 0,
    months_covered      INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    trans_date          TIMESTAMPTZ NOT NULL,
    receipt_number      VARCHAR(100) UNIQUE NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);


-- ============================================================================
-- SECTION D: SUPPORTING TABLES
-- ============================================================================

-- D1: Media (images for customers & items)
CREATE TABLE IF NOT EXISTS media (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    ref_type    VARCHAR(50) NOT NULL,       -- CUSTOMER_KYC, ITEM_PHOTO
    ref_id      UUID NOT NULL,              -- FK to customers.id or pawn_items.id
    image_url   TEXT NOT NULL,
    label       VARCHAR(50),                -- front, back, primary, etc.
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

-- D2: Notices Log
CREATE TABLE IF NOT EXISTS notices_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    ticket_id       UUID NOT NULL REFERENCES pawn_tickets(id),
    notice_type     notice_type NOT NULL,
    delivery_method delivery_method NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL,
    status          delivery_status NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- D3: Auctions
CREATE TABLE IF NOT EXISTS auctions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    branch_id       UUID REFERENCES branches(id),
    auction_date    TIMESTAMPTZ NOT NULL,
    publication_date TIMESTAMPTZ NOT NULL,
    venue           TEXT NOT NULL,
    status          auction_status NOT NULL DEFAULT 'SCHEDULED',
    approved_by     UUID REFERENCES tenant_users(id),
    total_lots      INTEGER NOT NULL DEFAULT 0,
    total_sold      DECIMAL(15,2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- D4: Auction Lots
CREATE TABLE IF NOT EXISTS auction_lots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    auction_id      UUID NOT NULL REFERENCES auctions(id),
    item_id         UUID NOT NULL REFERENCES pawn_items(id),
    base_price      DECIMAL(15,2) NOT NULL,
    sold_price      DECIMAL(15,2),
    buyer_id        UUID REFERENCES customers(id),
    lot_number      VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);


-- ============================================================================
-- SECTION E: INDEXES
-- ============================================================================

-- Loan Settings
CREATE INDEX IF NOT EXISTS idx_loan_settings_tenant ON tenant_loan_settings(tenant_id) WHERE deleted_at IS NULL;

-- Gold Rates
CREATE INDEX IF NOT EXISTS idx_gold_rates_tenant_karat ON gold_rates(tenant_id, karat, effective_date DESC) WHERE deleted_at IS NULL;

-- Pawn Items
CREATE INDEX IF NOT EXISTS idx_pawn_items_tenant_status ON pawn_items(tenant_id, inventory_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pawn_items_customer ON pawn_items(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pawn_items_serial ON pawn_items(tenant_id, serial_number) WHERE serial_number IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pawn_items_disposition ON pawn_items(tenant_id, disposition) WHERE disposition IS NOT NULL AND deleted_at IS NULL;

-- Appraisal Assessments
CREATE INDEX IF NOT EXISTS idx_assessments_item ON appraisal_assessments(tenant_id, item_id, created_at DESC);

-- Pawn Tickets
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status ON pawn_tickets(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON pawn_tickets(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_overdue ON pawn_tickets(tenant_id, status, next_payment_due_date) WHERE is_overdue = FALSE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_expiry ON pawn_tickets(tenant_id, status, expiry_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_parent ON pawn_tickets(parent_ticket_id) WHERE parent_ticket_id IS NOT NULL;

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_ticket ON transactions(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_date ON transactions(tenant_id, trans_date DESC) WHERE deleted_at IS NULL;

-- Media
CREATE INDEX IF NOT EXISTS idx_media_ref ON media(ref_type, ref_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_tenant ON media(tenant_id) WHERE deleted_at IS NULL;

-- Notices
CREATE INDEX IF NOT EXISTS idx_notices_ticket ON notices_log(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notices_tenant ON notices_log(tenant_id, created_at DESC) WHERE deleted_at IS NULL;

-- Auctions
CREATE INDEX IF NOT EXISTS idx_auctions_tenant ON auctions(tenant_id, auction_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auction_lots_auction ON auction_lots(auction_id) WHERE deleted_at IS NULL;


-- ============================================================================
-- SECTION F: RLS POLICIES
-- ============================================================================

ALTER TABLE tenant_loan_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_rates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE media                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_lots          ENABLE ROW LEVEL SECURITY;

-- All business tables: tenant isolation
CREATE POLICY tenant_isolation ON tenant_loan_settings FOR ALL USING (tenant_id = get_my_tenant_id());
CREATE POLICY tenant_isolation ON gold_rates FOR ALL USING (tenant_id = get_my_tenant_id());
CREATE POLICY tenant_isolation ON pawn_items FOR ALL USING (tenant_id = get_my_tenant_id());
CREATE POLICY tenant_isolation ON appraisal_assessments FOR ALL USING (tenant_id = get_my_tenant_id());
CREATE POLICY tenant_isolation ON pawn_tickets FOR ALL USING (tenant_id = get_my_tenant_id());
CREATE POLICY tenant_isolation ON transactions FOR ALL USING (tenant_id = get_my_tenant_id());
CREATE POLICY tenant_isolation ON media FOR ALL USING (tenant_id = get_my_tenant_id());
CREATE POLICY tenant_isolation ON notices_log FOR ALL USING (tenant_id = get_my_tenant_id());
CREATE POLICY tenant_isolation ON auctions FOR ALL USING (tenant_id = get_my_tenant_id());
CREATE POLICY tenant_isolation ON auction_lots FOR ALL USING (tenant_id = get_my_tenant_id());


-- ============================================================================
-- SECTION G: GRANT STATEMENTS
-- ============================================================================

GRANT SELECT ON tenant_loan_settings  TO authenticated;
GRANT SELECT ON gold_rates            TO authenticated;
GRANT SELECT ON pawn_items            TO authenticated;
GRANT SELECT ON appraisal_assessments TO authenticated;
GRANT SELECT ON pawn_tickets          TO authenticated;
GRANT SELECT ON transactions          TO authenticated;
GRANT SELECT ON media                 TO authenticated;
GRANT SELECT ON notices_log           TO authenticated;
GRANT SELECT ON auctions              TO authenticated;
GRANT SELECT ON auction_lots          TO authenticated;


-- ============================================================================
-- SECTION H: SEED RPCs
-- ============================================================================

-- Seed default loan settings + gold rates for a new tenant
CREATE OR REPLACE FUNCTION seed_tenant_defaults(p_tenant_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_settings_id UUID;
BEGIN
    INSERT INTO tenant_loan_settings (tenant_id)
    VALUES (p_tenant_id)
    ON CONFLICT (tenant_id) DO NOTHING
    RETURNING id INTO v_settings_id;

    INSERT INTO gold_rates (tenant_id, karat, purity_decimal, rate_per_gram)
    VALUES
        (p_tenant_id, 24, 1.000, 4000.00),
        (p_tenant_id, 22, 0.916, 3664.00),
        (p_tenant_id, 21, 0.875, 3500.00),
        (p_tenant_id, 18, 0.750, 3000.00),
        (p_tenant_id, 14, 0.585, 2340.00),
        (p_tenant_id, 10, 0.417, 1668.00)
    ON CONFLICT (tenant_id, karat, effective_date) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'settings_id', v_settings_id, 'gold_rates', 6);
END;
$$;

-- Gold appraisal calculator (pure function, no side effects)
CREATE OR REPLACE FUNCTION calculate_appraisal(
    p_tenant_id      UUID,
    p_weight_grams   DECIMAL,
    p_karat          INTEGER,
    p_item_condition TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_purity DECIMAL(5,3); v_rate DECIMAL(15,2); v_ltv DECIMAL(5,4);
    v_cond DECIMAL(5,2); v_melt DECIMAL(15,2); v_fmv DECIMAL(15,2); v_loan DECIMAL(15,2);
BEGIN
    v_purity := CASE p_karat WHEN 24 THEN 1.000 WHEN 22 THEN 0.916 WHEN 21 THEN 0.875
        WHEN 18 THEN 0.750 WHEN 14 THEN 0.585 WHEN 10 THEN 0.417 ELSE NULL END;
    IF v_purity IS NULL THEN RETURN jsonb_build_object('success', false, 'error', format('Unsupported karat: %s', p_karat)); END IF;

    v_cond := CASE UPPER(p_item_condition) WHEN 'MINT' THEN 1.00 WHEN 'GOOD' THEN 0.95
        WHEN 'FAIR' THEN 0.85 WHEN 'POOR' THEN 0.60 ELSE NULL END;
    IF v_cond IS NULL THEN RETURN jsonb_build_object('success', false, 'error', format('Invalid condition: %s', p_item_condition)); END IF;

    SELECT gr.rate_per_gram INTO v_rate FROM gold_rates gr
    WHERE gr.tenant_id = p_tenant_id AND gr.karat = p_karat AND gr.deleted_at IS NULL
    ORDER BY gr.effective_date DESC LIMIT 1;
    IF v_rate IS NULL THEN RETURN jsonb_build_object('success', false, 'error', format('No gold rate for %sK', p_karat)); END IF;

    SELECT tls.ltv_ratio INTO v_ltv FROM tenant_loan_settings tls
    WHERE tls.tenant_id = p_tenant_id AND tls.deleted_at IS NULL;
    IF v_ltv IS NULL THEN v_ltv := 0.80; END IF;

    v_melt := ROUND(p_weight_grams * v_purity * v_rate, 2);
    v_fmv  := ROUND(v_melt * v_cond, 2);
    v_loan := ROUND(v_fmv * v_ltv, 2);

    RETURN jsonb_build_object(
        'success', true, 'melt_value', v_melt, 'fair_market_value', v_fmv,
        'appraised_value', v_fmv, 'loan_amount', v_loan,
        'gold_rate_used', v_rate, 'purity_decimal_used', v_purity,
        'condition_multiplier', v_cond, 'ltv_ratio_used', v_ltv
    );
END;
$$;
