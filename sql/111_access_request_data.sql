-- Add request_data JSONB column to store full customer form payload
ALTER TABLE customer_access_requests
  ADD COLUMN IF NOT EXISTS request_data JSONB;

COMMENT ON COLUMN customer_access_requests.request_data IS 'Full customer registration payload (personalInfo, address, kyc)';
