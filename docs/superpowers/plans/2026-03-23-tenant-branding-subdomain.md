# Tenant Branding & Custom Subdomain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow tenants to configure a branded showcase page at `{slug}.obsidian-platform.tech` displaying their business name, logo, tagline, and an APK download button (Google Drive link).

**Architecture:** New `tenant_branding` table stores subdomain + tagline + APK URL per tenant. Express middleware intercepts subdomain requests early (before auth) and serves a server-side rendered HTML showcase page. Branding is configured from the Settings page by OWNER/MANAGER roles.

**Tech Stack:** Express.js middleware, Supabase PostgreSQL + RLS, EJS-free HTML template (string interpolation), React settings UI

**Spec:** `docs/superpowers/specs/2026-03-23-tenant-branding-custom-domain-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `sql/104_tenant_branding.sql` | Create | Migration: table, index, RLS policies |
| `server/utils/googleDrive.js` | Create | Google Drive URL transform helper |
| `server/utils/helpers.js` | Modify | Add subdomain validation + reserved list |
| `server/middleware/subdomainResolver.js` | Create | Host header parsing → showcase or passthrough |
| `server/views/showcase.html` | Create | SSR HTML template for tenant showcase page |
| `server/views/404.html` | Create | Subdomain not found page |
| `server/routes/branding.js` | Create | CRUD API for branding config |
| `server/index.js` | Modify | Register middleware + routes + static views |
| `src/lib/api.js` | Modify | Add `brandingApi` module |
| `src/pages/owner/SettingsPage.jsx` | Modify | Add Branding tab with form fields |
| `MasterSchema.md` | Modify | Document `tenant_branding` table |
| `CLAUDE.md` | Modify | Add to implemented features list |

---

## Task 1: Database Migration

**Files:**
- Create: `sql/104_tenant_branding.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 104_tenant_branding.sql
-- Tenant branding & custom subdomain showcase

CREATE TABLE tenant_branding (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  subdomain   VARCHAR(63) UNIQUE,
  tagline     VARCHAR(255),
  apk_download_url TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by subdomain for showcase routing
CREATE INDEX idx_tenant_branding_subdomain
  ON tenant_branding(subdomain)
  WHERE subdomain IS NOT NULL;

-- RLS
ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own branding
CREATE POLICY tenant_branding_select ON tenant_branding
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    OR is_super_admin()
  );

-- OWNER and MANAGER can insert/update
CREATE POLICY tenant_branding_insert ON tenant_branding
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('OWNER', 'MANAGER')
  );

CREATE POLICY tenant_branding_update ON tenant_branding
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('OWNER', 'MANAGER')
  );

-- Grant
GRANT SELECT, INSERT, UPDATE ON tenant_branding TO authenticated;
```

- [ ] **Step 2: Run migration in Supabase**

Run the SQL in Supabase SQL Editor. Verify:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'tenant_branding' ORDER BY ordinal_position;
```

Expected: 8 columns (id, tenant_id, subdomain, tagline, apk_download_url, is_published, created_at, updated_at).

- [ ] **Step 3: Commit**

```bash
git add sql/104_tenant_branding.sql
git commit -m "feat: add tenant_branding table migration"
```

---

## Task 2: Google Drive URL Transform Utility

**Files:**
- Create: `server/utils/googleDrive.js`

- [ ] **Step 1: Create the utility**

```javascript
// server/utils/googleDrive.js

/**
 * Transform a Google Drive share link to a direct download URL.
 * Non-Google-Drive URLs are returned as-is.
 *
 * Supported input formats:
 *   https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing
 *   https://drive.google.com/file/d/{FILE_ID}/view
 *   https://drive.google.com/open?id={FILE_ID}
 *
 * Output:
 *   https://drive.google.com/uc?export=download&id={FILE_ID}
 */
function transformGoogleDriveUrl(url) {
  if (!url) return url;

  // Pattern 1: /file/d/{id}/...
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  }

  // Pattern 2: ?id={id}
  const idMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
  }

  // Not a Google Drive link — return as-is
  return url;
}

module.exports = { transformGoogleDriveUrl };
```

- [ ] **Step 2: Verify manually**

Test in Node REPL:
```bash
node -e "
const { transformGoogleDriveUrl } = require('./server/utils/googleDrive');
console.log(transformGoogleDriveUrl('https://drive.google.com/file/d/ABC123/view?usp=sharing'));
console.log(transformGoogleDriveUrl('https://drive.google.com/open?id=XYZ789'));
console.log(transformGoogleDriveUrl('https://example.com/app.apk'));
"
```

Expected:
```
https://drive.google.com/uc?export=download&id=ABC123
https://drive.google.com/uc?export=download&id=XYZ789
https://example.com/app.apk
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/googleDrive.js
git commit -m "feat: add Google Drive URL transform utility"
```

---

## Task 3: Subdomain Validation Helper

**Files:**
- Modify: `server/utils/helpers.js`

- [ ] **Step 1: Add subdomain validation to helpers.js**

Append to the end of `server/utils/helpers.js`, before `module.exports`:

```javascript
// ── Subdomain Validation ─────────────────────────────────
const RESERVED_SUBDOMAINS = [
  'www', 'app', 'api', 'admin', 'mail', 'ftp',
  'static', 'assets', 'cdn', 'dev', 'staging',
];

/**
 * Validate subdomain format.
 * Rules: 3-63 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens.
 */
const isValidSubdomain = (subdomain) => {
  if (!subdomain || typeof subdomain !== 'string') return false;
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(subdomain);
};

const isReservedSubdomain = (subdomain) => {
  return RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase());
};
```

Then add `isValidSubdomain`, `isReservedSubdomain`, and `RESERVED_SUBDOMAINS` to the `module.exports` object.

- [ ] **Step 2: Verify**

```bash
node -e "
const { isValidSubdomain, isReservedSubdomain } = require('./server/utils/helpers');
console.log(isValidSubdomain('juans-pawnshop'));   // true
console.log(isValidSubdomain('-bad'));              // false
console.log(isValidSubdomain('ab'));                // false (too short)
console.log(isReservedSubdomain('www'));            // true
console.log(isReservedSubdomain('juans-pawnshop')); // false
"
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/helpers.js
git commit -m "feat: add subdomain validation helpers"
```

---

## Task 4: Showcase HTML Templates

**Files:**
- Create: `server/views/showcase.html`
- Create: `server/views/404.html`

- [ ] **Step 1: Create the showcase template**

The showcase page is **Light Centered** style — a single static HTML page with placeholders for template interpolation. No EJS needed; we'll use simple string replacement in the route handler.

Create `server/views/showcase.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{BUSINESS_NAME}}</title>
  <meta name="description" content="{{TAGLINE}}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: linear-gradient(135deg, #fafaf9, #e7e5e4);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: #1c1917;
    }
    .showcase {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 24px;
      max-width: 420px;
    }
    .logo {
      width: 80px;
      height: 80px;
      border-radius: 20px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #171717;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 32px;
      font-weight: 800;
      color: #A3E635;
    }
    .logo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .name {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #171717;
    }
    .tagline {
      font-size: 14px;
      color: #78716c;
      margin-top: -16px;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: #171717;
      color: #A3E635;
      padding: 14px 32px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 16px;
      text-decoration: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      margin-top: 8px;
    }
    .download-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }
    .download-btn svg { flex-shrink: 0; }
    .powered {
      margin-top: 32px;
      font-size: 11px;
      color: #a8a29e;
    }
    .powered span {
      color: #171717;
      font-weight: 600;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="showcase">
    <div class="logo">
      {{LOGO_HTML}}
    </div>
    <h1 class="name">{{BUSINESS_NAME}}</h1>
    <p class="tagline {{TAGLINE_CLASS}}">{{TAGLINE}}</p>
    <a href="{{APK_URL}}" class="download-btn {{DOWNLOAD_CLASS}}" download>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download App
    </a>
    <p class="powered">Powered by <span>OBSIDIAN</span></p>
  </div>
</body>
</html>
```

- [ ] **Step 2: Create the 404 template**

Create `server/views/404.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: linear-gradient(135deg, #fafaf9, #e7e5e4);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: #1c1917;
      text-align: center;
    }
    h1 {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 24px;
      font-weight: 800;
      color: #171717;
      margin-bottom: 8px;
    }
    p {
      font-size: 14px;
      color: #78716c;
      margin-bottom: 24px;
    }
    a {
      color: #171717;
      font-weight: 600;
      text-decoration: none;
      border-bottom: 2px solid #A3E635;
      padding-bottom: 2px;
    }
    a:hover { color: #A3E635; }
  </style>
</head>
<body>
  <h1>This page doesn't exist</h1>
  <p>The subdomain you're looking for hasn't been set up yet.</p>
  <a href="https://obsidian-platform.tech">Go to Obsidian</a>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add server/views/showcase.html server/views/404.html
git commit -m "feat: add showcase and 404 HTML templates"
```

---

## Task 5: Subdomain Resolver Middleware

**Files:**
- Create: `server/middleware/subdomainResolver.js`

- [ ] **Step 1: Create the middleware**

```javascript
// server/middleware/subdomainResolver.js
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/db');

// Pre-load templates once at startup
const showcaseTemplate = fs.readFileSync(
  path.join(__dirname, '../views/showcase.html'), 'utf-8'
);
const notFoundPage = fs.readFileSync(
  path.join(__dirname, '../views/404.html'), 'utf-8'
);

// Platform domain — subdomains are extracted relative to this
const PLATFORM_DOMAIN = 'obsidian-platform.tech';

// Subdomains that pass through to the main app
const PASSTHROUGH = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'ftp',
  'static', 'assets', 'cdn', 'dev', 'staging',
]);

/**
 * Extract subdomain from Host header.
 * Returns null if bare domain, localhost, or passthrough subdomain.
 */
function extractSubdomain(host) {
  if (!host) return null;

  // Strip port
  const hostname = host.split(':')[0];

  // Skip localhost / IP addresses
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  // Check if request is for our platform domain
  if (!hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
    return null;
  }

  // Extract subdomain part
  const subdomain = hostname.slice(0, -(PLATFORM_DOMAIN.length + 1));

  // Skip passthrough subdomains or empty
  if (!subdomain || PASSTHROUGH.has(subdomain)) {
    return null;
  }

  return subdomain;
}

/**
 * Render the showcase template with tenant data.
 */
function renderShowcase(tenant) {
  const logoHtml = tenant.logo_url
    ? `<img src="${escapeHtml(tenant.logo_url)}" alt="${escapeHtml(tenant.business_name)}">`
    : escapeHtml(tenant.business_name.charAt(0).toUpperCase());

  return showcaseTemplate
    .replace(/\{\{BUSINESS_NAME\}\}/g, escapeHtml(tenant.business_name))
    .replace('{{LOGO_HTML}}', logoHtml)
    .replace(/\{\{TAGLINE\}\}/g, escapeHtml(tenant.tagline || ''))
    .replace('{{TAGLINE_CLASS}}', tenant.tagline ? '' : 'hidden')
    .replace('{{APK_URL}}', escapeHtml(tenant.apk_download_url || '#'))
    .replace('{{DOWNLOAD_CLASS}}', tenant.apk_download_url ? '' : 'hidden');
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Middleware: intercept subdomain requests and serve showcase page.
 * If no subdomain detected, pass through to normal Express routes.
 */
const subdomainResolver = async (req, res, next) => {
  const subdomain = extractSubdomain(req.headers.host);

  // No subdomain — continue to normal app routes
  if (!subdomain) return next();

  try {
    // Look up branding + tenant info
    const { data: branding, error } = await supabaseAdmin
      .from('tenant_branding')
      .select('subdomain, tagline, apk_download_url, is_published, tenants(business_name, logo_url)')
      .eq('subdomain', subdomain)
      .eq('is_published', true)
      .single();

    if (error || !branding) {
      return res.status(404).type('html').send(notFoundPage);
    }

    // Flatten tenant data
    const tenant = {
      business_name: branding.tenants.business_name,
      logo_url: branding.tenants.logo_url,
      tagline: branding.tagline,
      apk_download_url: branding.apk_download_url,
    };

    return res.status(200).type('html').send(renderShowcase(tenant));
  } catch (err) {
    console.error('[SubdomainResolver]', err.message);
    return res.status(500).type('html').send(notFoundPage);
  }
};

module.exports = subdomainResolver;
```

- [ ] **Step 2: Commit**

```bash
git add server/middleware/subdomainResolver.js
git commit -m "feat: add subdomain resolver middleware for showcase pages"
```

---

## Task 6: Branding API Routes

**Files:**
- Create: `server/routes/branding.js`

- [ ] **Step 1: Create the route file**

```javascript
// server/routes/branding.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { isValidSubdomain, isReservedSubdomain } = require('../utils/helpers');
const { transformGoogleDriveUrl } = require('../utils/googleDrive');

// Only OWNER and MANAGER can access branding
const requireOwnerOrManager = (req, res, next) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can manage branding' });
  }
  next();
};

router.use(requireOwnerOrManager);

// GET /api/branding — get current tenant's branding config
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenant_branding')
      .select('*, tenants(business_name, logo_url)')
      .eq('tenant_id', req.tenantId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No row yet — return empty config
      return res.json(null);
    }
    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (err) {
    console.error('[Branding GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

// PUT /api/branding — upsert branding config
router.put('/', async (req, res) => {
  try {
    const { subdomain, tagline, apk_download_url, is_published } = req.body;

    // Validate subdomain if provided
    if (subdomain !== undefined && subdomain !== null) {
      const slug = subdomain.toLowerCase().trim();

      if (!isValidSubdomain(slug)) {
        return res.status(400).json({
          error: 'Invalid subdomain. Use 3-63 lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.'
        });
      }

      if (isReservedSubdomain(slug)) {
        return res.status(400).json({ error: 'This subdomain is reserved' });
      }

      // Check uniqueness (exclude own tenant)
      const { data: existing } = await supabaseAdmin
        .from('tenant_branding')
        .select('tenant_id')
        .eq('subdomain', slug)
        .neq('tenant_id', req.tenantId)
        .single();

      if (existing) {
        return res.status(409).json({ error: 'This subdomain is already taken' });
      }
    }

    // Transform Google Drive URL
    const transformedUrl = apk_download_url
      ? transformGoogleDriveUrl(apk_download_url)
      : apk_download_url;

    // Build upsert payload
    const payload = {
      tenant_id: req.tenantId,
      updated_at: new Date().toISOString(),
    };
    if (subdomain !== undefined) payload.subdomain = subdomain?.toLowerCase().trim() || null;
    if (tagline !== undefined) payload.tagline = tagline?.trim() || null;
    if (apk_download_url !== undefined) payload.apk_download_url = transformedUrl || null;
    if (is_published !== undefined) payload.is_published = !!is_published;

    const { data, error } = await supabaseAdmin
      .from('tenant_branding')
      .upsert(payload, { onConflict: 'tenant_id' })
      .select('*, tenants(business_name, logo_url)')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (err) {
    console.error('[Branding PUT]', err.message);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});

// GET /api/branding/check-subdomain/:slug — check availability
router.get('/check-subdomain/:slug', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase().trim();

    if (!isValidSubdomain(slug)) {
      return res.json({ available: false, reason: 'Invalid format' });
    }

    if (isReservedSubdomain(slug)) {
      return res.json({ available: false, reason: 'Reserved' });
    }

    const { data: existing } = await supabaseAdmin
      .from('tenant_branding')
      .select('tenant_id')
      .eq('subdomain', slug)
      .neq('tenant_id', req.tenantId)
      .single();

    res.json({ available: !existing });
  } catch (err) {
    console.error('[Branding Check]', err.message);
    res.status(500).json({ error: 'Failed to check subdomain' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Register route in server/index.js**

Add import near line 30 (with other route imports):
```javascript
const brandingRoutes = require('./routes/branding');
```

Add route registration near line 96 (with other protected routes):
```javascript
app.use('/api/branding', auth, tenantScope, brandingRoutes);
```

- [ ] **Step 3: Register subdomain middleware in server/index.js**

Add import near line 9 (with other middleware):
```javascript
const subdomainResolver = require('./middleware/subdomainResolver');
```

Add middleware right after `express.json()` (after line 61), before the root route:
```javascript
app.use(subdomainResolver);
```

This must be BEFORE all routes so subdomain requests get intercepted early.

- [ ] **Step 4: Commit**

```bash
git add server/routes/branding.js server/index.js
git commit -m "feat: add branding API routes and wire up middleware"
```

---

## Task 7: Frontend API Module

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add brandingApi to api.js**

Add after the `loanSettingsApi` block (around line 347):

```javascript
// ── Branding ─────────────────────────────────────────────
export const brandingApi = {
  get: () => apiFetch('/branding'),
  update: (data) =>
    apiFetch('/branding', { method: 'PUT', body: JSON.stringify(data) }),
  checkSubdomain: (slug) => apiFetch(`/branding/check-subdomain/${encodeURIComponent(slug)}`),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.js
git commit -m "feat: add brandingApi module to frontend API wrapper"
```

---

## Task 8: Settings Page — Branding Tab

**Files:**
- Modify: `src/pages/owner/SettingsPage.jsx`

- [ ] **Step 1: Add branding category to settingsCategories array**

Change `settingsCategories` (line 39) to include the new tab:

```javascript
const settingsCategories = [
  { icon: 'palette', label: 'Appearance', id: 'appearance' },
  { icon: 'language', label: 'Branding', id: 'branding' },
  { icon: 'notifications_active', label: 'Notifications', id: 'notifications' },
  { icon: 'security', label: 'Security', id: 'security' },
  { icon: 'backup', label: 'Backup & Data', id: 'backup' },
  { icon: 'integration_instructions', label: 'Integrations', id: 'integrations' },
];
```

- [ ] **Step 2: Add branding state and logic to SettingsPage component**

Add these imports at the top of the file:

```javascript
import { useState, useEffect, useCallback } from 'react';
import { brandingApi } from '../../lib/api';
```

Inside the `SettingsPage` component, add branding state (after the existing `settings` state around line 68):

```javascript
// Branding state
const [branding, setBranding] = useState({
  subdomain: '',
  tagline: '',
  apk_download_url: '',
  is_published: false,
});
const [brandingLoading, setBrandingLoading] = useState(false);
const [brandingSaving, setBrandingSaving] = useState(false);
const [brandingMessage, setBrandingMessage] = useState(null);
const [subdomainStatus, setSubdomainStatus] = useState(null); // { available, reason }
const [subdomainChecking, setSubdomainChecking] = useState(false);

// Load branding on mount
useEffect(() => {
  if (activeCategory === 'branding') {
    setBrandingLoading(true);
    brandingApi.get()
      .then(data => {
        if (data) {
          setBranding({
            subdomain: data.subdomain || '',
            tagline: data.tagline || '',
            apk_download_url: data.apk_download_url || '',
            is_published: data.is_published || false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setBrandingLoading(false));
  }
}, [activeCategory]);

// Debounced subdomain check
useEffect(() => {
  if (!branding.subdomain || branding.subdomain.length < 3) {
    setSubdomainStatus(null);
    return;
  }
  setSubdomainChecking(true);
  const timer = setTimeout(() => {
    brandingApi.checkSubdomain(branding.subdomain)
      .then(setSubdomainStatus)
      .catch(() => setSubdomainStatus(null))
      .finally(() => setSubdomainChecking(false));
  }, 500);
  return () => clearTimeout(timer);
}, [branding.subdomain]);

// Save branding
const handleBrandingSave = async () => {
  setBrandingSaving(true);
  setBrandingMessage(null);
  try {
    await brandingApi.update(branding);
    setBrandingMessage({ type: 'success', text: 'Branding saved successfully!' });
  } catch (err) {
    setBrandingMessage({ type: 'error', text: err.message });
  } finally {
    setBrandingSaving(false);
  }
};

const handleBrandingChange = (key) => (e) => {
  const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  setBranding(prev => ({ ...prev, [key]: value }));
};
```

- [ ] **Step 3: Add branding section JSX**

After the Appearance section block (after line 191), add the Branding section:

```jsx
{/* Branding Settings */}
{activeCategory === 'branding' && (
  <div className="profile-section">
    <div className="profile-section-header">
      <div className="profile-section-icon">
        <span className="material-symbols-outlined">language</span>
      </div>
      <div>
        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
          Business Branding
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Configure your public showcase page and app download link.
        </p>
      </div>
    </div>

    {brandingLoading ? (
      <div className="flex items-center justify-center py-12">
        <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
      </div>
    ) : (
      <div className="space-y-6">
        {/* Subdomain */}
        <div>
          <label className="form-label">Subdomain</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="profile-input flex-1"
              placeholder="your-business"
              value={branding.subdomain}
              onChange={handleBrandingChange('subdomain')}
              maxLength={63}
            />
            <span className="text-sm text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
              .obsidian-platform.tech
            </span>
          </div>
          {subdomainChecking && (
            <p className="text-xs text-neutral-400 mt-1">Checking availability...</p>
          )}
          {subdomainStatus && !subdomainChecking && (
            <p className={`text-xs mt-1 ${subdomainStatus.available ? 'text-emerald-600' : 'text-red-500'}`}>
              {subdomainStatus.available ? 'Available!' : subdomainStatus.reason || 'Taken'}
            </p>
          )}
        </div>

        {/* Tagline */}
        <div>
          <label className="form-label">Tagline</label>
          <input
            type="text"
            className="profile-input"
            placeholder="Your trusted pawnshop since 1995"
            value={branding.tagline}
            onChange={handleBrandingChange('tagline')}
            maxLength={255}
          />
          <p className="text-xs text-neutral-400 mt-1">{branding.tagline.length}/255</p>
        </div>

        {/* APK Download Link */}
        <div>
          <label className="form-label">APK Download Link</label>
          <input
            type="url"
            className="profile-input"
            placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
            value={branding.apk_download_url}
            onChange={handleBrandingChange('apk_download_url')}
          />
          <p className="text-xs text-neutral-400 mt-1">
            Paste your Google Drive share link. It will be auto-converted for direct download.
          </p>
        </div>

        {/* Publish Toggle */}
        <ToggleSwitch
          id="publish-showcase"
          icon="public"
          label="Publish Showcase"
          description={
            branding.subdomain && branding.is_published
              ? `Live at ${branding.subdomain}.obsidian-platform.tech`
              : 'Make your showcase page publicly accessible'
          }
          checked={branding.is_published}
          onChange={handleBrandingChange('is_published')}
        />

        {/* Preview Link */}
        {branding.subdomain && branding.is_published && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-sm border border-emerald-200 dark:border-emerald-800">
            <p className="text-sm text-emerald-800 dark:text-emerald-300">
              Your showcase is live at{' '}
              <a
                href={`https://${branding.subdomain}.obsidian-platform.tech`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline"
              >
                {branding.subdomain}.obsidian-platform.tech
              </a>
            </p>
          </div>
        )}

        {/* Save button + message */}
        {brandingMessage && (
          <p className={`text-sm ${brandingMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
            {brandingMessage.text}
          </p>
        )}
        <button
          className="btn-primary"
          onClick={handleBrandingSave}
          disabled={brandingSaving}
        >
          {brandingSaving ? 'Saving...' : 'Save Branding'}
        </button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/owner/SettingsPage.jsx
git commit -m "feat: add branding tab to settings page with subdomain, tagline, APK link"
```

---

## Task 9: Update Documentation

**Files:**
- Modify: `MasterSchema.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add tenant_branding to MasterSchema.md**

Add after the `kyc_documents` section (Group 4), as a new group:

```markdown
#### Group 5: Tenant Branding

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `tenant_branding` | id, tenant_id (UNIQUE), subdomain (UNIQUE), tagline, apk_download_url, is_published | Public showcase page config |
```

- [ ] **Step 2: Update CLAUDE.md implemented features**

Add to the implemented features checklist:

```markdown
- [x] Tenant branding (subdomain showcase page, APK download link, Google Drive URL transform)
```

- [ ] **Step 3: Commit**

```bash
git add MasterSchema.md CLAUDE.md
git commit -m "docs: document tenant_branding table and branding feature"
```

---

## Task 10: End-to-End Manual Testing

- [ ] **Step 1: Test API — save branding config**

Using a tool like curl or the browser console:
```bash
# Save branding (replace TOKEN with a valid OWNER JWT)
curl -X PUT http://localhost:5000/api/branding \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subdomain": "test-pawnshop",
    "tagline": "Your trusted neighborhood pawnshop",
    "apk_download_url": "https://drive.google.com/file/d/ABC123/view?usp=sharing",
    "is_published": true
  }'
```

Expected: 200 with branding object. `apk_download_url` should be transformed to `https://drive.google.com/uc?export=download&id=ABC123`.

- [ ] **Step 2: Test subdomain availability check**

```bash
curl http://localhost:5000/api/branding/check-subdomain/www \
  -H "Authorization: Bearer TOKEN"
```

Expected: `{ "available": false, "reason": "Reserved" }`

- [ ] **Step 3: Test showcase page rendering**

This requires either:
- Updating `/etc/hosts` to map `test-pawnshop.obsidian-platform.tech` to `127.0.0.1`
- Or testing via the middleware directly by setting the Host header:

```bash
curl -H "Host: test-pawnshop.obsidian-platform.tech" http://localhost:5000/
```

Expected: 200 with HTML containing "test-pawnshop" business name and the download button.

- [ ] **Step 4: Test 404 for unknown subdomain**

```bash
curl -H "Host: nonexistent.obsidian-platform.tech" http://localhost:5000/
```

Expected: 404 with "This page doesn't exist" HTML.

- [ ] **Step 5: Test Settings page UI**

1. Login as OWNER
2. Navigate to Settings → Branding tab
3. Enter subdomain, tagline, APK link
4. Verify subdomain availability check works (green/red indicator)
5. Toggle publish on
6. Click Save
7. Verify preview link appears

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
