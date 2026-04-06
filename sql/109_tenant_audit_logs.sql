  -- 109: Tenant-level audit logs for employee activity monitoring

  CREATE TABLE IF NOT EXISTS tenant_audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID        REFERENCES tenant_users(id),
    action      TEXT        NOT NULL,
    category    TEXT        NOT NULL,
    description TEXT        NOT NULL,
    target_type TEXT,
    target_id   UUID,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Primary query path: list by tenant sorted by time
  CREATE INDEX idx_tenant_audit_tenant_time ON tenant_audit_logs (tenant_id, created_at DESC);

  -- Filter by category within a tenant
  CREATE INDEX idx_tenant_audit_tenant_cat ON tenant_audit_logs (tenant_id, category);

  -- Filter by employee within a tenant
  CREATE INDEX idx_tenant_audit_tenant_user ON tenant_audit_logs (tenant_id, user_id);

  -- RLS: only OWNER can read their own tenant's logs
  ALTER TABLE tenant_audit_logs ENABLE ROW LEVEL SECURITY;

  CREATE POLICY tenant_audit_logs_owner_read ON tenant_audit_logs
    FOR SELECT
    USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'OWNER');

  -- Service role (backend) can insert freely — no insert policy needed since we use supabaseAdmin
