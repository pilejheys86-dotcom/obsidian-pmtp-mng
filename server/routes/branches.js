const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { getPagination } = require('../utils/helpers');

// GET /api/branches — List branches for tenant
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('*')
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// GET /api/branches/:id
router.get('/:id', async (req, res) => {
  const { data: branch, error } = await supabaseAdmin
    .from('branches')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null)
    .single();

  if (error) return res.status(404).json({ error: 'Branch not found' });

  const { data: staff } = await supabaseAdmin
    .from('employees')
    .select('id, full_name, role, is_active')
    .eq('branch_id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .is('deleted_at', null);

  branch.employees = staff || [];
  branch.tenant_users = staff || []; // compatibility shim

  res.json(branch);
});

// POST /api/branches — Create branch
router.post('/', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only owners can create branches' });
  }

  const { branch_code, branch_name, address, city_municipality, vault_capacity } = req.body;

  const { data, error } = await supabaseAdmin
    .from('branches')
    .insert({
      tenant_id: req.tenantId,
      branch_code,
      branch_name,
      address,
      city_municipality,
      vault_capacity,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/branches/:id
router.patch('/:id', async (req, res) => {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only owners can modify branches' });
  }

  const { data, error } = await supabaseAdmin
    .from('branches')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenantId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
