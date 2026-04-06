# Backup & Restore — Design Spec

> **Date:** 2026-04-04
> **Module:** Super Admin
> **Status:** Approved

---

## Overview

A comprehensive backup and restore system for the Obsidian platform that allows super admins to:

1. Generate **full platform backups** (all tenants) or **tenant-specific backups** as downloadable files
2. **Restore** from a previously downloaded backup file with preview and confirmation
3. **Export as CSV ZIP** for direct Supabase/PostgreSQL/Excel import
4. Track all backup activity in a **backup history log**

Files download directly to the admin's computer — no cloud storage integration. The admin manages Google Drive or other offsite storage manually.

---

## Backend

### New Route: `server/routes/backup.js`

Protected by `superAdminScope` middleware. Three endpoints:

#### `POST /api/backup/generate`

**Request body:**
```json
{
  "type": "full | tenant",
  "tenant_id": "uuid (required if type=tenant)",
  "format": "json | csv"
}
```

**Behavior:**
- Queries all backup-scoped tables in dependency order
- For `type: tenant`, filters every query by `tenant_id`
- For `format: json`, returns a single `.json` file as a download
- For `format: csv`, returns a `.zip` file containing one `.csv` per table
- Logs the backup to `platform_backup_logs` table
- Response headers: `Content-Disposition: attachment; filename="obsidian-backup-{type}-{name}-{date}.{ext}"`

#### `POST /api/backup/restore`

**Request:** Multipart file upload (`.json` file)

**Two modes controlled by query param `?confirm=true`:**

**Preview mode (default):**
- Validates file structure (platform marker, version, table names)
- Returns summary: backup date, type, tenant scope, table-by-table row counts, total rows
- Does NOT modify any data

**Execute mode (`?confirm=true`):**
- Deletes existing data for the backup scope (full = all tenant data, tenant = that tenant's data only)
- Inserts all rows in dependency order
- Wraps everything in a transaction — rolls back on any error
- Returns success/failure result

#### `GET /api/backup/history`

**Query params:** `page`, `limit` (default 10)

**Returns:** Paginated list from `platform_backup_logs` sorted by newest first.

### Database Table: `platform_backup_logs`

```sql
CREATE TABLE platform_backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('full', 'tenant')),
  format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'csv')),
  tenant_id UUID REFERENCES tenants(id),
  tenant_name TEXT,
  generated_by UUID NOT NULL,
  admin_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  total_rows INT DEFAULT 0,
  table_counts JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Table Ordering (Dependency-Safe)

Insert and delete order follows foreign key dependencies:

**Insert order (parent → child):**
1. `tenants`
2. `branches`
3. `tenant_users`
4. `customers`
5. `kyc_documents`
6. `tenant_loan_settings`
7. `tenant_branding`
8. `pawn_items`
9. `pawn_tickets`
10. `transactions`
11. `subscriptions`
12. `tenant_audit_logs`

**Delete order:** Reverse (child → parent).

### Backup Scoped Tables

All 12 tables above. Excluded from backups:
- `super_admins` — platform-level, not tenant data
- `platform_audit_logs` — platform-level admin actions
- `platform_settings` — single-row config
- `platform_backup_logs` — meta, not business data
- Supabase Auth data — passwords are hashed internally, cannot be meaningfully exported

---

## Backup File Format

### JSON Format

```json
{
  "meta": {
    "version": "1.0",
    "platform": "obsidian",
    "type": "full | tenant",
    "tenant_id": "uuid | null",
    "tenant_name": "string | null",
    "generated_at": "ISO 8601",
    "generated_by": "admin email",
    "table_counts": {
      "tenants": 7,
      "branches": 12
    },
    "total_rows": 1523
  },
  "data": {
    "tenants": [ { ...row }, { ...row } ],
    "branches": [ { ...row }, { ...row } ],
    "tenant_users": [],
    "customers": [],
    "kyc_documents": [],
    "tenant_loan_settings": [],
    "tenant_branding": [],
    "pawn_items": [],
    "pawn_tickets": [],
    "transactions": [],
    "subscriptions": [],
    "tenant_audit_logs": []
  }
}
```

**Filename:** `obsidian-backup-full-2026-04-04.json` or `obsidian-backup-tenant-pawnhub-2026-04-04.json`

### CSV ZIP Format

A `.zip` file containing one `.csv` per table:
```
obsidian-backup-full-2026-04-04.zip
├── tenants.csv
├── branches.csv
├── tenant_users.csv
├── customers.csv
├── kyc_documents.csv
├── tenant_loan_settings.csv
├── tenant_branding.csv
├── pawn_items.csv
├── pawn_tickets.csv
├── transactions.csv
├── subscriptions.csv
└── tenant_audit_logs.csv
```

**Filename:** `obsidian-backup-full-2026-04-04.zip` or `obsidian-backup-tenant-pawnhub-2026-04-04.zip`

### Restore Validation Checks

Before any restore executes, the server validates:
1. `meta.platform === "obsidian"` — rejects random JSON files
2. `meta.version === "1.0"` — future-proofs for schema changes
3. `meta.type` is `"full"` or `"tenant"`
4. Every key in `data` is a known table name
5. Row counts in `meta.table_counts` match actual array lengths

---

## Frontend

### Page: Redesigned `Backup.jsx`

Replaces the current placeholder page entirely.

#### Header
- Title: "Backup & Restore"
- Subtitle: "Generate, download, and restore platform data"
- Two action buttons:
  - **"Full Platform Backup"** — dropdown with "Download JSON" and "Download CSV"
  - **"Tenant Backup"** — opens a tenant selector modal, then same format dropdown

#### Backup History Table
- Fetched from `GET /api/backup/history`
- Columns: Date, Type (Full/Tenant badge), Scope (tenant name or "All Tenants"), Format (JSON/CSV badge), Size, Actions
- Actions: No re-download (files are on your machine already)
- Paginated, 10 per page
- Empty state with icon and message when no backups yet

#### Restore Section
- Separate card below the history table
- Title: "Restore from Backup"
- Drag-and-drop zone / file picker accepting `.json` files only
- Flow:
  1. User selects/drops a file
  2. File uploads to preview endpoint
  3. **Restore Preview Modal** appears showing:
     - Backup date and type
     - Tenant scope (if tenant-specific)
     - Table-by-table row counts in a clean grid
     - Warning banner: "This will delete and replace all existing data for the selected scope. This action cannot be undone."
  4. User must type `RESTORE` in a confirmation input to enable the button
  5. Clicking "Restore" triggers execute mode
  6. Shows loading overlay with progress (see below)
  7. Success or error message after completion

### Loading Overlay (Backup Generation & Restore)

Both backup generation and restore show the same overlay:

- **Full-screen overlay** with backdrop blur
- **Animated Obsidian logo** — the geometric SVG from `Logo.jsx` (logo only, no wordmark), with a CSS pulse animation
- **Progress bar** below the logo — advances as each table is "processed"
- **Stage label** below the progress bar: "Exporting tenants..." → "Exporting branches..." → "Exporting customers..." → etc.
- **Simulated progress** — frontend knows 12 tables, advances the bar at timed intervals (~250ms per step), jumps to 100% when the actual response arrives

For restore, the same pattern with labels like "Validating backup..." → "Restoring tenants..." → "Restoring branches..." → etc.

---

## Frontend API

New methods in `src/lib/api.js`:

```js
export const backupApi = {
  generate: (data) => apiFetch('/backup/generate', {
    method: 'POST',
    body: JSON.stringify(data),
    rawResponse: true, // returns blob for download
  }),
  preview: (file) => {
    const formData = new FormData()
    formData.append('backup', file)
    return apiFetch('/backup/restore', {
      method: 'POST',
      body: formData,
      skipContentType: true,
    })
  },
  restore: (file) => {
    const formData = new FormData()
    formData.append('backup', file)
    return apiFetch('/backup/restore?confirm=true', {
      method: 'POST',
      body: formData,
      skipContentType: true,
    })
  },
  history: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return apiFetch(`/backup/history?${qs}`)
  },
}
```

Note: The `generate` endpoint returns a file blob, not JSON. The `apiFetch` wrapper will need a `rawResponse` flag to return the raw `Response` object so the frontend can read it as a blob and trigger a download.

---

## Dependencies

- **`archiver`** (npm) — for generating `.zip` files containing CSVs. Lightweight, streaming, no native bindings.
- **`multer`** (npm) — for handling multipart file uploads on the restore endpoint. Already a common Express middleware.
- **`apiFetch` modification** — add a `rawResponse` flag that returns the raw `Response` object instead of parsing JSON. This is a small change to the existing wrapper in `src/lib/api.js`.

---

## Security

- All endpoints require `superAdminScope` — only platform admins can access
- Restore requires typing `RESTORE` — prevents accidental clicks
- Restore preview is read-only — no data modified until explicit confirmation
- Restore executes in a transaction — full rollback on any error
- Backup files contain tenant data (PII) — the admin is responsible for securing downloaded files
