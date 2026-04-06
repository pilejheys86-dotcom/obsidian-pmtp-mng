# Backup & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive backup & restore system for super admins — generate JSON/CSV backups (full platform or per-tenant), download them, view backup history, and restore from previously downloaded JSON files.

**Architecture:** Server-side generation via Express route that queries all 12 tenant-scoped tables in dependency order, assembles JSON or CSV ZIP, and streams the file as a download. Restore parses uploaded JSON, validates structure, previews changes, then executes delete+insert in dependency order. Frontend replaces the placeholder Backup page with backup controls, history table, drag-and-drop restore, and an animated loading overlay.

**Tech Stack:** Express.js, Supabase (PostgreSQL via supabaseAdmin), archiver (ZIP), multer (file upload), React 18, TailwindCSS 4.

**Spec:** `docs/superpowers/specs/2026-04-04-backup-restore-design.md`

---

### Task 1: Install Dependencies & Create Database Table

**Files:**
- Modify: `package.json` (root)
- Create: `sql/create_backup_logs.sql`

- [ ] **Step 1: Install archiver and multer**

```bash
npm install archiver multer
```

- [ ] **Step 2: Create the SQL migration file**

Create `sql/create_backup_logs.sql`:

```sql
CREATE TABLE IF NOT EXISTS platform_backup_logs (
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

- [ ] **Step 3: Run the SQL in Supabase**

Execute the SQL above in the Supabase SQL Editor for the project.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json sql/create_backup_logs.sql
git commit -m "chore: add archiver/multer deps and backup_logs migration"
```

---

### Task 2: Backend — Backup Generate Endpoint (JSON)

**Files:**
- Create: `server/routes/backup.js`
- Modify: `server/index.js` (register route)

- [ ] **Step 1: Create `server/routes/backup.js` with the generate endpoint**

```js
const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const multer = require('multer');
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');
const { toCsv } = require('../utils/csvHelper');

const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max

const BACKUP_TABLES = [
  'tenants', 'branches', 'tenant_users', 'customers', 'kyc_documents',
  'tenant_loan_settings', 'tenant_branding', 'pawn_items', 'pawn_tickets',
  'transactions', 'subscriptions', 'tenant_audit_logs',
];

const VALID_TABLES = new Set(BACKUP_TABLES);

// Helper: fetch all rows from a table, optionally filtered by tenant_id
const fetchTable = async (table, tenantId) => {
  let query = supabaseAdmin.from(table).select('*');
  if (tenantId) {
    // tenants table uses id, not tenant_id
    query = table === 'tenants'
      ? query.eq('id', tenantId)
      : query.eq('tenant_id', tenantId);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
  return data || [];
};

// POST /api/backup/generate — Generate and download a backup
router.post('/generate', async (req, res) => {
  const { type, tenant_id, format = 'json' } = req.body;

  if (!type || !['full', 'tenant'].includes(type)) {
    return res.status(422).json({ error: 'type must be "full" or "tenant"' });
  }
  if (type === 'tenant' && !tenant_id) {
    return res.status(422).json({ error: 'tenant_id is required for tenant backups' });
  }
  if (!['json', 'csv'].includes(format)) {
    return res.status(422).json({ error: 'format must be "json" or "csv"' });
  }

  try {
    // If tenant backup, get the tenant name for the filename
    let tenantName = null;
    if (type === 'tenant') {
      const { data: t } = await supabaseAdmin.from('tenants').select('business_name').eq('id', tenant_id).maybeSingle();
      tenantName = t?.business_name || 'unknown';
    }

    // Fetch all tables
    const data = {};
    const tableCounts = {};
    let totalRows = 0;

    for (const table of BACKUP_TABLES) {
      const rows = await fetchTable(table, type === 'tenant' ? tenant_id : null);
      data[table] = rows;
      tableCounts[table] = rows.length;
      totalRows += rows.length;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const slug = tenantName ? tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') : 'full';
    const baseName = `obsidian-backup-${type}-${slug}-${dateStr}`;

    let fileBuffer;
    let contentType;
    let ext;

    if (format === 'csv') {
      // Generate ZIP with one CSV per table
      ext = 'zip';
      contentType = 'application/zip';

      const chunks = [];
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => chunks.push(chunk));
      await new Promise((resolve, reject) => {
        archive.on('end', resolve);
        archive.on('error', reject);

        for (const table of BACKUP_TABLES) {
          const rows = data[table];
          if (rows.length === 0) {
            archive.append('', { name: `${table}.csv` });
          } else {
            const headers = Object.keys(rows[0]);
            const csv = toCsv(headers, rows);
            archive.append(csv, { name: `${table}.csv` });
          }
        }
        archive.finalize();
      });
      fileBuffer = Buffer.concat(chunks);
    } else {
      // Generate JSON
      ext = 'json';
      contentType = 'application/json';

      const backup = {
        meta: {
          version: '1.0',
          platform: 'obsidian',
          type,
          tenant_id: tenant_id || null,
          tenant_name: tenantName,
          generated_at: new Date().toISOString(),
          generated_by: req.adminProfile.email,
          table_counts: tableCounts,
          total_rows: totalRows,
        },
        data,
      };
      fileBuffer = Buffer.from(JSON.stringify(backup, null, 2), 'utf-8');
    }

    // Log the backup
    await supabaseAdmin.from('platform_backup_logs').insert({
      type,
      format,
      tenant_id: tenant_id || null,
      tenant_name: tenantName,
      generated_by: req.adminProfile.id,
      admin_name: req.adminProfile.full_name,
      file_size_bytes: fileBuffer.length,
      total_rows: totalRows,
      table_counts: tableCounts,
      status: 'success',
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${ext}"`);
    res.send(fileBuffer);
  } catch (err) {
    console.error('[BACKUP] Generate error:', err.message);

    // Log the failure
    await supabaseAdmin.from('platform_backup_logs').insert({
      type,
      format,
      tenant_id: tenant_id || null,
      generated_by: req.adminProfile.id,
      admin_name: req.adminProfile.full_name,
      status: 'failed',
    }).catch(() => {});

    res.status(500).json({ error: 'Failed to generate backup' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Register the route in `server/index.js`**

Add this line next to the other super admin route (`/api/tenants`):

```js
app.use('/api/backup', auth, superAdminScope, require('./routes/backup'));
```

- [ ] **Step 3: Verify the server starts without errors**

```bash
node -e "require('./server/routes/backup.js')"
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/backup.js server/index.js
git commit -m "feat(backup): add generate endpoint with JSON and CSV ZIP support"
```

---

### Task 3: Backend — Restore Endpoint (Preview + Execute)

**Files:**
- Modify: `server/routes/backup.js`

- [ ] **Step 1: Add the restore endpoint to `server/routes/backup.js`**

Add before `module.exports`:

```js
// POST /api/backup/restore — Preview or execute a restore from uploaded JSON
router.post('/restore', upload.single('backup'), async (req, res) => {
  if (!req.file) {
    return res.status(422).json({ error: 'No backup file uploaded' });
  }

  let parsed;
  try {
    parsed = JSON.parse(req.file.buffer.toString('utf-8'));
  } catch {
    return res.status(422).json({ error: 'Invalid JSON file' });
  }

  // Validate structure
  const { meta, data } = parsed;
  if (!meta || !data) {
    return res.status(422).json({ error: 'Invalid backup format: missing meta or data' });
  }
  if (meta.platform !== 'obsidian') {
    return res.status(422).json({ error: 'Invalid backup: not an Obsidian backup file' });
  }
  if (meta.version !== '1.0') {
    return res.status(422).json({ error: `Unsupported backup version: ${meta.version}` });
  }
  if (!['full', 'tenant'].includes(meta.type)) {
    return res.status(422).json({ error: 'Invalid backup type' });
  }

  // Validate table names
  const unknownTables = Object.keys(data).filter(t => !VALID_TABLES.has(t));
  if (unknownTables.length > 0) {
    return res.status(422).json({ error: `Unknown tables in backup: ${unknownTables.join(', ')}` });
  }

  // Validate row counts match
  for (const [table, expectedCount] of Object.entries(meta.table_counts || {})) {
    const actual = (data[table] || []).length;
    if (actual !== expectedCount) {
      return res.status(422).json({ error: `Row count mismatch for ${table}: expected ${expectedCount}, got ${actual}` });
    }
  }

  // Build preview summary
  const tableCounts = {};
  let totalRows = 0;
  for (const table of BACKUP_TABLES) {
    const count = (data[table] || []).length;
    tableCounts[table] = count;
    totalRows += count;
  }

  const preview = {
    valid: true,
    type: meta.type,
    tenant_id: meta.tenant_id,
    tenant_name: meta.tenant_name,
    generated_at: meta.generated_at,
    generated_by: meta.generated_by,
    table_counts: tableCounts,
    total_rows: totalRows,
  };

  // Preview mode — just return the summary
  const confirm = req.query.confirm === 'true';
  if (!confirm) {
    return res.json(preview);
  }

  // Execute mode — delete existing data and insert from backup
  try {
    const tenantFilter = meta.type === 'tenant' ? meta.tenant_id : null;

    // Delete in reverse dependency order (child → parent)
    const deleteOrder = [...BACKUP_TABLES].reverse();
    for (const table of deleteOrder) {
      let query = supabaseAdmin.from(table).delete();
      if (tenantFilter) {
        query = table === 'tenants'
          ? query.eq('id', tenantFilter)
          : query.eq('tenant_id', tenantFilter);
      } else {
        // Full restore: delete all rows. Supabase .delete() requires a filter,
        // so we use .neq('id', '00000000-0000-0000-0000-000000000000') as a match-all
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }
      const { error } = await query;
      if (error) throw new Error(`Delete from ${table} failed: ${error.message}`);
    }

    // Insert in dependency order (parent → child)
    for (const table of BACKUP_TABLES) {
      const rows = data[table] || [];
      if (rows.length === 0) continue;

      // Insert in batches of 500 to avoid payload limits
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabaseAdmin.from(table).insert(batch);
        if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
      }
    }

    res.json({ success: true, message: 'Restore completed successfully', ...preview });
  } catch (err) {
    console.error('[BACKUP] Restore error:', err.message);
    res.status(500).json({ error: `Restore failed: ${err.message}` });
  }
});
```

- [ ] **Step 2: Verify no syntax errors**

```bash
node -e "require('./server/routes/backup.js')"
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/backup.js
git commit -m "feat(backup): add restore endpoint with preview and execute modes"
```

---

### Task 4: Backend — History Endpoint

**Files:**
- Modify: `server/routes/backup.js`

- [ ] **Step 1: Add the history endpoint to `server/routes/backup.js`**

Add before `module.exports`:

```js
// GET /api/backup/history — Paginated backup log
router.get('/history', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const { from, to } = getPagination(page, limit);

  try {
    const { data, error, count } = await supabaseAdmin
      .from('platform_backup_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    res.json({ data: data || [], total: count || 0, page, limit });
  } catch (err) {
    console.error('[BACKUP] History error:', err.message);
    res.status(500).json({ error: 'Failed to fetch backup history' });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/backup.js
git commit -m "feat(backup): add history endpoint with pagination"
```

---

### Task 5: Frontend — API Client & apiFetch Modification

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Modify `apiFetch` to support raw responses and FormData**

Replace the existing `apiFetch` function (lines 34-52) with:

```js
const apiFetch = async (endpoint, options = {}) => {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  if (options.rawResponse) return res;
  return res.json();
};
```

Key changes:
- Skip `Content-Type: application/json` when body is `FormData` (lets browser set multipart boundary)
- Return raw `Response` when `options.rawResponse` is true (for file downloads)

- [ ] **Step 2: Add `backupApi` export**

Add after the existing `tenantsApi` export:

```js
// ── Backup ─────────────────────────────────────────────
export const backupApi = {
  generate: (data) =>
    apiFetch('/backup/generate', {
      method: 'POST',
      body: JSON.stringify(data),
      rawResponse: true,
    }),
  preview: (file) => {
    const formData = new FormData();
    formData.append('backup', file);
    return apiFetch('/backup/restore', { method: 'POST', body: formData });
  },
  restore: (file) => {
    const formData = new FormData();
    formData.append('backup', file);
    return apiFetch('/backup/restore?confirm=true', { method: 'POST', body: formData });
  },
  history: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/backup/history?${qs}`);
  },
};
```

- [ ] **Step 3: Verify build**

```bash
npx vite build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.js
git commit -m "feat(backup): add backupApi client and rawResponse support in apiFetch"
```

---

### Task 6: Frontend — Backup Page (Complete Rewrite)

**Files:**
- Rewrite: `src/pages/superadmin/Backup.jsx`

- [ ] **Step 1: Rewrite `src/pages/superadmin/Backup.jsx`**

Full replacement — the complete component with:
- Header with "Full Platform Backup" and "Tenant Backup" buttons
- Each button has a dropdown for JSON/CSV format
- Tenant backup opens a tenant selector modal first
- Backup history table with pagination (fetched from `/api/backup/history`)
- Restore section with drag-and-drop file upload
- Restore preview modal with table-by-table row counts and `RESTORE` confirmation input
- Animated loading overlay with ObsidianIcon (pulsing), progress bar, and simulated stage labels

The component uses these table names for progress simulation:

```js
const STAGE_LABELS = [
  'tenants', 'branches', 'tenant_users', 'customers', 'kyc_documents',
  'tenant_loan_settings', 'tenant_branding', 'pawn_items', 'pawn_tickets',
  'transactions', 'subscriptions', 'tenant_audit_logs',
];
```

The loading overlay component (`BackupOverlay`):
- Fixed fullscreen with `bg-black/60 backdrop-blur-sm`
- ObsidianIcon SVG (from Logo.jsx import) centered, `w-16 h-16`, with `animate-pulse` class
- Progress bar: `h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800` container, `bg-neutral-900 dark:bg-white` fill, `transition-all duration-300`
- Stage label below: `text-sm text-neutral-400` showing "Exporting {table}..." or "Restoring {table}..."
- Progress advances every 250ms through the 12 stages, jumps to 100% when the API promise resolves

Key download logic for the generate button:

```js
const handleBackup = async (type, tenantId, format) => {
  setOverlay({ active: true, mode: format === 'csv' ? 'Exporting' : 'Exporting' });
  try {
    const res = await backupApi.generate({ type, tenant_id: tenantId, format });
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="(.+?)"/);
    const filename = match ? match[1] : `obsidian-backup.${format === 'csv' ? 'zip' : 'json'}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setMessage({ type: 'success', text: `Backup downloaded: ${filename}` });
    fetchHistory();
  } catch (err) {
    setMessage({ type: 'error', text: err.message });
  } finally {
    setOverlay({ active: false });
  }
};
```

The restore flow:

```js
const handleRestorePreview = async (file) => {
  try {
    const preview = await backupApi.preview(file);
    setRestorePreview(preview);
    setRestoreFile(file);
  } catch (err) {
    setMessage({ type: 'error', text: err.message });
  }
};

const handleRestoreExecute = async () => {
  setOverlay({ active: true, mode: 'Restoring' });
  try {
    await backupApi.restore(restoreFile);
    setMessage({ type: 'success', text: 'Restore completed successfully.' });
    setRestorePreview(null);
    setRestoreFile(null);
    setConfirmText('');
    fetchHistory();
  } catch (err) {
    setMessage({ type: 'error', text: err.message });
  } finally {
    setOverlay({ active: false });
  }
};
```

Tenant selector: fetch tenant list via `tenantsApi.list()`, show in a simple dropdown modal, then proceed with backup.

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/superadmin/Backup.jsx
git commit -m "feat(backup): redesign backup page with generate, history, and restore"
```

---

### Task 7: Integration Test & Push

**Files:**
- No new files

- [ ] **Step 1: Start the dev server and test manually**

```bash
npm run dev
```

Test the following flows:
1. Navigate to `/superadmin/backup`
2. Click "Full Platform Backup" → "JSON" — should download a `.json` file
3. Click "Full Platform Backup" → "CSV" — should download a `.zip` file
4. Click "Tenant Backup" — should show tenant selector, pick one, download
5. Verify backup history table shows the new entries
6. Drag the downloaded `.json` file into the restore zone — should show preview modal
7. Type `RESTORE` and click restore — should execute and show success
8. Verify the loading overlay shows with animated logo + progress bar

- [ ] **Step 2: Verify Vite production build**

```bash
npx vite build
```

- [ ] **Step 3: Push all changes**

```bash
git push origin main
```
