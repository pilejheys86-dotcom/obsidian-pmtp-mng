-- ============================================================================
-- MIGRATION 106: BSP-Compliant Loan Term Defaults
-- 1. Rename service_charge → service_charge_pct (flat peso → percentage)
-- 2. Update defaults to PH pawnshop industry standards
-- Date: 2026-03-29
-- ============================================================================

-- Rename service_charge to service_charge_pct (percentage-based)
ALTER TABLE tenant_loan_settings RENAME COLUMN service_charge TO service_charge_pct;

-- Update defaults to BSP-compliant values
ALTER TABLE tenant_loan_settings ALTER COLUMN maturity_months SET DEFAULT 1;
ALTER TABLE tenant_loan_settings ALTER COLUMN grace_period_days SET DEFAULT 90;
ALTER TABLE tenant_loan_settings ALTER COLUMN service_charge_pct SET DEFAULT 5.00;
ALTER TABLE tenant_loan_settings ALTER COLUMN penalty_interest_rate SET DEFAULT 3.00;
ALTER TABLE tenant_loan_settings ALTER COLUMN ltv_ratio SET DEFAULT 0.70;
ALTER TABLE tenant_loan_settings ALTER COLUMN max_missed_payments SET DEFAULT 3;
ALTER TABLE tenant_loan_settings ALTER COLUMN renewal_cooldown_days SET DEFAULT 0;

-- Update the save_tenant_loan_settings RPC parameter name
CREATE OR REPLACE FUNCTION save_tenant_loan_settings(
  p_tenant_id UUID,
  p_interest_rate NUMERIC DEFAULT NULL,
  p_penalty_interest_rate NUMERIC DEFAULT NULL,
  p_ltv_ratio NUMERIC DEFAULT NULL,
  p_grace_period_days INTEGER DEFAULT NULL,
  p_maturity_months INTEGER DEFAULT NULL,
  p_renewal_cooldown_days INTEGER DEFAULT NULL,
  p_max_missed_payments INTEGER DEFAULT NULL,
  p_payment_cycle_days INTEGER DEFAULT NULL,
  p_service_charge_pct NUMERIC DEFAULT NULL,
  p_affidavit_fee NUMERIC DEFAULT NULL,
  p_advance_interest_months INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE tenant_loan_settings SET
    interest_rate = COALESCE(p_interest_rate, interest_rate),
    penalty_interest_rate = COALESCE(p_penalty_interest_rate, penalty_interest_rate),
    ltv_ratio = COALESCE(p_ltv_ratio, ltv_ratio),
    grace_period_days = COALESCE(p_grace_period_days, grace_period_days),
    maturity_months = COALESCE(p_maturity_months, maturity_months),
    renewal_cooldown_days = COALESCE(p_renewal_cooldown_days, renewal_cooldown_days),
    max_missed_payments = COALESCE(p_max_missed_payments, max_missed_payments),
    payment_cycle_days = COALESCE(p_payment_cycle_days, payment_cycle_days),
    service_charge_pct = COALESCE(p_service_charge_pct, service_charge_pct),
    affidavit_fee = COALESCE(p_affidavit_fee, affidavit_fee),
    advance_interest_months = COALESCE(p_advance_interest_months, advance_interest_months),
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loan settings not found for tenant');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing tenants to BSP defaults (only if they still have old defaults)
UPDATE tenant_loan_settings
SET maturity_months = 1, grace_period_days = 90
WHERE maturity_months = 10 AND grace_period_days = 10;
