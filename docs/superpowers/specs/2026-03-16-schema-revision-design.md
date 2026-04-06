# Schema Revision: Conservative Cleanup

> **Date:** 2026-03-16
> **Approach:** A (Conservative cleanup)
> **Scope:** Drop entire database and recreate with revised schema

---

## Summary

Four structural changes to the database schema:

1. **Split `tenant_users`** into `tenant_owners` (one per tenant) and `employees` (all staff)
2. **Merge `kyc_documents` + `item_images`** into a single universal `media` table for ImageKit URLs
3. **Clean up `customers`** by removing duplicate address columns
4. **Add `ON DELETE CASCADE`** on all tenant-scoped child foreign keys

---

## Tables REMOVED

| Table | Reason |
|-------|--------|
| `tenant_users` | Split into `tenant_owners` + `employees` |
| `kyc_documents` | Merged into `media` table (KYC metadata in JSONB) |
| `item_images` | Merged into `media` table |

---

## Tables ADDED

### `tenant_owners`

One record per tenant. The user who registered the business.

```sql
CREATE TABLE public.tenant_owners (
  id uuid NOT NULL,                          -- = auth.users.id
  tenant_id uuid NOT NULL UNIQUE,            -- enforces 1 owner per tenant
  full_name character varying NOT NULL,
  email character varying NOT NULL,
  branch_id uuid,                            -- default branch for owner context
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

> **Middleware note:** When a user is found in `tenant_owners`, the middleware must synthesize `role = 'OWNER'` for `req.userRole`. The `branch_id` maps to `req.branchId` for default branch context. The `is_active` flag is checked for access control (403 if false). The `deleted_at` column supports soft-delete filtering consistent with `employees`.

### `employees`

All non-owner staff (ADMIN, MANAGER, AUDITOR, APPRAISER, CASHIER). FK to `tenants`.

```sql
CREATE TABLE public.employees (
  id uuid NOT NULL,                          -- = auth.users.id
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

> `i9_document_url` removed from this table. Stored in `media` with `ref_type = 'EMPLOYEE_I9'`.
> The `OWNER` role is never stored in this table — it exists implicitly via the `tenant_owners` table.

### `media`

Universal image/document storage for all ImageKit URLs.

```sql
CREATE TABLE public.media (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ref_type character varying NOT NULL
    CHECK (ref_type IN ('CUSTOMER_KYC', 'ITEM_PHOTO', 'EMPLOYEE_I9', 'AVATAR')),
  ref_id uuid NOT NULL,
  image_url text NOT NULL,                   -- ImageKit path/URL
  label character varying,                   -- 'front', 'back', 'primary', 'signature'
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb,                            -- KYC: {id_type, id_number, expiry_date}
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

> `ref_id` is intentionally NOT a DB-level FK (polymorphic pattern). Orphan cleanup is handled via database triggers (see Media Cleanup Triggers section below).

#### Media metadata examples

**CUSTOMER_KYC:**
```json
{
  "id_type": "PhilSys National ID",
  "id_number": "PSN-1234-5678-9012",
  "expiry_date": "2030-01-15"
}
```

**ITEM_PHOTO:** No metadata needed (just `is_primary` + `label`).

**EMPLOYEE_I9:** No metadata needed (just the file URL).

**AVATAR:** No metadata needed.

#### Media cleanup triggers

Since `media.ref_id` is polymorphic (no DB-level FK), orphan media rows must be cleaned up via triggers. The app uses **soft deletes** (`deleted_at` timestamp), so triggers fire on UPDATE when `deleted_at` transitions from NULL to non-NULL. A secondary `AFTER DELETE` trigger handles hard deletes from CASCADE operations.

```sql
-- Generic media cleanup function (reusable for soft-delete + hard-delete)
CREATE OR REPLACE FUNCTION soft_delete_media(p_ref_type text, p_ref_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.media SET deleted_at = now()
  WHERE ref_type = p_ref_type AND ref_id = p_ref_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ── Customers ──────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_customer_media()
RETURNS TRIGGER AS $$
BEGIN
  -- Soft delete: deleted_at transitioned from NULL to non-NULL
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM soft_delete_media('CUSTOMER_KYC', NEW.id);
    RETURN NEW;
  END IF;
  -- Hard delete (cascade)
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

-- ── Pawn Items ─────────────────────────────────
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

-- ── Employees ──────────────────────────────────
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

-- ── Tenant Owners (AVATAR cleanup) ────────────
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

#### Querying media (replaces PostgREST joins)

Since `item_images` and `kyc_documents` are removed, Supabase PostgREST automatic joins like `pawn_items(*, item_images(*))` will no longer work. Instead, fetch media in a separate query:

```javascript
// Old: const { data } = await supabase.from('pawn_items').select('*, item_images(*)');
// New:
const { data: items } = await supabase.from('pawn_items').select('*');
const { data: photos } = await supabase.from('media')
  .select('*')
  .eq('ref_type', 'ITEM_PHOTO')
  .in('ref_id', items.map(i => i.id));
```

---

## Tables MODIFIED

### `customers` — remove duplicate columns

**Columns REMOVED:**

| Column | Reason |
|--------|--------|
| `auth_id` | Redundant with `auth_uid` |
| `address_line1` | Duplicate of `present_address_line1` |
| `address_line2` | Duplicate of `present_address_line2` |
| `province` | Duplicate of `present_province` |
| `city` | Duplicate of `present_city` |
| `barangay` | Duplicate of `present_barangay` |
| `zip_code` | Duplicate of `present_zip_code` |

**Final `customers` table:**

```sql
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  auth_uid uuid,
  first_name character varying NOT NULL,
  middle_name character varying,
  last_name character varying NOT NULL,
  date_of_birth date NOT NULL,
  nationality character varying NOT NULL,
  mobile_number character varying NOT NULL,
  email character varying,
  employment_nature character varying NOT NULL,
  risk_rating character varying NOT NULL DEFAULT 'LOW'
    CHECK (risk_rating IN ('LOW', 'MEDIUM', 'HIGH')),
  present_address text NOT NULL,
  present_address_line1 text,
  present_address_line2 text,
  present_province_code character varying,
  present_province character varying,
  present_city_code character varying,
  present_city character varying,
  present_barangay character varying,
  present_zip_code character varying
    CHECK (present_zip_code IS NULL OR present_zip_code ~ '^[0-9]{4}$'),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone,

  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT customers_auth_uid_fkey FOREIGN KEY (auth_uid)
    REFERENCES auth.users(id) ON DELETE SET NULL
);
```

### `pawn_tickets` — FK target change

```
appraiser_id FK → auth.users(id)  (was tenant_users)
```

> Changed to `auth.users(id)` instead of `employees(id)` because OWNERs can also approve appraisals, and their ID exists in `tenant_owners`, not `employees`.

### `transactions` — FK target change

```
processed_by FK → auth.users(id)  (was tenant_users)
```

> Changed to `auth.users(id)` instead of `employees(id)` because OWNERs can also process transactions.

---

## Tables UNCHANGED

| Table | Notes |
|-------|-------|
| `tenants` | Root table, no changes |
| `branches` | No changes |
| `pawn_items` | No changes (images now queried from `media` separately) |
| `auctions` | No changes |
| `auction_lots` | No changes |
| `auction_reservations` | No changes |
| `notices_log` | No changes |
| `tenant_loan_settings` | No changes |
| `gold_rates` | No changes |
| `subscriptions` | No changes |
| `super_admins` | No changes |
| `platform_audit_logs` | No changes |
| `customer_notifications` | No changes |
| `customer_payment_intents` | No changes |
| `customer_push_tokens` | No changes |

---

## CASCADE Policies

All child FKs use `ON DELETE CASCADE` from their tenant parent:

```
tenants
 ├── tenant_owners (CASCADE)
 ├── employees (CASCADE)
 ├── branches (CASCADE)
 ├── customers (CASCADE)
 ├── pawn_items (CASCADE)
 ├── pawn_tickets (CASCADE)
 ├── transactions (CASCADE)
 ├── auctions (CASCADE)
 ├── auction_lots (CASCADE)
 ├── auction_reservations (CASCADE)
 ├── notices_log (CASCADE)
 ├── tenant_loan_settings (CASCADE)
 ├── gold_rates (CASCADE)
 ├── subscriptions (CASCADE)
 ├── media (CASCADE)
 ├── customer_notifications (CASCADE)
 ├── customer_payment_intents (CASCADE)
 └── customer_push_tokens (CASCADE)

customers
 ├── pawn_items (CASCADE)
 ├── pawn_tickets (CASCADE)
 ├── auction_lots.buyer_id (SET NULL)
 ├── auction_reservations (CASCADE)
 ├── customer_notifications (CASCADE)
 ├── customer_payment_intents (CASCADE)
 └── customer_push_tokens (CASCADE)
 └── media (via trigger — soft-deletes matching CUSTOMER_KYC rows)

pawn_items
 ├── pawn_tickets (CASCADE)
 ├── auction_lots (CASCADE)
 └── media (via trigger — soft-deletes matching ITEM_PHOTO rows)

pawn_tickets
 ├── transactions (CASCADE)
 ├── notices_log (CASCADE)
 └── customer_payment_intents (CASCADE)

auctions
 └── auction_lots (CASCADE)

auction_lots
 └── auction_reservations (CASCADE)

employees
 └── media (via trigger — soft-deletes matching EMPLOYEE_I9 rows)

tenant_owners
 └── media (via trigger — soft-deletes matching AVATAR rows)

branches
 ├── employees.branch_id (SET NULL)
 └── tenant_owners.branch_id (SET NULL)
```

---

## Entity Relationship Diagram (Revised)

```
Tenants (root)
 ├── Tenant_Owners ←→ auth.users (1:1 per tenant, role synthesized as 'OWNER')
 ├── Employees ←→ auth.users (staff, FK to tenant)
 ├── Branches
 ├── Subscriptions
 ├── Customers ←→ auth.users (optional, for mobile app)
 │   ├── Customer_Notifications
 │   ├── Customer_Payment_Intents → pawn_tickets
 │   └── Customer_Push_Tokens
 ├── Pawn_Items → customer, branch
 ├── Pawn_Tickets → customer, item, appraiser(auth.users)
 │   ├── Transactions → processed_by(auth.users)
 │   └── Notices_Log
 ├── Auctions
 │   └── Auction_Lots → item, buyer(customer)
 │       └── Auction_Reservations → customer
 ├── Tenant_Loan_Settings
 ├── Gold_Rates
 ├── Media (universal: KYC docs, item photos, employee docs, avatars)
 └── (Super_Admins + Platform_Audit_Logs are platform-level, not tenant-scoped)
```

---

## Migration Notes

Since this is a full drop-and-recreate:

1. Drop all existing tables
2. Create tables in dependency order: `tenants` → `branches` → `tenant_owners` → `employees` → `customers` → `pawn_items` → `pawn_tickets` → `transactions` → etc.
3. Create the `media` table
4. Create media cleanup triggers
5. Apply RLS policies (existing policies adapted for new table names)
6. Recreate all RPCs (`register_owner` must be updated to insert into `tenant_owners` instead of `tenant_users`)

### RPCs that need updates

| RPC | Change |
|-----|--------|
| `register_owner` | Insert into `tenant_owners` instead of `tenant_users` |
| `process_loan_renewal` | Reference `employees` instead of `tenant_users` |
| `process_payment` | Reference `employees` instead of `tenant_users` |
| `check_overdue_loans` | No change (doesn't reference user tables) |
| `auto_expire_by_grace_period` | No change |
| `approve_item_disposition` | Reference `employees` if it checks user role |
| `calculate_appraisal` | No change (read-only) |
| `save_tenant_loan_settings` | No change |
| `save_gold_rate` | No change |
| `seed_tenant_defaults` | No change |
| `count_pending_appraisals` | No change |

### Backend route files that need updates

| File | Change |
|------|--------|
| `server/middleware/tenantScope.js` | Query `tenant_owners` first (synthesize role='OWNER'), fallback to `employees`. Check `is_active` and `deleted_at` on both tables. |
| `server/routes/auth.js` | Registration inserts into `tenant_owners` |
| `server/routes/employees.js` | CRUD against `employees` table |
| `server/routes/customers.js` | Remove KYC insert into `kyc_documents`, insert into `media` instead |
| `server/routes/pawnItems.js` | Remove `item_images` insert, insert into `media` instead |
| `server/routes/appraisals.js` | FK references to `auth.users` for appraiser_id |
| `server/routes/transactions.js` | Join on `employees` or `tenant_owners` instead of `tenant_users` for `processed_by` display name |
| `server/routes/renewals.js` | Same join change for `processed_by` display name |
| `server/routes/dashboard.js` | Replace `tenant_users!inner(full_name)` join |
| `server/routes/branches.js` | Replace `tenant_users(id, full_name, role, is_active)` with `employees` |
| `server/routes/tenants.js` | All queries against `tenant_users` must be split to query both `tenant_owners` and `employees` |
| `server/routes/dispositions.js` | Replace `item_images(*)` join with `media` query |
| `server/routes/auctions.js` | Replace `item_images(*)` join with `media` query |
| `server/routes/customerLoans.js` | Replace `item_images(image_url, is_primary)` join with `media` query |
| `server/routes/customerItems.js` | Replace `item_images(*)` join with `media` query |
| `server/routes/customerAuctions.js` | Replace `item_images(image_url, is_primary)` join with `media` query |
| `server/routes/pawnTickets.js` | Replace `tenant_users` join for appraiser name, replace `kyc_documents(*)` and `item_images(*)` joins with `media` queries |
| `server/__tests__/helpers/auth.js` | Update mock to use `tenant_owners` / `employees` |
| `server/__tests__/employees.hardening.test.js` | Replace `tenant_users` references with `employees` |
| `server/__tests__/customers.hardening.test.js` | Replace `kyc_documents` references with `media` |
| `server/__tests__/tenant-isolation.test.js` | Update RLS policy references from `tenant_users` |

### Frontend files that need updates

| File | Change |
|------|--------|
| `src/context/AuthContext.jsx` | Replace `tenant_users` query with check against both `tenant_owners` and `employees` tables |
| `src/pages/auth/LoginPage.jsx` | Replace `tenant_users` query |
| `src/pages/owner/Customers.jsx` | Send KYC data as `media` entries |
| `src/pages/owner/AddCustomer.jsx` | No structural change (form stays same) |
| `src/pages/owner/AddEmployee.jsx` | I-9 upload stored via media API |
| `src/pages/owner/CustomerProfile.jsx` | Replace `customer.kyc_documents` references with media queries |
| `src/pages/owner/AuctionItems.jsx` | Replace `item_images` references with media queries |
| `src/lib/api.js` | Add `mediaApi` module for media CRUD operations |
