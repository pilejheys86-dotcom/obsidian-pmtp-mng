# Tenant Branding & Custom Subdomain Design

> **Date:** 2026-03-23
> **Status:** Draft
> **Author:** Claude (brainstorming session)

---

## Overview

Each tenant can configure a branded showcase page served at a subdomain under `obsidian-platform.tech` (e.g., `juans-pawnshop.obsidian-platform.tech`). The page displays the tenant's business name, logo, tagline, and a download button that links to their Android APK hosted on Google Drive. Configuration is done post-registration from the Settings page by OWNER or MANAGER roles.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Domain model | Subdomains under `obsidian-platform.tech` | Platform controls DNS; no per-tenant domain management |
| APK delivery | Google Drive link, auto-transformed for direct download | No file hosting infra needed; leverages existing Google Drive |
| Showcase content | Minimal — logo, business name, tagline, download button | Clean app-landing-page feel; no content management overhead |
| Who configures | OWNER and MANAGER | Matches existing settings page permission model |
| When configured | Post-registration from Settings page | Keeps registration flow simple |
| Routing approach | Wildcard subdomain + Express Host header detection | Stays within existing Express stack; no extra services |
| Showcase rendering | Server-side rendered HTML (not React SPA) | Fast, SEO-friendly, no JS bundle needed |
| Visual style | Light Centered | Stone/white background, centered layout, dark button with lime accent |

---

## Data Model

### New Table: `tenant_branding`

```sql
CREATE TABLE tenant_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  subdomain VARCHAR(63) UNIQUE,
  tagline VARCHAR(255),
  apk_download_url TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tenant_branding_subdomain ON tenant_branding(subdomain) WHERE subdomain IS NOT NULL;
```

**Fields reused from `tenants` table (via JOIN):**
- `business_name` — main heading on showcase page
- `logo_url` — logo displayed on showcase page

**Subdomain validation rules:**
- 3–63 characters
- Lowercase alphanumeric and hyphens only (`^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`)
- Cannot start or end with a hyphen
- Reserved slugs blocked: `www`, `app`, `api`, `admin`, `mail`, `ftp`, `static`, `assets`, `cdn`, `dev`, `staging`

**RLS policy:**
- SELECT/UPDATE: `tenant_id = get_my_tenant_id()` (same pattern as other tenant tables)
- INSERT: Only if no existing row for that `tenant_id`
- Public SELECT: Allowed on `subdomain`, `tagline`, `apk_download_url`, `is_published` for showcase rendering (via service key or RLS exemption for the showcase route)

---

## Google Drive Link Transform

The backend auto-transforms Google Drive share links to direct download URLs on save.

**Input formats supported:**
```
https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing
https://drive.google.com/file/d/{FILE_ID}/view
https://drive.google.com/open?id={FILE_ID}
```

**Transformed to:**
```
https://drive.google.com/uc?export=download&id={FILE_ID}
```

**Non-Google-Drive URLs** are stored as-is (supports Play Store links, other hosts, etc.).

**Note:** Google Drive direct downloads work reliably for files under ~100MB. Most APKs (30–80MB) fall within this range. Files over 100MB may trigger Google's virus scan confirmation page.

---

## Subdomain Routing Architecture

### DNS Configuration

One wildcard A record on the domain registrar:
```
*.obsidian-platform.tech  →  A  →  <server IP>
```

One wildcard SSL certificate (Let's Encrypt via DNS-01 challenge).

### Request Flow

```
Browser: juans-pawnshop.obsidian-platform.tech
  → DNS resolves *.obsidian-platform.tech → server IP
  → Express middleware: subdomainResolver.js
    → Parses Host header → extracts "juans-pawnshop"
    → If no subdomain (bare domain) → pass through to normal app
    → If subdomain is reserved (www, app, api, admin) → pass through
    → Query: tenant_branding WHERE subdomain = 'juans-pawnshop' AND is_published = true
      → JOIN tenants for business_name, logo_url
    → If found → render showcase HTML template, respond 200
    → If not found → render 404 page
```

### New Middleware: `server/middleware/subdomainResolver.js`

- Runs early in the Express middleware chain (before auth, before tenantScope)
- Only intercepts requests with a recognized tenant subdomain
- Does NOT affect existing routes on the bare domain (`obsidian-platform.tech/login`, `/admin/*`, etc.)
- Bypasses auth middleware entirely (showcase is public)

### Reserved Subdomains

Hardcoded blocklist: `www`, `app`, `api`, `admin`, `mail`, `ftp`, `static`, `assets`, `cdn`, `dev`, `staging`

---

## API Endpoints

### Authenticated (tenant context required)

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/branding` | OWNER, MANAGER | Get current tenant's branding config |
| PUT | `/api/branding` | OWNER, MANAGER | Update subdomain, tagline, APK link, publish toggle |
| GET | `/api/branding/check-subdomain/:slug` | OWNER, MANAGER | Check subdomain availability (returns `{ available: boolean }`) |

### Route File: `server/routes/branding.js`

**GET `/api/branding`**
- Looks up `tenant_branding` by `req.tenantId`
- JOINs `tenants` for `business_name` and `logo_url`
- Returns branding config or empty object if not yet configured

**PUT `/api/branding`**
- Accepts: `{ subdomain, tagline, apk_download_url, is_published }`
- Validates subdomain format and availability
- Auto-transforms Google Drive URLs to direct download format
- Upserts `tenant_branding` row (INSERT on first save, UPDATE thereafter)
- Returns updated branding config

**GET `/api/branding/check-subdomain/:slug`**
- Validates format
- Checks against reserved list
- Queries `tenant_branding` for existing claim
- Returns `{ available: true/false, reason?: string }`

---

## Showcase Page (Server-Side Rendered)

### Template: `server/views/showcase.html` (or EJS)

**Visual style: Light Centered**
- Background: stone/off-white gradient (`#fafaf9` to `#e7e5e4`)
- Centered vertical layout
- Logo: 80px rounded square, dark background with lime initial (or tenant's `logo_url` image)
- Business name: 28px bold, dark text
- Tagline: 14px, muted stone color
- Download button: dark background (`#171717`), lime text (`#A3E635`), rounded, with download icon
- Footer: "Powered by OBSIDIAN" in small muted text

**Template data injected:**
```js
{
  business_name: "Juan's Pawnshop",
  logo_url: "https://...", // or null
  tagline: "Your trusted neighborhood pawnshop since 1995",
  apk_download_url: "https://drive.google.com/uc?export=download&id=ABC123"
}
```

**The page is:**
- Static HTML + inline CSS (no React, no JS bundle)
- Mobile-responsive (centered layout scales naturally)
- Loads fast (no external dependencies beyond the logo image)
- SEO-friendly with proper meta tags (title = business name, description = tagline)

### 404 Page

When a subdomain doesn't match any published tenant:
- Same light centered style
- "This page doesn't exist" message
- Link back to `obsidian-platform.tech`

---

## Frontend: Settings Page Addition

### Location: `src/pages/owner/SettingsPage.jsx`

Add a **"Branding"** tab/section alongside existing loan settings, gold rates, and branches.

**Form fields:**
1. **Subdomain** — text input with `.obsidian-platform.tech` suffix displayed inline. Debounced availability check as user types (calls `/api/branding/check-subdomain/:slug`). Green checkmark when available, red X when taken.
2. **Tagline** — text input, 255 char max, with character counter
3. **APK Download Link** — URL input, placeholder: "Paste your Google Drive share link"
4. **Publish** — toggle switch. Disabled until subdomain and APK link are both filled.
5. **Preview link** — when published, shows clickable `https://{subdomain}.obsidian-platform.tech` that opens in new tab

**API integration:**
- On mount: `GET /api/branding` to populate form
- On save: `PUT /api/branding` with form data
- Subdomain input: debounced `GET /api/branding/check-subdomain/:slug`

### Navigation Update

Add branding section to `src/config/navigation.js` for OWNER and MANAGER roles — or simply integrate it as a tab within the existing Settings page (no new nav item needed).

---

## Security Considerations

1. **Subdomain squatting** — reserved list prevents claiming system subdomains. First-come-first-served for others.
2. **XSS in showcase** — all tenant-provided content (business name, tagline) must be HTML-escaped when rendered in the template. No raw HTML injection.
3. **Open redirect via APK URL** — the download button links to an external URL. This is intentional and expected. The URL is validated as a proper URL format on save.
4. **RLS** — `tenant_branding` follows the same tenant isolation pattern as all other tables.
5. **Rate limiting** — subdomain availability check should be rate-limited to prevent enumeration.

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `sql/101_tenant_branding.sql` | Migration: create table, index, RLS policies |
| `server/middleware/subdomainResolver.js` | Host header parsing + showcase routing |
| `server/routes/branding.js` | CRUD API for branding config |
| `server/views/showcase.html` | SSR template for tenant showcase page |
| `server/views/404.html` | Subdomain not found page |
| `server/utils/googleDrive.js` | Google Drive URL transform helper |

### Modified Files
| File | Change |
|------|--------|
| `server/index.js` | Register subdomainResolver middleware (early), mount branding routes, serve showcase views |
| `src/pages/owner/SettingsPage.jsx` | Add Branding tab/section |
| `src/lib/api.js` | Add `brandingApi` module |
| `src/config/navigation.js` | Add branding to OWNER/MANAGER settings (if separate page) |
| `MasterSchema.md` | Document `tenant_branding` table |
| `CLAUDE.md` | Update implemented features list |
