-- 107: Add reference_number column to transactions for GCash/Bank Transfer tracking
ALTER TABLE transactions
ADD COLUMN reference_number VARCHAR(100) DEFAULT NULL;

COMMENT ON COLUMN transactions.reference_number IS 'External payment reference (GCash ref, bank transfer ref). NULL for cash payments.';
