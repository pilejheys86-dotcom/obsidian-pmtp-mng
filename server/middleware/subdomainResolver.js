// server/middleware/subdomainResolver.js
const fs   = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/db');

const showcaseTemplate = fs.readFileSync(path.join(__dirname, '../views/showcase.html'), 'utf-8');
const notFoundPage     = fs.readFileSync(path.join(__dirname, '../views/404.html'), 'utf-8');

const GOOGLE_FONTS_BASE = 'https://fonts.googleapis.com/css2?family=';

// Map font_family values to their Google Fonts URL slugs
const FONT_URL_MAP = {
  'Playfair Display': 'Playfair+Display:wght@700;800',
  'Lora': 'Lora:wght@700',
  'Merriweather': 'Merriweather:wght@700',
  'EB Garamond': 'EB+Garamond:wght@700',
  'Inter': 'Inter:wght@700;800',
  'Outfit': 'Outfit:wght@700;800',
  'Nunito': 'Nunito:wght@700;800',
  'Raleway': 'Raleway:wght@700;800',
  'Oswald': 'Oswald:wght@600;700',
  'Bebas Neue': 'Bebas+Neue',
  'Righteous': 'Righteous',
  'Staatliches': 'Staatliches',
};

const PAWNSHOP_SERVICES = [
  { slug: 'gold_jewelry',        label: 'Gold & Jewelry',       icon: 'diamond',       desc: 'Gold, silver, diamonds' },
  { slug: 'electronics',         label: 'Electronics',          icon: 'smartphone',    desc: 'Phones, laptops, tablets' },
  { slug: 'watches',             label: 'Watches',              icon: 'watch',         desc: 'Luxury & branded watches' },
  { slug: 'bags_apparel',        label: 'Bags & Apparel',       icon: 'shopping_bag',  desc: 'Designer bags & clothing' },
  { slug: 'power_tools',         label: 'Power Tools',          icon: 'construction',  desc: 'Tools & equipment' },
  { slug: 'musical_instruments', label: 'Musical Instruments',  icon: 'music_note',    desc: 'Guitars, keyboards & more' },
  { slug: 'title_loans',         label: 'Title Loans',          icon: 'article',       desc: 'Vehicle & property titles' },
];

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function buildServicesHtml(enabledSlugs, accentColor) {
  const enabled = Array.isArray(enabledSlugs) && enabledSlugs.length > 0
    ? PAWNSHOP_SERVICES.filter(s => enabledSlugs.includes(s.slug))
    : PAWNSHOP_SERVICES.slice(0, 4); // fallback: first 4

  return enabled.map((s, i) => `
    <div class="service-card reveal reveal-delay-${Math.min(i + 1, 4)}">
      <div class="service-icon">
        <span class="material-symbols-outlined">${escapeHtml(s.icon)}</span>
      </div>
      <div class="service-name">${escapeHtml(s.label)}</div>
      <div class="service-desc">${escapeHtml(s.desc)}</div>
    </div>`).join('');
}

function renderShowcase(tenant) {
  const accent       = tenant.brand_color || '#A3E635';
  const fontFamily   = tenant.font_family  || 'Plus Jakarta Sans';
  const fontSlug     = FONT_URL_MAP[fontFamily];
  const fontUrl      = fontSlug
    ? `${GOOGLE_FONTS_BASE}${fontSlug}&display=swap`
    : 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&display=swap';
  const servicesHtml = buildServicesHtml(tenant.services_enabled, accent);
  const logoHtml     = tenant.logo_url
    ? `<img src="${escapeHtml(tenant.logo_url)}" alt="${escapeHtml(tenant.business_name)}" style="width:100%;height:100%;object-fit:cover;border-radius:6px" />`
    : escapeHtml(tenant.business_name.charAt(0).toUpperCase());

  return showcaseTemplate
    .replace(/\{\{BUSINESS_NAME\}\}/g, escapeHtml(tenant.business_name))
    .replace(/\{\{LOGO_HTML\}\}/g,   logoHtml)
    .replace(/\{\{FONT_URL\}\}/g,   escapeHtml(fontUrl))
    .replace(/\{\{FONT_FAMILY\}\}/g, escapeHtml(fontFamily))
    .replace(/\{\{BRAND_COLOR\}\}/g, escapeHtml(accent))
    .replace(/\{\{TAGLINE\}\}/g, escapeHtml(tenant.tagline || ''))
    .replace(/\{\{TAGLINE_CLASS\}\}/g,  tenant.tagline ? '' : 'hidden')
    .replace(/\{\{SERVICES_HTML\}\}/g, servicesHtml)
    .replace(/\{\{TENANT_ID\}\}/g,   escapeHtml(tenant.tenant_id))
    .replace(/\{\{APK_URL\}\}/g,    escapeHtml(tenant.apk_download_url || '#'))
    .replace(/\{\{DOWNLOAD_CLASS\}\}/g, tenant.apk_download_url ? '' : 'hidden')
    .replace(/\{\{CLIENT_URL\}\}/g, escapeHtml(process.env.CLIENT_URL || ''));
}

const showcaseHandler = async (req, res) => {
  const slug = req.params.slug?.toLowerCase();
  if (!slug) return res.status(404).type('html').send(notFoundPage);

  try {
    const { data: branding, error } = await supabaseAdmin
      .from('tenant_branding')
      .select('tenant_id, subdomain, tagline, is_published, brand_color, font_family, services_enabled, apk_download_url, tenants(business_name, logo_url)')
      .eq('subdomain', slug)
      .eq('is_published', true)
      .single();

    if (error || !branding) return res.status(404).type('html').send(notFoundPage);

    const tenant = {
      tenant_id:        branding.tenant_id,
      business_name:    branding.tenants.business_name,
      logo_url:         branding.tenants.logo_url,
      tagline:          branding.tagline,
      brand_color:      branding.brand_color,
      font_family:      branding.font_family,
      services_enabled: branding.services_enabled,
      apk_download_url: branding.apk_download_url,
    };

    return res.status(200).type('html').send(renderShowcase(tenant));
  } catch (err) {
    console.error('[Showcase]', err.message);
    return res.status(500).type('html').send(notFoundPage);
  }
};

module.exports = showcaseHandler;
