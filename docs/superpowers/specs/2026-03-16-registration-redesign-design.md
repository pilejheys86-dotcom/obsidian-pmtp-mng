# Registration Flow Redesign

> **Date:** 2026-03-16
> **Approach:** A (Expand `register_owner` RPC)
> **Scope:** Redesign Step 2, add Step 3, update RPC + tenants table

---

## Summary

Redesign the pawnshop owner registration from a 2-step flow to a 3-step flow that captures all information needed for a BSP-licensed pawnshop to operate. The first branch is auto-created from the business address.

---

## Registration Flow

### Step 1: Account (no changes)

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| Full Name | text | min 2 chars | Yes |
| Email | email | valid email | Yes |
| Password | password | min 6 chars | Yes |
| Confirm Password | password | must match password | Yes |

### Step 2: Business Identity (redesigned)

| Field | Type | Icon | Placeholder | Validation | Required |
|-------|------|------|-------------|------------|----------|
| Business Name | text | `store` | "Reyes Pawnshop Inc." | min 2 chars | Yes |
| Business Type | select | `business` | "Select business type" | must select one | Yes |
| SEC/DTI Registration No. | text | `badge` | "SEC-2024-XXXXX" | non-empty | Yes |
| BSP Registration No. | text | `verified` | "BSP-2024-XXXXX" | non-empty | Yes |
| TIN Number | text | `receipt_long` | "000-000-000-000" | format: XXX-XXX-XXX-XXX | Yes |

> Note: The existing `bsp_registration_no` column (NOT NULL, UNIQUE) is reused. The "BSP Certificate of Authority No." field from the initial design is merged into this — they represent the same BSP license identifier. No new `bsp_certificate_no` column is needed.

**Business Type options:**
- `SOLE_PROPRIETOR` — "Sole Proprietor"
- `CORPORATION` — "Corporation"
- `COOPERATIVE` — "Cooperative"

### Step 3: Contact & Address (new)

| Field | Type | Icon | Placeholder | Validation | Required |
|-------|------|------|-------------|------------|----------|
| Business Phone | tel | `phone` | "+63 917 123 4567" | non-empty | Yes |
| Business Email | email | `mail` | "info@reyespawnshop.com" | valid email | Yes |
| Street Address | text | `home` | "123 Rizal St." | non-empty | Yes |
| Barangay | text | `location_on` | "Brgy. San Antonio" | non-empty | Yes |
| City / Municipality | text | `location_city` | "Manila" | non-empty | Yes |
| Province | text | `map` | "Metro Manila" | non-empty | Yes |
| Zip Code | text | `pin_drop` | "1000" | 4-digit numeric | Yes |

**Terms & conditions checkbox** is on this step.

---

## Step Indicator

```
Step 1          Step 2          Step 3
Account ──── Business ──── Contact & Address
```

- Completed steps show a green checkmark
- Current step shows lime-green accent
- Future steps are dimmed

---

## Navigation

| Step | Left Button | Right Button |
|------|-------------|-------------|
| 1 | (none) | "Continue →" |
| 2 | "← Back" | "Continue →" |
| 3 | "← Back" | "Create Account" (submit) |

---

## Data Flow

1. All 3 steps collect into one `formData` state object in `RegisterPage.jsx`
2. On Step 3 submit, calls `signup(formData)` from `AuthContext`
3. `AuthContext.signup()` calls `supabase.auth.signUp()` then `supabase.rpc('register_owner', {...})`
4. The RPC creates tenant + branch + owner in one atomic transaction
5. On success, redirect to `/login` with success message

---

## Database Changes

### New columns on `tenants` table

```sql
ALTER TABLE public.tenants
  ADD COLUMN business_type varchar NOT NULL DEFAULT 'SOLE_PROPRIETOR'
    CHECK (business_type IN ('SOLE_PROPRIETOR', 'CORPORATION', 'COOPERATIVE')),
  ADD COLUMN sec_dti_registration_no varchar,
  ADD COLUMN business_phone varchar,
  ADD COLUMN business_email varchar,
  ADD COLUMN street_address text,
  ADD COLUMN barangay varchar,
  ADD COLUMN province varchar,
  ADD COLUMN zip_code varchar CHECK (zip_code IS NULL OR zip_code ~ '^[0-9]{4}$');
```

> Columns nullable for migration compatibility with existing rows. All new registrations will always provide these values.
> `contact_email` (existing) = owner's login email. `business_email` (new) = customer-facing email for receipts/notices.
> `city_municipality` already exists on the `tenants` table — no ALTER needed.
> `bsp_registration_no` already exists (NOT NULL, UNIQUE) — reused for BSP Certificate of Authority. No new column needed.

### Updated `register_owner` RPC

**New parameters added:**

| Parameter | Type |
|-----------|------|
| `p_business_type` | text |
| `p_sec_dti_registration_no` | text |
| `p_business_phone` | text |
| `p_business_email` | text |
| `p_street_address` | text |
| `p_barangay` | text |
| `p_province` | text |
| `p_zip_code` | text |

**Parameters kept (already exist):**
- `p_city_municipality`
- `p_bsp_registration_no`
- `p_tin_number`

**Parameters removed from RPC:**
- `p_branch_name` — auto-set to 'Main Branch'
- `p_branch_code` — auto-set to 'BR-001'
- `p_address` — derived from structured address fields

**RPC changes:**

1. `INSERT INTO tenants` — include all new columns
2. `INSERT INTO branches` — auto-create with:
   - `branch_name = 'Main Branch'`
   - `branch_code = 'BR-001'`
   - `address = p_street_address || ', Brgy. ' || p_barangay || ', ' || p_city_municipality || ', ' || p_province`
   - `city_municipality = p_city_municipality`
3. `INSERT INTO tenant_owners` — unchanged
4. **Call `seed_tenant_defaults`** inside the RPC to initialize default loan settings and gold rates

### Full revised RPC

```sql
CREATE OR REPLACE FUNCTION public.register_owner(
  p_user_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_business_name TEXT,
  p_business_type TEXT,
  p_bsp_registration_no TEXT,
  p_sec_dti_registration_no TEXT,
  p_tin_number TEXT,
  p_business_phone TEXT,
  p_business_email TEXT,
  p_street_address TEXT,
  p_barangay TEXT,
  p_city_municipality TEXT,
  p_province TEXT,
  p_zip_code TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_branch_id UUID;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO tenants (
    business_name, business_type, bsp_registration_no,
    sec_dti_registration_no, tin_number,
    business_phone, business_email, contact_email,
    street_address, barangay, city_municipality, province, zip_code,
    status
  )
  VALUES (
    p_business_name, p_business_type, p_bsp_registration_no,
    p_sec_dti_registration_no, p_tin_number,
    p_business_phone, p_business_email, p_email,
    p_street_address, p_barangay, p_city_municipality, p_province, p_zip_code,
    'ACTIVE'
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO branches (
    tenant_id, branch_code, branch_name, address, city_municipality
  )
  VALUES (
    v_tenant_id, 'BR-001', 'Main Branch',
    p_street_address || ', Brgy. ' || p_barangay || ', ' || p_city_municipality || ', ' || p_province,
    p_city_municipality
  )
  RETURNING id INTO v_branch_id;

  INSERT INTO tenant_owners (id, tenant_id, branch_id, full_name, email)
  VALUES (p_user_id, v_tenant_id, v_branch_id, p_full_name, p_email);

  -- Seed default loan settings and gold rates for the new tenant
  PERFORM seed_tenant_defaults(v_tenant_id);
END;
$$;
```

> Note: `seed_tenant_defaults` is called inside the RPC so default loan settings and gold rates are created atomically with the tenant. This means the frontend path (`AuthContext.signup()`) no longer needs a separate call.

---

## Frontend File Changes

### `src/pages/auth/RegisterPage.jsx`

1. **formData state** — remove `branchName`, `branchCode`, `address`. Add: `businessType`, `secDtiRegNo`, `businessPhone`, `businessEmail`, `streetAddress`, `barangay`, `province`, `zipCode`. Keep `cityMunicipality` (moves from Step 2 to Step 3 UI). Keep `agreeTerms` (moves to Step 3).
2. **Step indicator** — update to 3 steps: Account → Business → Contact & Address
3. **Step 2 form** — replace current fields with Business Identity fields (Business Name, Business Type dropdown, SEC/DTI Reg No., BSP Registration No., TIN)
4. **Step 3 form** — new form with Contact & Address fields (phone, email, street, barangay, city, province, zip) + terms checkbox
5. **Step 2 validation** (`handleStep2Next`) — all fields required, `businessType` must be one of the 3 valid values, TIN format `XXX-XXX-XXX-XXX`
6. **Step 3 validation** (`handleSubmit`) — all fields required, zip code 4 digits, business email valid format
7. **handleSubmit** — on Step 3, sends all data via `signup(formData)`

### `src/context/AuthContext.jsx`

Update `signup()` function — remove `branchName`, `branchCode`, `address` destructuring. Add new fields. Updated RPC call:

```javascript
const { error: rpcError } = await supabase.rpc('register_owner', {
  p_user_id: data.user.id,
  p_full_name: fullName,
  p_email: email,
  p_business_name: businessName,
  p_business_type: businessType,
  p_bsp_registration_no: bspRegNo,
  p_sec_dti_registration_no: secDtiRegNo,
  p_tin_number: tinNumber,
  p_business_phone: businessPhone,
  p_business_email: businessEmail,
  p_street_address: streetAddress,
  p_barangay: barangay,
  p_city_municipality: cityMunicipality,
  p_province: province,
  p_zip_code: zipCode,
})
```

> `seed_tenant_defaults` is no longer called from `AuthContext` or `server/routes/auth.js` — it's handled inside the RPC itself.

### `server/routes/auth.js`

Update the backend registration route to match the new RPC signature. Remove `p_branch_name`, `p_branch_code`, `p_address` params. Add the new params. Remove the separate `seed_tenant_defaults` call (now inside the RPC).

### `src/components/ui/FormInput.jsx`

No changes needed. For the Business Type dropdown, use a native `<select>` styled inline in RegisterPage.

---

## Error Handling

### Auth user orphan cleanup

If the RPC fails after `supabase.auth.signUp()` succeeds, the auth user is orphaned. The frontend `AuthContext.signup()` should add cleanup:

```javascript
if (rpcError) {
  // Clean up the orphaned auth user
  await supabase.auth.signOut()
  throw rpcError
}
```

The backend route (`server/routes/auth.js`) already has `supabaseAdmin.auth.admin.deleteUser()` cleanup — this stays.

---

## What stays the same

- Login flow — unchanged
- Password recovery — unchanged
- Auth middleware — unchanged
- Tenant isolation — unchanged
- All other routes — unchanged
