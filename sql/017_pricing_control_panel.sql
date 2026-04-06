-- sql/017_pricing_control_panel.sql
-- Pricing Control Panel: gold history, silver rates, silver history, item conditions

-- ── 1. Gold Rate History ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gold_rate_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  karat       text        NOT NULL,          -- '24K', '22K', '21K', '18K', '14K', '10K'
  old_rate    numeric(12,4),
  new_rate    numeric(12,4) NOT NULL,
  changed_by  uuid        REFERENCES tenant_users(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gold_rate_history_tenant_idx ON gold_rate_history(tenant_id, changed_at DESC);

ALTER TABLE gold_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read gold history"
  ON gold_rate_history FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant members insert gold history"
  ON gold_rate_history FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ── 2. Silver Rates ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silver_rates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purity_mark   text        NOT NULL,        -- '999', '958', '925', '900', '835', '800'
  purity_pct    numeric(5,2) NOT NULL,
  common_name   text,
  rate_per_gram numeric(12,4) NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE(tenant_id, purity_mark)
);

ALTER TABLE silver_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read silver rates"
  ON silver_rates FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant members write silver rates"
  ON silver_rates FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ── 3. Silver Rate History ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silver_rate_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purity_mark  text        NOT NULL,
  old_rate     numeric(12,4),
  new_rate     numeric(12,4) NOT NULL,
  changed_by   uuid        REFERENCES tenant_users(id) ON DELETE SET NULL,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS silver_rate_history_tenant_idx ON silver_rate_history(tenant_id, changed_at DESC);

ALTER TABLE silver_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read silver history"
  ON silver_rate_history FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant members insert silver history"
  ON silver_rate_history FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ── 4. Item Conditions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_conditions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  condition_name  text        NOT NULL,
  description     text,
  multiplier_pct  numeric(5,2) NOT NULL DEFAULT 100,
  is_active       boolean     NOT NULL DEFAULT true,
  sort_order      int         NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, condition_name)
);

ALTER TABLE item_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read conditions"
  ON item_conditions FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant members write conditions"
  ON item_conditions FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());