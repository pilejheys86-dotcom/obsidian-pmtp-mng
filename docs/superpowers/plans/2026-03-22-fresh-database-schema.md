# Fresh Database Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clean database from scratch with 4 table groups (Super Admin, Tenants, Customers, Employees) plus a single-file Master Schema as the living source of truth.

**Architecture:** Fresh Supabase PostgreSQL schema with no incremental migrations — one clean DDL file. All tables use `tenant_id` for multi-tenant isolation. Super Admin tables are platform-level (no tenant scope). RLS policies use SECURITY DEFINER helpers to avoid recursion. The `MasterSchema.md` file is the canonical reference — every future migration must update it.

**Tech Stack:** Supabase PostgreSQL, RLS, SECURITY DEFINER functions, `gen_random_uuid()`, custom ENUMs

---

## Scope

This plan covers **4 table groups only** — the foundational layer. Business-logic tables (pawn_items, pawn_tickets, transactions, auctions, etc.) will be added in a future plan once this foundation is stable.

### Table Groups

| Group | Tables | Scope |
|-------|--------|-------|
| **1. Super Admin** | `super_admins`, `platform_audit_logs`, `platform_settings` | Platform-level, no tenant_id |
| **2. Tenants (Admin)** | `tenants`, `branches`, `subscriptions` | Multi-tenant root + billing |
| **3. Customers** | `customers`, `kyc_documents` | Tenant-scoped customer data |
| **4. Employees** | `tenant_users` | Tenant-scoped staff/roles |

### File Map

| File | Purpose |
|------|---------|
| `MasterSchema.md` (root) | **Single source of truth** — full DDL + ENUMs + RLS + indexes |
| `sql/100_fresh_foundation.sql` | Executable migration for Supabase SQL Editor |

> **Numbering convention:** Old migrations (001–016) are retired. New migrations start at 100 to clearly separate eras.

---

### Task 1: Create the Master Schema Source-of-Truth File

**Files:**
- Create: `MasterSchema.md` (overwrite existing)

- [ ] **Step 1: Write the complete Master Schema**

The file must contain:
1. Header with version, date, and update instructions
2. All ENUM types
3. All 8 tables with full column definitions
4. All indexes
5. All RLS policies and helper functions
6. All GRANT statements
7. Seed RPC functions (`seed_super_admin`, `register_owner`)

Key design decisions for the fresh schema:
- `tenants.blocked_reason` included from the start (was an ALTER in old schema)
- `tenant_users` has all employee fields built-in (no incremental ALTERs)
- `subscriptions` has `paymongo_checkout_id` and `paid_at` built-in
- `platform_settings` is new — stores global platform config (branding, limits)
- `customers.auth_id` links to `auth.users` for customer-portal login
- All tables use `TIMESTAMPTZ` instead of `TIMESTAMP` for timezone safety
- Consistent `created_at`, `updated_at`, `deleted_at` on every table

- [ ] **Step 2: Verify Master Schema is self-consistent**

Check:
- All FK references point to tables defined above them
- All ENUM types are created before tables that use them
- No circular dependencies
- RLS helper functions defined before policies that use them

- [ ] **Step 3: Commit**

```bash
git add MasterSchema.md
git commit -m "docs: create fresh Master Schema v4 — single source of truth"
```

---

### Task 2: Create the Executable SQL Migration

**Files:**
- Create: `sql/100_fresh_foundation.sql`

- [ ] **Step 1: Write Section A — ENUM Types**

All custom types needed by the 4 table groups:

```sql
-- tenant_status: ACTIVE, SUSPENDED, DEACTIVATED
-- subscription_cycle: MONTHLY, YEARLY
-- payment_status: PAID, OVERDUE, CANCELLED, PENDING
-- user_role: OWNER, ADMIN, MANAGER, AUDITOR, APPRAISER, CASHIER
-- risk_rating: LOW, MEDIUM, HIGH
```

- [ ] **Step 2: Write Section B — Super Admin Tables (Group 1)**

```sql
-- super_admins (platform-level, references auth.users)
-- platform_audit_logs (tracks super admin actions)
-- platform_settings (global config: branding, limits, permissions)
```

- [ ] **Step 3: Write Section C — Tenant Tables (Group 2)**

```sql
-- tenants (multi-tenant root)
-- branches (physical locations per tenant)
-- subscriptions (SaaS billing per tenant)
```

- [ ] **Step 4: Write Section D — Employee Tables (Group 4)**

```sql
-- tenant_users (employees, references auth.users + tenants + branches)
```

> Employees before Customers because `customers` may reference `tenant_users` in future.

- [ ] **Step 5: Write Section E — Customer Tables (Group 3)**

```sql
-- customers (pawn customers per tenant)
-- kyc_documents (identity verification per customer)
```

- [ ] **Step 6: Write Section F — Indexes**

Performance indexes for common query patterns:
- `tenant_users(tenant_id, is_active)` — employee lookups
- `tenant_users(work_email)` — login/unique check
- `customers(tenant_id, last_name, first_name)` — customer search
- `kyc_documents(customer_id)` — KYC lookup
- `branches(tenant_id)` — branch listing
- `subscriptions(tenant_id, payment_status)` — paywall check
- `platform_audit_logs(admin_id, created_at)` — audit trail

- [ ] **Step 7: Write Section G — RLS Helper Functions**

```sql
-- get_my_tenant_id() — SECURITY DEFINER, returns caller's tenant_id
-- get_my_role() — SECURITY DEFINER, returns caller's role
-- is_super_admin() — checks if caller is in super_admins
```

- [ ] **Step 8: Write Section H — RLS Policies**

Per-table policies:
- `super_admins`: self-read only
- `platform_audit_logs`: admin_id = auth.uid()
- `tenants`: tenant isolation via get_my_tenant_id() + super admin override
- `branches`: tenant isolation
- `subscriptions`: tenant isolation (SELECT) + OWNER-only (INSERT/UPDATE)
- `tenant_users`: tenant isolation (SELECT) + OWNER-only (mutations)
- `customers`: tenant isolation
- `kyc_documents`: tenant isolation

- [ ] **Step 9: Write Section I — GRANT Statements**

```sql
GRANT SELECT ON super_admins TO authenticated;
GRANT SELECT ON tenant_users TO authenticated;
GRANT SELECT ON tenants TO authenticated;
GRANT SELECT ON branches TO authenticated;
GRANT SELECT ON subscriptions TO authenticated;
GRANT SELECT ON customers TO authenticated;
GRANT SELECT ON kyc_documents TO authenticated;
GRANT SELECT ON platform_audit_logs TO authenticated;
```

- [ ] **Step 10: Write Section J — Seed RPCs**

```sql
-- seed_super_admin(p_user_id, p_email, p_full_name)
-- register_owner(p_email, p_password, p_full_name, p_business_name, ...)
```

- [ ] **Step 11: Commit**

```bash
git add sql/100_fresh_foundation.sql
git commit -m "feat: add fresh foundation migration (100) for clean DB rebuild"
```

---

### Task 3: Run Migration in Supabase

- [ ] **Step 1: Execute Section A (ENUMs) in Supabase SQL Editor**

Run each `CREATE TYPE` individually (ALTER TYPE ADD VALUE cannot run in transactions).

- [ ] **Step 2: Execute Sections B–J as a single block**

Copy everything after ENUMs and run in SQL Editor.

- [ ] **Step 3: Verify tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected: `branches`, `customers`, `kyc_documents`, `platform_audit_logs`, `platform_settings`, `subscriptions`, `super_admins`, `tenant_users`, `tenants`

- [ ] **Step 4: Verify RLS is enabled**

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename IN (
  'super_admins','platform_audit_logs','tenants','branches',
  'subscriptions','tenant_users','customers','kyc_documents'
);
```

All should show `rowsecurity = true`.

---

### Task 4: Update CLAUDE.md

- [ ] **Step 1: Update Database Schema section**

Replace the Entity Relationship Diagram and Core Tables sections to reflect the new 4-group structure.

- [ ] **Step 2: Update Implemented Features**

Mark old business-logic features as "pending migration to new schema".

- [ ] **Step 3: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect fresh schema v4"
```
