# Owner Signup Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a lightweight 3-step owner signup (personal info → credentials → OTP), with post-login KYC gate for business verification and partial access control.

**Architecture:** Signup creates only an auth user + tenant_users row (no tenant). KYC is deferred post-login: a `complete_owner_kyc` RPC creates the tenant + branch and links them. The tenantScope middleware handles pre-KYC owners by whitelisting specific endpoints. Frontend shows a welcome modal + persistent banner until KYC is submitted.

**Tech Stack:** Express.js, Supabase Auth, PostgreSQL RPC, React 18, TailwindCSS

**Spec:** `docs/superpowers/specs/2026-03-22-owner-signup-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `sql/101_signup_kyc_flow.sql` | Create | Schema migration: nullable tenant_id, kyc_status, tenants columns, RPC |
| `MasterSchema.md` | Modify | Update to reflect schema changes |
| `server/middleware/tenantScope.js` | Rewrite | Query `tenant_users` instead of old tables, handle pre-KYC owners |
| `server/routes/auth.js` | Modify | Add `signup-init`, `verify-signup-otp`, `complete-kyc`, `kyc-status`; update login/profile |
| `server/services/email.js` | Modify | Add `sendSignupOtpEmail` template |
| `src/lib/api.js` | Modify | Add signup/KYC API methods |
| `src/context/AuthContext.jsx` | Rewrite | Query `tenant_users`, handle null tenant, expose kyc_status |
| `src/pages/auth/RegisterPage.jsx` | Rewrite | 3-step signup: personal → credentials → OTP |
| `src/pages/auth/LoginPage.jsx` | Modify | Read kyc_status from profile, route appropriately |
| `src/pages/owner/KycPage.jsx` | Create | Business identity + branch address form |
| `src/components/ui/WelcomeModal.jsx` | Create | First-login KYC prompt modal |
| `src/components/ui/KycBanner.jsx` | Create | Persistent top banner for incomplete KYC |
| `src/config/navigation.js` | Modify | Add KYC nav item, add `locked` flag to items |
| `src/components/layout/Sidebar.jsx` | Modify | Render lock icons, dimmed text, red badge |
| `src/App.jsx` | Modify | Add `/admin/kyc` route, import KycPage |

---

### Task 1: SQL Migration + MasterSchema Update

**Files:**
- Create: `sql/101_signup_kyc_flow.sql`
- Modify: `MasterSchema.md`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================================
-- MIGRATION 101: Signup KYC Flow
-- Source of Truth: MasterSchema.md (v4)
-- Date: 2026-03-22
-- ============================================================================

-- 1. Make tenant_id nullable (pre-KYC owners have no tenant yet)
ALTER TABLE tenant_users ALTER COLUMN tenant_id DROP NOT NULL;

-- 2. Add KYC status tracking
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';

-- 3. Add business_type and sec_dti_registration_no to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sec_dti_registration_no VARCHAR(100);

-- 4. RPC: complete_owner_kyc
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
    SELECT work_email INTO v_email FROM tenant_users WHERE id = p_user_id;

    INSERT INTO tenants (
        business_name, business_type, bsp_registration_no,
        sec_dti_registration_no, tin_number, contact_email, status
    ) VALUES (
        p_business_name, p_business_type, p_bsp_registration_no,
        p_sec_dti_registration_no, p_tin_number, v_email, 'ACTIVE'
    ) RETURNING id INTO v_tenant_id;

    INSERT INTO branches (
        tenant_id, branch_code, branch_name, address,
        province, city_municipality, barangay, zip_code,
        phone, is_main_branch
    ) VALUES (
        v_tenant_id, 'MAIN', p_branch_name, p_street_address,
        p_province, p_city_municipality, p_barangay, p_zip_code,
        p_branch_phone, TRUE
    ) RETURNING id INTO v_branch_id;

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

- [ ] **Step 2: Update MasterSchema.md**

In the `tenant_users` table definition:
- Change `tenant_id UUID NOT NULL REFERENCES tenants(id)` → `tenant_id UUID REFERENCES tenants(id)` (remove NOT NULL)
- Add `kyc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'` after `avatar_url`

In the `tenants` table definition:
- Add `business_type VARCHAR(50)` after `contact_phone`
- Add `sec_dti_registration_no VARCHAR(100)` after `bsp_registration_no`

In Section J (Seed RPCs), add the `complete_owner_kyc` function definition.

- [ ] **Step 3: Commit**

```bash
git add sql/101_signup_kyc_flow.sql MasterSchema.md
git commit -m "feat: add signup KYC migration — nullable tenant_id, kyc_status, complete_owner_kyc RPC"
```

---

### Task 2: Rewrite tenantScope Middleware

**Files:**
- Modify: `server/middleware/tenantScope.js`

The current middleware queries `tenant_owners` and `employees` (old tables). It must be rewritten to:
1. Query `tenant_users` instead
2. Handle pre-KYC owners (null tenant_id) with whitelisted endpoints
3. Skip subscription check for pre-KYC owners

- [ ] **Step 1: Rewrite the middleware**

Replace the entire content of `server/middleware/tenantScope.js` with:

```javascript
const { supabaseAdmin } = require('../config/db');

// Endpoints accessible to pre-KYC owners (no tenant required)
const KYC_WHITELIST = [
  '/api/auth/complete-kyc',
  '/api/auth/kyc-status',
  '/api/auth/profile',
];

const tenantScope = async (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Query tenant_users (unified table — replaces old tenant_owners + employees)
  const { data: user, error } = await supabaseAdmin
    .from('tenant_users')
    .select('id, tenant_id, branch_id, role, full_name, is_active, kyc_status')
    .eq('id', req.userId)
    .is('deleted_at', null)
    .single();

  if (error || !user) {
    return res.status(403).json({ error: 'User profile not found or deactivated' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  req.userRole = user.role;
  req.profile = user;

  // Pre-KYC owner: tenant_id is NULL
  if (!user.tenant_id) {
    req.tenantId = null;
    req.branchId = null;
    req.kycPending = true;

    // Only allow whitelisted endpoints
    const requestPath = req.baseUrl + req.path;
    const isWhitelisted = KYC_WHITELIST.some(p => requestPath.startsWith(p));
    if (!isWhitelisted) {
      return res.status(403).json({ error: 'Complete KYC first', kycPending: true });
    }

    return next();
  }

  // Normal flow: tenant exists
  req.tenantId = user.tenant_id;
  req.branchId = user.branch_id;
  req.kycPending = false;

  // Attach subscription status
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('id, plan_name, payment_status, end_date')
    .eq('tenant_id', user.tenant_id)
    .eq('payment_status', 'PAID')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const isExpired = sub?.end_date && new Date(sub.end_date) < new Date();
  req.subscriptionActive = sub && !isExpired;
  req.profile.subscription_active = req.subscriptionActive;
  req.profile.subscription_plan = sub?.plan_name || null;

  next();
};

module.exports = tenantScope;
```

- [ ] **Step 2: Commit**

```bash
git add server/middleware/tenantScope.js
git commit -m "feat: rewrite tenantScope to use tenant_users with pre-KYC owner support"
```

---

### Task 3: Backend Auth Endpoints (signup-init, verify-signup-otp, complete-kyc, kyc-status) + Login/Profile Update

**Files:**
- Modify: `server/routes/auth.js`
- Modify: `server/services/email.js`

This is the largest backend task. It adds 4 new endpoints and updates login + profile to use `tenant_users` and include `kyc_status`.

- [ ] **Step 1: Add `sendSignupOtpEmail` to email.js**

Add a new template function in `server/services/email.js` (after the existing OTP templates). It takes `{ to, fullName, otp }` and sends a signup verification email. Reuse the dark-themed OTP layout from `sendPasswordResetEmail` but change the heading to "Verify Your Email" and the body to "Enter the code below to complete your Obsidian account registration."

Export it from the module.

- [ ] **Step 2: Add signup-init endpoint in auth.js**

```javascript
// In-memory rate limiter for signup OTP: email → { count, resetAt }
const _signupRateLimit = new Map();
const SIGNUP_RATE_LIMIT = 3;        // max 3 per email
const SIGNUP_RATE_WINDOW = 10 * 60 * 1000; // 10 minutes

// Temporary store for signup data (email → { fullName, phone, password, otp })
const _signupPendingStore = new Map();
const SIGNUP_PENDING_EXPIRY = 10 * 60 * 1000;

// POST /api/auth/signup-init
router.post('/signup-init', async (req, res) => {
  const { fullName, email, phone, password } = req.body;

  if (!fullName || fullName.trim().length < 2) return res.status(422).json({ error: 'Full name must be at least 2 characters.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(422).json({ error: 'Valid email is required.' });
  if (!phone || !/^\+639\d{9}$/.test(phone)) return res.status(422).json({ error: 'Phone must be in +639XXXXXXXXX format.' });
  if (!password || password.length < 8) return res.status(422).json({ error: 'Password must be at least 8 characters.' });

  // Rate limit
  const key = email.toLowerCase();
  const now = Date.now();
  const rl = _signupRateLimit.get(key);
  if (rl && now < rl.resetAt) {
    if (rl.count >= SIGNUP_RATE_LIMIT) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes.' });
    }
    rl.count++;
  } else {
    _signupRateLimit.set(key, { count: 1, resetAt: now + SIGNUP_RATE_WINDOW });
  }

  // Check email not taken
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ filter: email });
  const existing = users?.find(u => u.email?.toLowerCase() === key);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  // Generate OTP and store pending signup data
  const otp = generateOtp();
  storeOtp(key, otp); // uses existing OTP store for verification

  _signupPendingStore.set(key, {
    fullName: fullName.trim(),
    phone,
    password,
    expiresAt: now + SIGNUP_PENDING_EXPIRY,
  });

  // Send OTP email
  try {
    const { sendSignupOtpEmail } = require('../services/email');
    await sendSignupOtpEmail({ to: email, fullName: fullName.trim(), otp });
  } catch (emailErr) {
    console.error('[AUTH] Signup OTP email failed:', emailErr.message);
    return res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }

  res.json({ message: 'Verification code sent to your email.' });
});
```

- [ ] **Step 3: Add verify-signup-otp endpoint**

```javascript
// POST /api/auth/verify-signup-otp
router.post('/verify-signup-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(422).json({ error: 'Email and verification code are required.' });

  const key = email.toLowerCase();

  // Verify OTP
  const otpResult = verifyOtp(key, otp);
  if (!otpResult.valid) {
    return res.status(400).json({ error: otpResult.reason });
  }

  // Get pending signup data
  const pending = _signupPendingStore.get(key);
  if (!pending || Date.now() > pending.expiresAt) {
    _signupPendingStore.delete(key);
    return res.status(400).json({ error: 'Signup session expired. Please start over.' });
  }

  // Re-check email uniqueness (race condition guard)
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ filter: email });
  const existing = users?.find(u => u.email?.toLowerCase() === key);
  if (existing) {
    _signupPendingStore.delete(key);
    return res.status(409).json({ error: 'This email was just registered. Please use a different email.' });
  }

  // Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: pending.password,
    email_confirm: true,
    user_metadata: { full_name: pending.fullName },
  });

  if (authError) {
    _signupPendingStore.delete(key);
    return res.status(400).json({ error: authError.message });
  }

  // Insert tenant_users row (no tenant_id, no branch_id — pre-KYC)
  const { error: insertError } = await supabaseAdmin
    .from('tenant_users')
    .insert({
      id: authData.user.id,
      role: 'OWNER',
      full_name: pending.fullName,
      work_email: email,
      phone_number: pending.phone,
      kyc_status: 'PENDING',
    });

  if (insertError) {
    // Rollback: delete the auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    _signupPendingStore.delete(key);
    return res.status(400).json({ error: 'Registration failed. Please try again.' });
  }

  _signupPendingStore.delete(key);
  res.status(201).json({ success: true, message: 'Account created successfully.' });
});
```

- [ ] **Step 4: Add complete-kyc endpoint (auth required)**

```javascript
// POST /api/auth/complete-kyc — Submit KYC business details (requires auth + tenantScope)
router.post('/complete-kyc', async (req, res) => {
  // This endpoint is called through auth + tenantScope middleware
  // tenantScope whitelists it for pre-KYC owners
  const {
    businessName, businessType, bspRegNo, secDtiRegNo, tinNumber,
    branchName, streetAddress, province, cityMunicipality, barangay, zipCode, branchPhone
  } = req.body;

  if (!businessName || !businessType || !bspRegNo || !tinNumber || !branchName || !streetAddress || !province || !cityMunicipality || !barangay || !zipCode) {
    return res.status(422).json({ error: 'All required fields must be provided.' });
  }

  const { data, error } = await supabaseAdmin.rpc('complete_owner_kyc', {
    p_user_id: req.userId,
    p_business_name: businessName,
    p_business_type: businessType,
    p_bsp_registration_no: bspRegNo,
    p_sec_dti_registration_no: secDtiRegNo || null,
    p_tin_number: tinNumber,
    p_branch_name: branchName,
    p_street_address: streetAddress,
    p_province: province,
    p_city_municipality: cityMunicipality,
    p_barangay: barangay,
    p_zip_code: zipCode,
    p_branch_phone: branchPhone || null,
  });

  if (error) {
    console.error('[AUTH] KYC RPC error:', error.message);
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return res.status(409).json({ error: 'This BSP Registration No. is already registered.' });
    }
    return res.status(400).json({ error: error.message });
  }

  res.json(data);
});
```

- [ ] **Step 5: Add kyc-status endpoint**

```javascript
// GET /api/auth/kyc-status
router.get('/kyc-status', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('tenant_users')
    .select('kyc_status, tenant_id')
    .eq('id', req.userId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Profile not found.' });
  res.json(data);
});
```

- [ ] **Step 6: Update login endpoint to use tenant_users + include kyc_status**

Replace the existing `tenant_owners` + `employees` profile lookup in `POST /api/auth/login` with a single query to `tenant_users`. Include `kyc_status` in the response. Keep the super_admin and customer checks as-is.

```javascript
  // After super_admin check, replace the tenant_owners/employees block with:
  const { data: tuProfile } = await supabaseAdmin
    .from('tenant_users')
    .select('*, tenants(*), branches(*)')
    .eq('id', data.user.id)
    .is('deleted_at', null)
    .single();

  res.json({
    session: data.session,
    user: data.user,
    profile: tuProfile || null,
  });
```

- [ ] **Step 7: Update profile endpoint similarly**

Replace the `tenant_owners` + `employees` block in `GET /api/auth/profile` with the same `tenant_users` query pattern.

- [ ] **Step 8: Commit**

```bash
git add server/routes/auth.js server/services/email.js
git commit -m "feat: add owner signup endpoints (signup-init, verify-otp, complete-kyc) + update login/profile for tenant_users"
```

---

### Task 4: Frontend API Layer + AuthContext Update

**Files:**
- Modify: `src/lib/api.js`
- Modify: `src/context/AuthContext.jsx`

- [ ] **Step 1: Add signup/KYC methods to api.js**

Add to `authApi` object in `src/lib/api.js`:

```javascript
  signupInit: (data) =>
    apiFetch('/auth/signup-init', { method: 'POST', body: JSON.stringify(data) }),

  verifySignupOtp: (email, otp) =>
    apiFetch('/auth/verify-signup-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),

  completeKyc: (data) =>
    apiFetch('/auth/complete-kyc', { method: 'POST', body: JSON.stringify(data) }),

  kycStatus: () =>
    apiFetch('/auth/kyc-status'),
```

- [ ] **Step 2: Rewrite AuthContext.jsx**

Replace the `fetchProfile` function to query `tenant_users` instead of `tenant_owners` + `employees`. Handle null `tenant_id` gracefully — skip subscription fetch when `tenant_id` is null. Expose `kycStatus` in context value. Remove the old `signup` function (replaced by the new 2-step flow in RegisterPage).

Key changes:
- `fetchProfile`: query `tenant_users` with `select('*, tenants(*), branches(*)')`, fallback to `super_admins`
- If `profile.tenant_id === null`, don't call `fetchSubscriptionStatus`
- Add `kycStatus` derived from `profile?.kyc_status`
- Remove the `signup` function from context (RegisterPage will call api directly)

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.js src/context/AuthContext.jsx
git commit -m "feat: update AuthContext to use tenant_users, add signup/KYC API methods"
```

---

### Task 5: Rewrite RegisterPage (3-Step Signup)

**Files:**
- Modify: `src/pages/auth/RegisterPage.jsx`

Complete rewrite of the register page. 3 steps: Personal Info → Credentials → OTP Verification.

- [ ] **Step 1: Rewrite RegisterPage**

The page should have:
- **Step 1:** Full name, email, phone (+639 prefix)
- **Step 2:** Password, confirm password
- **Step 3:** 6-digit OTP input (auto-focus, large monospace digits), resend button with 60s cooldown

Step indicator at the top (reuse existing pattern from old RegisterPage).

On Step 2 submit → call `authApi.signupInit({ fullName, email, phone, password })` → move to Step 3.
On Step 3 verify → call `authApi.verifySignupOtp(email, otp)` → show success toast → redirect to `/login` after 2s.

Keep the existing design system classes (`auth-layout`, `card-auth`, `btn-primary-full`, `form-input`, etc.).

- [ ] **Step 2: Commit**

```bash
git add src/pages/auth/RegisterPage.jsx
git commit -m "feat: rewrite RegisterPage with 3-step signup (personal → credentials → OTP)"
```

---

### Task 6: Update LoginPage for KYC Routing

**Files:**
- Modify: `src/pages/auth/LoginPage.jsx`

- [ ] **Step 1: Update login to handle KYC status**

After successful login, read `profile.kyc_status` from the response. Route based on role:
- `superadmin` → `/superadmin`
- OWNER with `kyc_status === 'PENDING'` → `/admin` (dashboard shows KYC prompts)
- All other roles → `/admin`

Remove the `tenant_owners` / `employees` direct Supabase queries from the login handler — the backend now returns the full profile.

- [ ] **Step 2: Commit**

```bash
git add src/pages/auth/LoginPage.jsx
git commit -m "feat: update LoginPage to use backend profile response with KYC routing"
```

---

### Task 7: KYC Page

**Files:**
- Create: `src/pages/owner/KycPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/pages/index.js` (or wherever pages are re-exported)

- [ ] **Step 1: Create KycPage.jsx**

Two-section form:
- **Section A: Business Identity** — Business name, business type (select), BSP reg no, SEC/DTI reg no, TIN
- **Section B: Main Branch & Address** — Branch name, street address, province → city → barangay (cascading dropdowns via `locationsApi`), zip code (auto-filled), branch phone (optional)

On submit → call `authApi.completeKyc(data)` → refresh profile → show success toast → redirect to `/admin`.

Use existing design patterns: `card-base` wrapper, `form-input`, `form-label`, section headers.

If `profile.kyc_status !== 'PENDING'`, show read-only submitted data.

- [ ] **Step 2: Add route to App.jsx**

Add `'/admin/kyc'` route pointing to `KycPage` in the admin routes section.

- [ ] **Step 3: Export from pages index**

Add `KycPage` to the pages barrel export.

- [ ] **Step 4: Commit**

```bash
git add src/pages/owner/KycPage.jsx src/App.jsx src/pages/index.js
git commit -m "feat: add KYC page with business identity and branch address forms"
```

---

### Task 8: Welcome Modal + KYC Banner

**Files:**
- Create: `src/components/ui/WelcomeModal.jsx`
- Create: `src/components/ui/KycBanner.jsx`

- [ ] **Step 1: Create WelcomeModal.jsx**

A centered modal that shows once (tracked via `localStorage.getItem('obsidian_welcome_shown')`).

- Title: "Welcome to Obsidian!"
- Body: "Complete your business verification to unlock pawn operations, customer management, and more."
- Primary: "Complete Now" → navigate to `/admin/kyc`
- Secondary: "Later" → dismiss

Condition: show only when `profile.kyc_status === 'PENDING'` AND `localStorage` flag not set.

- [ ] **Step 2: Create KycBanner.jsx**

A full-width warning bar rendered below the top nav, above page content:

```jsx
const KycBanner = () => (
  <div className="w-full bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">warning</span>
      <span className="text-sm text-amber-800 dark:text-amber-200">
        Your business verification is incomplete. Complete KYC to unlock all features.
      </span>
    </div>
    <a href="/admin/kyc" className="btn-sm bg-amber-600 hover:bg-amber-700 text-white text-xs px-3 py-1 rounded font-semibold">
      Complete KYC
    </a>
  </div>
)
```

Render in the main layout when `profile.kyc_status === 'PENDING'`.

- [ ] **Step 3: Export from components/ui/index.js**

Add both components to the barrel export.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/WelcomeModal.jsx src/components/ui/KycBanner.jsx src/components/ui/index.js
git commit -m "feat: add WelcomeModal and KycBanner for KYC gate"
```

---

### Task 9: Sidebar Lock Logic + Navigation Update

**Files:**
- Modify: `src/config/navigation.js`
- Modify: `src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Add KYC nav item and locked flags to navigation.js**

Add a `requiresKyc: true` flag to all nav items that should be locked pre-KYC. Add a "Business Verification" item under System:

```javascript
{ icon: 'verified_user', label: 'Business Verification', path: '/admin/kyc', kycItem: true },
```

Add `requiresKyc: true` to: Appraisals, Active Loans, Overdue Items, Inventory, Auctions, Inventory Audit, Customers, Employees, Reports, Analytics, Subscription.

Dashboard and Settings remain unlocked (`requiresKyc` omitted or false).

- [ ] **Step 2: Update Sidebar.jsx**

Read `kycStatus` from AuthContext. For nav items with `requiresKyc: true` when `kycStatus === 'PENDING'`:
- Dim the text (`opacity-40`)
- Replace the icon with `lock` icon
- Prevent navigation (onClick does nothing, shows tooltip)
- On the KYC item: show a red dot badge when `kycStatus === 'PENDING'`

- [ ] **Step 3: Integrate WelcomeModal + KycBanner into layout**

In the main admin layout (wherever the Sidebar wraps content — likely in `App.jsx` or Sidebar itself):
- Render `<WelcomeModal />` when user has `kyc_status === 'PENDING'`
- Render `<KycBanner />` above the page content when `kyc_status === 'PENDING'`

- [ ] **Step 4: Commit**

```bash
git add src/config/navigation.js src/components/layout/Sidebar.jsx src/App.jsx
git commit -m "feat: add sidebar lock icons, KYC badge, and integrate KYC gate UI"
```
