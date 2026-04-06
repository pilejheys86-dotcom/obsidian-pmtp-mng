-- ============================================================================
-- MIGRATION: Query Optimizations — Indexes, Trigger Functions, Triggers, RPCs
-- Date: 2026-04-01
--
-- Purpose:
--   Replace N+1 query patterns in Express.js API routes with database-side
--   aggregation, denormalized counters via triggers, and composite indexes.
--
-- INSTRUCTIONS:
--   Run this entire file as one block in the Supabase SQL Editor.
--   All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- ============================================================================


-- ============================================================================
-- SECTION 1: INDEXES (10 total)
-- Composite indexes targeting the most frequent query patterns.
-- ============================================================================

-- 1. Loan portfolio queries (status breakdown, overdue scans, maturity filters)
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status_maturity
    ON pawn_tickets(tenant_id, status, maturity_date)
    WHERE deleted_at IS NULL;

-- 2. Transaction history & revenue reports (type + date range scans)
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_type_date
    ON transactions(tenant_id, trans_type, trans_date DESC)
    WHERE deleted_at IS NULL;

-- 3. Customer lookup by email within a tenant
CREATE INDEX IF NOT EXISTS idx_customers_tenant_email
    ON customers(tenant_id, email)
    WHERE deleted_at IS NULL;

-- 4. Employee roster filtered by role
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_role
    ON tenant_users(tenant_id, role)
    WHERE deleted_at IS NULL;

-- 5. Media retrieval by reference (item photos, customer KYC)
CREATE INDEX IF NOT EXISTS idx_media_tenant_ref
    ON media(tenant_id, ref_type, ref_id)
    WHERE deleted_at IS NULL;

-- 6. Notice deduplication check (has this notice already been sent?)
CREATE INDEX IF NOT EXISTS idx_notices_ticket_type
    ON notices_log(ticket_id, notice_type)
    WHERE deleted_at IS NULL;

-- 7. Subdomain routing for tenant showcase pages
--    NOTE: tenant_branding has no deleted_at column; filter on subdomain IS NOT NULL instead.
--    This index name already exists from 104_tenant_branding.sql so IF NOT EXISTS will skip it.
CREATE INDEX IF NOT EXISTS idx_tenant_branding_subdomain
    ON tenant_branding(subdomain)
    WHERE subdomain IS NOT NULL;

-- 8. Auction lot lookups by auction + item
CREATE INDEX IF NOT EXISTS idx_auction_lots_auction_item
    ON auction_lots(auction_id, item_id)
    WHERE deleted_at IS NULL;

-- 9. Pending payment intent cleanup / status checks
CREATE INDEX IF NOT EXISTS idx_payment_intents_status_created
    ON customer_payment_intents(status, created_at)
    WHERE status = 'PENDING';

-- 10. Item browsing by tenant + category
CREATE INDEX IF NOT EXISTS idx_pawn_items_tenant_category
    ON pawn_items(tenant_id, category)
    WHERE deleted_at IS NULL;


-- ============================================================================
-- SECTION 1b: ENUM ADDITIONS
-- batch_send_notices defaults to 'IN_APP' delivery, which is not in the
-- original delivery_method enum. Add it idempotently.
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction. If running
--       as part of a multi-statement block, run this line separately first.
-- ============================================================================

DO $$ BEGIN
    ALTER TYPE delivery_method ADD VALUE IF NOT EXISTS 'IN_APP';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- SECTION 2: TRIGGER FUNCTIONS (5 total)
-- All use SECURITY DEFINER to bypass RLS when updating denormalized fields.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 2a. fn_update_customer_total_loans
--     Recalculates customers.total_loans whenever a pawn_ticket is
--     inserted, has its status updated, or is deleted.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_customer_total_loans()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_customer_id UUID;
    v_new_count   INTEGER;
BEGIN
    -- Determine which customer to update
    IF TG_OP = 'DELETE' THEN
        v_customer_id := OLD.customer_id;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Update both old and new customer if customer_id changed (unlikely but safe)
        v_customer_id := NEW.customer_id;
        IF OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
            SELECT COUNT(*) INTO v_new_count
            FROM pawn_tickets
            WHERE customer_id = OLD.customer_id
              AND status IN ('ACTIVE', 'RENEWED')
              AND deleted_at IS NULL;
            UPDATE customers SET total_loans = v_new_count, updated_at = NOW()
            WHERE id = OLD.customer_id;
        END IF;
    ELSE
        v_customer_id := NEW.customer_id;
    END IF;

    -- Recalculate for the target customer
    SELECT COUNT(*) INTO v_new_count
    FROM pawn_tickets
    WHERE customer_id = v_customer_id
      AND status IN ('ACTIVE', 'RENEWED')
      AND deleted_at IS NULL;

    UPDATE customers SET total_loans = v_new_count, updated_at = NOW()
    WHERE id = v_customer_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 2b. fn_update_auction_totals
--     Keeps auctions.total_lots and total_sold in sync with auction_lots.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_auction_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_auction_id  UUID;
    v_total_lots  INTEGER;
    v_total_sold  NUMERIC(15,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_auction_id := OLD.auction_id;
    ELSE
        v_auction_id := NEW.auction_id;
    END IF;

    -- If auction_id changed on UPDATE, recalc the old auction too
    IF TG_OP = 'UPDATE' AND OLD.auction_id IS DISTINCT FROM NEW.auction_id THEN
        SELECT COUNT(*), COALESCE(SUM(sold_price), 0)
        INTO v_total_lots, v_total_sold
        FROM auction_lots
        WHERE auction_id = OLD.auction_id
          AND deleted_at IS NULL;

        UPDATE auctions
        SET total_lots = v_total_lots,
            total_sold = v_total_sold,
            updated_at = NOW()
        WHERE id = OLD.auction_id;
    END IF;

    -- Recalculate for the current auction
    SELECT COUNT(*), COALESCE(SUM(sold_price), 0)
    INTO v_total_lots, v_total_sold
    FROM auction_lots
    WHERE auction_id = v_auction_id
      AND deleted_at IS NULL;

    UPDATE auctions
    SET total_lots = v_total_lots,
        total_sold = v_total_sold,
        updated_at = NOW()
    WHERE id = v_auction_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 2c. fn_cascade_ticket_forfeiture
--     When a ticket status changes to FORFEITED or EXPIRED, mark its
--     collateral item as FORFEITED and record forfeited_at.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cascade_ticket_forfeiture()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE pawn_items
    SET inventory_status = 'FORFEITED',
        updated_at       = NOW()
    WHERE id = NEW.item_id
      AND deleted_at IS NULL;

    NEW.forfeited_at := NOW();
    RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 2d. fn_cascade_ticket_redemption
--     When a ticket status changes to REDEEMED, mark its collateral
--     item as REDEEMED.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cascade_ticket_redemption()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE pawn_items
    SET inventory_status = 'REDEEMED',
        updated_at       = NOW()
    WHERE id = NEW.item_id
      AND deleted_at IS NULL;

    RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 2e. fn_notify_payment_received
--     After a payment transaction is inserted, create an in-app
--     notification for the customer.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_notify_payment_received()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_customer_id    UUID;
    v_ticket_number  TEXT;
    v_amount         NUMERIC;
    v_body           TEXT;
BEGIN
    -- Only fire for payment-type transactions
    -- Note: PARTIAL_REDEMPTION is not currently a trans_type enum value;
    -- if it is added later, include it here.
    IF NEW.trans_type NOT IN ('INTEREST_PAYMENT', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION') THEN
        RETURN NEW;
    END IF;

    -- Look up the customer and ticket number
    SELECT pt.customer_id, pt.ticket_number
    INTO v_customer_id, v_ticket_number
    FROM pawn_tickets pt
    WHERE pt.id = NEW.ticket_id;

    IF v_customer_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Total amount of the payment
    v_amount := COALESCE(NEW.principal_paid, 0)
              + COALESCE(NEW.interest_paid, 0)
              + COALESCE(NEW.penalty_paid, 0)
              + COALESCE(NEW.service_charge_paid, 0);

    v_body := 'Payment of ' || chr(8369) || TO_CHAR(v_amount, 'FM999,999,999.00')
           || ' received for ticket ' || v_ticket_number || '.';

    INSERT INTO customer_notifications (
        tenant_id, customer_id, title, body, type, reference_type, reference_id
    ) VALUES (
        NEW.tenant_id,
        v_customer_id,
        'Payment Received',
        v_body,
        'PAYMENT_RECEIVED',
        'TRANSACTION',
        NEW.id
    );

    RETURN NEW;
END;
$$;


-- ============================================================================
-- SECTION 3: TRIGGERS (5 total)
-- Each trigger is dropped first for idempotency, then recreated.
-- ============================================================================

-- 3a. Customer total_loans counter
DROP TRIGGER IF EXISTS trg_update_customer_total_loans ON pawn_tickets;
CREATE TRIGGER trg_update_customer_total_loans
    AFTER INSERT OR UPDATE OF status OR DELETE
    ON pawn_tickets
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_customer_total_loans();

-- 3b. Auction totals (lots + sold amount)
DROP TRIGGER IF EXISTS trg_update_auction_totals ON auction_lots;
CREATE TRIGGER trg_update_auction_totals
    AFTER INSERT OR UPDATE OR DELETE
    ON auction_lots
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_auction_totals();

-- 3c. Cascade forfeiture to collateral items
DROP TRIGGER IF EXISTS trg_cascade_ticket_forfeiture ON pawn_tickets;
CREATE TRIGGER trg_cascade_ticket_forfeiture
    BEFORE UPDATE OF status
    ON pawn_tickets
    FOR EACH ROW
    WHEN (NEW.status IN ('FORFEITED', 'EXPIRED'))
    EXECUTE FUNCTION fn_cascade_ticket_forfeiture();

-- 3d. Cascade redemption to collateral items
DROP TRIGGER IF EXISTS trg_cascade_ticket_redemption ON pawn_tickets;
CREATE TRIGGER trg_cascade_ticket_redemption
    BEFORE UPDATE OF status
    ON pawn_tickets
    FOR EACH ROW
    WHEN (NEW.status = 'REDEEMED')
    EXECUTE FUNCTION fn_cascade_ticket_redemption();

-- 3e. In-app notification on payment received
DROP TRIGGER IF EXISTS trg_notify_payment_received ON transactions;
CREATE TRIGGER trg_notify_payment_received
    AFTER INSERT
    ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_notify_payment_received();


-- ============================================================================
-- SECTION 4: RPC FUNCTIONS (11 total)
-- All return JSONB and use SECURITY DEFINER to bypass RLS.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 4.01 get_tenant_kpis
--      Single-query dashboard KPIs using COUNT(*) FILTER.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_tenant_kpis(p_tenant_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result JSONB;
    -- Ticket metrics
    v_active_loans        INTEGER;
    v_renewed_loans       INTEGER;
    v_redeemed_loans      INTEGER;
    v_expired_loans       INTEGER;
    v_forfeited_loans     INTEGER;
    v_overdue_loans       INTEGER;
    v_total_principal     NUMERIC;
    v_loans_this_month    INTEGER;
    v_redemptions_month   INTEGER;
    -- Item metrics
    v_pending_appraisals  INTEGER;
    v_vault_items         INTEGER;
    v_forfeited_items     INTEGER;
    v_total_inv_value     NUMERIC;
    -- Customer metrics
    v_total_customers     INTEGER;
    v_active_customers    INTEGER;
BEGIN
    -- Pawn tickets aggregation (single scan)
    SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE'),
        COUNT(*) FILTER (WHERE status = 'RENEWED'),
        COUNT(*) FILTER (WHERE status = 'REDEEMED'),
        COUNT(*) FILTER (WHERE status = 'EXPIRED'),
        COUNT(*) FILTER (WHERE status = 'FORFEITED'),
        COUNT(*) FILTER (WHERE is_overdue = TRUE AND status IN ('ACTIVE', 'RENEWED')),
        COALESCE(SUM(principal_loan) FILTER (WHERE status IN ('ACTIVE', 'RENEWED')), 0),
        COUNT(*) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)),
        COUNT(*) FILTER (WHERE status = 'REDEEMED' AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', CURRENT_DATE))
    INTO
        v_active_loans, v_renewed_loans, v_redeemed_loans,
        v_expired_loans, v_forfeited_loans, v_overdue_loans,
        v_total_principal, v_loans_this_month, v_redemptions_month
    FROM pawn_tickets
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

    -- Pawn items aggregation (single scan)
    SELECT
        COUNT(*) FILTER (WHERE inventory_status IN ('PENDING_APPRAISAL', 'APPRAISED')),
        COUNT(*) FILTER (WHERE inventory_status = 'IN_VAULT'),
        COUNT(*) FILTER (WHERE inventory_status = 'FORFEITED'),
        COALESCE(SUM(appraised_value), 0)
    INTO
        v_pending_appraisals, v_vault_items, v_forfeited_items, v_total_inv_value
    FROM pawn_items
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

    -- Customer aggregation (single scan)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE is_active = TRUE)
    INTO
        v_total_customers, v_active_customers
    FROM customers
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

    v_result := jsonb_build_object(
        'active_loans',                 v_active_loans,
        'renewed_loans',                v_renewed_loans,
        'redeemed_loans',               v_redeemed_loans,
        'expired_loans',                v_expired_loans,
        'forfeited_loans',              v_forfeited_loans,
        'overdue_loans',                v_overdue_loans,
        'total_principal_outstanding',  v_total_principal,
        'loans_this_month',             v_loans_this_month,
        'redemptions_this_month',       v_redemptions_month,
        'pending_appraisals',           v_pending_appraisals,
        'vault_items',                  v_vault_items,
        'forfeited_items',              v_forfeited_items,
        'total_inventory_value',        v_total_inv_value,
        'total_customers',              v_total_customers,
        'active_customers',             v_active_customers
    );

    RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- 4.02 get_dashboard_chart_data
--      Loan activity chart data using generate_series (no N+1 per day).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dashboard_chart_data(
    p_tenant_id UUID,
    p_days      INT DEFAULT 7
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result JSONB;
BEGIN
    p_days := GREATEST(1, LEAST(p_days, 365));

    SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'date'), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'day',        TO_CHAR(d.day, 'Dy'),
            'date',       d.day::TEXT,
            'loan_count', COALESCE(t.cnt, 0),
            'amount',     COALESCE(t.total, 0)
        ) AS row_data
        FROM generate_series(
            (CURRENT_DATE - (p_days - 1)),
            CURRENT_DATE,
            '1 day'::INTERVAL
        ) AS d(day)
        LEFT JOIN (
            SELECT
                DATE(created_at) AS loan_date,
                COUNT(*)         AS cnt,
                SUM(principal_loan) AS total
            FROM pawn_tickets
            WHERE tenant_id = p_tenant_id
              AND deleted_at IS NULL
              AND created_at >= (CURRENT_DATE - (p_days - 1))
            GROUP BY DATE(created_at)
        ) t ON t.loan_date = d.day
    ) sub;

    RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- 4.03 get_tenant_list_enriched
--      Single call to replace the N+1 enrichment loop in GET /tenants.
--      Returns {data: [...], total: N}.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_tenant_list_enriched(
    p_limit  INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_data  JSONB;
    v_total BIGINT;
BEGIN
    -- Total count
    SELECT COUNT(*) INTO v_total
    FROM tenants
    WHERE deleted_at IS NULL;

    -- Enriched tenant rows
    SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    INTO v_data
    FROM (
        SELECT jsonb_build_object(
            'id',                      t.id,
            'business_name',           t.business_name,
            'bsp_registration_no',     t.bsp_registration_no,
            'sec_dti_registration_no', t.sec_dti_registration_no,
            'tin_number',              t.tin_number,
            'contact_email',           t.contact_email,
            'contact_phone',           t.contact_phone,
            'status',                  t.status,
            'blocked_reason',          t.blocked_reason,
            'logo_url',                t.logo_url,
            'created_at',              t.created_at,
            'updated_at',              t.updated_at,
            -- Owner info (LATERAL)
            'owner',            COALESCE(o.info, '{}'::jsonb),
            -- Main branch (LATERAL)
            'main_branch',      COALESCE(mb.info, '{}'::jsonb),
            -- Branch count (LATERAL)
            'branch_count',     COALESCE(bc.cnt, 0),
            -- Latest subscription (LATERAL)
            'subscription',     COALESCE(sub.info, '{}'::jsonb)
        ) AS row_data
        FROM tenants t

        -- Owner: first OWNER-role tenant_user
        LEFT JOIN LATERAL (
            SELECT jsonb_build_object(
                'full_name',      tu.full_name,
                'email',          tu.email,
                'phone_number',   tu.phone_number,
                'kyc_status',     tu.kyc_status,
                'id_type',        tu.id_type,
                'id_front_url',   tu.id_front_url,
                'id_back_url',    tu.id_back_url
            ) AS info
            FROM tenant_users tu
            WHERE tu.tenant_id = t.id
              AND tu.role = 'OWNER'
              AND tu.deleted_at IS NULL
            LIMIT 1
        ) o ON TRUE

        -- Main branch details
        LEFT JOIN LATERAL (
            SELECT jsonb_build_object(
                'branch_name',      b.branch_name,
                'address',          b.address,
                'province',         b.province,
                'city_municipality', b.city_municipality,
                'barangay',         b.barangay,
                'zip_code',         b.zip_code,
                'phone',            b.phone
            ) AS info
            FROM branches b
            WHERE b.tenant_id = t.id
              AND b.is_main_branch = TRUE
              AND b.deleted_at IS NULL
            LIMIT 1
        ) mb ON TRUE

        -- Branch count
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::INT AS cnt
            FROM branches b2
            WHERE b2.tenant_id = t.id
              AND b2.deleted_at IS NULL
        ) bc ON TRUE

        -- Latest subscription
        LEFT JOIN LATERAL (
            SELECT jsonb_build_object(
                'id',             s.id,
                'plan_name',      s.plan_name,
                'billing_cycle',  s.billing_cycle,
                'start_date',     s.start_date,
                'end_date',       s.end_date,
                'payment_status', s.payment_status,
                'amount',         s.amount,
                'paid_at',        s.paid_at
            ) AS info
            FROM subscriptions s
            WHERE s.tenant_id = t.id
              AND s.deleted_at IS NULL
            ORDER BY s.created_at DESC
            LIMIT 1
        ) sub ON TRUE

        WHERE t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) tenant_rows;

    RETURN jsonb_build_object('data', v_data, 'total', v_total);
END;
$$;

-- --------------------------------------------------------------------------
-- 4.04 get_branch_comparison
--      Side-by-side branch performance metrics for a tenant.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_branch_comparison(
    p_tenant_id  UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date   DATE DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_start DATE;
    v_end   DATE;
    v_result JSONB;
BEGIN
    v_start := COALESCE(p_start_date, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    v_end   := COALESCE(p_end_date, CURRENT_DATE);

    SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'branch_id',      b.id,
            'branch_name',    b.branch_name,
            'active_loans',   COALESCE(pt_agg.active_loans, 0),
            'period_loans',   COALESCE(pt_agg.period_loans, 0),
            'total_disbursed', COALESCE(tx_agg.total_disbursed, 0),
            'active_value',   COALESCE(pt_agg.active_value, 0),
            'revenue',        COALESCE(tx_agg.revenue, 0),
            'customer_count', COALESCE(pt_agg.customer_count, 0)
        ) AS row_data
        FROM branches b

        -- Ticket metrics per branch (via pawn_items.branch_id)
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (WHERE pt.status IN ('ACTIVE', 'RENEWED'))          AS active_loans,
                COUNT(*) FILTER (WHERE pt.created_at::DATE BETWEEN v_start AND v_end) AS period_loans,
                COALESCE(SUM(pt.principal_loan) FILTER (WHERE pt.status IN ('ACTIVE', 'RENEWED')), 0) AS active_value,
                COUNT(DISTINCT pt.customer_id) AS customer_count
            FROM pawn_tickets pt
            JOIN pawn_items pi ON pi.id = pt.item_id
            WHERE pi.branch_id = b.id
              AND pt.tenant_id = p_tenant_id
              AND pt.deleted_at IS NULL
        ) pt_agg ON TRUE

        -- Transaction revenue per branch
        LEFT JOIN LATERAL (
            SELECT
                COALESCE(SUM(tx.principal_paid) FILTER (WHERE tx.trans_type = 'DISBURSEMENT'), 0) AS total_disbursed,
                COALESCE(SUM(COALESCE(tx.interest_paid, 0) + COALESCE(tx.penalty_paid, 0) + COALESCE(tx.service_charge_paid, 0)), 0) AS revenue
            FROM transactions tx
            JOIN pawn_tickets pt2 ON pt2.id = tx.ticket_id
            JOIN pawn_items pi2  ON pi2.id = pt2.item_id
            WHERE pi2.branch_id = b.id
              AND tx.tenant_id = p_tenant_id
              AND tx.deleted_at IS NULL
              AND tx.trans_date::DATE BETWEEN v_start AND v_end
        ) tx_agg ON TRUE

        WHERE b.tenant_id = p_tenant_id
          AND b.deleted_at IS NULL
        ORDER BY b.branch_name
    ) sub;

    RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- 4.05 get_items_with_media
--      Joins pawn_items with their ITEM_PHOTO media in a single call.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_items_with_media(
    p_tenant_id   UUID,
    p_customer_id UUID DEFAULT NULL,
    p_status      TEXT DEFAULT NULL,
    p_limit       INT  DEFAULT 20,
    p_offset      INT  DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_items JSONB;
    v_total BIGINT;
BEGIN
    -- Total count with filters
    SELECT COUNT(*) INTO v_total
    FROM pawn_items pi
    WHERE pi.tenant_id = p_tenant_id
      AND pi.deleted_at IS NULL
      AND (p_customer_id IS NULL OR pi.customer_id = p_customer_id)
      AND (p_status IS NULL OR pi.inventory_status::TEXT = p_status);

    -- Items with embedded photo array
    SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    INTO v_items
    FROM (
        SELECT jsonb_build_object(
            'id',                pi.id,
            'tenant_id',         pi.tenant_id,
            'customer_id',       pi.customer_id,
            'branch_id',         pi.branch_id,
            'category',          pi.category,
            'general_desc',      pi.general_desc,
            'item_condition',    pi.item_condition,
            'condition_notes',   pi.condition_notes,
            'specific_attrs',    pi.specific_attrs,
            'brand',             pi.brand,
            'model',             pi.model,
            'serial_number',     pi.serial_number,
            'weight_grams',      pi.weight_grams,
            'karat',             pi.karat,
            'accessories',       pi.accessories,
            'appraised_value',   pi.appraised_value,
            'fair_market_value', pi.fair_market_value,
            'offered_amount',    pi.offered_amount,
            'storage_location',  pi.storage_location,
            'inventory_status',  pi.inventory_status,
            'disposition',       pi.disposition,
            'created_at',        pi.created_at,
            'updated_at',        pi.updated_at,
            -- Customer name
            'customer_name',     COALESCE(
                (SELECT c.first_name || ' ' || c.last_name
                 FROM customers c WHERE c.id = pi.customer_id),
                'Unknown'
            ),
            -- Branch name
            'branch_name',       COALESCE(
                (SELECT b.branch_name FROM branches b WHERE b.id = pi.branch_id),
                '---'
            ),
            'photos',            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id',        m.id,
                    'image_url', m.image_url,
                    'label',     m.label,
                    'metadata',  m.metadata
                ))
                FROM media m
                WHERE m.ref_type = 'ITEM_PHOTO'
                  AND m.ref_id = pi.id
                  AND m.tenant_id = p_tenant_id
                  AND m.deleted_at IS NULL
            ), '[]'::jsonb)
        ) AS row_data
        FROM pawn_items pi
        WHERE pi.tenant_id = p_tenant_id
          AND pi.deleted_at IS NULL
          AND (p_customer_id IS NULL OR pi.customer_id = p_customer_id)
          AND (p_status IS NULL OR pi.inventory_status::TEXT = p_status)
        ORDER BY pi.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) sub;

    RETURN jsonb_build_object('items', v_items, 'total_count', v_total);
END;
$$;

-- --------------------------------------------------------------------------
-- 4.06 get_risk_distribution
--      Customer risk rating breakdown for a tenant.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_risk_distribution(p_tenant_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_object_agg(risk_rating::TEXT, cnt),
        jsonb_build_object('LOW', 0, 'MEDIUM', 0, 'HIGH', 0)
    )
    INTO v_result
    FROM (
        SELECT risk_rating, COUNT(*) AS cnt
        FROM customers
        WHERE tenant_id = p_tenant_id
          AND deleted_at IS NULL
        GROUP BY risk_rating
    ) sub;

    RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- 4.07 get_category_distribution
--      Item category breakdown with count and total appraised value.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_category_distribution(p_tenant_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category',    category::TEXT,
        'count',       cnt,
        'total_value', total_val
    )), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            category,
            COUNT(*)                      AS cnt,
            COALESCE(SUM(appraised_value), 0) AS total_val
        FROM pawn_items
        WHERE tenant_id = p_tenant_id
          AND deleted_at IS NULL
        GROUP BY category
    ) sub;

    RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- 4.08 resolve_user_names
--      Batch resolve tenant_user UUIDs to {full_name, role} pairs.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_user_names(p_user_ids UUID[], p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_object_agg(
            tu.id::TEXT,
            jsonb_build_object('full_name', tu.full_name, 'role', tu.role::TEXT)
        ),
        '{}'::jsonb
    )
    INTO v_result
    FROM tenant_users tu
    WHERE tu.id = ANY(p_user_ids)
      AND (p_tenant_id IS NULL OR tu.tenant_id = p_tenant_id);

    RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- 4.09 batch_send_notices
--      Bulk insert notices for multiple tickets with deduplication.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION batch_send_notices(
    p_tenant_id       UUID,
    p_ticket_ids      UUID[],
    p_notice_type     TEXT,
    p_delivery_method TEXT DEFAULT 'IN_APP'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_created INTEGER;
BEGIN
    WITH inserted AS (
        INSERT INTO notices_log (tenant_id, ticket_id, notice_type, delivery_method, sent_at, status)
        SELECT
            p_tenant_id,
            t.id,
            p_notice_type::notice_type,
            p_delivery_method::delivery_method,
            NOW(),
            'PENDING'::delivery_status
        FROM unnest(p_ticket_ids) AS tid
        JOIN pawn_tickets t ON t.id = tid
        WHERE t.tenant_id = p_tenant_id
          AND t.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM notices_log nl
              WHERE nl.ticket_id = t.id
                AND nl.notice_type = p_notice_type::notice_type
                AND nl.tenant_id = p_tenant_id
                AND nl.deleted_at IS NULL
          )
        RETURNING id
    )
    SELECT COUNT(*) INTO v_created FROM inserted;

    RETURN jsonb_build_object('success', true, 'notices_created', v_created);
END;
$$;

-- --------------------------------------------------------------------------
-- 4.10 issue_pawn_ticket
--      Atomically: update item status, create ticket, record disbursement
--      transaction, and approve the appraisal assessment.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_pawn_ticket(
    p_tenant_id          UUID,
    p_item_id            UUID,
    p_customer_id        UUID,
    p_appraiser_id       UUID,
    p_principal_loan     NUMERIC,
    p_interest_rate      NUMERIC,
    p_service_charge     NUMERIC,
    p_advance_interest   NUMERIC,
    p_net_proceeds       NUMERIC,
    p_maturity_months    INT,
    p_grace_period_days  INT,
    p_payment_cycle_days INT,
    p_penalty_rate       NUMERIC,
    p_receipt_number     TEXT,
    p_ticket_number      TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_ticket_id      UUID;
    v_transaction_id UUID;
    v_maturity_date  TIMESTAMPTZ;
    v_expiry_date    TIMESTAMPTZ;
    v_next_payment   TIMESTAMPTZ;
BEGIN
    -- Calculate dates
    v_maturity_date := (CURRENT_DATE + (p_maturity_months || ' months')::INTERVAL)::DATE;
    v_expiry_date   := (CURRENT_DATE + (p_maturity_months || ' months')::INTERVAL + (p_grace_period_days || ' days')::INTERVAL)::DATE;
    v_next_payment  := CURRENT_DATE + p_payment_cycle_days;

    -- 1. Update item status to VAULT
    UPDATE pawn_items
    SET inventory_status = 'IN_VAULT',
        updated_at       = NOW()
    WHERE id = p_item_id
      AND tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND inventory_status IN ('APPRAISED', 'UNDER_APPRAISAL');

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item not found, deleted, or not in approvable state');
    END IF;

    -- 2. Create pawn ticket
    INSERT INTO pawn_tickets (
        tenant_id, ticket_number, customer_id, item_id, appraiser_id,
        principal_loan, interest_rate, advance_interest, service_charge,
        net_proceeds, loan_date, maturity_date, expiry_date,
        grace_period_days, penalty_rate, next_payment_due_date, status
    ) VALUES (
        p_tenant_id, p_ticket_number, p_customer_id, p_item_id, p_appraiser_id,
        p_principal_loan, p_interest_rate, p_advance_interest, p_service_charge,
        p_net_proceeds, NOW(), v_maturity_date, v_expiry_date,
        p_grace_period_days, p_penalty_rate, v_next_payment, 'ACTIVE'
    )
    RETURNING id INTO v_ticket_id;

    -- 3. Record disbursement transaction
    INSERT INTO transactions (
        tenant_id, ticket_id, processed_by, trans_type,
        payment_method, principal_paid, trans_date, receipt_number
    ) VALUES (
        p_tenant_id, v_ticket_id, p_appraiser_id, 'DISBURSEMENT',
        'CASH', p_principal_loan, NOW(), p_receipt_number
    )
    RETURNING id INTO v_transaction_id;

    -- 4. Approve latest pending appraisal assessment for this item
    UPDATE appraisal_assessments
    SET outcome = 'APPROVED'
    WHERE item_id = p_item_id
      AND tenant_id = p_tenant_id
      AND outcome = 'PENDING'
    ;

    RETURN jsonb_build_object(
        'success',        true,
        'ticket_id',      v_ticket_id,
        'ticket_number',  p_ticket_number,
        'transaction_id', v_transaction_id
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 4.11 approve_appraisal
--      Atomically: approve assessment + update item offered_amount & status.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_appraisal(
    p_tenant_id      UUID,
    p_item_id        UUID,
    p_assessment_id  UUID,
    p_offered_amount NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. Approve the assessment
    UPDATE appraisal_assessments
    SET outcome = 'APPROVED'
    WHERE id = p_assessment_id
      AND item_id = p_item_id
      AND tenant_id = p_tenant_id
      AND outcome = 'PENDING';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Assessment not found or not in PENDING state');
    END IF;

    -- 2. Update item with offered amount and move to PENDING_APPROVAL
    UPDATE pawn_items
    SET offered_amount   = p_offered_amount,
        inventory_status = 'APPRAISED',
        updated_at       = NOW()
    WHERE id = p_item_id
      AND tenant_id = p_tenant_id
      AND deleted_at IS NULL;

    RETURN jsonb_build_object('success', true, 'item_id', p_item_id);
END;
$$;


-- ============================================================================
-- SECTION 5: GRANTS
-- Grant EXECUTE on all 11 RPC functions to the authenticated role.
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_tenant_kpis(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_chart_data(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_list_enriched(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_branch_comparison(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_items_with_media(UUID, UUID, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_risk_distribution(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_category_distribution(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_user_names(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION batch_send_notices(UUID, UUID[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION issue_pawn_ticket(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INT, INT, INT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_appraisal(UUID, UUID, UUID, NUMERIC) TO authenticated;
