const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination, buildSearchFilter } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/pawn-items — List pawn items with pagination
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const tenantId = req.tenantId;
  const { from } = getPagination(Number(page), Number(limit));

  const { data: result, error } = await supabaseAdmin.rpc('get_items_with_media', {
    p_tenant_id: tenantId,
    p_status: status || null,
    p_limit: limit,
    p_offset: from,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data: result.items, pagination: { page, limit, total: result.total_count } });
}));

// GET /api/pawn-items/stats — KPI stats
router.get('/stats', async (req, res) => {
  const tenantId = req.tenantId;

  const { count: totalItems } = await supabaseAdmin
    .from('pawn_items')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  const { count: inVault } = await supabaseAdmin
    .from('pawn_items')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('inventory_status', 'IN_VAULT')
    .is('deleted_at', null);

  const { data: vaultValues } = await supabaseAdmin
    .from('pawn_items')
    .select('appraised_value')
    .eq('tenant_id', tenantId)
    .eq('inventory_status', 'IN_VAULT')
    .is('deleted_at', null);

  const totalValue = (vaultValues || []).reduce((sum, i) => sum + Number(i.appraised_value), 0);

  // Forfeited this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: forfeitedThisMonth } = await supabaseAdmin
    .from('pawn_items')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('inventory_status', 'FORFEITED')
    .gte('updated_at', startOfMonth.toISOString())
    .is('deleted_at', null);

  res.json({
    totalItems: totalItems || 0,
    inVault: inVault || 0,
    totalValue,
    forfeitedThisMonth: forfeitedThisMonth || 0,
  });
});

// GET /api/pawn-items/:id — Single item with images and tickets
router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('pawn_items')
    .select(`
      *,
      customers(first_name, last_name),
      branches(branch_name),
      pawn_tickets(*)
    `)
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .single();

  if (error) return res.status(404).json({ error: 'Item not found' });

  if (data) {
    const { data: photos } = await supabaseAdmin
      .from('media')
      .select('*')
      .eq('ref_type', 'ITEM_PHOTO')
      .eq('ref_id', data.id)
      .is('deleted_at', null);

    data.item_images = photos || [];

    // Resolve user UUIDs in specific_attrs to names
    const attrs = data.specific_attrs || {};
    const userIds = [attrs.appraised_by, attrs.submitted_by, attrs.issued_by].filter(Boolean);
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('tenant_users')
        .select('id, full_name')
        .in('id', userIds);
      const nameMap = {};
      (users || []).forEach(u => { nameMap[u.id] = u.full_name; });
      if (attrs.appraised_by) attrs.appraised_by_name = nameMap[attrs.appraised_by] || null;
      if (attrs.submitted_by) attrs.submitted_by_name = nameMap[attrs.submitted_by] || null;
      if (attrs.issued_by) attrs.issued_by_name = nameMap[attrs.issued_by] || null;
    }
  }

  res.json(data);
});

// POST /api/pawn-items — Create pawn item with images
router.post('/', async (req, res) => {
  const {
    customer_id, branch_id, category, general_desc,
    appraised_value, specific_attrs, condition_notes,
    inventory_status, images
  } = req.body;

  const { data: item, error } = await supabaseAdmin
    .from('pawn_items')
    .insert({
      tenant_id: req.tenantId,
      customer_id,
      branch_id: branch_id || req.branchId,
      category,
      general_desc,
      appraised_value,
      specific_attrs: specific_attrs || {},
      condition_notes,
      inventory_status: inventory_status || 'IN_VAULT',
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Insert images if provided
  if (images && images.length > 0) {
    const mediaRecords = images.map((img, idx) => ({
      tenant_id: req.tenantId,
      ref_type: 'ITEM_PHOTO',
      ref_id: item.id,
      image_url: img.image_url,
      is_primary: idx === 0,
      label: idx === 0 ? 'primary' : null,
    }));
    await supabaseAdmin.from('media').insert(mediaRecords);
  }

  res.status(201).json(item);
});

// PATCH /api/pawn-items/:id
router.patch('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('pawn_items')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/pawn-items/:id — Soft delete
router.delete('/:id', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('pawn_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Item deleted' });
});

module.exports = router;
