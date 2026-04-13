# Customer Mobile Account System — Design

**Date:** 2026-04-13
**Status:** Draft for review
**Author:** Matt Santua (w/ Claude)

---

## 1. Problem

The system needs to issue mobile-app login credentials to pawn customers so they can view their tickets, make payments, and browse auction items. Today the partially-built flow fails whenever two tenants try to register the **same customer email**, because `auth.users.email` is globally unique inside Supabase Auth.

Concretely, `server/routes/accessRequests.js:177` calls:

```js
supabaseAdmin.auth.admin.createUser({ email: ar.email, ... })
```

The first tenant to onboard `juan@gmail.com` wins; every subsequent tenant's approval of the same email fails with *"email address already registered"*. The half-created `customers` row is rolled back, but the access request gets stuck in `PENDING` with no path forward and no UI signal to the cashier.

The fix also needs to support a **second entry pathway** (walk-in at the counter after KYC), which currently has no mobile-account creation UI at all.

## 2. Goals

- Any customer email can be registered to **any tenant**, independent of other tenants. `juan@gmail.com` pawning at Goldstar and at Silverline must both work.
- Customers log into the mobile app with a **pawnshop code + username + password** — never an email.
- Credentials (username + temporary password) arrive at the customer's **real email**.
- Customers are forced to change the temporary password on first login.
- Customers can recover a lost password **self-service** from the mobile app, using an OTP delivered to their real email.
- Cashiers can reset a customer's password from the admin dashboard as a manual fallback.
- All three creation pathways (walk-in, online request, retroactive grant) go through **one** server helper so the logic lives in one place.

## 3. Non-goals

- Does **not** redesign the `customer_access_requests` table, the public showcase page, or the multi-step React request form — those continue to work as-is.
- Does **not** change how pawnshop employees (`tenant_users`) authenticate.
- Does **not** implement SMS-based recovery (future upgrade).
- Does **not** build the rest of the customer mobile app (ticket viewer, payments, auctions) — scope is limited to **account creation, login, first-login password change, and password reset**.
- Does **not** introduce a global/shared customer identity across tenants. Each tenant's customer record remains legally distinct (per-tenant KYC, per-tenant risk rating, per-tenant BSP compliance).

---

## 4. Architecture

### 4.1 Authentication identifier strategy

Supabase's `auth.users.email` has a hard global-unique constraint that cannot be relaxed. To bypass the collision without losing Supabase Auth (which we rely on for JWT issuance, session management, password hashing, and middleware compatibility), each customer is issued:

- **Username** — per-tenant unique, auto-generated from name. Visible. The customer types it.
- **Internal auth-identifier** — a per-customer value stored in `auth.users.email` that is guaranteed unique across tenants. Invisible. The customer never types it, never sees it, and no mail is delivered to it. Format: `{username}@t-{tenant_id}.pmtp.local` (e.g., `juan.delacruz@t-abc123-def456.pmtp.local`).

All **real** email communication (welcome letter, password reset OTP) is delivered to `customers.email`, which holds the customer's actual inbox address (e.g., `juan@gmail.com`) and has **no unique constraint** — duplicates across tenants are allowed and expected.

| Purpose | Column | Example | Visible to customer? |
|---|---|---|---|
| Real inbox (delivery target) | `customers.email` | `juan@gmail.com` | ✅ Yes |
| Mobile login identifier | `customers.username` + tenant code | `juan.delacruz` @ `goldstar` | ✅ Yes |
| Supabase Auth identifier (internal) | `auth.users.email` | `juan.delacruz@t-abc.pmtp.local` | ❌ No |

### 4.2 Tenant code

The "pawnshop code" the customer types when logging in reuses the existing `tenant_branding.subdomain` field (legacy name — functionally it's a URL slug today, since the system migrated to path-based routing at `/s/:slug`). No new column. Existing validation applies: 3–63 lowercase alphanumerics and hyphens, not a reserved word, unique across tenants.

### 4.3 Account-creation pathways

Three pathways converge on a single helper `createCustomerMobileAccount(customer)`:

```
┌────────────────────────────┐
│ 1. WALK-IN (post-KYC)      │
│    Cashier clicks          │
│    "Grant mobile access"   │───┐
│    on customer profile     │   │
└────────────────────────────┘   │
                                 │
┌────────────────────────────┐   │   ┌─────────────────────────────┐
│ 2. ONLINE REQUEST          │   │   │  createCustomerMobileAccount │
│    Public showcase form    │   │   │                              │
│    → pending queue         │   ├──▶│  1. generate username        │
│    → owner/manager         │   │   │  2. generate temp password   │
│      approves              │   │   │  3. build internal identifier│
└────────────────────────────┘   │   │  4. auth.admin.createUser    │
                                 │   │  5. UPDATE customers row     │
┌────────────────────────────┐   │   │  6. send welcome email to    │
│ 3. RETROACTIVE GRANT       │   │   │     customer.email           │
│    Cashier clicks          │   │   │                              │
│    "Grant mobile access"   │───┘   │  Returns: { username,        │
│    on existing customer    │       │            tempPassword }     │
│    who has no auth_id yet  │       └─────────────────────────────┘
└────────────────────────────┘
```

Pathways 1 and 3 share the same REST endpoint — idempotent guard distinguishes them.

---

## 5. Database changes

Zero new tables. Only `ALTER TABLE` on `public.customers`. Since the whole DB currently has 0 rows, zero migration risk.

```sql
-- Mobile account columns
ALTER TABLE customers
  ADD COLUMN username                      varchar(50),
  ADD COLUMN must_change_password          boolean NOT NULL DEFAULT true,
  ADD COLUMN password_reset_otp_hash       text,
  ADD COLUMN password_reset_otp_expires_at timestamptz,
  ADD COLUMN password_reset_attempts       smallint NOT NULL DEFAULT 0;

-- Per-tenant unique username
ALTER TABLE customers
  ADD CONSTRAINT customers_tenant_username_uniq UNIQUE (tenant_id, username);

-- Fast lookup for password-reset endpoint (case-insensitive on email)
CREATE INDEX customers_tenant_email_idx
  ON customers (tenant_id, lower(email));
```

**Column rationale:**

- `username` — per-tenant unique, generated from first+last name. Nullable so existing rows without mobile accounts remain valid.
- `must_change_password` — mirrors the `tenant_users.must_change_password` pattern. Forces the password change screen on first login.
- `password_reset_otp_hash` — SHA-256 of the 6-digit OTP. We never store the plaintext.
- `password_reset_otp_expires_at` — 15 minutes after issue.
- `password_reset_attempts` — increments on wrong OTP entries. Capped at 5 before the OTP is invalidated.

**Auth metadata (no DDL):** when creating the Supabase auth user, set `app_metadata = { role: 'CUSTOMER', tenant_id, customer_id }` via the existing `raw_app_meta_data` JSONB column. This lets backend middleware instantly distinguish customer JWTs from employee JWTs and scope queries without a join.

---

## 6. Server helpers

### 6.1 `generateCustomerUsername(firstName, lastName, tenantId)`

Signature: `async (firstName, lastName, tenantId) => string`

1. **Slugify:** lowercase, strip accents (NFD + remove combining marks), collapse whitespace, replace spaces with dots, drop any character that isn't `[a-z0-9.]`.
   - `"Juan"`, `"Dela Cruz"` → `"juan.delacruz"`
   - `"María José"`, `"Ñoño"` → `"maria.jose.nono"`
2. **Truncate base** to 47 characters (leaves room for a 3-digit numeric suffix).
3. **Collision check:** `SELECT username FROM customers WHERE tenant_id = $1 AND username ~ ('^' || $2 || '\d*$')`.
4. **If base is free** → return it. **Otherwise** pick the smallest integer `n >= 2` such that `{base}{n}` is not taken and return that.
5. **Edge case — empty slug** (customer has no letters/digits in their name, e.g., unicode-only or punctuation-only): fall back to `customer{last 6 of customer.id}`.

### 6.2 `createCustomerMobileAccount(customer)`

Signature: `async (customer) => { username, tempPassword }` — throws on error.

Preconditions checked by caller (not the helper itself) — the endpoint wrapper enforces role, rate-limit, and idempotency.

```js
async function createCustomerMobileAccount(customer) {
  // 1. Idempotency guard
  if (customer.auth_id) {
    const err = new Error('Mobile account already exists');
    err.code = 'ACCOUNT_EXISTS';
    throw err;
  }

  // 2. Generate identifiers
  const username = await generateCustomerUsername(
    customer.first_name, customer.last_name, customer.tenant_id
  );
  const tempPassword = generateTempPassword();  // existing in utils/helpers.js
  const internalEmail = `${username}@t-${customer.tenant_id}.pmtp.local`;

  // 3. Create Supabase auth user
  const { data: authData, error: authErr } =
    await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: tempPassword,
      email_confirm: true,
      app_metadata: {
        role: 'CUSTOMER',
        tenant_id: customer.tenant_id,
        customer_id: customer.id,
      },
    });
  if (authErr) throw authErr;

  // 4. Link customer → auth user
  const { error: updErr } = await supabaseAdmin
    .from('customers')
    .update({
      auth_id: authData.user.id,
      username,
      must_change_password: true,
    })
    .eq('id', customer.id);
  if (updErr) {
    // Best-effort rollback of the auth user so retry works
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw updErr;
  }

  // 5. Fetch tenant context for the welcome email
  const { data: tenant } = await supabaseAdmin
    .from('tenants').select('business_name').eq('id', customer.tenant_id).single();
  const { data: branding } = await supabaseAdmin
    .from('tenant_branding')
    .select('subdomain, apk_download_url')
    .eq('tenant_id', customer.tenant_id).single();

  // 6. Send welcome email (fire-and-forget, logged on failure)
  sendCustomerWelcomeEmail({
    to: customer.email,
    fullName: `${customer.first_name} ${customer.last_name}`.trim(),
    businessName: tenant?.business_name || 'Our Pawnshop',
    slug: branding?.subdomain || null,
    apkUrl: branding?.apk_download_url || null,
    username,
    tempPassword,
  }).catch((e) => console.error('[createCustomerMobileAccount email]', e.message));

  return { username, tempPassword };
}
```

Lives in: `server/services/customerAuth.js` (**new file**). `generateTempPassword`, `generateCustomerUsername`, and the transport wrappers go in `server/utils/customerAuthHelpers.js` or stay in `server/utils/helpers.js` — TBD by writing-plans phase.

### 6.3 `resolveCustomerLoginEmail(slug, username)`

Signature: `async (slug, username) => string | null`

Used by the mobile login endpoint. Returns the internal email so the backend can call `supabase.auth.signInWithPassword`.

```js
async function resolveCustomerLoginEmail(slug, username) {
  const { data: branding } = await supabaseAdmin
    .from('tenant_branding')
    .select('tenant_id')
    .eq('subdomain', slug.toLowerCase().trim())
    .single();
  if (!branding) return null;

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('tenant_id, username, is_active')
    .eq('tenant_id', branding.tenant_id)
    .eq('username', username.toLowerCase().trim())
    .eq('is_active', true)
    .single();
  if (!customer) return null;

  return `${customer.username}@t-${customer.tenant_id}.pmtp.local`;
}
```

---

## 7. API endpoints

All endpoints are new unless marked otherwise.

### 7.1 Public (unauthenticated)

| Method | Path | Purpose | Rate limit |
|---|---|---|---|
| `POST` | `/api/public/customer-auth/login` | Mobile login — accepts `{ slug, username, password }`, returns `{ session, must_change_password, customer }` | 10 per IP per minute |
| `POST` | `/api/public/customer-auth/change-password` | First-login or post-reset password change — requires valid JWT in Authorization header, accepts `{ new_password }` | 5 per user per hour |
| `POST` | `/api/public/customer-auth/forgot-password` | Request OTP — accepts `{ slug, email }`, always returns 200 regardless of whether email was found (anti-enumeration) | 3 per email per hour, 10 per IP per hour |
| `POST` | `/api/public/customer-auth/reset-password` | Verify OTP and set new password — accepts `{ slug, email, otp, new_password }` | 5 per email per hour |

### 7.2 Tenant-scoped (JWT + tenant middleware)

| Method | Path | Purpose | Allowed roles |
|---|---|---|---|
| `POST` | `/api/customers/:id/grant-mobile-access` | Walk-in / retroactive creation — wraps `createCustomerMobileAccount`. Returns `{ username, tempPassword }` for the cashier to read aloud. Idempotent: returns 409 if the customer already has `auth_id`. | OWNER, MANAGER, CASHIER |
| `POST` | `/api/customers/:id/reset-mobile-password` | Cashier-driven fallback reset. Generates a new temp password, calls `supabaseAdmin.auth.admin.updateUserById`, sets `must_change_password = true`, emails the customer. | OWNER, MANAGER |

### 7.3 Changed endpoints

| Method | Path | Change |
|---|---|---|
| `PATCH` | `/api/access-requests/admin/:id/approve` (`server/routes/accessRequests.js:133`) | Replace the inline auth-user creation block (lines 174–184) with a single call to `createCustomerMobileAccount(customer)`. Everything else (fetching the access request, building the customer record from `request_data`, marking the request APPROVED) stays the same. |

---

## 8. Mobile login flow

```
┌─────────────────────────┐
│ App launches            │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Welcome screen          │
│                         │
│ [ Log In Manually ]     │  ── default path
│                         │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Login form              │
│                         │
│  Pawnshop Code          │   e.g., goldstar
│  Username               │   e.g., juan.delacruz
│  Password               │   e.g., K8xN2pQw (temp) or user-set
│                         │
│  [ Forgot password? ]   │
│  [      Log In      ]   │
└──────────┬──────────────┘
           │
           ▼  POST /api/public/customer-auth/login
┌─────────────────────────────────────────────────┐
│ Backend:                                         │
│ 1. resolveCustomerLoginEmail(slug, username)     │
│ 2. supabase.auth.signInWithPassword({            │
│      email: internal, password                   │
│    })                                            │
│ 3. Fetch customer row (id, name, email,          │
│    must_change_password)                         │
│ 4. Return { session, must_change_password,       │
│             customer }                           │
└──────────┬──────────────────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│ must_change_password?   │
└──┬────────────────┬─────┘
   │ yes            │ no
   ▼                ▼
┌──────────────┐  ┌──────────────┐
│ Set new pw   │  │ Dashboard    │
│ screen       │  │              │
│ (forced)     │  │              │
└──────┬───────┘  └──────────────┘
       │
       ▼
┌──────────────┐
│ POST change- │
│ password     │
│              │
│ Clears       │
│ must_change  │
└──────────────┘
```

**Important:** the login endpoint itself does **not** return 403 when `must_change_password = true`. It returns a valid session with a flag. The mobile app reads the flag and forces the password-change screen before allowing any other action. Backend enforces this by rejecting any customer-scoped API call other than `change-password` when the flag is still true.

---

## 9. Password reset flow (OTP)

```
┌──────────────────────────┐
│ "Forgot password?"       │
│ screen in mobile app     │
│                          │
│  Pawnshop Code           │
│  Email                   │
│                          │
│  [ Send Reset Code ]     │
└────────────┬─────────────┘
             │
             ▼  POST /api/public/customer-auth/forgot-password
┌───────────────────────────────────────────────────────┐
│ Backend:                                               │
│ 1. Resolve slug → tenant_id                            │
│ 2. SELECT customer WHERE tenant_id=? AND              │
│    lower(email)=lower(?) AND is_active AND auth_id IS │
│    NOT NULL                                            │
│ 3. If not found → sleep 100-300ms → return 200 {       │
│    message: "If your email matches an account, we've  │
│    sent a code" }  (anti-enumeration)                  │
│ 4. Generate 6-digit OTP                                │
│ 5. Hash with SHA-256, store hash + expiry (now+15m) + │
│    attempts=0                                          │
│ 6. Send email to customer.email with the OTP          │
│ 7. Return 200                                          │
└────────────┬──────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────┐
│ Customer checks email    │
│ (real Gmail/Yahoo/etc.)  │
│ Receives OTP: 478293     │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ OTP entry screen         │
│                          │
│  Code: [______]          │
│  New password            │
│  Confirm password        │
│                          │
│  [     Reset     ]       │
└────────────┬─────────────┘
             │
             ▼  POST /api/public/customer-auth/reset-password
┌───────────────────────────────────────────────────────┐
│ Backend:                                               │
│ 1. Resolve slug → tenant_id                            │
│ 2. SELECT customer WHERE tenant_id + email match       │
│ 3. If no active OTP / expired → 400 "Code expired"    │
│ 4. If attempts >= 5 → clear OTP, 400 "Too many tries" │
│ 5. Hash submitted OTP, compare to stored hash         │
│    - on mismatch: increment attempts, 400             │
│ 6. Call supabaseAdmin.auth.admin.updateUserById(      │
│      auth_id, { password: new_password }              │
│    )                                                   │
│ 7. Clear OTP columns, set must_change_password=false  │
│    (they just set a password they know)               │
│ 8. Return 200                                          │
└───────────────────────────────────────────────────────┘
```

**Anti-abuse details:**

- `forgot-password` is rate-limited by email (3/hour) and by IP (10/hour), using the same in-memory limiter pattern already in `accessRequests.js:11-20`.
- `reset-password` is rate-limited by email (5/hour).
- The response to `forgot-password` is identical whether the email was found or not — same HTTP status, same message, same response shape, plus a 100–300 ms random delay to mask branch timing.
- OTP has 6 digits → 1-in-10⁶ brute force — 5-attempt cap makes that ~5 × 10⁻⁶.
- OTP is **single-use**: successful reset clears the hash.
- Any new `forgot-password` request for the same customer overwrites the previous OTP, so an attacker can't keep an old one alive.

---

## 10. Email templates

Both are added to `server/services/email.js` alongside the existing `sendCustomerWelcomeEmail`.

### 10.1 Welcome email (rewritten)

Called from `createCustomerMobileAccount`. The existing template is adapted — the only material change is showing the **username + tenant code** instead of the email address as the login identifier.

**Subject:** `Your {businessName} mobile account is ready`

**Body (text):**

```
Welcome to {businessName}!

Your mobile account has been created. Here's how to log in:

1. Download the app: {apkUrl}
2. Open the app and tap "Log In Manually"
3. Enter these credentials:

   Pawnshop Code:      {slug}
   Username:           {username}
   Temporary Password: {tempPassword}

4. You will be asked to set your own password on first login.

If you didn't expect this email, please ignore it — no account will be
active until you log in and set your password.

— Sent on behalf of {businessName} via Obsidian
```

If `slug` is null (tenant has not published branding yet): the email still sends but replaces the Pawnshop Code line with `Pawnshop Code: (ask {businessName} for your code)` and logs a warning — cashier should publish the branding.

If `apkUrl` is null: line 1 is omitted entirely.

### 10.2 Password reset OTP email

**Subject:** `{businessName} password reset code`

**Body (text):**

```
Hi {fullName},

Someone (hopefully you) requested a password reset on your {businessName}
mobile account. Enter this code in the app to set a new password:

         {otp}

This code expires in 15 minutes and can only be used once.

If you didn't request this, you can ignore this email — your current
password will keep working.

— Sent on behalf of {businessName} via Obsidian
```

---

## 11. UI changes

### 11.1 Customer Profile page — new "Mobile Access" card

Location: `src/pages/owner/CustomerProfile.jsx` (referenced in CLAUDE.md as an existing page).

Adds one new section below the existing profile info. Two visual states:

**State A: no account yet (`customer.auth_id IS NULL`)**

```
┌──────────────────────────────────────────────┐
│  Mobile Access                                │
│  ─────────────                                │
│  This customer doesn't have a mobile account  │
│  yet.                                         │
│                                               │
│  [  Grant Mobile Access  ]                    │
└──────────────────────────────────────────────┘
```

Clicking calls `POST /api/customers/:id/grant-mobile-access`. On success, shows a modal with the generated `username` + `tempPassword` so the cashier can read them aloud if the customer is physically present. Modal also says *"A welcome email with these credentials has been sent to {customer.email}."*

**State B: account exists (`customer.auth_id IS NOT NULL`)**

```
┌──────────────────────────────────────────────┐
│  Mobile Access                                │
│  ─────────────                                │
│  ✓ Mobile account active                      │
│  Username:  juan.delacruz                     │
│  Created:   Feb 14, 2026                      │
│  Status:    Password changed                  │
│             (or "Temporary password active")  │
│                                               │
│  [  Reset Password  ]    (OWNER/MANAGER only) │
└──────────────────────────────────────────────┘
```

Clicking "Reset Password" calls `POST /api/customers/:id/reset-mobile-password`. Confirmation modal before firing. Result modal shows the new temp password so the cashier can read it aloud, and says a reset email has been sent.

### 11.2 Mobile app screens (wireframe only)

The mobile app is a separate build and not part of this spec's implementation. This spec only defines the **backend contracts** the app will call. A later spec will cover the React Native (or whatever) app.

Wireframes of the four screens (Welcome, Login, Set Password, Forgot Password) appear in sections 8 and 9 above as references for whoever builds the app.

---

## 12. Files to change

### New files

- `server/services/customerAuth.js` — `createCustomerMobileAccount`, `resolveCustomerLoginEmail`, `generateCustomerUsername`, OTP helpers (`generateOtp`, `hashOtp`, `verifyOtp`).
- `server/routes/customerAuth.js` — all four public endpoints from §7.1.
- `server/__tests__/customerAuth.test.js` — unit + integration tests (see §13).

### Modified files

- `server/index.js` — mount the new customer-auth router under `/api/public/customer-auth`.
- `server/routes/customers.js` — add `POST /:id/grant-mobile-access` and `POST /:id/reset-mobile-password` tenant-scoped endpoints.
- `server/routes/accessRequests.js` — replace lines 174–184 of the approve handler with a call to `createCustomerMobileAccount(customer)`. Delete the inline `auth.admin.createUser` + rollback logic. Delete the unused local `tempPassword` / `sendCustomerWelcomeEmail` direct import (now handled by the helper).
- `server/services/email.js` — update `sendCustomerWelcomeEmail` signature to accept `{ username, slug, apkUrl, businessName, fullName, tempPassword }` (was `{ email, tempPassword, ... }`). Add new `sendCustomerPasswordResetOtpEmail({ fullName, businessName, otp })`.
- `server/utils/helpers.js` — keep existing `generateTempPassword`. Nothing new here unless writing-plans decides to collocate.
- `src/pages/owner/CustomerProfile.jsx` — add the Mobile Access card (§11.1).
- `src/lib/api.js` — add `customersApi.grantMobileAccess(id)` and `customersApi.resetMobilePassword(id)`.

### Migration

- `sql/201_customer_mobile_accounts.sql` — the `ALTER TABLE` statements from §5. Apply via Supabase SQL editor or the MCP `apply_migration` tool.

### Documentation

- `.claude/CLAUDE.md` — update the "Implemented Features" checklist to include customer mobile account system. Update the table-group list in §5 if column names changed.
- `server/sql/MasterSchema.md` — update `customers` table definition to include the new columns. Bump schema version.

---

## 13. Testing strategy

### 13.1 Unit tests (Jest)

`server/__tests__/customerAuth.test.js`:

- `generateCustomerUsername`:
  - Simple case: `"Juan"`, `"Dela Cruz"` → `"juan.delacruz"`.
  - Collision: when `juan.delacruz` exists, returns `juan.delacruz2`. When 2 exists too, returns 3. When only 5 exists, returns 2 (smallest free).
  - Accents: `"María José"`, `"Ñoño"` → `"maria.jose.nono"`.
  - Truncation: 60-char last name truncates the base to 47.
  - Empty slug fallback: punctuation-only name → `customer{id-suffix}`.
  - **Cross-tenant isolation:** `juan.delacruz` at Tenant A and at Tenant B are independent.
- `createCustomerMobileAccount`:
  - Happy path: creates auth user, links customer, returns `{ username, tempPassword }`.
  - Idempotency: called twice on the same customer → second call throws `ACCOUNT_EXISTS`.
  - Email collision regression: two tenants each create a customer with email `juan@gmail.com` → both succeed (this was the original bug).
  - Rollback: if the `UPDATE customers` step fails, the auth user is deleted.
- `resolveCustomerLoginEmail`:
  - Valid slug + username → correct internal email.
  - Unknown slug → `null`.
  - Inactive customer → `null`.
  - Case-insensitive username match.
- OTP helpers:
  - `generateOtp` returns a 6-digit string.
  - `hashOtp` is deterministic and SHA-256.
  - `verifyOtp` rejects wrong codes, accepts correct ones, rejects expired ones.

### 13.2 Integration tests

- `POST /api/public/customer-auth/login` with valid slug + username + password → 200 + session.
- `POST /login` with `must_change_password = true` → 200 + `must_change_password: true` in body.
- `POST /login` with wrong password → 401.
- `POST /login` with unknown slug → 401 (not 404 — don't leak tenant existence).
- `POST /forgot-password` with valid email → 200 + OTP row created + email job fired (mock transport).
- `POST /forgot-password` with unknown email → 200, no OTP created, response identical to valid case, within 50 ms variance.
- `POST /reset-password` with correct OTP → 200 + password updated + OTP cleared.
- `POST /reset-password` with wrong OTP → 400 + attempts incremented.
- `POST /reset-password` with 5+ wrong attempts → OTP invalidated.
- `PATCH /access-requests/admin/:id/approve` with an email already used at another tenant → succeeds (regression test for the original bug).

### 13.3 Manual smoke tests

- Create two tenants. Register `juan@gmail.com` at both via the walk-in pathway. Both succeed. Both welcome emails arrive at `juan@gmail.com`.
- Log in at Tenant A with `goldstar + juan.delacruz + tempPass`. Succeeds. Set new password. Log out.
- Log in at Tenant B with `silverline + juan.delacruz + tempPass`. Succeeds — separate account, separate password.
- Forgot password flow at Tenant A → OTP email arrives → enter in app → new password set.

---

## 14. Risks and open questions

### 14.1 Risks

- **Username guessability.** Username is derived from the real name, so an attacker who knows the customer's name and the tenant can guess it. Mitigation: the password is the actual secret; rate-limit login attempts (10 per IP per minute already in the spec); consider adding per-username lockout after N failures as a follow-up.
- **Tenant enumeration via pawnshop code.** A public endpoint (`resolveCustomerLoginEmail`) implicitly reveals whether a slug exists. This is acceptable because slugs are already public on the showcase page (`/s/goldstar`).
- **Name changes.** If a customer legally changes their name, their username stays. Cashiers can't edit usernames (the constraint is per-tenant unique, and changing would break sessions). Mitigation: accepted. A rename endpoint can be added later if needed.
- **Fire-and-forget welcome email.** If SMTP fails, the customer has a working account but no credentials. Mitigation: the cashier-facing modal after `grant-mobile-access` shows the `tempPassword` on screen so they can read it aloud. SMTP failures are logged for admin review.
- **In-memory rate limiter.** The existing `_rateLimitMap` in `accessRequests.js:11` is per-process — won't survive a restart and won't coordinate across multiple server instances. Acceptable for v1 (single instance); upgrade to Redis-backed later when the system scales.

### 14.2 Open questions (non-blocking)

- **Cleanup rename: `tenant_branding.subdomain → tenant_branding.slug`.** The column name is legacy — functionally it's a URL slug since the system moved to path-based routing. Free to rename now (0 rows). Should this be included in this spec or deferred? **Recommendation: defer** — keeps this spec focused on the customer-auth problem.
- **Welcome email delivery tracking.** Should we log welcome/reset emails in `notices_log`? **Recommendation: yes** — reuse the existing table, delivery_method = `EMAIL`, notice_type = new enum value `MOBILE_ACCOUNT_WELCOME` / `MOBILE_ACCOUNT_RESET`. Adds one line per email send. Will be added to the implementation plan.
- **JWT middleware for customer routes.** The existing `auth.js` middleware resolves `req.user` via `tenant_users`. Customer JWTs need a separate resolver that checks `app_metadata.role === 'CUSTOMER'` and populates `req.customer`. **Recommendation:** add `server/middleware/customerAuth.js` — scoped to the `/api/public/customer-auth/change-password` endpoint and any future customer-scoped endpoints.
- **Should cashiers (CASHIER role) be allowed to grant mobile access?** Current spec says yes. Risk: a rogue cashier could silently create accounts. Mitigation: `tenant_audit_logs` records every `grant-mobile-access` call. **Recommendation: yes, log it, move on.**

---

## 15. Implementation order (rough)

1. DB migration (`sql/201_customer_mobile_accounts.sql`).
2. `server/services/customerAuth.js` — helpers + unit tests.
3. `server/services/email.js` — new templates.
4. `server/routes/customerAuth.js` — public endpoints + integration tests.
5. `server/routes/customers.js` — tenant-scoped endpoints.
6. `server/routes/accessRequests.js` — swap inline block for helper call + regression test.
7. `src/pages/owner/CustomerProfile.jsx` — Mobile Access card UI.
8. `.claude/CLAUDE.md` + `MasterSchema.md` — docs update.
9. End-to-end manual smoke test on two-tenant setup.

A full step-by-step implementation plan will be produced by the `superpowers:writing-plans` skill in the next session.

---

**End of spec.**
