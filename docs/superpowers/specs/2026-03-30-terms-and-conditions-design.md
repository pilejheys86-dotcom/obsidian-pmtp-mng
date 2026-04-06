# Terms and Conditions — Design Spec

> **Date:** 2026-03-30
> **Status:** Approved

---

## Overview

Create a Terms and Conditions page for the Obsidian Pawnshop Management System. The T&C serves two purposes:

1. **Legal agreement** — users must accept before completing registration
2. **Suspension/deactivation grounds** — explicitly enumerates violations that justify tenant SUSPENDED or DEACTIVATED status

---

## Architecture

### Approach: Single shared component, two routes

One `TermsPage.jsx` in `src/pages/public/` rendered at two routes:

| Route | Context | Layout |
|-------|---------|--------|
| `/terms` | Public (pre-login, footer link) | Navbar + Footer wrapper |
| `/admin/terms` | Authenticated (sidebar link) | Sidebar layout (content only) |

The component accepts a `layout` prop (`"public"` or `"admin"`) to determine whether to render Navbar/Footer or just the content body.

### Page Layout

- Hero section: title "Terms and Conditions" + effective date
- Table of contents with anchor links
- 13 numbered sections with clear headings
- Scroll-reveal animations (matching AboutPage/ProcessPage pattern)
- Responsive, dark mode supported
- Uses existing design system (text-heading, text-subheading, etc.)

---

## T&C Content Sections

### 1. Definitions
- **Platform** — Obsidian Pawnshop Management System
- **Tenant** — A registered pawnshop business using the Platform
- **User** — Any individual with login credentials under a Tenant
- **Services** — SaaS features provided (loan management, appraisals, inventory, reports, etc.)
- **Subscription** — Paid plan granting access to the Platform
- **BSP** — Bangko Sentral ng Pilipinas

### 2. Acceptance of Terms
- By registering an account, you agree to be bound by these terms
- Must be at least 18 years of age
- Must hold a valid BSP pawnshop license (or be in the process of obtaining one)
- Continued use after amendments constitutes acceptance

### 3. Account Registration & Responsibilities
- Must provide accurate, complete business and personal information
- Responsible for maintaining credential security (passwords, API keys)
- Must comply with KYC verification requirements
- One tenant account per business entity (no duplicate registrations)
- Must keep BSP registration number and TIN up to date

### 4. Subscription & Payment Terms
- Three plans: Starter (PHP 1,499/mo), Professional (PHP 2,999/mo), Enterprise (PHP 4,999/mo)
- Billing cycles: Monthly or Yearly
- Payments processed via PayMongo (GCash, GrabPay, PayMaya, credit cards)
- Auto-renewal unless cancelled before billing date
- 7-day grace period for overdue payments before service restriction
- No refunds for partial billing periods
- Platform reserves the right to change pricing with 30-day notice

### 5. Acceptable Use Policy
Tenants and their users SHALL NOT:
- Use the Platform for any unlawful purpose
- Attempt to access other tenants' data or bypass data isolation
- Scrape, crawl, or programmatically extract data from the Platform
- Reverse engineer, decompile, or disassemble any part of the Platform
- Use the subdomain showcase feature for inappropriate, misleading, or offensive content
- Exceed reasonable usage limits or abuse API endpoints
- Resell, sublicense, or share Platform access with unauthorized third parties
- Upload malicious files, scripts, or content that could compromise Platform security

### 6. Data Privacy & Protection
- Platform complies with Republic Act No. 10173 (Data Privacy Act of 2012)
- Tenant data is isolated via Row-Level Security (RLS) — no cross-tenant data access
- All data transmitted over 256-bit SSL encryption
- Tenants are responsible for their own NPC (National Privacy Commission) registration obligations
- Platform retains tenant data for the duration of the subscription + 90 days post-deactivation
- Tenants may request data export before account closure
- Platform will not sell, share, or disclose tenant data to third parties except as required by law or court order

### 7. Intellectual Property
- Obsidian name, logo, and branding are property of the Platform
- Tenants retain ownership of their business data stored on the Platform
- Content uploaded to subdomain showcase pages must not infringe third-party intellectual property
- Tenants grant the Platform a limited license to display branding content on showcase pages

### 8. Grounds for Suspension (SUSPENDED status)
Temporary restriction of access. The Platform may suspend a tenant account for:
- **Financial:** Non-payment or subscription overdue beyond the 7-day grace period
- **Regulatory:** Failed KYC verification or reported regulatory non-compliance pending investigation
- **Platform Abuse:** Scraping, reverse engineering, excessive API usage, or subdomain misuse
- **Data Violations:** Unauthorized credential sharing, suspected data breach, or unauthorized data export
- **Other:** Any activity that poses a risk to Platform integrity or other tenants

Suspended tenants will receive email notification with the reason. Access is restored upon resolution of the violation (reactivation by platform admin).

### 9. Grounds for Deactivation (DEACTIVATED status)
Permanent termination of access. The Platform may deactivate a tenant account for:
- **Regulatory:** Operating without a valid BSP license or confirmed AML (Anti-Money Laundering) violations
- **Repeated Offenses:** Three (3) or more suspension incidents
- **Data Violations:** Confirmed exporting of customer PII for unauthorized purposes, or confirmed breach of tenant data isolation
- **Financial Fraud:** Subscription fraud, chargebacks, or payment manipulation
- **Facilitation of Crime:** Using the Platform to facilitate money laundering, fraud, or any criminal activity
- **Severe Platform Abuse:** Deliberate attempts to compromise Platform security or access other tenants' data

Deactivated tenants will receive email notification with the reason. Tenant data is retained for 90 days post-deactivation for legal/regulatory compliance, then permanently deleted.

### 10. Dispute Resolution
- Tenants may appeal suspension or deactivation by contacting Platform support within 15 business days
- Appeals will be reviewed within 10 business days
- Platform's decision after review is final
- For unresolved disputes, parties agree to mediation before litigation

### 11. Limitation of Liability
- Platform is provided "as is" without warranty of uninterrupted service
- Platform is not liable for tenant's regulatory violations or business losses
- Platform uptime target is 99.5% but not guaranteed
- Maximum liability limited to fees paid by tenant in the preceding 12 months
- Platform is not responsible for data loss due to tenant's negligence (e.g., credential compromise)

### 12. Governing Law
- These terms are governed by the laws of the Republic of the Philippines
- Relevant legislation: RA 11127 (Pawnshop Regulation Act of 2018), RA 10173 (Data Privacy Act of 2012)
- Venue for legal proceedings: courts of Quezon City, Metro Manila

### 13. Amendments & Contact
- Platform may update these terms at any time with 30-day advance email notice to all registered tenants
- Continued use after the effective date of amendments constitutes acceptance
- Contact: support@obsidian-platform.tech

---

## Registration Checkbox Integration

**Location:** `src/pages/auth/RegisterPage.jsx`, Step 2 (Credentials), below the confirm password field.

**Implementation:**
- Checkbox + label: "I agree to the [Terms and Conditions](/terms)" (link opens in new tab)
- Submit/Next button disabled until checkbox is checked
- Uses existing `form-checkbox` + `form-checkbox-label` CSS classes
- Frontend-only gate — no backend schema change needed (acceptance is implicit by completing registration)

---

## Footer Link Update

Wire the existing placeholder "Terms of Service" link in `src/components/Footer.jsx` to `/terms`.

---

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/pages/public/TermsPage.jsx` | T&C page component |
| Modify | `src/App.jsx` | Add `/terms` and `/admin/terms` routes |
| Modify | `src/pages/auth/RegisterPage.jsx` | Add T&C acceptance checkbox in Step 2 |
| Modify | `src/components/Footer.jsx` (if exists) | Wire "Terms of Service" link to `/terms` |
| Modify | `src/config/navigation.js` (optional) | Add "Terms" link to admin sidebar if desired |
