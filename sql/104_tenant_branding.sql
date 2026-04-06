-- 104_tenant_branding.sql
-- Tenant branding & custom subdomain showcase

-- RLS helper functions (idempotent — safe to re-run)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM tenant_users WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role::text FROM tenant_users WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM super_admins WHERE id = auth.uid() AND is_active = TRUE); $$;

CREATE TABLE IF NOT EXISTS tenant_branding (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  subdomain   VARCHAR(63) UNIQUE,
  tagline     VARCHAR(255),
  apk_download_url TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by subdomain for showcase routing
CREATE INDEX idx_tenant_branding_subdomain
  ON tenant_branding(subdomain)
  WHERE subdomain IS NOT NULL;

-- RLS
ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own branding
CREATE POLICY tenant_branding_select ON tenant_branding
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    OR is_super_admin()
  );

-- OWNER and MANAGER can insert/update
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

-- Grant
GRANT SELECT, INSERT, UPDATE ON tenant_branding TO authenticated;
