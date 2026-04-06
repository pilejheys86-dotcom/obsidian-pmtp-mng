-- 108: Remove hardcoded item_condition CHECK constraints
-- Condition values are now managed dynamically via the item_conditions table (Pricing module)

-- Drop CHECK on pawn_items.item_condition
ALTER TABLE pawn_items DROP CONSTRAINT IF EXISTS pawn_items_item_condition_check;

-- Drop CHECK on appraisal_assessments.item_condition
ALTER TABLE appraisal_assessments DROP CONSTRAINT IF EXISTS appraisal_assessments_item_condition_check;
