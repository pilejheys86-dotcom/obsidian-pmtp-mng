// server/routes/branding.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/db');
const { isValidSubdomain, isReservedSubdomain } = require('../utils/helpers');
const { transformGoogleDriveUrl } = require('../utils/googleDrive');
const { logTenantAudit } = require('../utils/auditLog');

// Only OWNER and MANAGER can access branding
const requireOwnerOrManager = (req, res, next) => {
  if (!['OWNER', 'MANAGER'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Only owners and managers can manage branding' });
  }
  next();
};

router.use(requireOwnerOrManager);

// GET /api/branding — get current tenant's branding config
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenant_branding')
      .select('*, tenants(business_name, logo_url)')
      .eq('tenant_id', req.tenantId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No row yet — return empty config
      return res.json(null);
    }
    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (err) {
    console.error('[Branding GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

// PUT /api/branding — upsert branding config
router.put('/', async (req, res) => {
  try {
    const {
      subdomain, tagline, is_published,
      brand_color, font_family, services_enabled,
      logo_url, business_name, apk_download_url,
    } = req.body;

    // --- existing subdomain validation ---
    if (subdomain !== undefined && subdomain !== null) {
      const slug = subdomain.toLowerCase().trim();
      if (!isValidSubdomain(slug)) {
        return res.status(400).json({ error: 'Invalid subdomain. Use 3-63 lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.' });
      }
      if (isReservedSubdomain(slug)) {
        return res.status(400).json({ error: 'This subdomain is reserved' });
      }
      const { data: existing } = await supabaseAdmin
        .from('tenant_branding')
        .select('tenant_id')
        .eq('subdomain', slug)
        .neq('tenant_id', req.tenantId)
        .single();
      if (existing) return res.status(409).json({ error: 'This subdomain is already taken' });
    }

    // --- new: validate brand_color ---
    if (brand_color !== undefined && brand_color !== null && brand_color !== '') {
      if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(brand_color)) {
        return res.status(400).json({ error: 'Invalid brand color. Must be a hex value like #A3E635' });
      }
    }

    // --- new: validate services_enabled ---
    if (services_enabled !== undefined && !Array.isArray(services_enabled)) {
      return res.status(400).json({ error: 'services_enabled must be an array' });
    }

    // --- new: validate logo_url ---
    if (logo_url !== undefined && logo_url !== null && logo_url !== '') {
      try {
        const parsed = new URL(logo_url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({ error: 'Logo URL must be HTTP or HTTPS' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid logo URL' });
      }
    }

    // --- build upsert payload ---
    const payload = { tenant_id: req.tenantId, updated_at: new Date().toISOString() };
    if (subdomain !== undefined)         payload.subdomain         = subdomain?.toLowerCase().trim() || null;
    if (tagline !== undefined)           payload.tagline           = tagline?.trim() || null;
    if (is_published !== undefined)      payload.is_published      = !!is_published;
    if (brand_color !== undefined)       payload.brand_color       = brand_color || null;
    if (font_family !== undefined)       payload.font_family       = font_family?.trim() || null;
    if (services_enabled !== undefined)  payload.services_enabled  = services_enabled;
    if (apk_download_url !== undefined) payload.apk_download_url = apk_download_url?.trim() || null;

    // --- update tenants table if identity fields provided ---
    if (logo_url !== undefined || business_name !== undefined) {
      const tenantUpdate = {};
      if (logo_url !== undefined)       tenantUpdate.logo_url      = logo_url || null;
      if (business_name !== undefined)  tenantUpdate.business_name = business_name?.trim() || null;
      if (Object.keys(tenantUpdate).length > 0) {
        await supabaseAdmin.from('tenants').update(tenantUpdate).eq('id', req.tenantId);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('tenant_branding')
      .upsert(payload, { onConflict: 'tenant_id' })
      .select('*, tenants(business_name, logo_url)')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    logTenantAudit(req, { action: 'BRANDING_UPDATED', category: 'SETTINGS', description: 'Updated branding settings' });
    res.json(data);
  } catch (err) {
    console.error('[Branding PUT]', err.message);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});

// GET /api/branding/check-subdomain/:slug — check availability
router.get('/check-subdomain/:slug', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase().trim();

    if (!isValidSubdomain(slug)) {
      return res.json({ available: false, reason: 'Invalid format' });
    }

    if (isReservedSubdomain(slug)) {
      return res.json({ available: false, reason: 'Reserved' });
    }

    const { data: existing } = await supabaseAdmin
      .from('tenant_branding')
      .select('tenant_id')
      .eq('subdomain', slug)
      .neq('tenant_id', req.tenantId)
      .single();

    res.json({ available: !existing });
  } catch (err) {
    console.error('[Branding Check]', err.message);
    res.status(500).json({ error: 'Failed to check subdomain' });
  }
});

module.exports = router;
