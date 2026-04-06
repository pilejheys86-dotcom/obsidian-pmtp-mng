const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');

// POST /api/cron/check-overdue — Trigger overdue check + penalty escalation
// Intended to be called by pg_cron, Supabase Edge Function, or external scheduler
router.post('/check-overdue', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can trigger overdue checks' });
  }

  const { data, error } = await supabaseAdmin.rpc('check_overdue_loans');

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
});

// POST /api/cron/auto-expire — Trigger hard expiry by grace period
router.post('/auto-expire', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can trigger auto-expire' });
  }

  const { data, error } = await supabaseAdmin.rpc('auto_expire_by_grace_period');

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
});

// POST /api/cron/run-all — Run both overdue check and auto-expire in sequence
router.post('/run-all', async (req, res) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can trigger cron jobs' });
  }

  const { data: overdueResult, error: overdueError } = await supabaseAdmin.rpc('check_overdue_loans');
  if (overdueError) return res.status(400).json({ error: overdueError.message });

  const { data: expiryResult, error: expiryError } = await supabaseAdmin.rpc('auto_expire_by_grace_period');
  if (expiryError) return res.status(400).json({ error: expiryError.message });

  res.json({
    overdue: overdueResult,
    expiry: expiryResult,
  });
});

module.exports = router;
