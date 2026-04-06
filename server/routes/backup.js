const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');
const { toCsv } = require('../utils/csvHelper');
const asyncHandler = require('../utils/asyncHandler');

// ── Constants ─────────────────────────────────────────────────────────────────
const TABLES = [
  'tenants',
  'branches',
  'tenant_users',
  'customers',
  'kyc_documents',
  'tenant_loan_settings',
  'tenant_branding',
  'pawn_items',
  'pawn_tickets',
  'transactions',
  'subscriptions',
  'tenant_audit_logs',
];

const VALID_TYPES = ['full', 'tenant'];
const VALID_FORMATS = ['json', 'csv'];

// Raw body parser for JSON file uploads (replaces multer)
const rawJsonUpload = express.raw({ type: 'application/json', limit: '100mb' });

// ── Helper: fetch all rows from a table (with optional tenant filter) ─────────
const fetchTable = async (table, tenantId) => {
  let query = supabaseAdmin.from(table).select('*');

  if (tenantId) {
    // tenants table uses `id` as the tenant identifier
    if (table === 'tenants') {
      query = query.eq('id', tenantId);
    } else {
      query = query.eq('tenant_id', tenantId);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
  return data || [];
};

// ── Helper: build slug for filename ───────────────────────────────────────────
const toSlug = (str) =>
  (str || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ── Helper: format date as YYYYMMDD ──────────────────────────────────────────
const dateStamp = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
};

// ── Helper: log backup to platform_backup_logs ────────────────────────────────
const logBackup = async (entry) => {
  await supabaseAdmin.from('platform_backup_logs').insert(entry);
};

// ── POST /generate ────────────────────────────────────────────────────────────
router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { type, tenant_id, format } = req.body;

    // Validate type
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    }

    // Validate format
    if (!format || !VALID_FORMATS.includes(format)) {
      return res.status(400).json({ error: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}` });
    }

    // Validate tenant_id when type is tenant
    if (type === 'tenant' && !tenant_id) {
      return res.status(400).json({ error: 'tenant_id is required for tenant backups' });
    }

    // Look up tenant name if tenant backup
    let tenantName = null;
    if (type === 'tenant') {
      const { data: tenant, error: tErr } = await supabaseAdmin
        .from('tenants')
        .select('business_name')
        .eq('id', tenant_id)
        .single();

      if (tErr || !tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      tenantName = tenant.business_name;
    }

    // Fetch all tables
    const data = {};
    const tableCounts = {};
    let totalRows = 0;

    for (const table of TABLES) {
      const rows = await fetchTable(table, type === 'tenant' ? tenant_id : null);
      data[table] = rows;
      tableCounts[table] = rows.length;
      totalRows += rows.length;
    }

    const slug = type === 'tenant' ? toSlug(tenantName) : 'full';
    const stamp = dateStamp();
    const ext = format === 'json' ? 'json' : 'zip';
    const filename = `obsidian-backup-${type}-${slug}-${stamp}.${ext}`;

    // ── JSON format ──────────────────────────────────────────────
    if (format === 'json') {
      const payload = {
        meta: {
          version: '1.0',
          platform: 'obsidian',
          type,
          tenant_id: tenant_id || null,
          tenant_name: tenantName,
          generated_at: new Date().toISOString(),
          generated_by: req.adminProfile.id,
          table_counts: tableCounts,
          total_rows: totalRows,
        },
        data,
      };

      const jsonString = JSON.stringify(payload, null, 2);
      const fileSizeBytes = Buffer.byteLength(jsonString, 'utf8');

      // Log to backup history
      await logBackup({
        type,
        format,
        tenant_id: tenant_id || null,
        tenant_name: tenantName,
        generated_by: req.adminProfile.id,
        admin_name: req.adminProfile.full_name,
        file_size_bytes: fileSizeBytes,
        total_rows: totalRows,
        table_counts: tableCounts,
        status: 'success',
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(jsonString);
    }

    // ── CSV format (one combined CSV per table, separated by headers) ──
    const csvParts = [];
    for (const table of TABLES) {
      const rows = data[table];
      if (rows.length === 0) continue;
      const headers = Object.keys(rows[0]);
      csvParts.push(`# TABLE: ${table}`);
      csvParts.push(toCsv(headers, rows));
    }
    const csvOutput = csvParts.join('\n\n');
    const fileSizeBytes = Buffer.byteLength(csvOutput, 'utf8');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvOutput);

    await logBackup({
      type,
      format,
      tenant_id: tenant_id || null,
      tenant_name: tenantName,
      generated_by: req.adminProfile.id,
      admin_name: req.adminProfile.full_name,
      file_size_bytes: fileSizeBytes,
      total_rows: totalRows,
      table_counts: tableCounts,
      status: 'success',
    });
  }),
);

// ── POST /restore ─────────────────────────────────────────────────────────────
router.post(
  '/restore',
  rawJsonUpload,
  asyncHandler(async (req, res) => {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'No backup file uploaded' });
    }

    // Parse JSON from raw body buffer
    let backup;
    try {
      backup = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON file' });
    }

    const { meta, data } = backup;

    // ── Validation ─────────────────────────────────────────────
    if (!meta || !data) {
      return res.status(400).json({ error: 'Invalid backup structure: missing meta or data' });
    }

    if (meta.platform !== 'obsidian') {
      return res.status(400).json({ error: `Invalid platform: expected "obsidian", got "${meta.platform}"` });
    }

    if (meta.version !== '1.0') {
      return res.status(400).json({ error: `Unsupported backup version: ${meta.version}` });
    }

    if (!VALID_TYPES.includes(meta.type)) {
      return res.status(400).json({ error: `Invalid backup type: ${meta.type}` });
    }

    // Validate all table names are known
    const dataKeys = Object.keys(data);
    const unknownTables = dataKeys.filter((t) => !TABLES.includes(t));
    if (unknownTables.length > 0) {
      return res.status(400).json({ error: `Unknown tables in backup: ${unknownTables.join(', ')}` });
    }

    // Validate row counts match actual array lengths
    if (meta.table_counts) {
      for (const [table, count] of Object.entries(meta.table_counts)) {
        const actual = Array.isArray(data[table]) ? data[table].length : 0;
        if (actual !== count) {
          return res.status(400).json({
            error: `Row count mismatch for ${table}: meta says ${count}, actual is ${actual}`,
          });
        }
      }
    }

    // Build preview summary
    const tableCounts = {};
    let totalRows = 0;
    for (const table of TABLES) {
      const count = Array.isArray(data[table]) ? data[table].length : 0;
      tableCounts[table] = count;
      totalRows += count;
    }

    const preview = {
      type: meta.type,
      tenant_id: meta.tenant_id || null,
      tenant_name: meta.tenant_name || null,
      generated_at: meta.generated_at,
      table_counts: tableCounts,
      total_rows: totalRows,
    };

    // ── Preview mode (default) ────────────────────────────────
    if (req.query.confirm !== 'true') {
      return res.json({ mode: 'preview', ...preview });
    }

    // ── Execute mode ──────────────────────────────────────────
    const isTenant = meta.type === 'tenant';
    const tenantId = meta.tenant_id;

    // Delete in reverse dependency order (child -> parent)
    const reverseTables = [...TABLES].reverse();

    for (const table of reverseTables) {
      let deleteQuery = supabaseAdmin.from(table).delete();

      if (isTenant) {
        if (table === 'tenants') {
          deleteQuery = deleteQuery.eq('id', tenantId);
        } else {
          deleteQuery = deleteQuery.eq('tenant_id', tenantId);
        }
      } else {
        // Full restore: match-all pattern
        deleteQuery = deleteQuery.neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { error } = await deleteQuery;
      if (error) {
        return res.status(500).json({ error: `Failed to clear ${table}: ${error.message}` });
      }
    }

    // Insert in dependency order (parent -> child), batched by 500
    const BATCH_SIZE = 500;

    for (const table of TABLES) {
      const rows = data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error } = await supabaseAdmin.from(table).insert(batch);
        if (error) {
          return res.status(500).json({
            error: `Failed to insert into ${table} (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${error.message}`,
          });
        }
      }
    }

    return res.json({ mode: 'execute', status: 'success', ...preview });
  }),
);

// ── GET /history ──────────────────────────────────────────────────────────────
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const { from, to } = getPagination(page, limit);

    const { data, error, count } = await supabaseAdmin
      .from('platform_backup_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return res.status(500).json({ error: `Failed to fetch backup history: ${error.message}` });
    }

    return res.json({ data, total: count, page, limit });
  }),
);

module.exports = router;
