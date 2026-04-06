# Tenant Public Landing Page & Business Branding Setup

> **Date:** 2026-04-02
> **Status:** Approved

---

## Overview

Tenants get a public-facing landing page at `/s/:slug` that showcases their business, lists services, and lets prospective customers request account access. A post-payment onboarding wizard guides them through setup. All branding is editable anytime via `/admin/branding`.

---

## Data Model Changes

### `tenant_branding` — add 3 columns

| Column | Type | Description |
|--------|------|-------------|
| `brand_color` | TEXT | Hex color string, e.g. `#A3E635` |
| `font_family` | TEXT | Google Font name, e.g. `"Playfair Display"` |
| `services_enabled` | JSONB | Array of enabled service slugs, e.g. `["gold_jewelry", "electronics"]` |

Existing columns (`subdomain`, `tagline`, `apk_download_url`, `is_published`) remain unchanged. `tenants.logo_url` and `tenants.business_name` are already present and used as-is.

### New table: `customer_access_requests`

```sql
CREATE TABLE customer_access_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  mobile_number   TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by     UUID REFERENCES tenant_users(id),
  reviewed_at     TIMESTAMPTZ,
  notes           TEXT
);
```

RLS: tenants can only read/write their own rows. Public INSERT allowed (no auth required — this is submitted from the public page).

### Predefined Services (frontend constant, no DB table)

```js
const PAWNSHOP_SERVICES = [
  { slug: 'gold_jewelry',    label: 'Gold & Jewelry',    icon: 'diamond' },
  { slug: 'electronics',     label: 'Electronics',       icon: 'smartphone' },
  { slug: 'watches',         label: 'Watches',           icon: 'watch' },
  { slug: 'bags_apparel',    label: 'Bags & Apparel',    icon: 'shopping_bag' },
  { slug: 'power_tools',     label: 'Power Tools',       icon: 'construction' },
  { slug: 'musical_instruments', label: 'Musical Instruments', icon: 'music_note' },
  { slug: 'title_loans',     label: 'Title Loans',       icon: 'article' },
]
```

---

## Feature 1 — Onboarding Wizard (`/admin/branding/setup`)

### Trigger
After subscription payment is confirmed, `SubscriptionPage.jsx` currently redirects to `/admin`. This is changed to redirect to `/admin/branding/setup` instead — but only on first-time payment (i.e., when the tenant has no existing `tenant_branding` row, or `brand_color` is null). Subsequent subscription renewals continue redirecting to `/admin`.

### Layout
Side-by-side panel: step list on the left, active step form on the right. Matches the existing registration wizard aesthetic.

### Steps

**Step 1 — Identity**
- Business name (pre-filled from `tenants.business_name`, editable). Saving this step also updates `tenants.business_name`.
- Logo URL (text input; must be a square 1:1 image). Saving this step also updates `tenants.logo_url`.

**Step 2 — Branding**
- Brand color: color wheel + HSL sliders + hex input. One color only.
- Business name font: chip grid grouped into Serif / Sans / Display tabs. Curated list of ~12 Google Fonts (4 per category). Selection previews the font name in that typeface.

**Step 3 — Services**
- Checklist of `PAWNSHOP_SERVICES`. Toggle each on/off. At least one must be selected to proceed.

### Skip behavior
"Set up later" link in the left panel (visible on all 3 steps). Clicking it navigates to `/admin` without saving the current unsaved step. Any steps already saved (by clicking Next) are retained. No blocking — the wizard is not automatically shown again; the dashboard nudge handles re-entry.

### Completion
On finishing Step 3, branding is saved with `is_published: false` and the user is redirected to `/admin/branding` (Publish tab) to review and go live.

---

## Feature 2 — Branding Management Page (`/admin/branding`)

A dedicated page (not inside Settings) accessible from the sidebar navigation. Restricted to OWNER and MANAGER roles.

### Layout
Left sidebar nav + right content area. Three tabs:

**Appearance tab**
- Logo URL field with live square preview
- Brand color: color swatch (click to open inline color picker with wheel + HSL sliders + hex input)
- Business name font: chip grid (Serif / Sans / Display category tabs, ~12 options total)

**Services tab**
- Toggle list of predefined `PAWNSHOP_SERVICES`. Each row shows icon + label + toggle. Minimum 1 must remain enabled.

**Publish tab**
- Subdomain/slug field (existing, with availability check)
- Tagline field (existing)
- APK download link field (existing)
- Publish toggle: makes the page live at `/s/:slug`
- When published: shows the full public URL as a copyable link

### Sidebar status indicator
Always shows current page status (Live / Draft) and the slug path. "Preview Page" button opens `/s/:slug` in a new tab.

### Save behavior
Each tab has its own "Save Changes" button. Changes do not auto-save.

---

## Feature 3 — Public Landing Page (`/s/:slug`) — SSR Extended

Served by the existing `GET /s/:slug` Express route. Template (`server/views/showcase.html`) is extended to support brand color, font, services, staff login modal, and customer request form.

### Template variables added

| Variable | Source |
|----------|--------|
| `{{BRAND_COLOR}}` | `tenant_branding.brand_color` |
| `{{FONT_FAMILY}}` | `tenant_branding.font_family` |
| `{{FONT_URL}}` | Google Fonts embed URL for chosen font |
| `{{SERVICES_HTML}}` | Pre-rendered service cards (enabled only) |
| `{{TENANT_ID}}` | `tenant_branding.tenant_id` — injected into request form for unauthenticated POST |

### Page sections (top to bottom)

**Navbar**
- Left: logo (square image or initial letter fallback) + business name in chosen font
- Right: "Staff Login" button → opens login modal

**Hero**
- "Licensed Pawnshop" badge
- Business name as H1 (chosen font)
- Tagline (hidden if empty)
- "Request Account Access" CTA button (smooth scrolls to request form)
- "View Services ↓" secondary button

**Services section**
- Label: "What We Offer"
- Grid of enabled service cards (icon + name + short description)
- Only services in `services_enabled` are rendered

**Customer Request Access section**
- Left: explanatory copy ("Submit your details…once approved you'll receive login credentials for our mobile app")
- Right: form with Full Name, Email, Mobile Number fields + Submit button
- On submit: `POST /api/public/access-requests` (unauthenticated endpoint). The request body includes `tenant_id`, which is injected into the SSR template as a hidden `{{TENANT_ID}}` variable so the form knows which tenant to associate the request with.
- Success: inline confirmation message replaces form ("Request submitted! Our staff will review it shortly.")
- Error: inline error message

**Staff Login modal**
- Triggered by "Staff Login" navbar button
- Overlay modal with: business name + "Employee access" subtitle, email + password fields, Sign In button, Forgot password link
- On Sign In: calls existing auth flow, redirects to `/admin` on success
- Forgot password: navigates to `/recover`

**Footer**
- "Powered by OBSIDIAN" branding
- Copyright line

### Brand color application
The `{{BRAND_COLOR}}` value is injected as a CSS variable (`--accent`) used for: badge backgrounds, service card icon tints, CTA button, active states, and the logo fallback background.

---

## Feature 4 — Customer Access Requests (Admin Side)

### Customers page — new tab
The existing Customers page (`/admin/customers`) gets a second tab: **"Pending Requests"** with a badge showing the count of PENDING requests.

- Table columns: Name, Email, Mobile, Requested Date, Status, Action
- Each row is clickable → navigates to the request detail page
- Approve / Reject buttons on each row for quick action without navigating away

### Request detail page (`/admin/customers/requests/:id`)
Dedicated page showing full submitted info:
- Full name, email, mobile
- Date requested, current status
- Notes field (staff can add a note before approving/rejecting)
- Approve and Reject action buttons

**On Approve:**
1. Creates a `customers` record from the request data
2. Creates a Supabase auth user with a generated temporary password
3. Sends a welcome email with login credentials (mobile app instructions)
4. Updates request status to APPROVED

**On Reject:**
1. Updates request status to REJECTED
2. Optionally sends a rejection notification email (configurable)

### API endpoints
- `POST /api/public/access-requests` — public, unauthenticated, creates PENDING request
- `GET /api/customers/access-requests` — auth required, returns tenant's requests
- `GET /api/customers/access-requests/:id` — auth required, single request detail
- `PATCH /api/customers/access-requests/:id/approve` — auth required, OWNER/MANAGER only
- `PATCH /api/customers/access-requests/:id/reject` — auth required, OWNER/MANAGER only

---

## Feature 5 — Dashboard Nudge Banner

A dismissible banner shown at the top of `/admin` (dashboard) when `is_published === false` and branding has never been completed.

- Text: "Your public page isn't set up yet — complete your branding to go live."
- CTA button: "Set Up Now" → navigates to `/admin/branding/setup`
- Dismiss: saves a `branding_nudge_dismissed` flag to localStorage. Does not reappear once dismissed.
- Banner disappears permanently once `is_published === true`.

---

## Feature 6 — Superadmin Visibility

In the SuperAdmin Tenants detail view, a new field is added:

- **Public Page:** `/s/{slug}` as a clickable external link (opens in new tab) — shown if `is_published === true`
- If not published: "Not published yet" in muted text

No new page or route needed in the superadmin module.

---

## Routing Changes

### Frontend (`App.jsx`)
```
/admin/branding/setup     → BrandingSetupPage (wizard, post-payment)
/admin/branding           → BrandingPage (management)
/admin/customers/requests/:id → CustomerRequestDetail
```

`App.jsx` currently uses exact `switch/case` routing. The dynamic path `/admin/customers/requests/:id` requires a prefix match. The `renderPage()` function is extended to check `currentPath.startsWith('/admin/customers/requests/')` before falling through to the switch, extracting the ID from `currentPath.split('/').pop()`.

### Backend (`server/index.js`)
```
POST /api/public/access-requests   → new public route (no auth middleware)
GET/PATCH /api/customers/access-requests/* → added to customers router
```

### Navigation
Add "Branding" to the OWNER and MANAGER sidebar nav configs in `src/config/navigation.js`.

---

## Google Fonts — Curated List

12 fonts, 4 per category:

| Category | Fonts |
|----------|-------|
| Serif | Playfair Display, Lora, Merriweather, EB Garamond |
| Sans | Inter, Outfit, Nunito, Raleway |
| Display | Oswald, Bebas Neue, Righteous, Staatliches |

Fonts are loaded via a single Google Fonts `<link>` in the tenant showcase template and in the admin branding page (only the selected font is loaded in the showcase; all 12 loaded in the admin for the picker).

---

## Security Considerations

- `POST /api/public/access-requests` must be rate-limited (e.g., 5 requests per IP per hour) to prevent spam
- The tenant slug is escaped before injection into the SSR template (already handled by `escapeHtml`)
- Brand color is validated as a valid hex string server-side before storing
- Logo URL is validated as an HTTP/HTTPS URL (same pattern as APK URL validation)
- Customer approval creates a Supabase auth user — use service role key, never expose this to frontend

---

## Out of Scope

- Multiple brand colors or gradient support
- Custom domain (subdomain feature already exists separately)
- Customer sign-in on the public page (customers use the mobile app)
- Analytics / visitor tracking on the public page
- Tenant being able to add custom sections to their public page
