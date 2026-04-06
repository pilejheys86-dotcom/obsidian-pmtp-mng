const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 12 } = req.query;
  const { from } = getPagination(Number(page), Number(limit));

  const { data: result, error } = await supabaseAdmin.rpc('get_items_with_media', {
    p_tenant_id: req.activeTenantId,
    p_customer_id: req.customerId,
    p_limit: limit,
    p_offset: from,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data: result.items, pagination: { page, limit, total: result.total_count } });
}));

router.get('/:itemId', async (req, res) => {
  const { data: item, error } = await supabaseAdmin.from('pawn_items')
    .select('*, pawn_tickets(id, ticket_number, status, principal_loan, maturity_date)')
    .eq('id', req.params.itemId).eq('customer_id', req.customerId).eq('tenant_id', req.activeTenantId)
    .is('deleted_at', null).single();
  if (error || !item) return res.status(404).json({ error: 'Item not found' });

  // Fetch media for the item
  const { data: photos } = await supabaseAdmin.from('media')
    .select('*').eq('ref_type', 'ITEM_PHOTO').eq('ref_id', item.id).is('deleted_at', null);
  item.item_images = photos || [];

  res.json({ item });
});

module.exports = router;
