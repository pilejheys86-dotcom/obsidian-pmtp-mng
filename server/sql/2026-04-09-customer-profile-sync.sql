-- ============================================================================
-- CUSTOMER PROFILE SYNC — Cross-Tenant Profile Propagation
-- Created: 2026-04-09
-- Purpose: When a customer belongs to multiple tenants, keep personal data
--          in sync across all tenant rows. Tenant-scoped fields (risk_rating,
--          total_loans, is_active) are NOT synced.
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_customer_profile(p_auth_id UUID, p_source_customer_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_source customers%ROWTYPE;
BEGIN
  SELECT * INTO v_source FROM customers WHERE id = p_source_customer_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE customers SET
    first_name = v_source.first_name,
    last_name = v_source.last_name,
    date_of_birth = v_source.date_of_birth,
    nationality = v_source.nationality,
    present_address = v_source.present_address,
    province = v_source.province,
    city_municipality = v_source.city_municipality,
    barangay = v_source.barangay,
    zip_code = v_source.zip_code,
    mobile_number = v_source.mobile_number,
    email = v_source.email,
    avatar_url = v_source.avatar_url,
    updated_at = NOW()
  WHERE auth_id = p_auth_id
    AND id != p_source_customer_id
    AND deleted_at IS NULL;
END;
$$;

-- ============================================================================
-- ONE-TIME DATA RECONCILIATION
-- Run AFTER deploying this function to sync existing multi-tenant customers.
-- Uses the most recently updated record as the source of truth.
-- ============================================================================
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--   FOR r IN (
--     SELECT DISTINCT ON (auth_id) auth_id, id
--     FROM customers
--     WHERE auth_id IS NOT NULL AND deleted_at IS NULL
--     AND auth_id IN (
--       SELECT auth_id FROM customers
--       WHERE auth_id IS NOT NULL AND deleted_at IS NULL
--       GROUP BY auth_id HAVING COUNT(*) > 1
--     )
--     ORDER BY auth_id, updated_at DESC
--   ) LOOP
--     PERFORM sync_customer_profile(r.auth_id, r.id);
--   END LOOP;
-- END $$;
