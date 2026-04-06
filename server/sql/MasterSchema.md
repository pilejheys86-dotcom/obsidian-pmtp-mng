-- ============================================================================
-- OBSIDIAN PMTP MNG — Master Schema (v8)
-- Updated: 2026-04-05
--
-- SINGLE SOURCE OF TRUTH
-- Every database change MUST be reflected here first.
-- Workflow: Update this file → Create migration SQL → Run in Supabase
--
-- Table Groups:
--   Group 1: Super Admin (platform-level, no tenant_id)
--   Group 2: Tenants / Admin (multi-tenant root + billing)
--   Group 3: Tenant Employees (staff/roles + audit)
--   Group 4: Tenant Customers (customer data + KYC + online payments)
--   Group 5: Business Config (loan settings, gold/silver rates, conditions)
--   Group 6: Pawn Operations (items, assessments, tickets, transactions)
--   Group 7: Supporting (media, notices, auctions)
--
-- Conventions:
--   - All tables use TIMESTAMPTZ (not TIMESTAMP)
--   - All tables have created_at, updated_at, deleted_at (soft delete)
--     unless noted otherwise (immutable logs skip updated_at/deleted_at)
--   - All tenant-scoped tables have tenant_id FK
--   - UUIDs via gen_random_uuid()
--   - RLS on every table
--
-- Business Process Summary:
--   1. Customer KYC → 2. Item Intake → 3. Appraisal → 4. Manager Approval
--   (if > threshold) → 5. Customer Accepts → 6. Advance Interest Selection
--   → 7. Pawn Ticket Issued → 8. Disbursement → 9. Monthly Payments
--   (interest-only / partial principal / full redemption / renewal)
--   → 10. Overdue → Forfeiture → Disposition → Auction
-- ============================================================================


-- ============================================================================
-- SECTION A: ENUM TYPES
-- NOTE: Run each CREATE TYPE individually in Supabase SQL Editor.
--       ALTER TYPE ADD VALUE cannot run inside a transaction.
-- ============================================================================

-- A1: Foundation ENUMs
CREATE TYPE tenant_status      AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE subscription_cycle AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE payment_status     AS ENUM ('PAID', 'OVERDUE', 'CANCELLED', 'PENDING');
CREATE TYPE user_role          AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'AUDITOR', 'APPRAISER', 'CASHIER');
CREATE TYPE risk_rating        AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- A2: Business-Logic ENUMs
CREATE TYPE item_category      AS ENUM ('JEWELRY', 'GADGET', 'APPLIANCE', 'VEHICLE');
CREATE TYPE inventory_status   AS ENUM (
    'PENDING_APPRAISAL',    -- Item submitted, awaiting appraiser
    'UNDER_APPRAISAL',      -- Appraiser is evaluating
    'APPRAISED',            -- Appraisal done, awaiting customer decision
    'IN_VAULT',             -- Customer accepted, ticket issued, item stored
    'REDEEMED',             -- Customer paid in full, item returned
    'FORFEITED',            -- Loan expired, item seized
    'FOR_AUCTION',          -- Approved for public auction
    'AUCTIONED',            -- Sold at auction
    'MELTED'                -- Jewelry melted for scrap value
);
CREATE TYPE disposition_status AS ENUM ('FOR_AUCTION', 'FOR_MELTING', 'SOLD', 'MELTED');
CREATE TYPE ticket_status      AS ENUM (
    'ACTIVE',               -- Loan is current
    'RENEWED',              -- Replaced by a new ticket (partial pay / renewal)
    'REDEEMED',             -- Fully paid, item returned
    'FORFEITED',            -- Grace period expired, item seized
    'EXPIRED'               -- Maturity passed, not yet forfeited (in grace period)
);
CREATE TYPE trans_type         AS ENUM (
    'DISBURSEMENT',         -- Initial loan payout to customer
    'INTEREST_PAYMENT',     -- Monthly interest-only payment
    'PARTIAL_REDEMPTION',   -- Partial principal + interest payment (new ticket issued)
    'FULL_REDEMPTION',      -- Full payoff, item returned
    'RENEWAL'               -- At maturity: pay interest, reset term, same principal
);
CREATE TYPE payment_method     AS ENUM ('CASH', 'E_WALLET', 'BANK_TRANSFER');
CREATE TYPE notice_type        AS ENUM ('DUE_REMINDER', 'OVERDUE', 'FORFEITURE_WARNING', 'FORFEITED');
CREATE TYPE delivery_method    AS ENUM ('SMS', 'EMAIL', 'BOTH');
CREATE TYPE delivery_status    AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE auction_status     AS ENUM ('SCHEDULED', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED');


-- ============================================================================
-- SECTION B: GROUP 1 — SUPER ADMIN (Platform-Level)
-- These tables have NO tenant_id. They govern the entire platform.
-- ============================================================================

-- B1: Super Admins
-- Platform operators who manage all tenants. References auth.users(id).
CREATE TABLE super_admins (
    id              UUID PRIMARY KEY,                   -- = auth.users(id)
    email           VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- No deleted_at: super admins are deactivated, never soft-deleted
);

-- B2: Platform Audit Logs
-- Immutable log of every super admin action.
CREATE TABLE platform_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID REFERENCES super_admins(id),   -- Nullable for system-generated events
    action          VARCHAR(100) NOT NULL,               -- e.g. TENANT_BLOCKED, TENANT_REACTIVATED
    target_type     VARCHAR(50) NOT NULL,                -- e.g. TENANT, SUBSCRIPTION, SUPER_ADMIN
    target_id       UUID,                                -- ID of affected entity
    details         JSONB,                               -- Additional context / before-after snapshots
    ip_address      VARCHAR(45),                         -- IPv4 or IPv6
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Immutable: no updated_at, no deleted_at
);

-- B3: Platform Settings
-- Global platform configuration (branding, limits, feature flags).
-- Single-row table (one row for the entire platform).
CREATE TABLE platform_settings (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_name            VARCHAR(255) NOT NULL DEFAULT 'Obsidian',
    platform_logo_url        TEXT,
    support_email            VARCHAR(255),
    max_tenants              INTEGER DEFAULT 1000,
    max_branches_per_tenant  INTEGER DEFAULT 50,
    max_employees_per_tenant INTEGER DEFAULT 200,
    maintenance_mode         BOOLEAN NOT NULL DEFAULT FALSE,
    settings_json            JSONB DEFAULT '{}',          -- Extensible key-value config
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B4: Platform Backup Logs
-- Audit trail for database backup/export operations.
CREATE TABLE platform_backup_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL CHECK (type IN ('full', 'tenant')),
    format          TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'csv')),
    tenant_id       UUID REFERENCES tenants(id),          -- NULL for full backups
    tenant_name     TEXT,                                  -- Denormalized for log readability
    generated_by    UUID NOT NULL,                         -- super_admin or tenant_user who triggered
    admin_name      TEXT NOT NULL,                         -- Denormalized
    file_size_bytes BIGINT,
    total_rows      INTEGER DEFAULT 0,
    table_counts    JSONB DEFAULT '{}',                    -- { "customers": 50, "pawn_tickets": 120 }
    status          TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
    -- Immutable: no updated_at, no deleted_at
);


-- ============================================================================
-- SECTION C: GROUP 2 — TENANTS / ADMIN (Multi-Tenant Root)
-- ============================================================================

-- C1: Tenants
-- Each tenant is a pawnshop business. Root of all tenant-scoped data.
CREATE TABLE tenants (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name           VARCHAR(255) NOT NULL,
    bsp_registration_no     VARCHAR(100) UNIQUE NOT NULL, -- BSP (Bangko Sentral ng Pilipinas) reg
    sec_dti_registration_no VARCHAR(100),
    tin_number              VARCHAR(50) NOT NULL,          -- Tax Identification Number
    contact_email           VARCHAR(255) NOT NULL,
    contact_phone           VARCHAR(20),
    business_type           VARCHAR(50),
    business_address        TEXT,
    status                  tenant_status NOT NULL DEFAULT 'ACTIVE',
    blocked_reason          TEXT,                          -- Populated when status = SUSPENDED
    logo_url                TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

-- C2: Branches
-- Physical pawnshop locations belonging to a tenant.
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

-- C3: Subscriptions
-- SaaS billing records per tenant.
CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    plan_name               VARCHAR(100) NOT NULL,         -- e.g. 'Starter', 'Professional', 'Enterprise'
    billing_cycle           subscription_cycle NOT NULL,
    start_date              TIMESTAMPTZ NOT NULL,
    end_date                TIMESTAMPTZ NOT NULL,
    payment_status          payment_status NOT NULL DEFAULT 'PENDING',
    amount                  DECIMAL(15,2),
    currency                VARCHAR(3) DEFAULT 'PHP',
    -- PayMongo integration
    paymongo_checkout_id    TEXT UNIQUE,                    -- Checkout session ID for webhook correlation
    paid_at                 TIMESTAMPTZ,                   -- Webhook-confirmed payment timestamp
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    -- Integrity: paid_at only when PAID
    CONSTRAINT subscriptions_paid_at_requires_paid_status
        CHECK (paid_at IS NULL OR payment_status = 'PAID')
);

-- C4: Tenant Branding
-- Subdomain showcase configuration + visual branding for public pages.
CREATE TABLE tenant_branding (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    subdomain           VARCHAR(63) UNIQUE,
    tagline             VARCHAR(255),
    is_published        BOOLEAN DEFAULT FALSE,
    brand_color         TEXT,                                  -- Primary brand color hex
    font_family         TEXT,                                  -- Custom font family name
    services_enabled    JSONB DEFAULT '[]'::jsonb,             -- Array of enabled service slugs
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- SECTION D: GROUP 3 — TENANT EMPLOYEES
-- ============================================================================

-- D1: Tenant Users (Employees)
-- Staff members of a tenant. id = auth.users(id) from Supabase Auth.
CREATE TABLE tenant_users (
    id                  UUID PRIMARY KEY,                   -- = auth.users(id)
    tenant_id           UUID REFERENCES tenants(id),
    branch_id           UUID REFERENCES branches(id),       -- Nullable; assigned later
    role                user_role NOT NULL,
    full_name           VARCHAR(255) NOT NULL,
    -- Contact
    email               VARCHAR(255) UNIQUE,                -- Login email (personal gmail, yahoo, etc.)
    phone_number        VARCHAR(20),
    -- Personal
    date_of_birth       DATE,
    -- Address (Philippine format)
    address_line_1      TEXT,
    address_line_2      TEXT,
    province            VARCHAR(100),
    city_municipality   VARCHAR(100),
    barangay            VARCHAR(100),
    zip_code            VARCHAR(10),
    -- Compliance / Identity
    ssn_tax_id          VARCHAR(50),                        -- SSN or TIN
    -- Profile
    avatar_url          TEXT,
    kyc_status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- KYC ID verification
    id_type             VARCHAR(50),                        -- e.g. PHILSYS, DRIVERS_LICENSE, SSS
    id_front_url        TEXT,                               -- ImageKit URL for front of ID
    id_back_url         TEXT,                               -- ImageKit URL for back of ID (optional)
    -- Security
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,    -- Force password reset on first login
    -- Status
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

-- D2: Tenant Audit Logs
-- Immutable log of tenant-level staff actions (separate from platform audit).
CREATE TABLE tenant_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    user_id         UUID REFERENCES tenant_users(id),       -- Who performed the action
    action          TEXT NOT NULL,                           -- e.g. TICKET_ISSUED, PAYMENT_PROCESSED
    category        TEXT NOT NULL,                           -- e.g. LOAN, CUSTOMER, INVENTORY, SETTINGS
    description     TEXT NOT NULL,                           -- Human-readable summary
    target_type     TEXT,                                    -- e.g. PAWN_TICKET, CUSTOMER, PAWN_ITEM
    target_id       UUID,                                    -- ID of affected entity
    ip_address      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Immutable: no updated_at, no deleted_at
);


-- ============================================================================
-- SECTION E: GROUP 4 — TENANT CUSTOMERS
-- ============================================================================

-- E1: Customers
-- Pawn customers belonging to a tenant.
-- auth_id is populated when the owner creates a customer with an email.
-- The customer receives an OTP email, verifies via POST /api/auth/verify-registration-otp,
-- then sets their password via POST /api/auth/set-password to access the mobile app.
CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    auth_id             UUID,                               -- Link to auth.users for customer portal
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
    total_loans         INTEGER NOT NULL DEFAULT 0,         -- Denormalized counter
    avatar_url          TEXT,                                -- Profile photo
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

-- E2: KYC Documents
-- Identity verification documents for customers.
-- KYC is REQUIRED before any pawn transaction can proceed.
CREATE TABLE kyc_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES customers(id),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    id_type             VARCHAR(50) NOT NULL,               -- e.g. 'Philippine ID', 'Passport', 'Driver License'
    id_number           VARCHAR(100) NOT NULL,
    expiry_date         DATE,
    image_front_url     TEXT NOT NULL,
    image_back_url      TEXT,
    specimen_sig_url    TEXT,                                -- Signature specimen
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by         UUID REFERENCES tenant_users(id),
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

-- E3: Customer Access Requests
-- Public access requests submitted from tenant showcase page.
-- Prospective customers request access; tenant staff review and approve/reject.
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

-- E4: Customer Payment Intents
-- PayMongo checkout sessions for customer self-service payments (mobile app).
-- Tracks online payment lifecycle: created → paid/failed/expired.
CREATE TABLE customer_payment_intents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    customer_id             UUID NOT NULL REFERENCES customers(id),
    ticket_id               UUID NOT NULL REFERENCES pawn_tickets(id),
    paymongo_checkout_id    TEXT NOT NULL,                   -- PayMongo checkout session ID
    amount                  DECIMAL(15,2) NOT NULL,
    payment_type            TEXT NOT NULL CHECK (payment_type IN (
                                'INTEREST_ONLY', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION'
                            )),
    payment_method          TEXT,                            -- Populated after payment (gcash, card, etc.)
    status                  TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
                                'PENDING', 'PAID', 'FAILED', 'EXPIRED'
                            )),
    paid_at                 TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- SECTION F: GROUP 5 — BUSINESS CONFIG
-- ============================================================================

-- F1: Tenant Loan Settings
-- Per-tenant configuration for loan terms, fees, and approval thresholds.
CREATE TABLE tenant_loan_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id) UNIQUE,
    -- Interest & Penalties
    interest_rate               DECIMAL(5,2) NOT NULL DEFAULT 3.00,    -- Monthly interest rate (%)
    penalty_interest_rate       DECIMAL(5,2) NOT NULL DEFAULT 3.00,    -- Penalty rate for overdue (%)
    -- Loan-to-Value
    ltv_ratio                   DECIMAL(5,4) NOT NULL DEFAULT 0.7000,  -- 70% of appraised value
    -- Timing
    grace_period_days           INTEGER NOT NULL DEFAULT 90,           -- BSP-compliant grace period
    maturity_months             INTEGER NOT NULL DEFAULT 1,            -- Monthly payment cycle
    renewal_cooldown_days       INTEGER NOT NULL DEFAULT 0,            -- Days before renewal allowed
    max_missed_payments         INTEGER NOT NULL DEFAULT 3,            -- Before forfeiture
    payment_cycle_days          INTEGER NOT NULL DEFAULT 30,           -- Days between payments
    -- Fees
    service_charge              DECIMAL(15,2) NOT NULL DEFAULT 10.00,  -- Fixed service charge amount (pesos)
    affidavit_fee               DECIMAL(15,2) NOT NULL DEFAULT 100.00, -- Fixed affidavit fee
    advance_interest_months     INTEGER NOT NULL DEFAULT 1,            -- Default advance interest months
    -- Approval
    manager_approval_threshold  DECIMAL(15,2) NOT NULL DEFAULT 15000.00, -- Appraisals above this need manager approval
    -- Timestamps
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);

-- F2: Gold Rates (per-tenant pricing by karat)
CREATE TABLE gold_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    karat           INTEGER NOT NULL,                       -- e.g. 10, 14, 18, 21, 22, 24
    purity_decimal  DECIMAL(5,3) NOT NULL,                  -- e.g. 0.750 for 18k
    rate_per_gram   DECIMAL(15,2) NOT NULL,                 -- Current buy rate
    effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE(tenant_id, karat, effective_date)
);

-- F3: Gold Rate History
-- Immutable audit trail when gold rates change.
CREATE TABLE gold_rate_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    karat           TEXT NOT NULL,                           -- Stored as text for flexibility
    old_rate        DECIMAL(15,2),                           -- NULL on first rate set
    new_rate        DECIMAL(15,2) NOT NULL,
    changed_by      UUID REFERENCES tenant_users(id),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Immutable: no updated_at, no deleted_at
);

-- F4: Silver Rates (per-tenant pricing by purity)
CREATE TABLE silver_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    purity_mark     TEXT NOT NULL,                           -- e.g. '925', '950', '999'
    purity_pct      DECIMAL(5,2) NOT NULL,                   -- e.g. 92.50 for sterling
    common_name     TEXT,                                     -- e.g. 'Sterling Silver'
    rate_per_gram   DECIMAL(15,2) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- F5: Silver Rate History
-- Immutable audit trail when silver rates change.
CREATE TABLE silver_rate_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    purity_mark     TEXT NOT NULL,
    old_rate        DECIMAL(15,2),
    new_rate        DECIMAL(15,2) NOT NULL,
    changed_by      UUID REFERENCES tenant_users(id),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Immutable: no updated_at, no deleted_at
);

-- F6: Item Conditions
-- Lookup table for item condition multipliers used during appraisal.
-- Replaces hardcoded CHECK constraints; tenant-configurable.
CREATE TABLE item_conditions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    condition_name  TEXT NOT NULL,                           -- e.g. 'MINT', 'GOOD', 'FAIR', 'POOR'
    description     TEXT,                                     -- e.g. 'Like new, no visible wear'
    multiplier_pct  DECIMAL(5,2) NOT NULL DEFAULT 100,       -- 100 = no adjustment, 80 = 20% reduction
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0               -- Display ordering
);


-- ============================================================================
-- SECTION G: GROUP 6 — PAWN OPERATIONS
-- ============================================================================

-- G1: Pawn Items (collateral submitted for appraisal)
CREATE TABLE pawn_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    customer_id             UUID NOT NULL REFERENCES customers(id),
    branch_id               UUID NOT NULL REFERENCES branches(id),
    category                item_category NOT NULL,
    general_desc            TEXT NOT NULL,
    item_condition          TEXT,                                        -- References item_conditions.condition_name
    condition_notes         TEXT,
    specific_attrs          JSONB DEFAULT '{}',
    -- Shared identifiers (gadget/appliance)
    brand                   TEXT,
    model                   TEXT,
    serial_number           TEXT,
    -- Jewelry-specific
    metal_type              TEXT CHECK (metal_type IN ('GOLD','SILVER')),
    weight_grams            NUMERIC(10,4),
    karat                   INTEGER,
    -- Gadget-specific
    gadget_color            TEXT,
    storage_capacity        TEXT,                                       -- e.g. '256GB', '1TB'
    -- Appliance-specific
    appliance_brand         TEXT,
    appliance_model         TEXT,
    appliance_serial        TEXT,
    size_capacity           TEXT,                                       -- e.g. '32 inches', '10 kg', '1.5 HP'
    wattage                 TEXT,                                       -- e.g. '1200W'
    appliance_color         TEXT,
    -- Vehicle-specific
    vehicle_make            TEXT,                                       -- e.g. 'Toyota'
    vehicle_model           TEXT,                                       -- e.g. 'Vios'
    vehicle_year            INTEGER,
    vehicle_color           TEXT,
    plate_number            TEXT,
    engine_number           TEXT,
    chassis_number          TEXT,
    mileage                 INTEGER,                                   -- km
    transmission            TEXT CHECK (transmission IN ('AUTOMATIC','MANUAL','CVT')),
    fuel_type               TEXT CHECK (fuel_type IN ('GASOLINE','DIESEL','ELECTRIC','HYBRID')),
    accessories             TEXT[],
    -- Valuation (populated after appraisal)
    appraised_value         DECIMAL(15,2),
    fair_market_value       DECIMAL(12,2),
    offered_amount          DECIMAL(12,2),
    -- Storage
    storage_location        TEXT,
    -- Status tracking
    inventory_status        inventory_status NOT NULL DEFAULT 'PENDING_APPRAISAL',
    disposition             disposition_status,
    disposition_approved_by UUID REFERENCES tenant_users(id),
    disposition_approved_at TIMESTAMPTZ,
    auction_base_price      DECIMAL(15,2),
    melting_value           DECIMAL(15,2),
    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

-- G2: Appraisal Assessments (immutable audit trail per valuation)
-- Each appraisal attempt creates one row. Supports manager approval gate.
CREATE TABLE appraisal_assessments (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 UUID NOT NULL REFERENCES tenants(id),
    item_id                   UUID NOT NULL REFERENCES pawn_items(id),
    assessed_by               UUID NOT NULL REFERENCES tenant_users(id),  -- Appraiser
    category                  TEXT NOT NULL,
    -- Measurement data (jewelry)
    weight_grams              NUMERIC(10,4),
    karat                     INTEGER,
    item_condition            TEXT,
    -- Rates used at time of appraisal (frozen snapshot)
    gold_rate_used            NUMERIC(12,2),
    purity_decimal_used       NUMERIC(6,4),
    condition_multiplier      NUMERIC(4,2),
    ltv_ratio_used            NUMERIC(5,4),
    -- Calculated values
    melt_value                NUMERIC(12,2),
    fair_market_value         NUMERIC(12,2) NOT NULL,
    appraised_value           NUMERIC(12,2) NOT NULL,
    offered_amount            NUMERIC(12,2),
    notes                     TEXT,
    -- Appraiser outcome
    outcome                   TEXT CHECK (outcome IN ('PENDING','APPROVED','REJECTED','DECLINED'))
                              DEFAULT 'PENDING',
    -- Manager approval gate (required when offered_amount > manager_approval_threshold)
    requires_manager_approval BOOLEAN NOT NULL DEFAULT FALSE,
    manager_approved_by       UUID REFERENCES tenant_users(id),           -- Manager who approved/rejected
    manager_approved_at       TIMESTAMPTZ,
    manager_notes             TEXT,                                        -- Manager's comments
    -- Timestamp
    created_at                TIMESTAMPTZ DEFAULT NOW()
    -- Immutable: no updated_at, no deleted_at
);

-- G3: Pawn Tickets (loan contracts)
-- Each ticket represents a loan agreement. Partial payments create new tickets
-- linked via parent_ticket_id, forming a chain of the loan's history.
CREATE TABLE pawn_tickets (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id),
    ticket_number               VARCHAR(50) UNIQUE NOT NULL,
    customer_id                 UUID NOT NULL REFERENCES customers(id),
    item_id                     UUID NOT NULL REFERENCES pawn_items(id),
    appraiser_id                UUID NOT NULL REFERENCES tenant_users(id),
    issued_by                   UUID REFERENCES tenant_users(id),          -- Cashier/clerk who issued
    -- Loan terms
    principal_loan              DECIMAL(15,2) NOT NULL,
    interest_rate               DECIMAL(5,2) NOT NULL,                     -- Monthly %
    advance_interest            DECIMAL(15,2) NOT NULL DEFAULT 0,          -- Pre-deducted interest
    service_charge              DECIMAL(15,2) NOT NULL DEFAULT 0,          -- Pre-deducted service fee
    net_proceeds                DECIMAL(15,2),                             -- principal - advance_interest - service_charge
    -- Dates
    loan_date                   TIMESTAMPTZ NOT NULL,
    maturity_date               TIMESTAMPTZ NOT NULL,
    -- Status
    status                      ticket_status NOT NULL DEFAULT 'ACTIVE',
    -- Renewal chain
    parent_ticket_id            UUID REFERENCES pawn_tickets(id),          -- Previous ticket in chain
    renewal_count               INTEGER NOT NULL DEFAULT 0,
    -- Rate snapshots
    original_interest_rate      DECIMAL(5,2),                              -- Rate at time of original loan
    penalty_rate                DECIMAL(5,2),                              -- Penalty rate if overdue
    -- Overdue tracking
    is_overdue                  BOOLEAN NOT NULL DEFAULT FALSE,
    consecutive_missed_payments INTEGER NOT NULL DEFAULT 0,
    last_payment_date           TIMESTAMPTZ,
    next_payment_due_date       TIMESTAMPTZ,
    -- Expiry & forfeiture
    expiry_date                 TIMESTAMPTZ,                               -- maturity_date + grace_period
    grace_period_days           INTEGER,                                   -- Snapshot from loan settings
    forfeited_at                TIMESTAMPTZ,
    forfeiture_reason           TEXT,
    -- Timestamps
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);

-- G4: Transactions (payment records)
-- Every money movement creates a transaction row. Immutable financial record.
CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    ticket_id           UUID NOT NULL REFERENCES pawn_tickets(id),
    processed_by        UUID NOT NULL REFERENCES tenant_users(id),
    trans_type          trans_type NOT NULL,
    payment_method      payment_method NOT NULL,
    -- Amounts
    principal_paid      DECIMAL(15,2) NOT NULL DEFAULT 0,
    interest_paid       DECIMAL(15,2) NOT NULL DEFAULT 0,
    penalty_paid        DECIMAL(15,2) NOT NULL DEFAULT 0,
    service_charge_paid DECIMAL(15,2) NOT NULL DEFAULT 0,
    months_covered      INTEGER NOT NULL DEFAULT 0,
    -- Reference
    notes               TEXT,
    trans_date          TIMESTAMPTZ NOT NULL,
    receipt_number      VARCHAR(100) UNIQUE NOT NULL,
    reference_number    VARCHAR(100),                        -- External ref (GCash, bank transfer, etc.)
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);


-- ============================================================================
-- SECTION H: GROUP 7 — SUPPORTING TABLES
-- ============================================================================

-- H1: Media (polymorphic image storage for customers & items)
CREATE TABLE media (
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

-- H2: Notices Log
-- Email/SMS notifications sent to customers about their loans.
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

-- H3: Auctions
-- Public auction events for forfeited items (BSP requirement).
CREATE TABLE auctions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    branch_id        UUID REFERENCES branches(id),
    auction_date     TIMESTAMPTZ NOT NULL,
    publication_date TIMESTAMPTZ NOT NULL,                  -- BSP requires public notice
    venue            TEXT NOT NULL,
    status           auction_status NOT NULL DEFAULT 'SCHEDULED',
    approved_by      UUID REFERENCES tenant_users(id),
    total_lots       INTEGER NOT NULL DEFAULT 0,
    total_sold       DECIMAL(15,2),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

-- H4: Auction Lots
-- Individual items listed in an auction event.
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
CREATE INDEX idx_audit_logs_admin       ON platform_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_logs_target      ON platform_audit_logs(target_type, target_id, created_at DESC);

-- Tenants
CREATE INDEX idx_tenants_status         ON tenants(status) WHERE deleted_at IS NULL;

-- Branches
CREATE INDEX idx_branches_tenant        ON branches(tenant_id) WHERE deleted_at IS NULL;

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
-- SECURITY DEFINER functions bypass RLS — prevents infinite recursion
-- when policies on tenant_users need to query tenant_users.
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
-- SECTION K: ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
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

-- K1: super_admins — self-read only
CREATE POLICY super_admins_self_read ON super_admins
    FOR SELECT USING (id = auth.uid());

-- K2: platform_audit_logs — super admins only
CREATE POLICY audit_logs_admin_read ON platform_audit_logs
    FOR SELECT USING (is_super_admin());

-- K3: platform_settings — super admins can read/manage
CREATE POLICY platform_settings_read ON platform_settings
    FOR SELECT USING (is_super_admin());

CREATE POLICY platform_settings_manage ON platform_settings
    FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- K4: platform_backup_logs — super admins only
CREATE POLICY backup_logs_admin_read ON platform_backup_logs
    FOR SELECT USING (is_super_admin());

CREATE POLICY backup_logs_admin_insert ON platform_backup_logs
    FOR INSERT WITH CHECK (is_super_admin());

-- K5: tenants — tenant members see own tenant + super admins see all
CREATE POLICY tenants_tenant_read ON tenants
    FOR SELECT USING (
        id = get_my_tenant_id()
        OR is_super_admin()
    );

CREATE POLICY tenants_super_admin_manage ON tenants
    FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- K6: branches — tenant isolation
CREATE POLICY branches_tenant_isolation ON branches
    FOR SELECT USING (
        tenant_id = get_my_tenant_id()
        OR is_super_admin()
    );

CREATE POLICY branches_owner_manage ON branches
    FOR ALL
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (get_my_role() = 'OWNER');

-- K7: subscriptions — tenant isolation + OWNER mutations
CREATE POLICY subscriptions_tenant_select ON subscriptions
    FOR SELECT USING (
        tenant_id = get_my_tenant_id()
        OR is_super_admin()
    );

CREATE POLICY subscriptions_owner_insert ON subscriptions
    FOR INSERT WITH CHECK (
        tenant_id = get_my_tenant_id()
        AND get_my_role() = 'OWNER'
    );

CREATE POLICY subscriptions_owner_update ON subscriptions
    FOR UPDATE
    USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'OWNER')
    WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'OWNER');

-- K8: tenant_users — tenant isolation + OWNER mutations
CREATE POLICY tenant_users_select ON tenant_users
    FOR SELECT USING (
        id = auth.uid()
        OR tenant_id = get_my_tenant_id()
        OR is_super_admin()
    );

CREATE POLICY tenant_users_owner_manage ON tenant_users
    FOR ALL
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (get_my_role() = 'OWNER');

-- K9: tenant_audit_logs — tenant isolation (read-only for tenant, insert by system)
CREATE POLICY tenant_audit_tenant_read ON tenant_audit_logs
    FOR SELECT USING (
        tenant_id = get_my_tenant_id()
        OR is_super_admin()
    );

-- K10: customers — tenant isolation
CREATE POLICY customers_tenant_isolation ON customers
    FOR SELECT USING (
        tenant_id = get_my_tenant_id()
        OR is_super_admin()
    );

CREATE POLICY customers_tenant_manage ON customers
    FOR ALL
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

-- K11: kyc_documents — tenant isolation
CREATE POLICY kyc_tenant_isolation ON kyc_documents
    FOR SELECT USING (
        tenant_id = get_my_tenant_id()
        OR is_super_admin()
    );

CREATE POLICY kyc_tenant_manage ON kyc_documents
    FOR ALL
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

-- K12: tenant_branding — tenant isolation + OWNER/MANAGER mutations
CREATE POLICY tenant_branding_select ON tenant_branding
    FOR SELECT USING (
        tenant_id = get_my_tenant_id()
        OR is_super_admin()
    );

CREATE POLICY tenant_branding_insert ON tenant_branding
    FOR INSERT WITH CHECK (
        tenant_id = get_my_tenant_id()
        AND get_my_role() IN ('OWNER', 'MANAGER')
    );

CREATE POLICY tenant_branding_update ON tenant_branding
    FOR UPDATE USING (
        tenant_id = get_my_tenant_id()
        AND get_my_role() IN ('OWNER', 'MANAGER')
    );

-- K13: customer_access_requests — tenant isolation
CREATE POLICY car_tenant_isolation ON customer_access_requests
    FOR ALL USING (tenant_id = get_my_tenant_id());

-- K14: customer_payment_intents — tenant isolation
CREATE POLICY payment_intents_tenant_read ON customer_payment_intents
    FOR SELECT USING (
        tenant_id = get_my_tenant_id()
        OR is_super_admin()
    );

CREATE POLICY payment_intents_tenant_manage ON customer_payment_intents
    FOR ALL
    USING (tenant_id = get_my_tenant_id())
    WITH CHECK (tenant_id = get_my_tenant_id());

-- K15–K20: Business config + operations — tenant isolation (all same pattern)
-- Loan Settings
CREATE POLICY loan_settings_tenant_read ON tenant_loan_settings
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY loan_settings_tenant_manage ON tenant_loan_settings
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Gold Rates
CREATE POLICY gold_rates_tenant_read ON gold_rates
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY gold_rates_tenant_manage ON gold_rates
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Gold Rate History
CREATE POLICY gold_rate_history_tenant_read ON gold_rate_history
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());

-- Silver Rates
CREATE POLICY silver_rates_tenant_read ON silver_rates
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY silver_rates_tenant_manage ON silver_rates
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Silver Rate History
CREATE POLICY silver_rate_history_tenant_read ON silver_rate_history
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());

-- Item Conditions
CREATE POLICY item_conditions_tenant_read ON item_conditions
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY item_conditions_tenant_manage ON item_conditions
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Pawn Items
CREATE POLICY pawn_items_tenant_read ON pawn_items
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY pawn_items_tenant_manage ON pawn_items
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Appraisal Assessments
CREATE POLICY assessments_tenant_read ON appraisal_assessments
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY assessments_tenant_manage ON appraisal_assessments
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Pawn Tickets
CREATE POLICY tickets_tenant_read ON pawn_tickets
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY tickets_tenant_manage ON pawn_tickets
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Transactions
CREATE POLICY transactions_tenant_read ON transactions
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY transactions_tenant_manage ON transactions
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Media
CREATE POLICY media_tenant_read ON media
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY media_tenant_manage ON media
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Notices
CREATE POLICY notices_tenant_read ON notices_log
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY notices_tenant_manage ON notices_log
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Auctions
CREATE POLICY auctions_tenant_read ON auctions
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY auctions_tenant_manage ON auctions
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());

-- Auction Lots
CREATE POLICY auction_lots_tenant_read ON auction_lots
    FOR SELECT USING (tenant_id = get_my_tenant_id() OR is_super_admin());
CREATE POLICY auction_lots_tenant_manage ON auction_lots
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());


-- ============================================================================
-- SECTION L: GRANT STATEMENTS
-- Required for Supabase PostgREST to access tables via authenticated role.
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

-- M1: Seed a super admin (called from backend with service key)
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

-- M2: Register a new tenant owner (creates tenant + branch + user in one transaction)
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
    p_user_id             UUID         -- auth.users(id) from Supabase Auth signup
) RETURNS JSONB AS $$
DECLARE
    v_tenant_id UUID;
    v_branch_id UUID;
BEGIN
    -- Create tenant
    INSERT INTO tenants (business_name, bsp_registration_no, tin_number, contact_email, status)
    VALUES (p_business_name, p_bsp_registration_no, p_tin_number, p_contact_email, 'ACTIVE')
    RETURNING id INTO v_tenant_id;

    -- Create main branch
    INSERT INTO branches (tenant_id, branch_code, branch_name, address, city_municipality, is_main_branch)
    VALUES (v_tenant_id, 'MAIN', p_branch_name, p_branch_address, p_branch_city, TRUE)
    RETURNING id INTO v_branch_id;

    -- Create owner user
    INSERT INTO tenant_users (id, tenant_id, branch_id, role, full_name, email)
    VALUES (p_user_id, v_tenant_id, v_branch_id, 'OWNER', p_full_name, p_email);

    -- Seed default loan settings
    INSERT INTO tenant_loan_settings (tenant_id) VALUES (v_tenant_id);

    RETURN jsonb_build_object(
        'success',   true,
        'tenant_id', v_tenant_id,
        'branch_id', v_branch_id,
        'user_id',   p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- M3: Complete owner KYC (creates tenant + branch, links pre-KYC owner row)
-- Called after signup when the owner submits their business verification form.
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

    -- Seed default loan settings
    INSERT INTO tenant_loan_settings (tenant_id) VALUES (v_tenant_id);

    RETURN jsonb_build_object(
        'success',   true,
        'tenant_id', v_tenant_id,
        'branch_id', v_branch_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
