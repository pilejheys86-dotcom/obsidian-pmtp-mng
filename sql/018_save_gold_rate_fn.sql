-- sql/018_save_gold_rate_fn.sql
-- Creates save_gold_rate function used by the Pricing Control Panel.
-- gold_rates.karat is INTEGER; this function accepts TEXT like '24K' and converts.

CREATE OR REPLACE FUNCTION save_gold_rate(
  p_tenant_id     UUID,
  p_karat         TEXT,
  p_rate_per_gram NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_karat_int  INTEGER;
  v_purity     DECIMAL(5,3);
BEGIN
  -- Convert '24K' → 24
  v_karat_int := CAST(REPLACE(UPPER(TRIM(p_karat)), 'K', '') AS INTEGER);

  -- Map karat integer to purity decimal
  v_purity := CASE v_karat_int
    WHEN 24 THEN 0.999
    WHEN 22 THEN 0.916
    WHEN 21 THEN 0.875
    WHEN 18 THEN 0.750
    WHEN 14 THEN 0.583
    WHEN 10 THEN 0.417
    ELSE NULL
  END;

  IF v_purity IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid karat: ' || p_karat);
  END IF;

  INSERT INTO gold_rates (tenant_id, karat, purity_decimal, rate_per_gram, effective_date)
  VALUES (p_tenant_id, v_karat_int, v_purity, p_rate_per_gram, CURRENT_DATE)
  ON CONFLICT (tenant_id, karat, effective_date)
  DO UPDATE SET
    rate_per_gram = EXCLUDED.rate_per_gram,
    purity_decimal = EXCLUDED.purity_decimal,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
