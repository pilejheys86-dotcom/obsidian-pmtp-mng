const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');

const RESERVATION_EXPIRY_HOURS = 48;

router.get('/', async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));
  const { data, error, count } = await supabaseAdmin.from('auctions')
    .select('id, auction_date, venue, status, total_lots', { count: 'exact' })
    .eq('tenant_id', req.activeTenantId).eq('status', 'SCHEDULED')
    .gte('auction_date', new Date().toISOString()).is('deleted_at', null)
    .order('auction_date', { ascending: true }).range(from, to);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data: data || [], total: count, page: Number(page), limit: Number(limit) });
});

router.get('/:auctionId/lots', async (req, res) => {
  const { page = 1, limit = 12 } = req.query;
  const { from, to } = getPagination(Number(page), Number(limit));
  const { data, error, count } = await supabaseAdmin.from('auction_lots')
    .select('*, pawn_items(id, general_desc, category)', { count: 'exact' })
    .eq('auction_id', req.params.auctionId).eq('tenant_id', req.activeTenantId)
    .is('sold_price', null).order('lot_number', { ascending: true }).range(from, to);
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

router.post('/lots/:lotId/reserve', async (req, res) => {
  const { data: lot, error: lotErr } = await supabaseAdmin.from('auction_lots')
    .select('*, auctions(status)').eq('id', req.params.lotId).eq('tenant_id', req.activeTenantId).is('sold_price', null).single();
  if (lotErr || !lot) return res.status(404).json({ error: 'Lot not found or already sold' });
  if (lot.auctions?.status !== 'SCHEDULED') return res.status(400).json({ error: 'Auction is not open for reservations' });

  const expiresAt = new Date(Date.now() + RESERVATION_EXPIRY_HOURS * 60 * 60 * 1000);
  const { data: reservation, error: resErr } = await supabaseAdmin.from('auction_reservations').insert({
    tenant_id: req.activeTenantId, lot_id: req.params.lotId, customer_id: req.customerId,
    status: 'ACTIVE', expires_at: expiresAt.toISOString(), notes: req.body.notes || null,
  }).select().single();
  if (resErr) {
    if (resErr.message.includes('unique') || resErr.message.includes('duplicate'))
      return res.status(409).json({ error: 'You already have an active reservation for this lot' });
    return res.status(400).json({ error: resErr.message });
  }

  await supabaseAdmin.from('customer_notifications').insert({
    tenant_id: req.activeTenantId, customer_id: req.customerId, title: 'Reservation Confirmed',
    body: `Your reservation for Lot ${lot.lot_number || req.params.lotId} has been confirmed. Expires ${expiresAt.toLocaleDateString()}.`,
    type: 'RESERVATION_CONFIRMED', reference_type: 'RESERVATION', reference_id: reservation.id,
  });
  res.status(201).json({ reservation });
});

router.delete('/reservations/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('auction_reservations')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('customer_id', req.customerId).eq('status', 'ACTIVE').select().single();
  if (error || !data) return res.status(404).json({ error: 'Reservation not found or already cancelled' });
  res.json({ message: 'Reservation cancelled', reservation: data });
});

router.get('/reservations', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('auction_reservations')
    .select('*, auction_lots(*, pawn_items(id, general_desc, category), auctions(auction_date, venue))')
    .eq('customer_id', req.customerId).eq('tenant_id', req.activeTenantId)
    .eq('status', 'ACTIVE').is('deleted_at', null).order('reserved_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });

  // Fetch media for all pawn_items in reservations
  const resItemIds = (data || []).map(r => r.auction_lots?.pawn_items?.id).filter(Boolean);
  if (resItemIds.length > 0) {
    const { data: photos } = await supabaseAdmin.from('media')
      .select('*').eq('ref_type', 'ITEM_PHOTO').in('ref_id', resItemIds).is('deleted_at', null);
    (data || []).forEach(reservation => {
      if (reservation.auction_lots?.pawn_items) {
        reservation.auction_lots.pawn_items.item_images = (photos || []).filter(p => p.ref_id === reservation.auction_lots.pawn_items.id);
      }
    });
  }

  res.json({ data: data || [] });
});

module.exports = router;
