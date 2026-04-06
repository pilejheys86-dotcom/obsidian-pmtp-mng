const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');

// GET /api/auctions — List auctions
router.get('/', async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));

  let query = supabaseAdmin
    .from('auctions')
    .select('*, auction_lots(*, pawn_items(*), customers(first_name, last_name))', { count: 'exact' })
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('auction_date', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });

  // Fetch media for all pawn_items in auction lots
  const allItemIds = [];
  (data || []).forEach(auction => {
    (auction.auction_lots || []).forEach(lot => {
      if (lot.pawn_items?.id) allItemIds.push(lot.pawn_items.id);
    });
  });
  if (allItemIds.length > 0) {
    const { data: photos } = await supabaseAdmin.from('media')
      .select('*').eq('ref_type', 'ITEM_PHOTO').in('ref_id', allItemIds).is('deleted_at', null);
    (data || []).forEach(auction => {
      (auction.auction_lots || []).forEach(lot => {
        if (lot.pawn_items) {
          lot.pawn_items.item_images = (photos || []).filter(p => p.ref_id === lot.pawn_items.id);
        }
      });
    });
  }

  res.json({ data: data || [], total: count, page: Number(page), limit: Number(limit) });
});

// GET /api/auctions/lots — Flat list of all auction lots (for gallery view)
router.get('/lots', async (req, res) => {
  const { page = 1, limit = 12, category } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));

  let query = supabaseAdmin
    .from('auction_lots')
    .select(`
      *,
      auctions(auction_date, status, venue),
      pawn_items(*),
      customers(first_name, last_name)
    `, { count: 'exact' })
    .eq('tenant_id', req.tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (category) {
    query = query.eq('pawn_items.category', category);
  }

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });

  // Fetch media for all pawn_items in lots
  const lotItemIds = (data || []).map(lot => lot.pawn_items?.id).filter(Boolean);
  if (lotItemIds.length > 0) {
    const { data: photos } = await supabaseAdmin.from('media')
      .select('*').eq('ref_type', 'ITEM_PHOTO').in('ref_id', lotItemIds).is('deleted_at', null);
    (data || []).forEach(lot => {
      if (lot.pawn_items) {
        lot.pawn_items.item_images = (photos || []).filter(p => p.ref_id === lot.pawn_items.id);
      }
    });
  }

  res.json({ data: data || [], total: count, page: Number(page), limit: Number(limit) });
});

// GET /api/auctions/stats
router.get('/stats', async (req, res) => {
  const tenantId = req.tenantId;

  const { count: totalAuctions } = await supabaseAdmin
    .from('auctions')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  const { count: scheduledAuctions } = await supabaseAdmin
    .from('auctions')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'SCHEDULED')
    .is('deleted_at', null);

  const { count: totalLots } = await supabaseAdmin
    .from('auction_lots')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // Sold lots this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: soldThisMonth } = await supabaseAdmin
    .from('auction_lots')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('sold_price', 'is', null)
    .gte('created_at', startOfMonth.toISOString());

  res.json({
    totalAuctions: totalAuctions || 0,
    scheduledAuctions: scheduledAuctions || 0,
    totalLots: totalLots || 0,
    soldThisMonth: soldThisMonth || 0,
  });
});

// POST /api/auctions — Create auction
router.post('/', async (req, res) => {
  const { auction_date, publication_date, venue } = req.body;

  const { data, error } = await supabaseAdmin
    .from('auctions')
    .insert({
      tenant_id: req.tenantId,
      auction_date,
      publication_date,
      venue,
      status: 'SCHEDULED',
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// POST /api/auctions/:id/lots — Add lot to auction
router.post('/:id/lots', async (req, res) => {
  const { item_id, base_price } = req.body;

  const { data, error } = await supabaseAdmin
    .from('auction_lots')
    .insert({
      tenant_id: req.tenantId,
      auction_id: req.params.id,
      item_id,
      base_price,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/auctions/lots/:lotId — Record sale
router.patch('/lots/:lotId', async (req, res) => {
  const { sold_price, buyer_id } = req.body;

  const { data, error } = await supabaseAdmin
    .from('auction_lots')
    .update({ sold_price, buyer_id, updated_at: new Date().toISOString() })
    .eq('id', req.params.lotId)
    .eq('tenant_id', req.tenantId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Update item status to AUCTIONED
  if (data.item_id) {
    await supabaseAdmin
      .from('pawn_items')
      .update({ inventory_status: 'AUCTIONED', updated_at: new Date().toISOString() })
      .eq('id', data.item_id)
      .eq('tenant_id', req.tenantId);
  }

  res.json(data);
});

// PATCH /api/auctions/:id — Update auction status
router.patch('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('auctions')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
