-- ============================================================================
-- 200_clean_foundation.sql
-- Obsidian PMTP MNG — Clean Foundation (v8)
-- Generated: 2026-04-05
--
-- PURPOSE: Complete database rebuild for deployment.
-- Run this on a FRESH Supabase project (after data wipe).
-- All previous migrations (001–110) are retired and consolidated here.
--
-- EXECUTION ORDER:
--   1. Run SECTION A (ENUMs) — one CREATE TYPE at a time
--   2. Run SECTIONS B–H (Tables) — in order due to FK dependencies
--   3. Run SECTION I (Indexes)
--   4. Run SECTION J (RLS Functions)
--   5. Run SECTION K (RLS Policies)
--   6. Run SECTION L (Grants)
--   7. Run SECTION M (RPCs)
--   8. Run SECTION N (Seed Data)
-- ============================================================================


-- ============================================================================
-- SECTION A: ENUM TYPES
-- Run each CREATE TYPE individually — ALTER TYPE ADD VALUE cannot run in a txn.
-- ============================================================================

CREATE TYPE tenant_status      AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE subscription_cycle AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE payment_status     AS ENUM ('PAID', 'OVERDUE', 'CANCELLED', 'PENDING');
CREATE TYPE user_role          AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'AUDITOR', 'APPRAISER', 'CASHIER');
CREATE TYPE risk_rating        AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE item_category      AS ENUM ('JEWELRY', 'GADGET', 'APPLIANCE', 'VEHICLE');
CREATE TYPE inventory_status   AS ENUM (
    'PENDING_APPRAISAL', 'UNDER_APPRAISAL', 'APPRAISED',
    'IN_VAULT', 'REDEEMED', 'FORFEITED', 'FOR_AUCTION', 'AUCTIONED', 'MELTED'
);
CREATE TYPE disposition_status AS ENUM ('FOR_AUCTION', 'FOR_MELTING', 'SOLD', 'MELTED');
CREATE TYPE ticket_status      AS ENUM ('ACTIVE', 'RENEWED', 'REDEEMED', 'FORFEITED', 'EXPIRED');
CREATE TYPE trans_type         AS ENUM (
    'DISBURSEMENT', 'INTEREST_PAYMENT', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION', 'RENEWAL'
);
CREATE TYPE payment_method     AS ENUM ('CASH', 'E_WALLET', 'BANK_TRANSFER');
CREATE TYPE notice_type        AS ENUM ('DUE_REMINDER', 'OVERDUE', 'FORFEITURE_WARNING', 'FORFEITED');
CREATE TYPE delivery_method    AS ENUM ('SMS', 'EMAIL', 'BOTH');
CREATE TYPE delivery_status    AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE auction_status     AS ENUM ('SCHEDULED', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED');


-- ============================================================================
-- SECTION B: GROUP 1 — SUPER ADMIN (Platform-Level)
-- ============================================================================

CREATE TABLE super_admins (
    id              UUID PRIMARY KEY,
    email           VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE platform_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID REFERENCES super_admins(id),
    action          VARCHAR(100) NOT NULL,
    target_type     VARCHAR(50) NOT NULL,
    target_id       UUID,
    details         JSONB,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE platform_settings (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_name            VARCHAR(255) NOT NULL DEFAULT 'Obsidian',
    platform_logo_url        TEXT,
    support_email            VARCHAR(255),
    max_tenants              INTEGER DEFAULT 1000,
    max_branches_per_tenant  INTEGER DEFAULT 50,
    max_employees_per_tenant INTEGER DEFAULT 200,
    maintenance_mode         BOOLEAN NOT NULL DEFAULT FALSE,
    settings_json            JSONB DEFAULT '{}',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- SECTION C: GROUP 2 — TENANTS / ADMIN
-- ============================================================================

CREATE TABLE tenants (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name           VARCHAR(255) NOT NULL,
    bsp_registration_no     VARCHAR(100) UNIQUE NOT NULL,
    sec_dti_registration_no VARCHAR(100),
    tin_number              VARCHAR(50) NOT NULL,
    contact_email           VARCHAR(255) NOT NULL,
    contact_phone           VARCHAR(20),
    business_type           VARCHAR(50),
    business_address        TEXT,
    status                  tenant_status NOT NULL DEFAULT 'ACTIVE',
    blocked_reason          TEXT,
    logo_url                TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

CREATE TABLE branches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    branch_code         VARCHAR(20) NOT NULL,
    branch_name         VARCHAR(255) NOT NULL,
    address             TEXT NOT NULL,
    province            VARCHAR(100),
    city_municipality   VARCHAR(100) NOT NULL,
    barangay            VARCHAR(100),
    zip_code            VARCHAR(10),
    phone               VARCHAR(20),
    vault_capacity      INTEGER,
    is_main_branch      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    UNIQUE(tenant_id, branch_code)
);

CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    plan_name               VARCHAR(100) NOT NULL,
    billing_cycle           subscription_cycle NOT NULL,
    start_date              TIMESTAMPTZ NOT NULL,
    end_date                TIMESTAMPTZ NOT NULL,
    payment_status          payment_status NOT NULL DEFAULT 'PENDING',
    amount                  DECIMAL(15,2),
    currency                VARCHAR(3) DEFAULT 'PHP',
    paymongo_checkout_id    TEXT UNIQUE,
    paid_at                 TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT subscriptions_paid_at_requires_paid_status
        CHECK (paid_at IS NULL OR payment_status = 'PAID')
);

CREATE TABLE tenant_branding (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    subdomain           VARCHAR(63) UNIQUE,
    tagline             VARCHAR(255),
    is_published        BOOLEAN DEFAULT FALSE,
    brand_color         TEXT,
    font_family         TEXT,
    services_enabled    JSONB DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backup logs (platform-level, references tenants)
CREATE TABLE platform_backup_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL CHECK (type IN ('full', 'tenant')),
    format          TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'csv')),
    tenant_id       UUID REFERENCES tenants(id),
    tenant_name     TEXT,
    generated_by    UUID NOT NULL,
    admin_name      TEXT NOT NULL,
    file_size_bytes BIGINT,
    total_rows      INTEGER DEFAULT 0,
    table_counts    JSONB DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- SECTION D: GROUP 3 — TENANT EMPLOYEES
-- ============================================================================

CREATE TABLE tenant_users (
    id                   UUID PRIMARY KEY,
    tenant_id            UUID REFERENCES tenants(id),
    branch_id            UUID REFERENCES branches(id),
    role                 user_role NOT NULL,
    full_name            VARCHAR(255) NOT NULL,
    email                VARCHAR(255) UNIQUE,
    phone_number         VARCHAR(20),
    date_of_birth        DATE,
    address_line_1       TEXT,
    address_line_2       TEXT,
    province             VARCHAR(100),
    city_municipality    VARCHAR(100),
    barangay             VARCHAR(100),
    zip_code             VARCHAR(10),
    ssn_tax_id           VARCHAR(50),
    avatar_url           TEXT,
    kyc_status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    id_type              VARCHAR(50),
    id_front_url         TEXT,
    id_back_url          TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at        TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ
);

CREATE TABLE tenant_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    user_id         UUID REFERENCES tenant_users(id),
    action          TEXT NOT NULL,
    category        TEXT NOT NULL,
    description     TEXT NOT NULL,
    target_type     TEXT,
    target_id       UUID,
    ip_address      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- SECTION E: GROUP 4 — TENANT CUSTOMERS
-- ============================================================================

CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    auth_id             UUID,
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    date_of_birth       DATE NOT NULL,
    nationality         VARCHAR(50) NOT NULL DEFAULT 'Filipino',
    present_address     TEXT NOT NULL,
    province            VARCHAR(100),
    city_municipality   VARCHAR(100),
    barangay            VARCHAR(100),
    zip_code            VARCHAR(10),
    mobile_number       VARCHAR(20) NOT NULL,
    email               VARCHAR(255),
    risk_rating         risk_rating NOT NULL DEFAULT 'LOW',
    total_loans         INTEGER NOT NULL DEFAULT 0,
    avatar_url          TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE kyc_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES customers(id),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    id_type             VARCHAR(50) NOT NULL,
    id_number           VARCHAR(100) NOT NULL,
    expiry_date         DATE,
    image_front_url     TEXT NOT NULL,
    image_back_url      TEXT,
    specimen_sig_url    TEXT,
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by         UUID REFERENCES tenant_users(id),
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE customer_access_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    full_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    mobile_number   TEXT,
    status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by     UUID REFERENCES tenant_users(id),
    reviewed_at     TIMESTAMPTZ,
    notes           TEXT
);


-- ============================================================================
-- SECTION F: GROUP 5 — BUSINESS CONFIG
-- ============================================================================

CREATE TABLE tenant_loan_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id) UNIQUE,
    interest_rate               DECIMAL(5,2) NOT NULL DEFAULT 3.00,
    penalty_interest_rate       DECIMAL(5,2) NOT NULL DEFAULT 3.00,
    ltv_ratio                   DECIMAL(5,4) NOT NULL DEFAULT 0.7000,
    grace_period_days           INTEGER NOT NULL DEFAULT 90,
    maturity_months             INTEGER NOT NULL DEFAULT 1,
    renewal_cooldown_days       INTEGER NOT NULL DEFAULT 0,
    max_missed_payments         INTEGER NOT NULL DEFAULT 3,
    payment_cycle_days          INTEGER NOT NULL DEFAULT 30,
    service_charge              DECIMAL(15,2) NOT NULL DEFAULT 10.00,
    affidavit_fee               DECIMAL(15,2) NOT NULL DEFAULT 100.00,
    advance_interest_months     INTEGER NOT NULL DEFAULT 1,
    manager_approval_threshold  DECIMAL(15,2) NOT NULL DEFAULT 15000.00,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);

CREATE TABLE gold_rates (
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

CREATE TABLE gold_rate_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    karat           TEXT NOT NULL,
    old_rate        DECIMAL(15,2),
    new_rate        DECIMAL(15,2) NOT NULL,
    changed_by      UUID REFERENCES tenant_users(id),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE silver_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    purity_mark     TEXT NOT NULL,
    purity_pct      DECIMAL(5,2) NOT NULL,
    common_name     TEXT,
    rate_per_gram   DECIMAL(15,2) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE silver_rate_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    purity_mark     TEXT NOT NULL,
    old_rate        DECIMAL(15,2),
    new_rate        DECIMAL(15,2) NOT NULL,
    changed_by      UUID REFERENCES tenant_users(id),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE item_conditions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    condition_name  TEXT NOT NULL,
    description     TEXT,
    multiplier_pct  DECIMAL(5,2) NOT NULL DEFAULT 100,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0
);


-- ============================================================================
-- SECTION G: GROUP 6 — PAWN OPERATIONS
-- ============================================================================

CREATE TABLE pawn_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    customer_id             UUID NOT NULL REFERENCES customers(id),
    branch_id               UUID NOT NULL REFERENCES branches(id),
    category                item_category NOT NULL,
    general_desc            TEXT NOT NULL,
    item_condition          TEXT,
    condition_notes         TEXT,
    specific_attrs          JSONB DEFAULT '{}',
    brand                   TEXT,
    model                   TEXT,
    serial_number           TEXT,
    metal_type              TEXT CHECK (metal_type IN ('GOLD','SILVER')),
    weight_grams            NUMERIC(10,4),
    karat                   INTEGER,
    gadget_color            TEXT,
    storage_capacity        TEXT,
    appliance_brand         TEXT,
    appliance_model         TEXT,
    appliance_serial        TEXT,
    size_capacity           TEXT,
    wattage                 TEXT,
    appliance_color         TEXT,
    vehicle_make            TEXT,
    vehicle_model           TEXT,
    vehicle_year            INTEGER,
    vehicle_color           TEXT,
    plate_number            TEXT,
    engine_number           TEXT,
    chassis_number          TEXT,
    mileage                 INTEGER,
    transmission            TEXT CHECK (transmission IN ('AUTOMATIC','MANUAL','CVT')),
    fuel_type               TEXT CHECK (fuel_type IN ('GASOLINE','DIESEL','ELECTRIC','HYBRID')),
    accessories             TEXT[],
    appraised_value         DECIMAL(15,2),
    fair_market_value       DECIMAL(12,2),
    offered_amount          DECIMAL(12,2),
    storage_location        TEXT,
    inventory_status        inventory_status NOT NULL DEFAULT 'PENDING_APPRAISAL',
    disposition             disposition_status,
    disposition_approved_by UUID REFERENCES tenant_users(id),
    disposition_approved_at TIMESTAMPTZ,
    auction_base_price      DECIMAL(15,2),
    melting_value           DECIMAL(15,2),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

CREATE TABLE appraisal_assessments (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 UUID NOT NULL REFERENCES tenants(id),
    item_id                   UUID NOT NULL REFERENCES pawn_items(id),
    assessed_by               UUID NOT NULL REFERENCES tenant_users(id),
    category                  TEXT NOT NULL,
    weight_grams              NUMERIC(10,4),
    karat                     INTEGER,
    item_condition            TEXT,
    gold_rate_used            NUMERIC(12,2),
    purity_decimal_used       NUMERIC(6,4),
    condition_multiplier      NUMERIC(4,2),
    ltv_ratio_used            NUMERIC(5,4),
    melt_value                NUMERIC(12,2),
    fair_market_value         NUMERIC(12,2) NOT NULL,
    appraised_value           NUMERIC(12,2) NOT NULL,
    offered_amount            NUMERIC(12,2),
    notes                     TEXT,
    outcome                   TEXT CHECK (outcome IN ('PENDING','APPROVED','REJECTED','DECLINED'))
                              DEFAULT 'PENDING',
    requires_manager_approval BOOLEAN NOT NULL DEFAULT FALSE,
    manager_approved_by       UUID REFERENCES tenant_users(id),
    manager_approved_at       TIMESTAMPTZ,
    manager_notes             TEXT,
    created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pawn_tickets (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id),
    ticket_number               VARCHAR(50) UNIQUE NOT NULL,
    customer_id                 UUID NOT NULL REFERENCES customers(id),
    item_id                     UUID NOT NULL REFERENCES pawn_items(id),
    appraiser_id                UUID NOT NULL REFERENCES tenant_users(id),
    issued_by                   UUID REFERENCES tenant_users(id),
    principal_loan              DECIMAL(15,2) NOT NULL,
    interest_rate               DECIMAL(5,2) NOT NULL,
    advance_interest            DECIMAL(15,2) NOT NULL DEFAULT 0,
    service_charge              DECIMAL(15,2) NOT NULL DEFAULT 0,
    net_proceeds                DECIMAL(15,2),
    loan_date                   TIMESTAMPTZ NOT NULL,
    maturity_date               TIMESTAMPTZ NOT NULL,
    status                      ticket_status NOT NULL DEFAULT 'ACTIVE',
    parent_ticket_id            UUID REFERENCES pawn_tickets(id),
    renewal_count               INTEGER NOT NULL DEFAULT 0,
    original_interest_rate      DECIMAL(5,2),
    penalty_rate                DECIMAL(5,2),
    is_overdue                  BOOLEAN NOT NULL DEFAULT FALSE,
    consecutive_missed_payments INTEGER NOT NULL DEFAULT 0,
    last_payment_date           TIMESTAMPTZ,
    next_payment_due_date       TIMESTAMPTZ,
    expiry_date                 TIMESTAMPTZ,
    grace_period_days           INTEGER,
    forfeited_at                TIMESTAMPTZ,
    forfeiture_reason           TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);

CREATE TABLE transactions (
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
    reference_number    VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

-- Customer payment intents (PayMongo online payments from mobile app)
CREATE TABLE customer_payment_intents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    customer_id             UUID NOT NULL REFERENCES customers(id),
    ticket_id               UUID NOT NULL REFERENCES pawn_tickets(id),
    paymongo_checkout_id    TEXT NOT NULL,
    amount                  DECIMAL(15,2) NOT NULL,
    payment_type            TEXT NOT NULL CHECK (payment_type IN (
                                'INTEREST_ONLY', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION'
                            )),
    payment_method          TEXT,
    status                  TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
                                'PENDING', 'PAID', 'FAILED', 'EXPIRED'
                            )),
    paid_at                 TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- SECTION H: GROUP 7 — SUPPORTING TABLES
-- ============================================================================

CREATE TABLE media (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    ref_type    VARCHAR(50) NOT NULL,
    ref_id      UUID NOT NULL,
    image_url   TEXT NOT NULL,
    label       VARCHAR(50),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE notices_log (
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

CREATE TABLE auctions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    branch_id        UUID REFERENCES branches(id),
    auction_date     TIMESTAMPTZ NOT NULL,
    publication_date TIMESTAMPTZ NOT NULL,
    venue            TEXT NOT NULL,
    status           auction_status NOT NULL DEFAULT 'SCHEDULED',
    approved_by      UUID REFERENCES tenant_users(id),
    total_lots       INTEGER NOT NULL DEFAULT 0,
    total_sold       DECIMAL(15,2),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE TABLE auction_lots (
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
-- SECTION I: INDEXES
-- ============================================================================

-- Super Admin
CREATE INDEX idx_audit_logs_admin           ON platform_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_logs_target          ON platform_audit_logs(target_type, target_id, created_at DESC);

-- Tenants
CREATE INDEX idx_tenants_status             ON tenants(status) WHERE deleted_at IS NULL;

-- Branches
CREATE INDEX idx_branches_tenant            ON branches(tenant_id) WHERE deleted_at IS NULL;

-- Subscriptions
CREATE INDEX idx_subscriptions_tenant_status  ON subscriptions(tenant_id, payment_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_subscriptions_paymongo       ON subscriptions(paymongo_checkout_id) WHERE paymongo_checkout_id IS NOT NULL;
CREATE INDEX idx_subscriptions_tenant_created ON subscriptions(tenant_id, created_at DESC) WHERE deleted_at IS NULL;

-- Employees
CREATE INDEX idx_tenant_users_tenant_active   ON tenant_users(tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenant_users_email            ON tenant_users(email) WHERE email IS NOT NULL;

-- Tenant Audit Logs
CREATE INDEX idx_tenant_audit_tenant_date     ON tenant_audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_tenant_audit_user            ON tenant_audit_logs(user_id, created_at DESC);
CREATE INDEX idx_tenant_audit_category        ON tenant_audit_logs(tenant_id, category, created_at DESC);

-- Customers
CREATE INDEX idx_customers_tenant_name        ON customers(tenant_id, last_name, first_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_tenant_mobile      ON customers(tenant_id, mobile_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_auth_id            ON customers(auth_id) WHERE auth_id IS NOT NULL;

-- KYC
CREATE INDEX idx_kyc_customer                 ON kyc_documents(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_kyc_tenant                   ON kyc_documents(tenant_id) WHERE deleted_at IS NULL;

-- Customer Payment Intents
CREATE INDEX idx_payment_intents_customer     ON customer_payment_intents(customer_id, created_at DESC);
CREATE INDEX idx_payment_intents_ticket       ON customer_payment_intents(ticket_id);
CREATE INDEX idx_payment_intents_status       ON customer_payment_intents(status) WHERE status = 'PENDING';

-- Tenant Branding
CREATE INDEX idx_tenant_branding_subdomain    ON tenant_branding(subdomain) WHERE subdomain IS NOT NULL;

-- Customer Access Requests
CREATE INDEX idx_car_tenant_status            ON customer_access_requests(tenant_id, status);

-- Loan Settings & Gold Rates
CREATE INDEX idx_loan_settings_tenant         ON tenant_loan_settings(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_gold_rates_tenant_karat      ON gold_rates(tenant_id, karat, effective_date DESC) WHERE deleted_at IS NULL;

-- Silver Rates
CREATE INDEX idx_silver_rates_tenant          ON silver_rates(tenant_id) WHERE deleted_at IS NULL;

-- Gold/Silver Rate History
CREATE INDEX idx_gold_rate_history_tenant     ON gold_rate_history(tenant_id, changed_at DESC);
CREATE INDEX idx_silver_rate_history_tenant   ON silver_rate_history(tenant_id, changed_at DESC);

-- Item Conditions
CREATE INDEX idx_item_conditions_tenant       ON item_conditions(tenant_id, sort_order);

-- Pawn Items
CREATE INDEX idx_pawn_items_tenant_status     ON pawn_items(tenant_id, inventory_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_pawn_items_customer          ON pawn_items(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pawn_items_serial            ON pawn_items(tenant_id, serial_number) WHERE serial_number IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_pawn_items_disposition       ON pawn_items(tenant_id, disposition) WHERE disposition IS NOT NULL AND deleted_at IS NULL;

-- Appraisal Assessments
CREATE INDEX idx_assessments_item             ON appraisal_assessments(tenant_id, item_id, created_at DESC);
CREATE INDEX idx_assessments_pending_approval ON appraisal_assessments(tenant_id, requires_manager_approval)
    WHERE requires_manager_approval = TRUE AND manager_approved_by IS NULL;

-- Pawn Tickets
CREATE INDEX idx_tickets_tenant_status        ON pawn_tickets(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_customer             ON pawn_tickets(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_overdue              ON pawn_tickets(tenant_id, status, next_payment_due_date) WHERE is_overdue = FALSE AND deleted_at IS NULL;
CREATE INDEX idx_tickets_expiry               ON pawn_tickets(tenant_id, status, expiry_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_parent               ON pawn_tickets(parent_ticket_id) WHERE parent_ticket_id IS NOT NULL;

-- Transactions
CREATE INDEX idx_transactions_ticket          ON transactions(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_tenant_date     ON transactions(tenant_id, trans_date DESC) WHERE deleted_at IS NULL;

-- Media
CREATE INDEX idx_media_ref                    ON media(ref_type, ref_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_tenant                 ON media(tenant_id) WHERE deleted_at IS NULL;

-- Notices
CREATE INDEX idx_notices_ticket               ON notices_log(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notices_tenant               ON notices_log(tenant_id, created_at DESC) WHERE deleted_at IS NULL;

-- Auctions
CREATE INDEX idx_auctions_tenant              ON auctions(tenant_id, auction_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_auction_lots_auction         ON auction_lots(auction_id) WHERE deleted_at IS NULL;

-- Platform Backup Logs
CREATE INDEX idx_backup_logs_created          ON platform_backup_logs(created_at DESC);
CREATE INDEX idx_backup_logs_tenant           ON platform_backup_logs(tenant_id) WHERE tenant_id IS NOT NULL;


-- ============================================================================
-- SECTION J: RLS HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM tenant_users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role::text FROM tenant_users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM super_admins WHERE id = auth.uid() AND is_active = TRUE);
$$;


-- ============================================================================
-- SECTION K: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on ALL tables
ALTER TABLE super_admins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_backup_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_branding           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_access_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payment_intents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_loan_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_rates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_rate_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE silver_rates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE silver_rate_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_conditions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_items                ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pawn_tickets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE media                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_lots              ENABLE ROW LEVEL SECURITY;

-- K1: super_admins
CREATE POLICY super_admins_self_read ON super_admins
    FOR SELECT USING (id = auth.uid());

-- K2: platform_audit_logs
CREATE POLICY audit_logs_admin_read ON platform_audit_logs
    FOR SELECT USING (is_super_admin());

-- K3: platform_settings
CREATE POLICY platform_settings_read ON platform_settings
    FOR SELECT USING (is_super_admin());
CREATE POLICY platform_settings_manage ON platform_settings
    FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- K4: platform_backup_logs
CREATE POLICY backup_logs_admin_read ON platform_backup_logs
    FOR SELECT USING (is_super_admin());
CREATE POLICY backup_logs_admin_insert ON platform_backup_logs
    FOR INSERT WITH CHECK (is_super_admin());

-- K5: tenants
CREATE POLICY tenants_tenant_read ON tenants
    FOR SELECT USING (id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY tenants_super_admin_manage ON tenants
    FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- K6: branches
CREATE POLICY branches_tenant_isolation ON branches
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY branches_owner_manage ON branches
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (get_my_role() = 'OWNER');

-- K7: subscriptions
CREATE POLICY subscriptions_tenant_select ON subscriptions
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY subscriptions_owner_insert ON subscriptions
    FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'OWNER');
CREATE POLICY subscriptions_owner_update ON subscriptions
    FOR UPDATE
    USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'OWNER')
    WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'OWNER');

-- K8: tenant_branding
CREATE POLICY tenant_branding_select ON tenant_branding
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY tenant_branding_insert ON tenant_branding
    FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('OWNER', 'MANAGER'));
CREATE POLICY tenant_branding_update ON tenant_branding
    FOR UPDATE USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('OWNER', 'MANAGER'));

-- K9: tenant_users
CREATE POLICY tenant_users_select ON tenant_users
    FOR SELECT USING (id = auth.uid() OR tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY tenant_users_owner_manage ON tenant_users
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (get_my_role() = 'OWNER');

-- K10: tenant_audit_logs
CREATE POLICY tenant_audit_tenant_read ON tenant_audit_logs
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());

-- K11: customers
CREATE POLICY customers_tenant_isolation ON customers
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY customers_tenant_manage ON customers
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K12: kyc_documents
CREATE POLICY kyc_tenant_isolation ON kyc_documents
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY kyc_tenant_manage ON kyc_documents
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K13: customer_access_requests
CREATE POLICY car_tenant_isolation ON customer_access_requests
    FOR ALL USING (tenant_id = get_my_tenant_id());

-- K14: customer_payment_intents
CREATE POLICY payment_intents_tenant_read ON customer_payment_intents
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY payment_intents_tenant_manage ON customer_payment_intents
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K15: tenant_loan_settings
CREATE POLICY loan_settings_tenant_read ON tenant_loan_settings
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY loan_settings_tenant_manage ON tenant_loan_settings
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K16: gold_rates
CREATE POLICY gold_rates_tenant_read ON gold_rates
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY gold_rates_tenant_manage ON gold_rates
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K17: gold_rate_history
CREATE POLICY gold_rate_history_tenant_read ON gold_rate_history
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());

-- K18: silver_rates
CREATE POLICY silver_rates_tenant_read ON silver_rates
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY silver_rates_tenant_manage ON silver_rates
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K19: silver_rate_history
CREATE POLICY silver_rate_history_tenant_read ON silver_rate_history
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());

-- K20: item_conditions
CREATE POLICY item_conditions_tenant_read ON item_conditions
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY item_conditions_tenant_manage ON item_conditions
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K21: pawn_items
CREATE POLICY pawn_items_tenant_read ON pawn_items
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY pawn_items_tenant_manage ON pawn_items
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K22: appraisal_assessments
CREATE POLICY assessments_tenant_read ON appraisal_assessments
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY assessments_tenant_manage ON appraisal_assessments
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K23: pawn_tickets
CREATE POLICY tickets_tenant_read ON pawn_tickets
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY tickets_tenant_manage ON pawn_tickets
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K24: transactions
CREATE POLICY transactions_tenant_read ON transactions
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY transactions_tenant_manage ON transactions
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K25: media
CREATE POLICY media_tenant_read ON media
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY media_tenant_manage ON media
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K26: notices_log
CREATE POLICY notices_tenant_read ON notices_log
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY notices_tenant_manage ON notices_log
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K27: auctions
CREATE POLICY auctions_tenant_read ON auctions
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY auctions_tenant_manage ON auctions
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- K28: auction_lots
CREATE POLICY auction_lots_tenant_read ON auction_lots
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY auction_lots_tenant_manage ON auction_lots
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());


-- ============================================================================
-- SECTION L: GRANT STATEMENTS
-- ============================================================================

-- Platform-level
GRANT SELECT ON super_admins              TO authenticated;
GRANT SELECT ON super_admins              TO anon;
GRANT SELECT ON platform_audit_logs       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON platform_settings TO authenticated;
GRANT SELECT, INSERT ON platform_backup_logs TO authenticated;

-- Tenant admin
GRANT SELECT ON tenants                   TO authenticated;
GRANT SELECT ON branches                  TO authenticated;
GRANT SELECT ON subscriptions             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON tenant_branding TO authenticated;

-- Employees
GRANT SELECT ON tenant_users              TO authenticated;
GRANT SELECT, INSERT ON tenant_audit_logs TO authenticated;

-- Customers
GRANT SELECT ON customers                 TO authenticated;
GRANT SELECT ON kyc_documents             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON customer_access_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON customer_payment_intents TO authenticated;

-- Business config
GRANT SELECT ON tenant_loan_settings      TO authenticated;
GRANT SELECT ON gold_rates                TO authenticated;
GRANT SELECT ON gold_rate_history         TO authenticated;
GRANT SELECT ON silver_rates              TO authenticated;
GRANT SELECT ON silver_rate_history       TO authenticated;
GRANT SELECT ON item_conditions           TO authenticated;

-- Pawn operations
GRANT SELECT ON pawn_items                TO authenticated;
GRANT SELECT ON appraisal_assessments     TO authenticated;
GRANT SELECT ON pawn_tickets              TO authenticated;
GRANT SELECT ON transactions              TO authenticated;

-- Supporting
GRANT SELECT ON media                     TO authenticated;
GRANT SELECT ON notices_log               TO authenticated;
GRANT SELECT ON auctions                  TO authenticated;
GRANT SELECT ON auction_lots              TO authenticated;


-- ============================================================================
-- SECTION M: SEED RPCs (Stored Procedures)
-- ============================================================================

-- M1: Seed super admin
CREATE OR REPLACE FUNCTION seed_super_admin(
    p_user_id   UUID,
    p_email     TEXT,
    p_full_name TEXT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO super_admins (id, email, full_name, is_active)
    VALUES (p_user_id, p_email, p_full_name, TRUE)
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- M2: Register tenant owner
CREATE OR REPLACE FUNCTION register_owner(
    p_email               TEXT,
    p_full_name           TEXT,
    p_business_name       TEXT,
    p_bsp_registration_no TEXT,
    p_tin_number          TEXT,
    p_contact_email       TEXT,
    p_branch_name         TEXT,
    p_branch_address      TEXT,
    p_branch_city         TEXT,
    p_user_id             UUID
) RETURNS JSONB AS $$
DECLARE
    v_tenant_id UUID;
    v_branch_id UUID;
BEGIN
    INSERT INTO tenants (business_name, bsp_registration_no, tin_number, contact_email, status)
    VALUES (p_business_name, p_bsp_registration_no, p_tin_number, p_contact_email, 'ACTIVE')
    RETURNING id INTO v_tenant_id;

    INSERT INTO branches (tenant_id, branch_code, branch_name, address, city_municipality, is_main_branch)
    VALUES (v_tenant_id, 'MAIN', p_branch_name, p_branch_address, p_branch_city, TRUE)
    RETURNING id INTO v_branch_id;

    INSERT INTO tenant_users (id, tenant_id, branch_id, role, full_name, email)
    VALUES (p_user_id, v_tenant_id, v_branch_id, 'OWNER', p_full_name, p_email);

    INSERT INTO tenant_loan_settings (tenant_id) VALUES (v_tenant_id);

    RETURN jsonb_build_object(
        'success',   true,
        'tenant_id', v_tenant_id,
        'branch_id', v_branch_id,
        'user_id',   p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- M3: Complete owner KYC
CREATE OR REPLACE FUNCTION complete_owner_kyc(
    p_user_id                 UUID,
    p_business_name           TEXT,
    p_business_type           TEXT,
    p_bsp_registration_no     TEXT,
    p_sec_dti_registration_no TEXT,
    p_tin_number              TEXT,
    p_branch_name             TEXT,
    p_street_address          TEXT,
    p_province                TEXT,
    p_city_municipality       TEXT,
    p_barangay                TEXT,
    p_zip_code                TEXT,
    p_branch_phone            TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_tenant_id UUID;
    v_branch_id UUID;
    v_email     TEXT;
BEGIN
    SELECT email INTO v_email FROM tenant_users WHERE id = p_user_id;

    INSERT INTO tenants (
        business_name, business_type, bsp_registration_no,
        sec_dti_registration_no, tin_number, contact_email, status
    ) VALUES (
        p_business_name, p_business_type, p_bsp_registration_no,
        p_sec_dti_registration_no, p_tin_number, v_email, 'ACTIVE'
    ) RETURNING id INTO v_tenant_id;

    INSERT INTO branches (
        tenant_id, branch_code, branch_name, address,
        province, city_municipality, barangay, zip_code,
        phone, is_main_branch
    ) VALUES (
        v_tenant_id, 'MAIN', p_branch_name, p_street_address,
        p_province, p_city_municipality, p_barangay, p_zip_code,
        p_branch_phone, TRUE
    ) RETURNING id INTO v_branch_id;

    UPDATE tenant_users
    SET tenant_id  = v_tenant_id,
        branch_id  = v_branch_id,
        kyc_status = 'SUBMITTED',
        updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO tenant_loan_settings (tenant_id) VALUES (v_tenant_id);

    RETURN jsonb_build_object(
        'success',   true,
        'tenant_id', v_tenant_id,
        'branch_id', v_branch_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

