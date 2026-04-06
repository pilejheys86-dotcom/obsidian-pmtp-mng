# Registration OTP Emails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace temp-password emails with OTP-based credential emails for employee and customer registration, sent via Resend.

**Architecture:** When an owner creates an employee or customer, the backend generates a 6-digit OTP (not a password), sends it via Resend, and the user verifies the OTP to set their own password. Reuses existing OTP infrastructure (`helpers.js` `generateOtp/storeOtp/verifyOtp`) and the existing `sendEmail` transport layer (Resend HTTP API in production, SMTP fallback in dev).

**Tech Stack:** Resend HTTP API, Express.js, existing OTP helpers, existing email templates

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/services/email.js` | Modify | Add `sendEmployeeOtpEmail` and `sendCustomerOtpEmail` templates |
| `server/routes/employees.js` | Modify | Replace temp password with OTP generation + email on POST |
| `server/routes/customers.js` | Modify | Add auth user creation + OTP email on POST |
| `server/routes/auth.js` | Modify | Add `POST /api/auth/verify-registration-otp` and `POST /api/auth/set-password` endpoints |
| `server/utils/helpers.js` | Modify | Add `storeRegistrationOtp` / `verifyRegistrationOtp` (stores user context alongside OTP) |
| `MasterSchema.md` | Modify | Document `customers.auth_id` usage for customer portal auth |

---

### Task 1: Add Registration OTP Helpers

**Files:**
- Modify: `server/utils/helpers.js`

The existing `storeOtp`/`verifyOtp` work for password reset but don't carry context (user type, user ID). We need a variant that stores the registration context so the verify endpoint knows who to activate.

- [ ] **Step 1: Add registration OTP store and helpers**

Add below the existing `verifyResetToken` function in `server/utils/helpers.js`:

```javascript
// In-memory registration OTP store: email → { otp, expiresAt, attempts, context }
// context = { type: 'employee'|'customer', userId, tenantId, fullName }
const _registrationOtpStore = new Map();
const REG_OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const REG_OTP_MAX_ATTEMPTS = 5;
const REG_OTP_MAX_RESENDS = 3;

const storeRegistrationOtp = (email, otp, context) => {
  const key = email.toLowerCase();
  const existing = _registrationOtpStore.get(key);
  const resendCount = existing ? (existing.resendCount || 0) + 1 : 0;

  if (resendCount > REG_OTP_MAX_RESENDS) {
    return { stored: false, reason: 'Too many resend requests. Please wait.' };
  }

  _registrationOtpStore.set(key, {
    otp,
    expiresAt: Date.now() + REG_OTP_EXPIRY_MS,
    attempts: 0,
    resendCount,
    context,
  });
  return { stored: true };
};

const verifyRegistrationOtp = (email, otp) => {
  const key = email.toLowerCase();
  const entry = _registrationOtpStore.get(key);
  if (!entry) return { valid: false, reason: 'No verification code found for this email.' };
  if (Date.now() > entry.expiresAt) {
    _registrationOtpStore.delete(key);
    return { valid: false, reason: 'Code expired. Please request a new one.' };
  }
  if (entry.attempts >= REG_OTP_MAX_ATTEMPTS) {
    _registrationOtpStore.delete(key);
    return { valid: false, reason: 'Too many attempts. Please request a new code.' };
  }
  entry.attempts++;
  if (entry.otp !== otp) {
    return { valid: false, reason: 'Invalid code.' };
  }
  const context = entry.context;
  _registrationOtpStore.delete(key);
  return { valid: true, context };
};
```

- [ ] **Step 2: Export the new helpers**

Update the `module.exports` at the bottom of `helpers.js` to include `storeRegistrationOtp` and `verifyRegistrationOtp`.

- [ ] **Step 3: Commit**

```bash
git add server/utils/helpers.js
git commit -m "feat: add registration OTP helpers with context storage"
```

---

### Task 2: Add OTP Email Templates

**Files:**
- Modify: `server/services/email.js`

- [ ] **Step 1: Add `sendEmployeeOtpEmail` template**

Add after the existing `sendEmployeeWelcomeEmail` function:

```javascript
const sendEmployeeOtpEmail = async ({ to, fullName, role, businessName, otp }) => {
  const year = new Date().getFullYear();
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();

  await sendEmail({
    to,
    subject: `Your Obsidian Verification Code — ${businessName}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0f172a;padding:32px 40px;text-align:center;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="width:36px;height:36px;background:#A3E635;border-radius:6px;text-align:center;vertical-align:middle;">
                  <span style="font-size:18px;font-weight:800;color:#0f172a;line-height:36px;">O</span>
                </td>
                <td style="padding-left:12px;">
                  <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Obsidian</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 0;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Welcome, ${fullName}!</h1>
            <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
              You've been added as <strong style="color:#0f172a;">${roleLabel}</strong> at <strong style="color:#0f172a;">${businessName}</strong>. Use the code below to verify your account and set your password.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
              <tr>
                <td style="padding:28px 24px;text-align:center;">
                  <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Verification Code</p>
                  <p style="margin:0;font-size:36px;font-weight:800;color:#0f172a;letter-spacing:8px;font-family:'Courier New',monospace;">${otp}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FEFCE8;border:1px solid #FEF08A;border-radius:6px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:12px;color:#854D0E;line-height:1.5;">
                    <strong>This code expires in 10 minutes.</strong> Enter it on the login page to set your password and activate your account.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              &copy; ${year} Obsidian Pawnshop MIS &mdash; ${businessName}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `,
  });
};
```

- [ ] **Step 2: Add `sendCustomerOtpEmail` template**

Add after `sendEmployeeOtpEmail`:

```javascript
const sendCustomerOtpEmail = async ({ to, fullName, businessName, otp }) => {
  const year = new Date().getFullYear();

  await sendEmail({
    to,
    subject: `Your Verification Code — ${businessName}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#171717;font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;color:#F5F5F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#171717;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#262626;border-radius:12px;overflow:hidden;border:1px solid #404040;">
        <tr>
          <td style="background:#1a1a1a;padding:36px 40px;text-align:center;border-bottom:1px solid #404040;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="width:40px;height:40px;background:#A3E635;border-radius:8px;text-align:center;vertical-align:middle;">
                  <span style="font-size:20px;font-weight:800;color:#171717;line-height:40px;">O</span>
                </td>
                <td style="padding-left:14px;">
                  <span style="font-size:22px;font-weight:700;color:#F5F5F5;letter-spacing:-0.3px;">Obsidian</span>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:1.5px;">Customer Portal</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 0;">
            <p style="margin:0 0 4px;font-size:13px;color:#A3E635;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Account Created</p>
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#F5F5F5;">Welcome, ${fullName}!</h1>
            <p style="margin:0;font-size:14px;color:#A3A3A3;line-height:1.7;">
              You've been registered as a customer of <strong style="color:#F5F5F5;">${businessName}</strong>. Use the code below in the Obsidian app to set your password.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid #404040;border-radius:8px;">
              <tr>
                <td style="padding:28px 24px;text-align:center;">
                  <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#737373;text-transform:uppercase;letter-spacing:0.8px;">Verification Code</p>
                  <p style="margin:0;font-size:36px;font-weight:800;color:#A3E635;letter-spacing:8px;font-family:'Courier New',monospace;">${otp}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#422006;border-radius:8px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:12px;color:#FDE68A;line-height:1.5;">
                    <strong style="color:#FBBF24;">Expires in 10 minutes.</strong> Open the Obsidian app, enter this code, and set your password.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#1a1a1a;padding:24px 40px;border-top:1px solid #404040;text-align:center;">
            <p style="margin:0;font-size:11px;color:#525252;">
              &copy; ${year} Obsidian Pawnshop MIS &mdash; ${businessName}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `,
  });
};
```

- [ ] **Step 3: Export the new templates**

Add `sendEmployeeOtpEmail` and `sendCustomerOtpEmail` to the `module.exports` at the bottom of `email.js`.

- [ ] **Step 4: Commit**

```bash
git add server/services/email.js
git commit -m "feat: add OTP email templates for employee and customer registration"
```

---

### Task 3: Add Verification + Set-Password Endpoints

**Files:**
- Modify: `server/routes/auth.js`

These endpoints are shared by both employees (web app) and customers (React Native app).

- [ ] **Step 1: Add `POST /api/auth/verify-registration-otp`**

Add before `module.exports = router;` in `auth.js`:

```javascript
// POST /api/auth/verify-registration-otp — Verify OTP from employee/customer registration
router.post('/verify-registration-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(422).json({ error: 'Email and verification code are required.' });

  const result = verifyRegistrationOtp(email, otp);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason });
  }

  // Return a short-lived reset token so the user can set their password
  const resetToken = generateResetToken();
  storeResetToken(resetToken, email);

  res.json({
    resetToken,
    userType: result.context.type,      // 'employee' or 'customer'
    fullName: result.context.fullName,
  });
});
```

- [ ] **Step 2: Add `POST /api/auth/set-password`**

This endpoint is called after OTP verification. It sets the user's password for the first time.

```javascript
// POST /api/auth/set-password — Set password after OTP verification (first-time login)
router.post('/set-password', async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) return res.status(422).json({ error: 'Token and password are required.' });
  if (newPassword.length < 8) return res.status(422).json({ error: 'Password must be at least 8 characters.' });

  const result = verifyResetToken(resetToken);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason });
  }

  // Find auth user by email
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ filter: result.email });
  const authUser = users?.find(u => u.email?.toLowerCase() === result.email.toLowerCase());
  if (!authUser) {
    return res.status(400).json({ error: 'Account not found.' });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
    password: newPassword,
  });

  if (updateError) {
    return res.status(500).json({ error: 'Failed to set password. Please try again.' });
  }

  res.json({ message: 'Password set successfully. You can now sign in.' });
});
```

- [ ] **Step 3: Import the new helpers at the top of `auth.js`**

Update the require from `helpers` to include:

```javascript
const { generateOtp, generateResetToken, storeOtp, verifyOtp,
        storeResetToken, verifyResetToken,
        storeRegistrationOtp, verifyRegistrationOtp } = require('../utils/helpers');
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: add verify-registration-otp and set-password endpoints"
```

---

### Task 4: Update Employee Creation to Use OTP

**Files:**
- Modify: `server/routes/employees.js`

Currently, `POST /api/employees` generates a default password and sends it via `sendEmployeeWelcomeEmail`. We change it to:
1. Create auth user with a random internal password (user never sees it)
2. Generate OTP + send via `sendEmployeeOtpEmail`
3. Employee uses OTP to set their own password

- [ ] **Step 1: Update imports**

Replace at top of `employees.js`:

```javascript
const { sendEmployeeOtpEmail } = require('../services/email');
const { generateOtp, storeRegistrationOtp } = require('../utils/helpers');
```

Remove `sendEmployeeWelcomeEmail` import if no longer used.

- [ ] **Step 2: Update the POST handler**

In the employee creation POST handler (around line 253), after the auth user is created successfully and the `tenant_users` INSERT succeeds, replace the welcome email section with:

```javascript
    // Send OTP email (employee verifies + sets own password)
    if (payload.send_welcome && payload.personal_email) {
      try {
        const otp = generateOtp();
        storeRegistrationOtp(payload.personal_email, otp, {
          type: 'employee',
          userId: authData.user.id,
          tenantId: req.tenantId,
          fullName,
        });
        await sendEmployeeOtpEmail({
          to: payload.personal_email,
          fullName,
          role: payload.role,
          businessName: businessName,
          otp,
        });
        logEvent('employee_otp_sent', { email: payload.personal_email });
      } catch (emailErr) {
        logError('employee_otp_email_failed', emailErr, { email: payload.personal_email });
        // Non-blocking: employee is created, OTP email just failed
      }
    }
```

- [ ] **Step 3: Add `POST /api/employees/:id/resend-otp` endpoint**

Add before `module.exports`:

```javascript
// POST /api/employees/:id/resend-otp — Resend OTP to employee
router.post('/:id/resend-otp', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only owners can resend OTP' });
  }

  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid employee id.' });
  }

  try {
    const { data: employee } = await supabaseAdmin
      .from('tenant_users')
      .select('id, full_name, role, personal_email')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .single();

    if (!employee || !employee.personal_email) {
      return res.status(404).json({ error: 'Employee not found or no email on file.' });
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_name')
      .eq('id', req.tenantId)
      .single();

    const otp = generateOtp();
    const stored = storeRegistrationOtp(employee.personal_email, otp, {
      type: 'employee',
      userId: employee.id,
      tenantId: req.tenantId,
      fullName: employee.full_name,
    });

    if (!stored.stored) {
      return res.status(429).json({ error: stored.reason });
    }

    await sendEmployeeOtpEmail({
      to: employee.personal_email,
      fullName: employee.full_name,
      role: employee.role,
      businessName: tenant?.business_name || 'Obsidian',
      otp,
    });

    res.json({ message: 'Verification code resent.' });
  } catch (err) {
    logError('employee_resend_otp_failed', err);
    res.status(500).json({ error: 'Failed to resend code.' });
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/employees.js
git commit -m "feat: replace employee temp password with OTP verification flow"
```

---

### Task 5: Update Customer Creation to Use OTP

**Files:**
- Modify: `server/routes/customers.js`

Currently, customer creation does NOT create an auth user. We need to:
1. Create an auth user (with random password) linked via `customers.auth_id`
2. Generate OTP + send via `sendCustomerOtpEmail`
3. Customer uses OTP in React Native app to set their password

- [ ] **Step 1: Update imports**

```javascript
const { sendCustomerOtpEmail } = require('../services/email');
const { generateOtp, storeRegistrationOtp, generateTempPassword } = require('../utils/helpers');
```

- [ ] **Step 2: Add auth user creation + OTP in the POST handler**

After the customer INSERT succeeds (around line 475), add:

```javascript
    // Create auth account for customer portal (if email provided)
    let authUserId = null;
    if (payload.email) {
      try {
        const internalPassword = generateTempPassword() + generateTempPassword(); // random, never shared
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: payload.email,
          password: internalPassword,
          email_confirm: true,
          user_metadata: {
            full_name: `${payload.first_name} ${payload.last_name}`,
            role: 'customer',
          },
        });

        if (authData?.user) {
          authUserId = authData.user.id;

          // Link auth_id to customer record
          await supabaseAdmin
            .from('customers')
            .update({ auth_id: authUserId })
            .eq('id', customer.id);

          // Send OTP email
          const otp = generateOtp();
          storeRegistrationOtp(payload.email, otp, {
            type: 'customer',
            userId: authUserId,
            tenantId: req.tenantId,
            fullName: `${payload.first_name} ${payload.last_name}`,
          });

          const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('business_name')
            .eq('id', req.tenantId)
            .single();

          await sendCustomerOtpEmail({
            to: payload.email,
            fullName: `${payload.first_name} ${payload.last_name}`,
            businessName: tenant?.business_name || 'Obsidian',
            otp,
          });

          logEvent('customer_otp_sent', { email: payload.email, customerId: customer.id });
        } else if (authError) {
          logError('customer_auth_create_failed', authError, { email: payload.email });
        }
      } catch (authErr) {
        logError('customer_auth_setup_failed', authErr, { email: payload.email });
        // Non-blocking: customer record exists, auth/OTP just failed
      }
    }
```

- [ ] **Step 3: Add `POST /api/customers/:id/resend-otp` endpoint**

```javascript
// POST /api/customers/:id/resend-otp — Resend OTP to customer
router.post('/:id/resend-otp', async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(422).json({ error: 'Invalid customer id.' });
  }

  try {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, first_name, last_name, email, auth_id')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .is('deleted_at', null)
      .single();

    if (!customer || !customer.email) {
      return res.status(404).json({ error: 'Customer not found or no email on file.' });
    }

    if (!customer.auth_id) {
      return res.status(400).json({ error: 'Customer has no portal account.' });
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_name')
      .eq('id', req.tenantId)
      .single();

    const fullName = `${customer.first_name} ${customer.last_name}`;
    const otp = generateOtp();
    const stored = storeRegistrationOtp(customer.email, otp, {
      type: 'customer',
      userId: customer.auth_id,
      tenantId: req.tenantId,
      fullName,
    });

    if (!stored.stored) {
      return res.status(429).json({ error: stored.reason });
    }

    await sendCustomerOtpEmail({
      to: customer.email,
      fullName,
      businessName: tenant?.business_name || 'Obsidian',
      otp,
    });

    res.json({ message: 'Verification code resent.' });
  } catch (err) {
    logError('customer_resend_otp_failed', err);
    res.status(500).json({ error: 'Failed to resend code.' });
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/customers.js
git commit -m "feat: add customer auth account creation with OTP verification"
```

---

### Task 6: Update MasterSchema.md

**Files:**
- Modify: `MasterSchema.md`

- [ ] **Step 1: Add note about `customers.auth_id` usage**

In the customers table comment, add:

```sql
-- customers.auth_id is populated when the owner creates a customer with an email.
-- The customer uses OTP verification to set their password and access the mobile app.
```

- [ ] **Step 2: Commit**

```bash
git add MasterSchema.md
git commit -m "docs: document customer auth_id OTP flow in MasterSchema"
```

---

## API Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/verify-registration-otp` | None | Verify OTP → returns resetToken |
| POST | `/api/auth/set-password` | None (uses resetToken) | Set password after OTP |
| POST | `/api/employees/:id/resend-otp` | Bearer (OWNER) | Resend OTP to employee |
| POST | `/api/customers/:id/resend-otp` | Bearer (OWNER+) | Resend OTP to customer |

## User Flow

**Employee:**
1. Owner creates employee in web app
2. Employee receives OTP email to their personal email
3. Employee opens `/login`, clicks "First time? Verify your account"
4. Enters email + OTP → gets resetToken
5. Sets their own password → redirected to login
6. Logs in with email + new password

**Customer:**
1. Owner creates customer in web app (with email)
2. Customer receives OTP email
3. Customer opens React Native app → "First time? Verify your account"
4. Enters email + OTP → gets resetToken
5. Sets their own password → redirected to login
6. Logs in with email + new password
