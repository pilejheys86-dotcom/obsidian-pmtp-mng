const { supabaseAdmin } = require('../config/db');

/**
 * Log a tenant-level audit event. Fire-and-forget — does not throw on failure.
 *
 * @param {object} req - Express request (must have tenantId, userId)
 * @param {object} opts
 * @param {string} opts.action - Machine-readable code (e.g. APPRAISAL_SUBMITTED)
 * @param {string} opts.category - Grouping (AUTH, APPRAISAL, LOAN, etc.)
 * @param {string} opts.description - Human-readable summary
 * @param {string} [opts.target_type] - Entity type (pawn_item, customer, etc.)
 * @param {string} [opts.target_id] - UUID of affected entity
 */
function logTenantAudit(req, { action, category, description, target_type, target_id }) {
  const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

  supabaseAdmin.from('tenant_audit_logs').insert({
    tenant_id: req.tenantId,
    user_id: req.userId || null,
    action,
    category,
    description,
    target_type: target_type || null,
    target_id: target_id || null,
    ip_address: ip,
  }).then(({ error }) => {
    if (error) console.error('[AUDIT] Failed to log:', error.message);
  });
}

module.exports = { logTenantAudit };
