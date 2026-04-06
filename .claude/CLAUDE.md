# Obsidian - Pawnshop Management Information System (MIS)

> **Last Updated:** 2026-04-05
> This document is the single source of truth for the project's architecture, implemented features, and current state. Update this file every time a new feature is completed.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 6 + TailwindCSS 4 |
| Charts | MUI X Charts (BarChart, PieChart) |
| Backend | Express.js + Node.js |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Auth | Supabase Auth (JWT) |
| Email | NodeMailer (SMTP) |
| Type | Multi-tenant SaaS |

---

## Project Structure

```
obsidian-pmtp-mng/
├── server/
│   ├── index.js                    # Express entry point (port 5000)
│   ├── config/
│   │   └── db.js                   # Supabase client setup (admin + anon)
│   ├── middleware/
│   │   ├── auth.js                 # JWT verification → req.user, req.userId
│   │   └── tenantScope.js          # Tenant isolation → req.tenantId, req.userRole
│   ├── routes/
│   │   ├── auth.js                 # Register, login, recover, profile
│   │   ├── dashboard.js            # KPI aggregates
│   │   ├── customers.js            # CRUD + KYC
│   │   ├── employees.js            # CRUD + role mgmt (excludes OWNER from list)
│   │   ├── pawnItems.js            # Inventory CRUD + images
│   │   ├── pawnTickets.js          # Loan tickets CRUD
│   │   ├── transactions.js         # Payment records
│   │   ├── auctions.js             # Auction events + lots
│   │   ├── appraisals.js           # Gold appraisal calculation
│   │   ├── renewals.js             # Loan renewal processing
│   │   ├── payments.js             # Flexible payment processing
│   │   ├── notices.js              # Notification log + email send
│   │   ├── dispositions.js         # Forfeited item disposition
│   │   ├── loanSettings.js         # Tenant loan config + gold rates
│   │   ├── branches.js             # Branch CRUD
│   │   ├── branding.js             # Tenant branding + subdomain config
│   │   ├── subscriptions.js        # SaaS billing
│   │   ├── reports.js              # Analytics endpoints
│   │   ├── cron.js                 # Scheduled overdue/expiry checks
│   │   └── locations.js            # PH province/city lookup (PSGC)
│   ├── middleware/
│   │   ├── auth.js                 # JWT verification → req.user, req.userId
│   │   ├── tenantScope.js          # Tenant isolation → req.tenantId, req.userRole
│   │   └── subdomainResolver.js    # Wildcard subdomain → showcase page
│   ├── views/
│   │   ├── showcase.html           # SSR tenant showcase template
│   │   └── 404.html                # Subdomain not found page
│   ├── services/
│   │   └── email.js                # NodeMailer templates
│   ├── utils/
│   │   ├── helpers.js              # Receipt/ticket number generation, pagination
│   │   └── googleDrive.js          # Google Drive URL transform
│   └── __tests__/                  # Jest test suite
├── src/
│   ├── App.jsx                     # Client-side routing (path-based)
│   ├── index.css                   # Design tokens + component classes
│   ├── context/
│   │   ├── AuthContext.jsx          # Session, signup, login, logout, profile
│   │   └── ThemeContext.jsx         # Dark/light mode toggle
│   ├── config/
│   │   └── navigation.js           # Role-based sidebar nav arrays
│   ├── lib/
│   │   └── api.js                  # Centralized fetch wrapper + API modules
│   ├── components/
│   │   ├── layout/
│   │   │   └── Sidebar.jsx         # Collapsible sidebar, mobile drawer, user menu
│   │   ├── ui/
│   │   │   ├── FormInput.jsx       # Input with icon, label, hint
│   │   │   ├── Pagination.jsx      # Page navigator
│   │   │   ├── StepNav.jsx         # Multi-step form indicator
│   │   │   ├── Logo.jsx            # Branding component
│   │   │   └── ThemeToggle.jsx     # Dark/light switch
│   │   └── public/                 # Landing page sections
│   └── pages/
│       ├── auth/
│       │   ├── LoginPage.jsx
│       │   ├── RegisterPage.jsx
│       │   └── RecoverAcc.jsx
│       ├── owner/
│       │   ├── AdminDash.jsx        # Dashboard with KPI, charts, activities
│       │   ├── ActiveLoans.jsx      # Loans table + renewal/redemption
│       │   ├── Customers.jsx        # Customer list + profile view + add form
│       │   ├── CustomerProfile.jsx  # Full customer detail (inline component)
│       │   ├── AddCustomer.jsx      # Multi-step customer creation form
│       │   ├── Employee.jsx         # Employee list (OWNER excluded)
│       │   ├── AddEmployee.jsx      # Employee creation + invite
│       │   ├── Inventory.jsx        # Pawn items table
│       │   ├── InventoryAudit.jsx   # Audit management
│       │   ├── Appraisals.jsx       # Appraisal queue + approval
│       │   ├── AuctionItems.jsx     # Auction lot gallery
│       │   ├── SettingsPage.jsx     # Loan settings, gold rates, branches
│       │   └── ProfilePage.jsx      # User profile + password change
│       └── public/
│           └── LandingPage.jsx      # Marketing page
├── .env                             # Environment variables (NOT committed)
├── tailwind.config.js               # Tailwind theme tokens
├── Features.md                      # Feature specification
└── ProjectDescription.md            # THIS FILE
```

---

## Database Schema

> **Source of Truth:** `MasterSchema.md` (v8) — all schema changes must update that file first.
> **Migration:** `sql/200_clean_foundation.sql` — clean rebuild, old migrations (001–110) retired.

### Entity Relationship Diagram

```
Platform Level (no tenant_id):
  Super_Admins ←→ auth.users
  Platform_Audit_Logs → admin_id
  Platform_Settings (single row)
  Platform_Backup_Logs

Tenant Level:
  Tenants (root)
    ├── Branches
    ├── Subscriptions
    ├── Tenant_Branding (subdomain showcase)
    ├── Tenant_Users ←→ auth.users
    │   └── Tenant_Audit_Logs
    ├── Customers
    │   ├── KYC_Documents
    │   └── Customer_Payment_Intents → Pawn_Tickets
    ├── Config
    │   ├── Tenant_Loan_Settings (manager_approval_threshold)
    │   ├── Gold_Rates → Gold_Rate_History
    │   ├── Silver_Rates → Silver_Rate_History
    │   └── Item_Conditions
    └── Operations
        ├── Pawn_Items → Appraisal_Assessments (manager approval gate)
        ├── Pawn_Tickets (self-referencing via parent_ticket_id)
        ├── Transactions
        ├── Media (polymorphic)
        ├── Notices_Log
        └── Auctions → Auction_Lots
```

### Table Groups (28 tables total)

#### Group 1: Super Admin (Platform-Level)

| Table | Purpose |
|-------|---------|
| `super_admins` | Platform operators (id = auth.uid) |
| `platform_audit_logs` | Immutable super admin action log |
| `platform_settings` | Global config (single row) |
| `platform_backup_logs` | Backup/export audit trail |

#### Group 2: Tenants / Admin

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant root (business_name, bsp_registration_no, status) |
| `branches` | Physical pawnshop locations |
| `subscriptions` | SaaS billing + PayMongo integration |
| `tenant_branding` | Subdomain showcase config |

#### Group 3: Tenant Employees

| Table | Purpose |
|-------|---------|
| `tenant_users` | Staff members (id = auth.uid, email, role, must_change_password) |
| `tenant_audit_logs` | Tenant-level action log (action, category, target) |

#### Group 4: Tenant Customers

| Table | Purpose |
|-------|---------|
| `customers` | Pawn customers (KYC required before transactions) |
| `kyc_documents` | Identity verification documents |
| `customer_access_requests` | Public showcase access requests |
| `customer_payment_intents` | PayMongo online payment tracking (mobile app) |

#### Group 5: Business Config

| Table | Purpose |
|-------|---------|
| `tenant_loan_settings` | Interest rates, LTV, grace period, service_charge_pct, manager_approval_threshold |
| `gold_rates` | Per-tenant gold pricing by karat |
| `gold_rate_history` | Immutable gold rate change audit |
| `silver_rates` | Per-tenant silver pricing by purity |
| `silver_rate_history` | Immutable silver rate change audit |
| `item_conditions` | Configurable condition multipliers (MINT/GOOD/FAIR/POOR) |

#### Group 6: Pawn Operations

| Table | Purpose |
|-------|---------|
| `pawn_items` | Collateral items (category, valuation, inventory_status, disposition) |
| `appraisal_assessments` | Immutable appraisal records + manager approval gate |
| `pawn_tickets` | Loan contracts (self-referencing chain via parent_ticket_id) |
| `transactions` | Payment records (DISBURSEMENT, INTEREST, PARTIAL/FULL REDEMPTION, RENEWAL) |

#### Group 7: Supporting

| Table | Purpose |
|-------|---------|
| `media` | Polymorphic image storage (KYC docs, item photos) |
| `notices_log` | Email/SMS notification log |
| `auctions` | Public auction events (BSP requirement) |
| `auction_lots` | Individual items in auctions |

### ENUMs (v8)

| Enum | Values |
|------|--------|
| tenant_status | `ACTIVE`, `SUSPENDED`, `DEACTIVATED` |
| subscription_cycle | `MONTHLY`, `YEARLY` |
| payment_status | `PAID`, `OVERDUE`, `CANCELLED`, `PENDING` |
| user_role | `OWNER`, `ADMIN`, `MANAGER`, `AUDITOR`, `APPRAISER`, `CASHIER` |
| risk_rating | `LOW`, `MEDIUM`, `HIGH` |
| item_category | `JEWELRY`, `GADGET`, `APPLIANCE`, `VEHICLE` |
| inventory_status | `PENDING_APPRAISAL`, `UNDER_APPRAISAL`, `APPRAISED`, `IN_VAULT`, `REDEEMED`, `FORFEITED`, `FOR_AUCTION`, `AUCTIONED`, `MELTED` |
| disposition_status | `FOR_AUCTION`, `FOR_MELTING`, `SOLD`, `MELTED` |
| ticket_status | `ACTIVE`, `RENEWED`, `REDEEMED`, `FORFEITED`, `EXPIRED` |
| trans_type | `DISBURSEMENT`, `INTEREST_PAYMENT`, `PARTIAL_REDEMPTION`, `FULL_REDEMPTION`, `RENEWAL` |
| payment_method | `CASH`, `E_WALLET`, `BANK_TRANSFER` |
| notice_type | `DUE_REMINDER`, `OVERDUE`, `FORFEITURE_WARNING`, `FORFEITED` |
| delivery_method | `SMS`, `EMAIL`, `BOTH` |
| delivery_status | `PENDING`, `SENT`, `FAILED` |
| auction_status | `SCHEDULED`, `PUBLISHED`, `ONGOING`, `COMPLETED`, `CANCELLED` |

---

## Business Process Flow

```
1. KYC → 2. Item Intake → 3. Appraisal → 4. Manager Approval (if > threshold)
→ 5. Customer Accepts → 6. Advance Interest → 7. Ticket Issued → 8. Disbursement
→ 9. Monthly Payments (interest / partial / full / renewal) → 10. Overdue → Forfeiture → Auction
```

- Partial principal payments close the old ticket (RENEWED) and issue a new one with reduced principal
- Every payment transaction generates a new receipt
- Manager approval required when offered_amount > `tenant_loan_settings.manager_approval_threshold`

---

## Supabase RPCs (Stored Procedures)

| RPC | Purpose |
|-----|---------|
| `register_owner` | Creates tenant + branch + user + loan_settings in one transaction |
| `complete_owner_kyc` | Creates tenant + branch, links pre-KYC owner, seeds loan_settings |
| `seed_super_admin` | Upserts a platform super admin |
| `get_my_tenant_id()` | RLS helper — returns caller's tenant_id |
| `get_my_role()` | RLS helper — returns caller's role |
| `is_super_admin()` | RLS helper — checks if caller is platform admin |

---

## Authentication & Security

### Auth Flow
1. Frontend calls `supabase.auth.signUp()` or `signInWithPassword()`
2. Supabase returns JWT token
3. Frontend stores session, injects token via `Authorization: Bearer <token>` on API calls
4. Backend `auth.js` middleware verifies token via `supabaseAdmin.auth.getUser(token)`
5. Backend `tenantScope.js` middleware resolves `tenant_id`, `role`, `branch_id` from `tenant_users` table

### Security Layers
- **Database**: RLS policies enforce `tenant_id = auth.uid()'s tenant`
- **Middleware**: `tenantScope.js` injects tenant context on every request
- **API**: Every query filtered by `req.tenantId`
- **Frontend**: AuthContext guards protected routes

### Role Permissions

| Action | OWNER | MANAGER | APPRAISER | CASHIER |
|--------|:-----:|:-------:|:---------:|:-------:|
| Create/modify employees | x | | | |
| Manage branches | x | | | |
| Update loan settings | x | | | |
| Approve high-value appraisals | x | x | | |
| Approve dispositions | x | x | | |
| Manage gold/silver rates | x | x | | |
| Perform appraisals | x | x | x | |
| Process payments | x | x | | x |
| Issue pawn tickets | x | x | | x |
| Create/edit customers | x | x | | x |
| View reports | x | x | | |
| Trigger cron jobs | x | x | | |
| View dashboard | x | x | x | x |

---

## Design System

### Color Theme

**Light Mode** — Muted white with off-black accent
- Background: `stone-100` (`#F5F5F4`)
- Surface: `white`
- Text primary: `neutral-900` (`#1C1917`)
- Text secondary: `neutral-500` (`#78716C`)
- Borders: `neutral-200` (`#E7E5E4`)

**Dark Mode** — Claude/Supabase warm grey
- Background: `neutral-900` (`#171717`)
- Surface: `neutral-800` (`#262626`)
- Text primary: `neutral-100` (`#F5F5F5`)
- Text secondary: `neutral-400` (`#A3A3A3`)
- Borders: `neutral-700` (`#404040`)

**Primary Accent**: `#A3E635` (lime green)

**Sidebar**: `neutral-900` / `neutral-950` (dark on both modes)

### Typography
- Body: Inter
- Display/headings: Plus Jakarta Sans

### CSS Architecture
All component styles defined in `src/index.css` using `@apply` with Tailwind classes. Design tokens in `:root` CSS variables. Tailwind config extends with custom colors, fonts, and spacing.

---

## Implemented Features (Current State)

- [x] Owner registration (multi-step: business + branch + user)
- [x] Login / logout / password recovery
- [x] Dashboard with KPI cards, loan activity chart, portfolio donut, recent activities
- [x] Customer management (list, add with KYC, profile view with loan history)
- [x] Employee management (list excluding OWNER, add with invite email, deactivate)
- [x] Inventory management (list, category filter, item detail)
- [x] Inventory audit (KPI, audit list, create audit)
- [x] Appraisals (queue, gold calculation, approve/reject)
- [x] Active loans (table with computed fields, renewal, redemption)
- [x] Auctions (gallery, lots, sale recording)
- [x] Transactions (log, create, receipt generation)
- [x] Notices (log, manual send via email)
- [x] Dispositions (approve for auction/melting)
- [x] Loan settings (interest rates, penalty rates, grace period, gold rates)
- [x] Branch management (CRUD)
- [x] Reports (loan volume, revenue)
- [x] Cron jobs (overdue check, auto-expire)
- [x] Profile page (view/edit, password change)
- [x] Settings page (loan config, gold rates)
- [x] Dark/light mode toggle with warm neutral theme
- [x] Customer profile page (reusable components: InfoField, SectionCard, StatusPill, RiskBadge)
- [x] Tenant isolation (RLS + middleware + API-level filtering)
- [x] Role-based navigation (admin, manager, cashier nav configs)
- [x] Tenant branding & subdomain showcase (*.obsidian-platform.tech, SSR landing page, Google Drive APK link)
- [x] Reports & Analytics — tenant (daily transactions, overdue loans, branch comparison, customer history)
- [x] Reports & Analytics — super admin (tenant health, subscription analytics, pawn volume, rankings)
- [x] CSV export for all reports
- [x] PDF export via browser print with @media print CSS

---

## Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `VITE_SUPABASE_URL` | Frontend + Backend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend + Backend | Public anon key (respects RLS) |
| `SUPABASE_SERVICE_KEY` | Backend only | Service role key (bypasses RLS) |
| `VITE_API_BASE_URL` | Frontend | Backend API base URL |
| `CLIENT_URL` | Backend | Frontend origin for CORS + email links |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Backend | NodeMailer email config |
| `PORT` | Backend | Express server port (default: 5000) |

---

## Key Architecture Decisions

1. **Multi-tenant via tenant_id column** — Every table has `tenant_id` FK; no shared data between tenants
2. **Supabase RLS + Express middleware** — Belt-and-suspenders tenant isolation
3. **Soft deletes** — `deleted_at` timestamp instead of hard deletes for audit trail
4. **JSONB for item attributes** — `specific_attrs` column allows flexible per-category fields
5. **Self-referencing tickets** — `parent_ticket_id` creates renewal chain for loan history
6. **Receipt/ticket numbering** — Generated server-side with date prefix (RCP-YYYYMMDD-XXXXX)
7. **Client-side routing** — `window.history.pushState` in App.jsx (no react-router)
8. **CSS-first component styling** — All component classes in index.css, not inline styles
9. **OWNER role hidden from employee list** — Prevents manipulation of the owner account
10. **Service key for backend** — `supabaseAdmin` uses service role key; `supabaseAnon` for user-context operations
