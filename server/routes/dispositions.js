const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const { logTenantAudit } = require('../utils/auditLog');

// POST /api/dispositions/approve — Approve item disposition via stored procedure
router.post('/approve', async (req, res) => {
  const { item_id, disposition_path, auction_base_price, melting_value } = req.body;

  if (!item_id || !disposition_path) {
    return res.status(400).json({ error: 'item_id and disposition_path are required' });
  }

  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only managers and owners can approve dispositions' });
  }

  const { data, error } = await supabaseAdmin.rpc('approve_item_disposition', {
    p_item_id: item_id,
    p_approved_by: req.userId,
    p_disposition_path: disposition_path,
    p_auction_base_price: auction_base_price || null,
    p_melting_value: melting_value || null,
  });

  if (error) return res.status(400).json({ error: error.message });
  if (!data.success) return res.status(422).json({ error: data.error });

  const dispositionLabel = req.body.disposition_path === 'AUCTION' ? 'Moved item to auction'
    : req.body.disposition_path === 'MELT' ? 'Melted item' : 'Forfeited item';
  const actionCode = req.body.disposition_path === 'AUCTION' ? 'ITEM_AUCTIONED'
    : req.body.disposition_path === 'MELT' ? 'ITEM_MELTED' : 'ITEM_FORFEITED';
  logTenantAudit(req, {
    action: actionCode, category: 'INVENTORY',
    description: dispositionLabel,
    target_type: 'pawn_item', target_id: req.body.item_id,
  });

  res.json(data);
});

// GET /api/dispositions — List items pending disposition review
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const tenantId = req.tenantId;
  const { from } = getPagination(Number(page), Number(limit));

  const { data: result, error } = await supabaseAdmin.rpc('get_items_with_media', {
    p_tenant_id: tenantId,
    p_status: 'FORFEITED',
    p_limit: limit,
    p_offset: from,
  });
  if (error) return res.status(400).json({ error: error.message });

  res.json({ data: result.items, pagination: { page, limit, total: result.total_count } });
}));

module.exports = router;
