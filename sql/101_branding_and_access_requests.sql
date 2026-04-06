-- ── 1. Extend tenant_branding ────────────────────────────────────────────────
ALTER TABLE tenant_branding
  ADD COLUMN IF NOT EXISTS brand_color      TEXT,
  ADD COLUMN IF NOT EXISTS font_family      TEXT,
  ADD COLUMN IF NOT EXISTS services_enabled JSONB DEFAULT '[]'::jsonb;

-- ── 2. customer_access_requests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_access_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name      TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  mobile_number  TEXT,
  status         TEXT        NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by    UUID        REFERENCES tenant_users(id),
  reviewed_at    TIMESTAMPTZ,
  notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_car_tenant_status
  ON customer_access_requests (tenant_id, status);

ALTER TABLE customer_access_requests ENABLE ROW LEVEL SECURITY;

-- Tenant users can read/manage their own tenant's requests
CREATE POLICY car_tenant_isolation ON customer_access_requests
  USING (tenant_id = get_my_tenant_id());
