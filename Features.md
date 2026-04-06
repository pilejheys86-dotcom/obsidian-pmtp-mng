# Obsidian — Pawnshop Management Information System (MIS)

## Feature Map & Module Specification

> **Stack:** React 18 + Vite (Frontend) · Express + Node.js (Backend) · Supabase / PostgreSQL (Database) · NodeMailer (Email)

---

## 1. Authentication & Multi-Tenancy

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Owner Registration | `Tenants`, `Branches`, `Tenant_Users`, auth.users | Multi-step sign-up: creates auth user → tenant → default branch → owner user record via `register_owner` RPC |
| Login / Logout | auth.users, `Tenant_Users` | Email + password sign-in; session managed by Supabase Auth; profile (role, tenant, branch) fetched on login |
| Password Recovery | auth.users | Email-based password reset flow with NodeMailer confirmation email |
| Email Confirmation | auth.users | NodeMailer sends account verification email on registration |
| Role-Based Access | `Tenant_Users` | Four roles: `OWNER`, `MANAGER`, `APPRAISER`, `CLERK` — each role sees a different sidebar navigation and accessible routes |
| Tenant Isolation | `Tenants` | Every query is scoped to the authenticated user's `tenant_id`; Row-Level Security (RLS) enforced in Supabase |

---

## 2. Dashboard (AdminDash)

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| KPI Cards | `Pawn_Tickets`, `Pawn_Items`, `Customers`, `Transactions` | Real-time aggregated stats: Total Active Loans (sum of principal where status = ACTIVE), Inventory Value (sum of appraised_value where status = VAULT), New Customers (count this month), Pending Appraisals (items without a ticket yet) |
| Loan Activity Chart | `Pawn_Tickets`, `Transactions` | Bar chart showing daily/weekly loan disbursement amounts |
| Portfolio Status Donut | `Pawn_Tickets` | Pie chart breaking down tickets by status: ACTIVE, REDEEMED, EXPIRED, FORFEITED, RENEWED |
| Recent Activities Table | `Transactions`, `Pawn_Tickets`, `Pawn_Items`, `Customers` | Latest transactions joined with ticket, item, and customer data — sortable, searchable, paginated |

---

## 3. Active Loans

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Loans KPI | `Pawn_Tickets` | Counts by status: Total Active, Expiring Soon (maturity_date within 7 days), Overdue (past maturity + grace), Renewed This Month |
| Loans Table | `Pawn_Tickets`, `Pawn_Items`, `Customers`, `Tenant_Users` | Paginated table: ticket_number, customer name, item description, principal_loan, calculated interest accrued, maturity_date, status |
| Loan Detail | `Pawn_Tickets`, `Transactions`, `Notices_Log` | View full ticket details, transaction history, and notice log for a specific loan |
| Loan Renewal | `Pawn_Tickets`, `Transactions` | Create a RENEWAL transaction: updates ticket status, recalculates maturity_date, records payment |
| Loan Redemption | `Pawn_Tickets`, `Transactions`, `Pawn_Items` | Create a REDEMPTION transaction: marks ticket REDEEMED, updates pawn item to REDEEMED, records full payment |

---

## 4. Inventory

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Inventory KPI | `Pawn_Items` | Total Items, In Vault (VAULT status), Total Value (sum appraised_value), Forfeited This Month |
| Inventory Table | `Pawn_Items`, `Item_Images`, `Customers`, `Branches` | Paginated table with item category, description, specific_attrs (parsed from JSONB), appraised_value, inventory_status, primary image thumbnail |
| Category Filter | `Pawn_Items` | Filter by item_category enum: JEWELRY, VEHICLE, GADGET, APPLIANCE, OTHER |
| Item Detail View | `Pawn_Items`, `Item_Images`, `Pawn_Tickets` | Full item view: all images carousel, specific attributes, condition notes, linked tickets history |

---

## 5. Inventory Audit

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Audit KPI | `Pawn_Items` | Total Audits, Verified Items, Discrepancies, Compliance Rate — computed against inventory records |
| Audit Table | `Pawn_Items`, `Tenant_Users` | List of audits with auditor, type (Full Audit / Spot Check / Reconciliation), items checked, discrepancies found |
| Create Audit | `Pawn_Items`, `Tenant_Users` | New audit form: select scope (category/branch), auditor assignment, check items against vault |

---

## 6. Appraisals

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Appraisals KPI | `Pawn_Items`, `Pawn_Tickets` | Total Appraisals, Pending Approval, Completed Today |
| Appraisals Table | `Pawn_Items`, `Tenant_Users` | Items pending appraisal with appraised_value, category, appraiser info, approval status |
| Create Appraisal | `Pawn_Items`, `Item_Images` | New item appraisal form: category selection, general description, specific attributes (JSONB based on category), condition notes, image uploads, appraised value |
| Approve / Reject | `Pawn_Items`, `Pawn_Tickets` | Manager/Owner can approve → creates pawn ticket; or reject with reason |

---

## 7. Auctions

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Auction Dashboard | `Auctions`, `Auction_Lots`, `Pawn_Items` | Gallery/grid view of auction lots with status badges: SCHEDULED, COMPLETED, CANCELLED |
| Auction KPI | `Auctions`, `Auction_Lots` | Active Auctions, Total Lots, Sold This Month, Upcoming Auctions |
| Create Auction | `Auctions` | Form: auction_date, publication_date, venue, status |
| Add Lots to Auction | `Auction_Lots`, `Pawn_Items` | Select forfeited items (inventory_status = FORFEITED), set base_price, assign to auction |
| Record Sale | `Auction_Lots`, `Pawn_Items`, `Transactions`, `Customers` | Record sold_price, buyer, creates AUCTION_SALE transaction, updates item inventory_status to AUCTIONED |
| Category Filter | `Auction_Lots`, `Pawn_Items` | Filter lots by item category |

---

## 8. Customer Management

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Customers KPI | `Customers`, `Pawn_Tickets` | Total Customers, Active Loan Holders, New This Month, Avg Customer Lifetime Value |
| Customers Table | `Customers`, `Pawn_Tickets` | Paginated list: name, email, mobile, total active loans, risk rating, status |
| Add Customer | `Customers`, `KYC_Documents` | Multi-section form: **Personal Info** (first_name, last_name, date_of_birth, nationality, mobile_number, email, employment_nature) → **Address** (present_address with PSGC cascading dropdowns) → **KYC** (id_type, id_number, expiry_date, image_front_url, image_back_url, specimen_sig_url) |
| Customer Detail | `Customers`, `KYC_Documents`, `Pawn_Tickets`, `Pawn_Items`, `Transactions` | Full profile: personal info, KYC documents viewer, loan history, transaction history, risk rating |
| Risk Rating | `Customers` | risk_rating enum: LOW, MEDIUM, HIGH — auto-calculated or manually set |

---

## 9. Employee Management

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Employees KPI | `Tenant_Users` | Total Employees, Active Staff, Roles count, Performance metrics |
| Employees Table | `Tenant_Users`, `Branches` | Paginated list: full_name, role, branch, email, is_active status, created_at |
| Add Employee | `Tenant_Users`, auth.users | Multi-section form: **Personal Info** (full_name, email) → **Employment** (role selection from user_role enum: OWNER/MANAGER/APPRAISER/CLERK, branch assignment) → **Compliance** (government ID upload) → **Onboarding** (access control, email invitation via NodeMailer) |
| Edit Employee | `Tenant_Users` | Update role, branch assignment, active status |
| Deactivate Employee | `Tenant_Users` | Soft-delete: set is_active = false, set deleted_at timestamp |

---

## 10. Transactions

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Transaction Log | `Transactions`, `Pawn_Tickets`, `Tenant_Users` | Full transaction history: trans_type (DISBURSEMENT, RENEWAL, REDEMPTION, AUCTION_SALE), payment_method, amounts paid, receipt_number, processed_by |
| Create Transaction | `Transactions`, `Pawn_Tickets` | Transaction form: select ticket, trans_type, payment_method (CASH, GCASH, PAYMAYA, BANK_TRANSFER), enter amounts (principal_paid, interest_paid, penalty_paid), auto-generate receipt_number |
| Receipt Generation | `Transactions` | Print/download receipt with all transaction details |

---

## 11. Notices & Notifications

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Notices Log | `Notices_Log`, `Pawn_Tickets`, `Customers` | List of all sent notices with notice_type, delivery_method, status |
| Auto Notices | `Notices_Log`, `Pawn_Tickets` | Scheduled checks for: MATURITY_WARNING (7 days before maturity), GRACE_PERIOD_START (on maturity), AUCTION_NOTICE (after grace period) |
| Send Notice | `Notices_Log` | Manual notice sending via: SMS, EMAIL (NodeMailer), REGISTERED_MAIL, APP_PUSH |
| Email Delivery | `Notices_Log` | NodeMailer integration for email notices with delivery status tracking (DELIVERED, FAILED, PENDING) |

---

## 12. Subscriptions & Billing

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Subscription View | `Subscriptions`, `Tenants` | Current plan, billing cycle (MONTHLY/YEARLY), start/end dates, payment status |
| Subscription Management | `Subscriptions` | Upgrade/downgrade plan, change billing cycle |
| Payment Status | `Subscriptions` | Track payment_status: PAID, OVERDUE, CANCELLED |

---

## 13. Reports & Analytics

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Loan Reports | `Pawn_Tickets`, `Transactions` | Loan volume, redemption rate, default rate, average loan duration |
| Revenue Reports | `Transactions` | Interest earned, service charges, penalty collections, auction sales revenue |
| Customer Reports | `Customers`, `Pawn_Tickets` | Customer acquisition, retention, risk distribution |
| Inventory Reports | `Pawn_Items`, `Item_Images` | Vault inventory value, category distribution, turnover rate |
| Audit Reports | `Pawn_Items` | Compliance metrics, discrepancy tracking |

---

## 14. Settings & Profile

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Profile Page | `Tenant_Users`, auth.users | View/edit personal information, change password |
| Appearance | — | Dark/light mode toggle (persisted to localStorage) |
| Notifications | `Notices_Log` | Configure notification preferences per notice_type and delivery_method |
| Security | auth.users | Two-factor authentication, session management |
| Backup | `Tenants` | Data export functionality |
| Branch Management | `Branches`, `Tenants` | Add/edit branches: branch_code, branch_name, address, city_municipality, vault_capacity |

---

## 15. Branch Management

| Feature | Schema Tables | Description |
|---------|---------------|-------------|
| Branch List | `Branches` | All branches for the tenant |
| Add Branch | `Branches` | Form: branch_code, branch_name, address, city_municipality, vault_capacity |
| Assign Users | `Tenant_Users`, `Branches` | Assign/reassign employees to branches |

---

## Schema Tables → Feature Coverage Matrix

| Table | Features Using It |
|-------|-------------------|
| `Tenants` | Registration, Auth, Tenant Isolation, Subscriptions, Settings |
| `Subscriptions` | Subscription Management, Billing |
| `Branches` | Registration, Employee Management, Inventory, Branch Management |
| `Tenant_Users` | Auth, Employee Management, Appraisals, Transactions, Audit |
| `Customers` | Customer Management, Loans, Transactions, Auctions, Notices |
| `KYC_Documents` | Add Customer, Customer Detail |
| `Pawn_Items` | Inventory, Appraisals, Loans, Auctions, Audit, Reports |
| `Item_Images` | Inventory Detail, Appraisals, Auctions |
| `Pawn_Tickets` | Active Loans, Dashboard, Transactions, Notices, Reports |
| `Transactions` | Transaction Log, Loans, Auctions, Dashboard, Reports |
| `Notices_Log` | Notices & Notifications, Loan Detail |
| `Auctions` | Auction Dashboard, Auction Management |
| `Auction_Lots` | Auction Lots, Sale Recording |

---

## Email Notifications (NodeMailer)

| Email Type | Trigger | Schema Reference |
|------------|---------|------------------|
| Account Verification | User registration | auth.users |
| Password Reset | Recovery request | auth.users |
| Employee Invitation | Add Employee | `Tenant_Users` |
| Maturity Warning | 7 days before maturity_date | `Pawn_Tickets`, `Notices_Log` |
| Grace Period Notice | On maturity_date | `Pawn_Tickets`, `Notices_Log` |
| Auction Notice | After grace period expires | `Pawn_Tickets`, `Notices_Log` |
| Transaction Receipt | After any transaction | `Transactions` |

---

## API Architecture (Express + Node.js)

```
server/
├── index.js                # Express entry point
├── config/
│   └── db.js               # Supabase client setup
├── middleware/
│   ├── auth.js             # JWT verification middleware  
│   └── tenantScope.js      # Auto-inject tenant_id
├── routes/
│   ├── auth.js             # Login, register, recover, verify-email
│   ├── dashboard.js        # Aggregated KPI endpoints
│   ├── customers.js        # CRUD + KYC documents
│   ├── employees.js        # CRUD + role management
│   ├── pawnItems.js        # CRUD + images + appraisals
│   ├── pawnTickets.js      # CRUD + renewals + redemptions
│   ├── transactions.js     # CRUD + receipt generation
│   ├── auctions.js         # CRUD + lots + sales
│   ├── notices.js          # CRUD + auto-send
│   ├── branches.js         # CRUD
│   ├── subscriptions.js    # View + manage
│   └── reports.js          # Aggregated analytics
├── services/
│   └── email.js            # NodeMailer configuration & templates
└── utils/
    └── helpers.js          # Receipt number generation, date utils
```
