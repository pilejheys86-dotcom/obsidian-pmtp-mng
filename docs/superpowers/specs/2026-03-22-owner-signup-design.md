# Pawnshop Owner Signup — Design Spec

> **Date:** 2026-03-22
> **Status:** Approved
> **Scope:** Owner signup flow, email OTP verification, post-login KYC gate, partial access control

---

## 1. Overview

A lightweight 3-step signup for pawnshop owners that collects only personal info and credentials. Business verification (KYC) is deferred to post-login, allowing owners to explore the platform immediately with partial access. Pawn operations are locked until KYC is submitted.

### Prerequisites

- The fresh database uses a single `tenant_users` table (not the old `tenant_owners` + `employees` split). Backend routes (`auth.js`, `tenantScope.js`, login, profile) must be updated to query `tenant_users` instead. This is part of implementation, not a separate migration.

---

## 2. Signup Flow (3 Steps)

### Step 1: Personal Info

| Field | Type | Validation |
|-------|------|------------|
| Full name | text | Required, min 2 chars |
| Email address | email | Required, valid email format, checked for uniqueness |
| Phone number | tel | Required, PH format `+639XXXXXXXXX` |

### Step 2: Credentials

| Field | Type | Validation |
|-------|------|------------|
| Password | password | Required, min 8 chars |
| Confirm password | password | Must match password |

### Step 3: Email OTP Verification

- 6-digit numeric OTP sent to the email from Step 1
- OTP expires after 5 minutes
- "Resend OTP" button with 60-second cooldown
- Max 3 resend attempts per session (enforced server-side)
- Max 5 failed verification attempts per OTP (server-side — invalidates OTP, requires resend)
- On successful verification:
  - Account is created (auth.users + tenant_users row with `kyc_status = 'PENDING'`)
  - If `tenant_users` INSERT fails, cleanup: delete the auth user
  - Email uniqueness re-checked at creation time (handles race condition between Step 1 and Step 3)
  - Success toast: "Account created! Redirecting to login..."
  - Redirect to `/login` after 2 seconds

### Signup API Flow

```
Frontend                    Backend                         Supabase
  |                           |                               |
  |-- POST /api/auth/signup-init (name, email, phone, password)
  |                           |-- Rate limit: 3/email/10min   |
  |                           |-- Check email not taken        |
  |                           |-- Generate 6-digit OTP        |
  |                           |-- Store OTP (in-memory, 5min) |
  |                           |-- Send OTP via email -------->|
  |                           |                               |
  |<-- { message: "OTP sent" }|                               |
  |                           |                               |
  |-- POST /api/auth/verify-signup-otp (email, otp)           |
  |                           |-- Verify OTP (max 5 attempts) |
  |                           |-- Re-check email uniqueness   |
  |                           |-- createUser() -------------->|
  |                           |-- Insert tenant_users ------->|
  |                           |-- On failure: deleteUser() -->|
  |                           |                               |
  |<-- { success: true }      |                               |
  |                           |                               |
  |-- Redirect to /login      |                               |
```

**Key design decisions:**
- Auth user + tenant_users created **only after OTP verification** — prevents orphaned accounts
- Rollback on partial failure: if tenant_users INSERT fails, auth user is deleted
- In-memory OTP is acceptable for MVP; production should migrate to Redis or a Supabase table

---

## 3. Post-Login KYC Gate

### 3a. First Login — Welcome Modal

On the **first login** after signup (detected by `kyc_status === 'PENDING'`):

- **Modal title:** "Welcome to Obsidian!"
- **Body:** "Complete your business verification to unlock pawn operations, customer management, and more."
- **Primary button:** "Complete Now" → navigates to KYC tab
- **Secondary button:** "Later" → dismisses modal, lands on dashboard
- Modal only shows **once per account** (tracked via `first_login_modal_shown` flag in user metadata or localStorage)

### 3b. Persistent Top Banner

Displayed on **every page** (below navbar, above content) until KYC is submitted:

- **Style:** Warning-level alert bar, full-width, not dismissible
- **Text:** "Your business verification is incomplete. Complete KYC to unlock all features."
- **CTA button:** "Complete KYC" → navigates to KYC tab
- **Disappears** when `kyc_status` changes from `PENDING` to `SUBMITTED` (or `APPROVED`)

### 3c. Sidebar Badge

- Red notification dot on the "KYC" or "Business Verification" nav item
- Removed once KYC is submitted

---

## 4. KYC Tab (2 Sections)

Located at: `/admin/kyc` or as a tab within Settings.

### Section A: Business Identity

| Field | Type | Validation |
|-------|------|------------|
| Business name | text | Required |
| Business type | select | Required: `SOLE_PROPRIETOR`, `CORPORATION`, `COOPERATIVE` |
| BSP Registration No. | text | Required |
| SEC/DTI Registration No. | text | Required |
| TIN Number | text | Required |

### Section B: Main Branch & Address

| Field | Type | Validation |
|-------|------|------------|
| Branch name | text | Required |
| Street address | text | Required |
| Province | select (PSGC) | Required, cascading dropdown |
| City/Municipality | select (PSGC) | Required, cascading from province |
| Barangay | select (PSGC) | Required, cascading from city |
| ZIP code | text | Required, 4-digit, auto-filled from city |
| Branch phone | tel | Optional, PH format |

### KYC Submission API Flow

```
Frontend                    Backend                         Supabase
  |                           |                               |
  |-- POST /api/auth/complete-kyc (business + branch data)    |
  |                           |-- RPC: complete_owner_kyc --->|
  |                           |    Creates tenants row        |
  |                           |    Creates branches row       |
  |                           |    Links tenant_users.tenant_id
  |                           |    Sets kyc_status = SUBMITTED|
  |                           |                               |
  |<-- { success, tenant_id } |                               |
  |                           |                               |
  |-- Refresh profile/session |                               |
  |-- Banner + badge disappear|                               |
```

---

## 5. Access Control (Partial)

Based on `kyc_status` of the logged-in owner:

| Feature | Before KYC (`PENDING`) | After KYC (`SUBMITTED`/`APPROVED`) |
|---------|:----------------------:|:----------------------------------:|
| Dashboard (empty state) | Unlocked | Unlocked |
| Settings / Profile | Unlocked | Unlocked |
| KYC tab | Unlocked | Unlocked (read-only after submit) |
| Employee management | **Locked** (no tenant_id) | Unlocked |
| Branch management | **Locked** (no tenant_id) | Unlocked |
| Customers | **Locked** | Unlocked |
| Pawn tickets / Loans | **Locked** | Unlocked |
| Appraisals | **Locked** | Unlocked |
| Inventory | **Locked** | Unlocked |
| Transactions | **Locked** | Unlocked |
| Auctions | **Locked** | Unlocked |
| Reports | **Locked** | Unlocked |
| Notices | **Locked** | Unlocked |

**Locked behavior:** Clicking a locked nav item shows a tooltip or inline message: "Complete business verification to access this feature." Sidebar items are visually dimmed with a lock icon.

**Why Employee/Branch are locked:** These require `tenant_id` (FK constraint). Since the owner has no tenant until KYC is complete, creating employees or branches would fail at the database level.

---

## 6. Database Changes

### 6a. Schema migration (`sql/101_signup_kyc_flow.sql`)

```sql
-- Make tenant_id nullable (pre-KYC owners have no tenant yet)
ALTER TABLE tenant_users ALTER COLUMN tenant_id DROP NOT NULL;

-- Add KYC status tracking
ALTER TABLE tenant_users ADD COLUMN kyc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
-- Values: PENDING, SUBMITTED, APPROVED, REJECTED

-- Add business_type and sec_dti_registration_no to tenants
ALTER TABLE tenants ADD COLUMN business_type VARCHAR(50);
ALTER TABLE tenants ADD COLUMN sec_dti_registration_no VARCHAR(100);
```

### 6b. Modified `tenant_users` for signup

During signup (before KYC), the owner's `tenant_users` row is created with:
- `tenant_id = NULL` (no tenant yet)
- `branch_id = NULL` (no branch yet)
- `role = 'OWNER'`
- `kyc_status = 'PENDING'`

### 6c. RLS impact of nullable `tenant_id`

`get_my_tenant_id()` returns NULL for pre-KYC owners. Since `NULL = NULL` evaluates to FALSE in PostgreSQL, all tenant-scoped policies naturally deny access — which is correct behavior for pre-KYC users. The `tenant_users_select` policy still works because it has `id = auth.uid()` as a fallback, allowing owners to read their own row.

### 6d. Middleware handling for pre-KYC owners

The `tenantScope` middleware must be updated:
- If `tenant_id` is NULL and `kyc_status = 'PENDING'`, set `req.kycPending = true`
- Skip subscription check for pre-KYC owners
- Only allow whitelisted endpoints: `/api/auth/complete-kyc`, `/api/auth/kyc-status`, `/api/auth/profile`
- All other endpoints return `403 { error: "Complete KYC first", kycPending: true }`

### 6e. New RPC: `complete_owner_kyc`

```sql
CREATE OR REPLACE FUNCTION complete_owner_kyc(
    p_user_id                 UUID,
    p_business_name           TEXT,
    p_business_type           TEXT,
    p_bsp_registration_no     TEXT,
    p_sec_dti_registration_no TEXT,
    p_tin_number              TEXT,
    p_branch_name             TEXT,
    p_street_address          TEXT,
    p_province                TEXT,
    p_city_municipality       TEXT,
    p_barangay                TEXT,
    p_zip_code                TEXT,
    p_branch_phone            TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_tenant_id UUID;
    v_branch_id UUID;
    v_email     TEXT;
BEGIN
    -- Get owner's email
    SELECT work_email INTO v_email FROM tenant_users WHERE id = p_user_id;

    -- Create tenant
    INSERT INTO tenants (
        business_name, business_type, bsp_registration_no,
        sec_dti_registration_no, tin_number, contact_email, status
    ) VALUES (
        p_business_name, p_business_type, p_bsp_registration_no,
        p_sec_dti_registration_no, p_tin_number, v_email, 'ACTIVE'
    ) RETURNING id INTO v_tenant_id;

    -- Create main branch
    INSERT INTO branches (
        tenant_id, branch_code, branch_name, address,
        province, city_municipality, barangay, zip_code,
        phone, is_main_branch
    ) VALUES (
        v_tenant_id, 'MAIN', p_branch_name, p_street_address,
        p_province, p_city_municipality, p_barangay, p_zip_code,
        p_branch_phone, TRUE
    ) RETURNING id INTO v_branch_id;

    -- Link owner to tenant + branch, update KYC status
    UPDATE tenant_users
    SET tenant_id  = v_tenant_id,
        branch_id  = v_branch_id,
        kyc_status = 'SUBMITTED',
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success',   true,
        'tenant_id', v_tenant_id,
        'branch_id', v_branch_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6f. Old `register_owner` RPC

Replaced by the two-phase flow:
1. **Signup:** Backend directly does `createUser()` + `INSERT INTO tenant_users` (no RPC needed)
2. **KYC:** Backend calls `complete_owner_kyc` RPC

### 6g. MasterSchema.md update

After migration, update MasterSchema.md to reflect:
- `tenant_users.tenant_id` is nullable
- `tenant_users.kyc_status` column added
- `tenants.business_type` and `tenants.sec_dti_registration_no` columns added
- `complete_owner_kyc` RPC added
- Old `register_owner` RPC removed

---

## 7. Backend API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/signup-init` | None | Validate inputs, rate-limit (3/email/10min), generate & send OTP |
| POST | `/api/auth/verify-signup-otp` | None | Verify OTP (max 5 attempts), re-check email, create account with rollback |
| POST | `/api/auth/complete-kyc` | Bearer token | Submit business details, calls `complete_owner_kyc` RPC |
| GET | `/api/auth/kyc-status` | Bearer token | Returns `{ kyc_status, tenant_id }` |

### Login response changes

The `/api/auth/login` response must include `kyc_status` in the profile. For pre-KYC owners:

```json
{
  "session": { ... },
  "user": { ... },
  "profile": {
    "id": "uuid",
    "full_name": "Juan Dela Cruz",
    "role": "OWNER",
    "kyc_status": "PENDING",
    "tenant_id": null,
    "branch_id": null
  }
}
```

The frontend `AuthContext` must handle `profile.tenant_id === null` gracefully — do not attempt to fetch tenant data, subscriptions, or tenant-scoped resources.

---

## 8. Frontend Pages/Components

| Component | Path | Purpose |
|-----------|------|---------|
| `RegisterPage.jsx` | `/register` | 3-step signup (personal → credentials → OTP) |
| `LoginPage.jsx` | `/login` | Updated: reads `kyc_status` from profile, routes to dashboard |
| `WelcomeModal.jsx` | — | First-login modal prompting KYC (shows once via localStorage) |
| `KycBanner.jsx` | — | Persistent top banner for incomplete KYC, not dismissible |
| `KycPage.jsx` | `/admin/kyc` | Business identity + branch address form (2 sections) |
| `Sidebar.jsx` | — | Updated: lock icons + dim text for locked items, red badge on KYC |

---

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| Email already registered (Step 1) | "An account with this email already exists." |
| Email taken between Step 1–3 (race) | "This email was just registered. Please use a different email." |
| OTP expired | "Code expired. Click Resend to get a new code." |
| OTP wrong 5 times (server-side) | OTP invalidated. "Too many attempts. Click Resend to get a new code." |
| Resend limit exceeded (3/email/10min) | "Too many resend requests. Please wait a few minutes." |
| Account creation fails after auth user | Auth user deleted (rollback). "Registration failed. Please try again." |
| KYC submit with duplicate BSP No. | "This BSP Registration No. is already registered." |
| Network error during OTP | "Failed to send verification code. Please try again." |
| Pre-KYC owner hits locked endpoint | `403 { error: "Complete KYC first", kycPending: true }` |
