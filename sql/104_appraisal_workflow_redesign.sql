-- ============================================================================
-- MIGRATION 104: Appraisal Workflow Redesign
-- Spec: docs/superpowers/specs/2026-03-29-appraisal-workflow-redesign.md
-- Date: 2026-03-29
-- ============================================================================

-- 1. Add READY_FOR_RELEASE to inventory_status enum
ALTER TYPE inventory_status ADD VALUE IF NOT EXISTS 'READY_FOR_RELEASE' AFTER 'PENDING_APPROVAL';

-- 2. Add issued_by column to pawn_tickets (nullable UUID, FK to tenant_users)
ALTER TABLE pawn_tickets ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES tenant_users(id);

-- 3. Backfill: migrate any PENDING_APPRAISAL items to PENDING_APPROVAL
UPDATE pawn_items
SET inventory_status = 'PENDING_APPROVAL',
    updated_at = NOW()
WHERE inventory_status = 'PENDING_APPRAISAL'
  AND deleted_at IS NULL;
