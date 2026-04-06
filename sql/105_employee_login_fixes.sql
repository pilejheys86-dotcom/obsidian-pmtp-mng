-- ============================================================================
-- MIGRATION 105: Employee Login Fixes
-- 1. Add must_change_password column to tenant_users
-- Date: 2026-03-29
-- ============================================================================

-- Add must_change_password flag (default false; set to true in app code when creating employees)
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
