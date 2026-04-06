# Schema Revision Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop and recreate the database with a revised schema that splits `tenant_users` into `tenant_owners` + `employees`, merges image tables into a universal `media` table, cleans up `customers`, and adds proper CASCADE policies.

**Architecture:** Full database drop-and-recreate via Supabase SQL Editor for schema + triggers + RLS. Then update all backend routes and middleware that referenced the old table names. Finally update frontend components that query those tables.

**Tech Stack:** PostgreSQL (Supabase), Express.js routes, React frontend (Supabase JS client)

**Spec:** `docs/superpowers/specs/2026-03-16-schema-revision-design.md`

---

## Chunk 1: Database Migration + Backend Core

### Task 1: Run SQL Migration in Supabase

This is a single SQL script to run in the Supabase SQL Editor. It drops old tables and recreates the full schema.

**Files:** None (Supabase SQL Editor only)

- [ ] **Step 1: Drop old tables that are being replaced**

Run in Supabase SQL Editor:

```sql
-- Drop tables being replaced (order matters for FK dependencies)
DROP TABLE IF EXISTS public.kyc_documents CASCADE;
DROP TABLE IF EXISTS public.item_images CASCADE;
DROP TABLE IF EXISTS public.tenant_users CASCADE;
```

- [ ] **Step 2: Create `tenant_owners` table**

```sql
CREATE TABLE public.tenant_owners (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL UNIQUE,
  full_name character varying NOT NULL,
  email character varying NOT NULL,
  branch_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone,

  CONSTRAINT tenant_owners_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_owners_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT tenant_owners_branch_id_fkey FOREIGN KEY (branch_id)
    REFERENCES public.branches(id) ON DELETE SET NULL,
  CONSTRAINT tenant_owners_id_fkey FOREIGN KEY (id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);
```

- [ ] **Step 3: Create `employees` table**

```sql
CREATE TABLE public.employees (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid,
  role character varying NOT NULL
    CHECK (role IN ('ADMIN', 'MANAGER', 'AUDITOR', 'APPRAISER', 'CASHIER')),
  full_name character varying NOT NULL,
  work_email character varying UNIQUE,
  personal_email character varying,
  phone_number character varying,
  date_of_birth date,
  address_line_1 text,
  address_line_2 text,
  province character varying,
  city_municipality character varying,
  barangay character varying,
  zip_code character varying,
  ssn_tax_id character varying,
  work_auth_status character varying,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone,

  CONSTRAINT employees_pkey PRIMARY KEY (id),
  CONSTRAINT employees_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT employees_branch_id_fkey FOREIGN KEY (branch_id)
    REFERENCES public.branches(id) ON DELETE SET NULL,
  CONSTRAINT employees_id_fkey FOREIGN KEY (id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_employees_tenant ON public.employees (tenant_id);
```

- [ ] **Step 4: Create `media` table**

```sql
CREATE TABLE public.media (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ref_type character varying NOT NULL
    CHECK (ref_type IN ('CUSTOMER_KYC', 'ITEM_PHOTO', 'EMPLOYEE_I9', 'AVATAR')),
  ref_id uuid NOT NULL,
  image_url text NOT NULL,
  label character varying,
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone,

  CONSTRAINT media_pkey PRIMARY KEY (id),
  CONSTRAINT media_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_media_ref ON public.media (ref_type, ref_id);
CREATE INDEX idx_media_tenant ON public.media (tenant_id);
```

- [ ] **Step 5: Remove duplicate columns from `customers`**

```sql
ALTER TABLE public.customers
  DROP COLUMN IF EXISTS auth_id,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2,
  DROP COLUMN IF EXISTS province,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS barangay,
  DROP COLUMN IF EXISTS zip_code;
```

- [ ] **Step 6: Update FK targets on `pawn_tickets` and `transactions`**

```sql
-- pawn_tickets.appraiser_id → auth.users(id)
ALTER TABLE public.pawn_tickets
  DROP CONSTRAINT IF EXISTS pawn_tickets_appraiser_id_fkey;
ALTER TABLE public.pawn_tickets
  ADD CONSTRAINT pawn_tickets_appraiser_id_fkey
    FOREIGN KEY (appraiser_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- transactions.processed_by → auth.users(id)
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_processed_by_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_processed_by_fkey
    FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

- [ ] **Step 7: Add ON DELETE CASCADE to all tenant-scoped child FKs**

```sql
-- customers
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_tenant_id_fkey;
ALTER TABLE public.customers ADD CONSTRAINT customers_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- pawn_items
ALTER TABLE public.pawn_items DROP CONSTRAINT IF EXISTS pawn_items_tenant_id_fkey;
ALTER TABLE public.pawn_items ADD CONSTRAINT pawn_items_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.pawn_items DROP CONSTRAINT IF EXISTS pawn_items_customer_id_fkey;
ALTER TABLE public.pawn_items ADD CONSTRAINT pawn_items_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- pawn_tickets
ALTER TABLE public.pawn_tickets DROP CONSTRAINT IF EXISTS pawn_tickets_tenant_id_fkey;
ALTER TABLE public.pawn_tickets ADD CONSTRAINT pawn_tickets_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.pawn_tickets DROP CONSTRAINT IF EXISTS pawn_tickets_customer_id_fkey;
ALTER TABLE public.pawn_tickets ADD CONSTRAINT pawn_tickets_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.pawn_tickets DROP CONSTRAINT IF EXISTS pawn_tickets_item_id_fkey;
ALTER TABLE public.pawn_tickets ADD CONSTRAINT pawn_tickets_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.pawn_items(id) ON DELETE CASCADE;

-- transactions
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_tenant_id_fkey;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_ticket_id_fkey;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES public.pawn_tickets(id) ON DELETE CASCADE;

-- notices_log
ALTER TABLE public.notices_log DROP CONSTRAINT IF EXISTS notices_log_tenant_id_fkey;
ALTER TABLE public.notices_log ADD CONSTRAINT notices_log_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notices_log DROP CONSTRAINT IF EXISTS notices_log_ticket_id_fkey;
ALTER TABLE public.notices_log ADD CONSTRAINT notices_log_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES public.pawn_tickets(id) ON DELETE CASCADE;

-- auctions
ALTER TABLE public.auctions DROP CONSTRAINT IF EXISTS auctions_tenant_id_fkey;
ALTER TABLE public.auctions ADD CONSTRAINT auctions_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- auction_lots
ALTER TABLE public.auction_lots DROP CONSTRAINT IF EXISTS auction_lots_tenant_id_fkey;
ALTER TABLE public.auction_lots ADD CONSTRAINT auction_lots_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.auction_lots DROP CONSTRAINT IF EXISTS auction_lots_auction_id_fkey;
ALTER TABLE public.auction_lots ADD CONSTRAINT auction_lots_auction_id_fkey
  FOREIGN KEY (auction_id) REFERENCES public.auctions(id) ON DELETE CASCADE;
ALTER TABLE public.auction_lots DROP CONSTRAINT IF EXISTS auction_lots_item_id_fkey;
ALTER TABLE public.auction_lots ADD CONSTRAINT auction_lots_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.pawn_items(id) ON DELETE CASCADE;
ALTER TABLE public.auction_lots DROP CONSTRAINT IF EXISTS auction_lots_buyer_id_fkey;
ALTER TABLE public.auction_lots ADD CONSTRAINT auction_lots_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- auction_reservations
ALTER TABLE public.auction_reservations DROP CONSTRAINT IF EXISTS auction_reservations_tenant_id_fkey;
ALTER TABLE public.auction_reservations ADD CONSTRAINT auction_reservations_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.auction_reservations DROP CONSTRAINT IF EXISTS auction_reservations_lot_id_fkey;
ALTER TABLE public.auction_reservations ADD CONSTRAINT auction_reservations_lot_id_fkey
  FOREIGN KEY (lot_id) REFERENCES public.auction_lots(id) ON DELETE CASCADE;
ALTER TABLE public.auction_reservations DROP CONSTRAINT IF EXISTS auction_reservations_customer_id_fkey;
ALTER TABLE public.auction_reservations ADD CONSTRAINT auction_reservations_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- tenant_loan_settings
ALTER TABLE public.tenant_loan_settings DROP CONSTRAINT IF EXISTS tenant_loan_settings_tenant_id_fkey;
ALTER TABLE public.tenant_loan_settings ADD CONSTRAINT tenant_loan_settings_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- gold_rates
ALTER TABLE public.gold_rates DROP CONSTRAINT IF EXISTS gold_rates_tenant_id_fkey;
ALTER TABLE public.gold_rates ADD CONSTRAINT gold_rates_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- subscriptions
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tenant_id_fkey;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- customer_notifications
ALTER TABLE public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_tenant_id_fkey;
ALTER TABLE public.customer_notifications ADD CONSTRAINT customer_notifications_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_customer_id_fkey;
ALTER TABLE public.customer_notifications ADD CONSTRAINT customer_notifications_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- customer_payment_intents
ALTER TABLE public.customer_payment_intents DROP CONSTRAINT IF EXISTS customer_payment_intents_tenant_id_fkey;
ALTER TABLE public.customer_payment_intents ADD CONSTRAINT customer_payment_intents_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.customer_payment_intents DROP CONSTRAINT IF EXISTS customer_payment_intents_customer_id_fkey;
ALTER TABLE public.customer_payment_intents ADD CONSTRAINT customer_payment_intents_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_payment_intents DROP CONSTRAINT IF EXISTS customer_payment_intents_ticket_id_fkey;
ALTER TABLE public.customer_payment_intents ADD CONSTRAINT customer_payment_intents_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES public.pawn_tickets(id) ON DELETE CASCADE;

-- customer_push_tokens
ALTER TABLE public.customer_push_tokens DROP CONSTRAINT IF EXISTS customer_push_tokens_customer_id_fkey;
ALTER TABLE public.customer_push_tokens ADD CONSTRAINT customer_push_tokens_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_push_tokens DROP CONSTRAINT IF EXISTS customer_push_tokens_tenant_id_fkey;
ALTER TABLE public.customer_push_tokens ADD CONSTRAINT customer_push_tokens_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
```

- [ ] **Step 8: Create media cleanup triggers**

```sql
-- Generic media cleanup helper
CREATE OR REPLACE FUNCTION soft_delete_media(p_ref_type text, p_ref_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.media SET deleted_at = now()
  WHERE ref_type = p_ref_type AND ref_id = p_ref_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Customers → CUSTOMER_KYC
CREATE OR REPLACE FUNCTION cleanup_customer_media()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM soft_delete_media('CUSTOMER_KYC', NEW.id);
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM soft_delete_media('CUSTOMER_KYC', OLD.id);
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_customer_media_soft
  AFTER UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION cleanup_customer_media();
CREATE TRIGGER trg_cleanup_customer_media_hard
  AFTER DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION cleanup_customer_media();

-- Pawn Items → ITEM_PHOTO
CREATE OR REPLACE FUNCTION cleanup_item_media()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM soft_delete_media('ITEM_PHOTO', NEW.id);
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM soft_delete_media('ITEM_PHOTO', OLD.id);
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_item_media_soft
  AFTER UPDATE ON public.pawn_items
  FOR EACH ROW EXECUTE FUNCTION cleanup_item_media();
CREATE TRIGGER trg_cleanup_item_media_hard
  AFTER DELETE ON public.pawn_items
  FOR EACH ROW EXECUTE FUNCTION cleanup_item_media();

-- Employees → EMPLOYEE_I9
CREATE OR REPLACE FUNCTION cleanup_employee_media()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM soft_delete_media('EMPLOYEE_I9', NEW.id);
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM soft_delete_media('EMPLOYEE_I9', OLD.id);
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_employee_media_soft
  AFTER UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION cleanup_employee_media();
CREATE TRIGGER trg_cleanup_employee_media_hard
  AFTER DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION cleanup_employee_media();

-- Tenant Owners → AVATAR
CREATE OR REPLACE FUNCTION cleanup_owner_media()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM soft_delete_media('AVATAR', NEW.id);
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM soft_delete_media('AVATAR', OLD.id);
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_owner_media_soft
  AFTER UPDATE ON public.tenant_owners
  FOR EACH ROW EXECUTE FUNCTION cleanup_owner_media();
CREATE TRIGGER trg_cleanup_owner_media_hard
  AFTER DELETE ON public.tenant_owners
  FOR EACH ROW EXECUTE FUNCTION cleanup_owner_media();
```

- [ ] **Step 9: Update RLS policies for new tables**

```sql
-- Enable RLS
ALTER TABLE public.tenant_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

-- tenant_owners: users can read their own record
CREATE POLICY "tenant_owners_select_own" ON public.tenant_owners
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "tenant_owners_service_all" ON public.tenant_owners
  FOR ALL USING (true) WITH CHECK (true);

-- employees: users can read their own record, service key has full access
CREATE POLICY "employees_select_own" ON public.employees
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "employees_service_all" ON public.employees
  FOR ALL USING (true) WITH CHECK (true);

-- media: tenant-scoped access
CREATE POLICY "media_select_tenant" ON public.media
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_owners WHERE id = auth.uid()
      UNION
      SELECT tenant_id FROM public.employees WHERE id = auth.uid()
    )
  );
CREATE POLICY "media_service_all" ON public.media
  FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 10: Update all RPCs that reference `tenant_users`**

Go to Supabase Dashboard → Database → Functions. For each RPC below, export the current function body, make the change, and re-run the full `CREATE OR REPLACE FUNCTION` statement.

**`register_owner`:** Change the INSERT target from `tenant_users` to `tenant_owners`. Remove the `role` column from the INSERT (OWNER is implicit).
```sql
-- OLD: INSERT INTO public.tenant_users (id, tenant_id, branch_id, role, full_name, ...)
-- NEW:
INSERT INTO public.tenant_owners (id, tenant_id, full_name, email, branch_id)
VALUES (p_user_id, v_tenant_id, p_full_name, p_email, v_branch_id);
```

**`process_loan_renewal`:** Find any `FROM tenant_users` or `JOIN tenant_users` and replace with `employees`. If it looks up the processor's name, use `employees` (OWNERs can also renew — handle with a UNION or fallback to `tenant_owners`).

**`process_payment`:** Same as `process_loan_renewal` — replace `tenant_users` references with `employees`, add `tenant_owners` fallback if it resolves processor name.

**`approve_item_disposition`:** If it checks the user's role via `tenant_users`, replace with a lookup against both `tenant_owners` (synthesize 'OWNER') and `employees`.

> **Important:** Export each function BEFORE editing. Run the full `CREATE OR REPLACE FUNCTION ...` statement, not just the delta. Verify each one works by calling it from the SQL Editor with test parameters.

- [ ] **Step 11: Verify migration by checking table structure**

Run in SQL Editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected: `tenant_owners`, `employees`, `media` should appear. `tenant_users`, `kyc_documents`, `item_images` should NOT appear.

- [ ] **Step 12: Commit checkpoint**

```bash
git add -A && git commit -m "docs: add schema revision spec and implementation plan"
```

---

### Task 2: Update `tenantScope.js` Middleware

**Files:**
- Modify: `server/middleware/tenantScope.js`

This is the most critical change — every authenticated API request flows through this middleware.

- [ ] **Step 1: Rewrite tenantScope.js**

Replace the entire file content with:

```javascript
const { supabaseAdmin } = require('../config/db');

/**
 * After auth middleware — resolves the user's tenant context.
 * Checks tenant_owners first (synthesizes role='OWNER'),
 * then falls back to employees table.
 */
const tenantScope = async (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Try tenant_owners first
  const { data: owner } = await supabaseAdmin
    .from('tenant_owners')
    .select('id, tenant_id, branch_id, full_name, is_active')
    .eq('id', req.userId)
    .is('deleted_at', null)
    .single();

  if (owner) {
    if (!owner.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }
    req.tenantId = owner.tenant_id;
    req.branchId = owner.branch_id;
    req.userRole = 'OWNER';
    req.profile = { ...owner, role: 'OWNER' };
    return next();
  }

  // Fallback to employees
  const { data: employee, error } = await supabaseAdmin
    .from('employees')
    .select('id, tenant_id, branch_id, role, full_name, is_active')
    .eq('id', req.userId)
    .is('deleted_at', null)
    .single();

  if (error || !employee) {
    return res.status(403).json({ error: 'User profile not found or deactivated' });
  }

  if (!employee.is_active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  req.tenantId = employee.tenant_id;
  req.branchId = employee.branch_id;
  req.userRole = employee.role;
  req.profile = employee;
  next();
};

module.exports = tenantScope;
```

- [ ] **Step 2: Verify server starts without errors**

```bash
cd server && node -e "require('./middleware/tenantScope')" && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add server/middleware/tenantScope.js
git commit -m "refactor: update tenantScope to query tenant_owners + employees"
```

---

### Task 3: Update `server/routes/auth.js`

**Files:**
- Modify: `server/routes/auth.js`

Four queries reference `tenant_users` and need updating.

- [ ] **Step 1: Update registration route (line ~47-51)**

Replace:
```javascript
const { data: ownerProfile } = await supabaseAdmin
  .from('tenant_users')
  .select('tenant_id')
  .eq('id', authData.user.id)
  .single();
```
With:
```javascript
const { data: ownerProfile } = await supabaseAdmin
  .from('tenant_owners')
  .select('tenant_id')
  .eq('id', authData.user.id)
  .single();
```

- [ ] **Step 2: Update login route (line ~105-109)**

Replace:
```javascript
const { data: profile } = await supabaseAdmin
  .from('tenant_users')
  .select('*, tenants(*), branches(*)')
  .eq('id', data.user.id)
  .single();
```
With:
```javascript
// Try owner first, then employee
let profile;
const { data: ownerProfile } = await supabaseAdmin
  .from('tenant_owners')
  .select('*, tenants(*), branches(*)')
  .eq('id', data.user.id)
  .single();

if (ownerProfile) {
  profile = { ...ownerProfile, role: 'OWNER' };
} else {
  const { data: empProfile } = await supabaseAdmin
    .from('employees')
    .select('*, tenants(*), branches(*)')
    .eq('id', data.user.id)
    .single();
  profile = empProfile;
}
```

- [ ] **Step 3: Update password recovery route (line ~127-131)**

Replace:
```javascript
const { data: profile } = await supabaseAdmin
  .from('tenant_users')
  .select('full_name')
  .eq('id', authUsers[0].id)
  .single();
```
With:
```javascript
let profile;
const { data: ownerProfile } = await supabaseAdmin
  .from('tenant_owners')
  .select('full_name')
  .eq('id', authUsers[0].id)
  .single();
profile = ownerProfile;
if (!profile) {
  const { data: empProfile } = await supabaseAdmin
    .from('employees')
    .select('full_name')
    .eq('id', authUsers[0].id)
    .single();
  profile = empProfile;
}
```

- [ ] **Step 4: Update profile endpoint (line ~182-186)**

Replace:
```javascript
const { data: profile } = await supabaseAdmin
  .from('tenant_users')
  .select('*, tenants(*), branches(*)')
  .eq('id', user.id)
  .single();
```
With:
```javascript
let profile;
const { data: ownerProfile } = await supabaseAdmin
  .from('tenant_owners')
  .select('*, tenants(*), branches(*)')
  .eq('id', user.id)
  .single();
if (ownerProfile) {
  profile = { ...ownerProfile, role: 'OWNER' };
} else {
  const { data: empProfile } = await supabaseAdmin
    .from('employees')
    .select('*, tenants(*), branches(*)')
    .eq('id', user.id)
    .single();
  profile = empProfile;
}
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/auth.js
git commit -m "refactor: update auth routes to use tenant_owners + employees"
```

---

## Chunk 2: Backend Route Updates (Employees, Customers, PawnItems, PawnTickets)

### Task 4: Update `server/routes/employees.js`

**Files:**
- Modify: `server/routes/employees.js`

All `tenant_users` references → `employees`. The OWNER exclusion filter (`neq('role', 'OWNER')`) can be removed since OWNERs are no longer in this table.

- [ ] **Step 1: Global find-and-replace in employees.js**

Replace all occurrences of `.from('tenant_users')` with `.from('employees')` throughout the file.

- [ ] **Step 2: Remove OWNER exclusion filter**

Remove this line (was ~line 162):
```javascript
.neq('role', 'OWNER')
```
Since OWNERs are never in the `employees` table, this filter is unnecessary.

- [ ] **Step 3: Update employee creation (POST /)**

In the insert payload (~line 321-345), remove `i9_document_url` from the insert object. After the employee insert succeeds, add a media insert if `i9_document_url` was provided:

```javascript
// After the employee insert succeeds and we have the employee record:
if (payload.i9_document_url) {
  await supabaseAdmin.from('media').insert({
    tenant_id: req.tenantId,
    ref_type: 'EMPLOYEE_I9',
    ref_id: employee.id,
    image_url: payload.i9_document_url,
    label: 'i9_document',
  });
}
```

- [ ] **Step 4: Update employee update (PATCH /:id)**

In the allowed fields whitelist (~line 432), remove `i9_document_url`. If `i9_document_url` is in the request body, upsert into `media` instead:

```javascript
if (req.body.i9_document_url !== undefined) {
  // Soft-delete old I9 media
  await supabaseAdmin.from('media')
    .update({ deleted_at: new Date().toISOString() })
    .eq('ref_type', 'EMPLOYEE_I9')
    .eq('ref_id', req.params.id)
    .is('deleted_at', null);

  if (req.body.i9_document_url) {
    await supabaseAdmin.from('media').insert({
      tenant_id: req.tenantId,
      ref_type: 'EMPLOYEE_I9',
      ref_id: req.params.id,
      image_url: req.body.i9_document_url,
      label: 'i9_document',
    });
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/employees.js
git commit -m "refactor: employees route uses employees table + media for I9 docs"
```

---

### Task 5: Update `server/routes/customers.js`

**Files:**
- Modify: `server/routes/customers.js`

Replace `kyc_documents` inserts/joins with `media` table operations.

- [ ] **Step 1: Update GET / endpoint (list customers)**

Replace the select that joins `kyc_documents`:
```javascript
// OLD: .select('*, kyc_documents!kyc_documents_customer_id_fkey(*), pawn_tickets(...)')
// NEW:
.select('*, pawn_tickets(...)')
```

Then after fetching customers, fetch their KYC media separately:

```javascript
if (customers.length > 0) {
  const customerIds = customers.map(c => c.id);
  const { data: kycMedia } = await supabaseAdmin
    .from('media')
    .select('*')
    .eq('ref_type', 'CUSTOMER_KYC')
    .eq('tenant_id', req.tenantId)
    .in('ref_id', customerIds)
    .is('deleted_at', null);

  // Attach to each customer
  customers.forEach(c => {
    c.kyc_documents = (kycMedia || [])
      .filter(m => m.ref_id === c.id)
      .map(m => ({ ...m.metadata, image_front_url: m.image_url, label: m.label }));
  });
}
```

- [ ] **Step 2: Update GET /:id endpoint (customer detail)**

Same pattern — remove `kyc_documents` from the select join, fetch from `media` separately and attach.

- [ ] **Step 3: Update POST / endpoint (create customer)**

Replace the `kyc_documents` insert block (~lines 343-357):

```javascript
// OLD: await supabaseAdmin.from('kyc_documents').insert(kycRecords);
// NEW:
const mediaRecords = payload.kyc_documents.flatMap(doc => {
  const records = [];
  if (doc.image_front_url) {
    records.push({
      tenant_id: req.tenantId,
      ref_type: 'CUSTOMER_KYC',
      ref_id: customer.id,
      image_url: doc.image_front_url,
      label: 'front',
      metadata: { id_type: doc.id_type, id_number: doc.id_number, expiry_date: doc.expiry_date },
    });
  }
  if (doc.image_back_url) {
    records.push({
      tenant_id: req.tenantId,
      ref_type: 'CUSTOMER_KYC',
      ref_id: customer.id,
      image_url: doc.image_back_url,
      label: 'back',
      metadata: { id_type: doc.id_type, id_number: doc.id_number, expiry_date: doc.expiry_date },
    });
  }
  if (doc.specimen_sig_url) {
    records.push({
      tenant_id: req.tenantId,
      ref_type: 'CUSTOMER_KYC',
      ref_id: customer.id,
      image_url: doc.specimen_sig_url,
      label: 'signature',
      metadata: { id_type: doc.id_type, id_number: doc.id_number, expiry_date: doc.expiry_date },
    });
  }
  return records;
});

if (mediaRecords.length > 0) {
  const { error: mediaError } = await supabaseAdmin.from('media').insert(mediaRecords);
  if (mediaError) console.error('KYC media insert error:', mediaError.message);
}
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/customers.js
git commit -m "refactor: customers route uses media table for KYC documents"
```

---

### Task 6: Update `server/routes/pawnItems.js`

**Files:**
- Modify: `server/routes/pawnItems.js`

Replace `item_images` joins/inserts with `media` table.

- [ ] **Step 1: Update GET / endpoint (list items, ~line 13)**

Replace:
```javascript
.select('*, item_images(*), customers(...), branches(...)', { count: 'exact' })
```
With:
```javascript
.select('*, customers(...), branches(...)', { count: 'exact' })
```

After fetching items, fetch media:
```javascript
if (items.length > 0) {
  const itemIds = items.map(i => i.id);
  const { data: photos } = await supabaseAdmin
    .from('media')
    .select('*')
    .eq('ref_type', 'ITEM_PHOTO')
    .in('ref_id', itemIds)
    .is('deleted_at', null);

  items.forEach(item => {
    item.item_images = (photos || []).filter(p => p.ref_id === item.id);
  });
}
```

- [ ] **Step 2: Update GET /:id endpoint (~line 89)**

Same pattern — remove `item_images(*)` from select, fetch from `media` separately.

- [ ] **Step 3: Update POST / endpoint (~lines 131-138)**

Replace:
```javascript
await supabaseAdmin.from('item_images').insert(imageRecords);
```
With:
```javascript
const mediaRecords = images.map((img, idx) => ({
  tenant_id: req.tenantId,
  ref_type: 'ITEM_PHOTO',
  ref_id: item.id,
  image_url: img.image_url,
  is_primary: idx === 0,
  label: idx === 0 ? 'primary' : null,
}));
await supabaseAdmin.from('media').insert(mediaRecords);
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/pawnItems.js
git commit -m "refactor: pawnItems route uses media table for item photos"
```

---

### Task 7: Update `server/routes/pawnTickets.js`

**Files:**
- Modify: `server/routes/pawnTickets.js`

This file references all three old tables: `tenant_users`, `kyc_documents`, `item_images`.

- [ ] **Step 1: Update GET / endpoint (~line 17)**

Replace `tenant_users!pawn_tickets_appraiser_id_fkey(full_name)` in the select.

Since `appraiser_id` now points to `auth.users` (not a Supabase table with full_name), we need to resolve the name separately. Remove the join from the select, then after fetching tickets:

```javascript
// Collect unique appraiser IDs
const appraiserIds = [...new Set(tickets.map(t => t.appraiser_id).filter(Boolean))];

// Look up names from both tenant_owners and employees
const { data: owners } = await supabaseAdmin.from('tenant_owners')
  .select('id, full_name').in('id', appraiserIds);
const { data: emps } = await supabaseAdmin.from('employees')
  .select('id, full_name').in('id', appraiserIds);

const nameMap = {};
(owners || []).forEach(o => nameMap[o.id] = o.full_name);
(emps || []).forEach(e => nameMap[e.id] = e.full_name);

tickets.forEach(t => {
  t.appraiser_name = nameMap[t.appraiser_id] || 'Unknown';
});
```

- [ ] **Step 2: Update GET /:id endpoint (~line 119-120)**

Remove `kyc_documents(*)`, `item_images(*)`, and `tenant_users!pawn_tickets_appraiser_id_fkey(full_name)` from the select join. Fetch them separately using the same media pattern from Tasks 5-6 and the name lookup from Step 1.

- [ ] **Step 3: Commit**

```bash
git add server/routes/pawnTickets.js
git commit -m "refactor: pawnTickets route uses media + owner/employee name lookup"
```

---

## Chunk 3: Remaining Backend Route Updates

### Task 8: Update routes with `tenant_users` joins

**Files:**
- Modify: `server/routes/transactions.js`
- Modify: `server/routes/renewals.js`
- Modify: `server/routes/dashboard.js`
- Modify: `server/routes/branches.js`

All four files have the same pattern: they join `tenant_users` to get `full_name` for `processed_by` or staff listings.

- [ ] **Step 1: Update `transactions.js` (lines ~17 and ~126)**

Replace `tenant_users!transactions_processed_by_fkey(full_name)` in both GET / and GET /:id selects.

Since `processed_by` now references `auth.users`, resolve names separately:

```javascript
// After fetching transactions:
const processorIds = [...new Set(transactions.map(t => t.processed_by).filter(Boolean))];
const { data: owners } = await supabaseAdmin.from('tenant_owners')
  .select('id, full_name').in('id', processorIds);
const { data: emps } = await supabaseAdmin.from('employees')
  .select('id, full_name').in('id', processorIds);

const nameMap = {};
(owners || []).forEach(o => nameMap[o.id] = o.full_name);
(emps || []).forEach(e => nameMap[e.id] = e.full_name);

transactions.forEach(t => {
  t.processed_by_name = nameMap[t.processed_by] || 'System';
});
```

- [ ] **Step 2: Update `renewals.js` (line ~32-33)**

Same pattern as transactions.js — remove `tenant_users!transactions_processed_by_fkey(full_name)` from select, resolve names separately.

- [ ] **Step 3: Update `dashboard.js` (line ~77)**

Replace `tenant_users!inner(full_name)` join on recent activities. After fetching recent transactions, resolve `processed_by` names using the same lookup pattern.

- [ ] **Step 4: Update `branches.js` (line ~23)**

Replace:
```javascript
.select('*, tenant_users(id, full_name, role, is_active)')
```
With:
```javascript
.select('*')
```

Then fetch branch staff from `employees`:
```javascript
const { data: staff } = await supabaseAdmin
  .from('employees')
  .select('id, full_name, role, is_active')
  .eq('branch_id', req.params.id)
  .eq('tenant_id', req.tenantId)
  .is('deleted_at', null);

branch.employees = staff || [];
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/transactions.js server/routes/renewals.js server/routes/dashboard.js server/routes/branches.js
git commit -m "refactor: replace tenant_users joins in transactions, renewals, dashboard, branches"
```

---

### Task 9: Update routes with `item_images` joins

**Files:**
- Modify: `server/routes/dispositions.js`
- Modify: `server/routes/auctions.js`
- Modify: `server/routes/customerLoans.js`
- Modify: `server/routes/customerItems.js`
- Modify: `server/routes/customerAuctions.js`

All five files join `item_images(*)` through `pawn_items`. Replace with separate `media` queries.

- [ ] **Step 1: Update `dispositions.js` (line ~41)**

Remove `item_images(*)` from select. After fetching items, attach photos from media:

```javascript
const itemIds = items.map(i => i.id);
const { data: photos } = await supabaseAdmin.from('media')
  .select('*').eq('ref_type', 'ITEM_PHOTO').in('ref_id', itemIds).is('deleted_at', null);
items.forEach(item => {
  item.item_images = (photos || []).filter(p => p.ref_id === item.id);
});
```

- [ ] **Step 2: Update `auctions.js` (lines ~13 and ~37)**

Same pattern — remove `item_images(*)` from nested select inside `auction_lots(*, pawn_items(*, item_images(*)))`. After fetching, collect all `pawn_items` IDs from the lots and fetch media.

- [ ] **Step 3: Update `customerLoans.js` (lines ~10 and ~21)**

Remove `item_images(image_url, is_primary)` from select. Fetch media separately and attach to each loan's pawn_items.

- [ ] **Step 4: Update `customerItems.js` (lines ~10 and ~19)**

Remove `item_images(*)` from select. Fetch from media and attach.

- [ ] **Step 5: Update `customerAuctions.js` (lines ~24 and ~66)**

Remove `item_images(image_url, is_primary)` from nested selects. Fetch from media and attach.

- [ ] **Step 6: Commit**

```bash
git add server/routes/dispositions.js server/routes/auctions.js server/routes/customerLoans.js server/routes/customerItems.js server/routes/customerAuctions.js
git commit -m "refactor: replace item_images joins with media queries in 5 route files"
```

---

### Task 10: Update `server/routes/tenants.js`

**Files:**
- Modify: `server/routes/tenants.js`

This super-admin route has the most `tenant_users` references (6 locations).

- [ ] **Step 1: Update GET / (list tenants, ~lines 114-121)**

Replace:
```javascript
const { data: owner } = await supabaseAdmin
  .from('tenant_users')
  .select('full_name')
  .eq('tenant_id', t.id)
  .eq('role', 'OWNER')
  .single();
```
With:
```javascript
const { data: owner } = await supabaseAdmin
  .from('tenant_owners')
  .select('full_name')
  .eq('tenant_id', t.id)
  .single();
```

- [ ] **Step 2: Update GET /:id (tenant detail, ~lines 194-207)**

Replace the owner lookup to use `tenant_owners`. Replace the employee count to use `employees` table.

- [ ] **Step 3: Update POST /:id/block (~lines 293-297)**

Replace:
```javascript
.from('tenant_users')
.update({ is_active: false, updated_at: ... })
.eq('tenant_id', id)
```
With two updates:
```javascript
await supabaseAdmin.from('tenant_owners')
  .update({ is_active: false, updated_at: new Date().toISOString() })
  .eq('tenant_id', id);
await supabaseAdmin.from('employees')
  .update({ is_active: false, updated_at: new Date().toISOString() })
  .eq('tenant_id', id);
```

- [ ] **Step 4: Update POST /:id/reactivate (~lines 352-356)**

Same pattern as block — update both `tenant_owners` and `employees`.

- [ ] **Step 5: Update GET /:id/users (~lines 441-446)**

Replace the single `tenant_users` query with a combined result:
```javascript
const { data: owner } = await supabaseAdmin.from('tenant_owners')
  .select('id, full_name, is_active, branch_id, branches(branch_name), created_at')
  .eq('tenant_id', id)
  .is('deleted_at', null)
  .single();

const { data: employees } = await supabaseAdmin.from('employees')
  .select('id, full_name, role, is_active, branch_id, branches(branch_name), created_at')
  .eq('tenant_id', id)
  .is('deleted_at', null);

const users = [];
if (owner) users.push({ ...owner, role: 'OWNER' });
if (employees) users.push(...employees);
```

- [ ] **Step 6: Commit**

```bash
git add server/routes/tenants.js
git commit -m "refactor: tenants route uses tenant_owners + employees tables"
```

---

## Chunk 4: Frontend Updates

### Task 11: Update Frontend Auth (AuthContext + LoginPage)

**Files:**
- Modify: `src/context/AuthContext.jsx`
- Modify: `src/pages/auth/LoginPage.jsx`

- [ ] **Step 1: Update AuthContext.jsx (~lines 14-18)**

Replace:
```javascript
const { data, error } = await supabase
  .from('tenant_users')
  .select('*, tenants(*), branches(*)')
  .eq('id', userId)
  .single()
```
With:
```javascript
// Try tenant_owners first
let data, error;
const ownerResult = await supabase
  .from('tenant_owners')
  .select('*, tenants(*), branches(*)')
  .eq('id', userId)
  .single();

if (ownerResult.data) {
  data = { ...ownerResult.data, role: 'OWNER' };
  error = null;
} else {
  const empResult = await supabase
    .from('employees')
    .select('*, tenants(*), branches(*)')
    .eq('id', userId)
    .single();
  data = empResult.data;
  error = empResult.error;
}
```

- [ ] **Step 2: Update LoginPage.jsx (~lines 24-28)**

Replace:
```javascript
const { data: prof } = await supabase
  .from('tenant_users')
  .select('role')
  .eq('id', data.user.id)
  .single()
```
With:
```javascript
let prof;
const { data: ownerProf } = await supabase
  .from('tenant_owners')
  .select('id')
  .eq('id', data.user.id)
  .single();

if (ownerProf) {
  prof = { role: 'OWNER' };
} else {
  const { data: empProf } = await supabase
    .from('employees')
    .select('role')
    .eq('id', data.user.id)
    .single();
  prof = empProf;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/context/AuthContext.jsx src/pages/auth/LoginPage.jsx
git commit -m "refactor: frontend auth uses tenant_owners + employees tables"
```

---

### Task 12: Update Frontend Customer & Employee Pages

**Files:**
- Modify: `src/pages/owner/CustomerProfile.jsx`
- Modify: `src/pages/owner/Customers.jsx`
- Modify: `src/pages/owner/AddEmployee.jsx`

- [ ] **Step 1: Update CustomerProfile.jsx (~lines 211-232)**

The KYC documents section currently iterates `customer.kyc_documents`. After the backend changes (Task 5), the API will still return `kyc_documents` as a mapped array from the media table. So the frontend code may not need changes **if** the backend maps the media response to match the old shape.

Verify the backend response shape. If the backend returns media records directly, update the template:

```javascript
{customer.kyc_documents && customer.kyc_documents.length > 0 && (
  <SectionCard title="KYC Documents" icon="verified_user">
    <div className="space-y-4">
      {customer.kyc_documents.map((doc, i) => (
        <div key={doc.id || i} className="flex items-center gap-4 p-3 rounded-lg bg-neutral-50...">
          <div className="w-10 h-10 rounded-lg bg-neutral-200...">
            <span className="material-symbols-outlined text-lg text-neutral-500...">id_card</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-800...">{doc.metadata?.id_type || doc.id_type}</p>
            <p className="text-xs text-neutral-400...">{doc.metadata?.id_number || doc.id_number}</p>
          </div>
          {(doc.metadata?.expiry_date || doc.expiry_date) && (
            <span className="text-xs text-neutral-400...">
              Exp: {new Date(doc.metadata?.expiry_date || doc.expiry_date).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      ))}
    </div>
  </SectionCard>
)}
```

- [ ] **Step 2: Verify `Customers.jsx` (no change needed)**

The `kyc_documents` field in the create-customer payload (~line 149) is consumed by the backend, which now routes it to the `media` table (Task 5). The frontend payload shape stays the same — no code change required.

- [ ] **Step 3: Verify `AddEmployee.jsx` (no change needed)**

The `i9_document_url` field in the create-employee payload (~line 355) is consumed by the backend, which now routes it to the `media` table (Task 4). The frontend payload shape stays the same — no code change required.

- [ ] **Step 4: Commit**

```bash
git add src/pages/owner/CustomerProfile.jsx
git commit -m "refactor: CustomerProfile reads KYC data from media-backed response"
```

---

### Task 13: Update Frontend Auction/Item Pages + API

**Files:**
- Modify: `src/pages/owner/AuctionItems.jsx`
- Modify: `src/lib/api.js`

- [ ] **Step 1: Update AuctionItems.jsx (~line 30)**

The code accesses `lot.pawn_items?.item_images?.[0]?.image_url`. After backend changes (Task 9), the backend will attach `item_images` from the media table with the same shape. Verify this works. If the backend returns media records directly:

```javascript
// May need to update if field name changes:
const imageUrl = lot.pawn_items?.item_images?.[0]?.image_url;
```

> This should work as-is since the backend attaches `item_images` from the media query using the same property name.

- [ ] **Step 2: Verify `api.js` (no change needed for now)**

All media operations flow through the parent entity routes (customers, employees, pawnItems). A dedicated `mediaApi` module can be added later if direct media CRUD from the frontend is needed.

- [ ] **Step 3: Commit**

```bash
git add src/pages/owner/AuctionItems.jsx src/lib/api.js
git commit -m "refactor: update frontend for media table, add mediaApi module"
```

---

### Task 14: Update Test Files

**Files:**
- Modify: `server/__tests__/helpers/auth.js`
- Modify: `server/__tests__/employees.hardening.test.js`
- Modify: `server/__tests__/customers.hardening.test.js`
- Modify: `server/__tests__/tenant-isolation.test.js`

- [ ] **Step 1: Update test helper auth.js (~line 20)**

Replace `tenant_users` mock with `tenant_owners` / `employees` mock. Check the mock setup and update the table name.

- [ ] **Step 2: Update employees.hardening.test.js**

Global replace `tenant_users` → `employees` in all mock implementations and assertions.

- [ ] **Step 3: Update customers.hardening.test.js**

Replace `kyc_documents` references with `media` in mock data and assertions. Update expected response shapes.

- [ ] **Step 4: Update tenant-isolation.test.js**

Update RLS policy comments and table references from `tenant_users` to `tenant_owners` / `employees`.

- [ ] **Step 5: Run tests to verify**

```bash
cd server && npm test
```

Fix any failures.

- [ ] **Step 6: Commit**

```bash
git add server/__tests__/
git commit -m "refactor: update test files for new schema (employees, media)"
```

---

## Final Verification

### Task 15: End-to-End Smoke Test

- [ ] **Step 1: Start the backend server**

```bash
cd server && npm run dev
```

Verify no startup errors.

- [ ] **Step 2: Start the frontend**

```bash
npm run dev
```

- [ ] **Step 3: Test the critical flows**

1. Register a new owner account → verify `tenant_owners` record created
2. Login as owner → verify dashboard loads, role shows as OWNER
3. Add an employee → verify `employees` record created
4. Add a customer with KYC → verify `media` records created with `ref_type = 'CUSTOMER_KYC'`
5. Submit an appraisal with item photos → verify `media` records with `ref_type = 'ITEM_PHOTO'`
6. View customer profile → verify KYC documents display correctly
7. View auction items → verify item photos display correctly

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: schema revision complete - tenant_owners, employees, media tables"
```
