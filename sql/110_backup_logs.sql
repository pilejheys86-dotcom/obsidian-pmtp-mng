CREATE TABLE IF NOT EXISTS platform_backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('full', 'tenant')),
  format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'csv')),
  tenant_id UUID REFERENCES tenants(id),
  tenant_name TEXT,
  generated_by UUID NOT NULL,
  admin_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  total_rows INT DEFAULT 0,
  table_counts JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
