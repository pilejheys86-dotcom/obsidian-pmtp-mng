import { useState, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Sidebar, Header, SettingsNav } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { brandingApi } from '../../lib/api';

const PAWNSHOP_SERVICES = [
  { slug: 'gold_jewelry',        label: 'Gold & Jewelry',       icon: 'diamond' },
  { slug: 'electronics',         label: 'Electronics',          icon: 'smartphone' },
  { slug: 'watches',             label: 'Watches',              icon: 'watch' },
  { slug: 'bags_apparel',        label: 'Bags & Apparel',       icon: 'shopping_bag' },
  { slug: 'power_tools',         label: 'Power Tools',          icon: 'construction' },
  { slug: 'musical_instruments', label: 'Musical Instruments',  icon: 'music_note' },
  { slug: 'title_loans',         label: 'Title Loans',          icon: 'article' },
];

const FONTS = {
  Serif:   ['Playfair Display', 'Lora', 'Merriweather', 'EB Garamond'],
  Sans:    ['Inter', 'Outfit', 'Nunito', 'Raleway'],
  Display: ['Oswald', 'Bebas Neue', 'Righteous', 'Staatliches'],
};

const GOOGLE_FONTS_LOAD_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lora:wght@700&family=Merriweather:wght@700&family=EB+Garamond:wght@700&family=Inter:wght@700&family=Outfit:wght@700&family=Nunito:wght@700&family=Raleway:wght@700&family=Oswald:wght@700&family=Bebas+Neue&family=Righteous&family=Staatliches&display=swap';

const SHOWCASE_BASE = import.meta.env.VITE_SHOWCASE_URL
  || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api$/, '') : '')
  || (typeof window !== 'undefined' ? window.location.origin : '');

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const NAV_TABS = [
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'services',   label: 'Services',   icon: 'category' },
  { id: 'publish',    label: 'Publish',     icon: 'public' },
];

const BrandingPage = () => {
  const { profile } = useAuth();
  const currentUser = buildSidebarUser(profile);
  const navigation  = getNavigationByRole(profile?.role);

  const [activeTab, setActiveTab] = useState('appearance');
  const [loading, setLoading]     = useState(true);
  const [saving,  setSaving]      = useState(false);
  const [message, setMessage]     = useState(null);
  const [fontCategory, setFontCategory] = useState('Serif');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [subdomainStatus, setSubdomainStatus] = useState(null);
  const [subdomainChecking, setSubdomainChecking] = useState(false);

  const [form, setForm] = useState({
    business_name: '', logo_url: '',
    brand_color: '#A3E635', font_family: 'Playfair Display',
    services_enabled: ['gold_jewelry', 'electronics', 'watches'],
    subdomain: '', tagline: '', is_published: false,
  });
  const [hexInput, setHexInput] = useState('#A3E635');

  useEffect(() => {
    brandingApi.get().then(data => {
      if (data) {
        setForm(prev => ({
          ...prev,
          business_name:    data.tenants?.business_name || '',
          logo_url:         data.tenants?.logo_url      || '',
          brand_color:      data.brand_color    || '#A3E635',
          font_family:      data.font_family    || 'Playfair Display',
          services_enabled: data.services_enabled?.length ? data.services_enabled : prev.services_enabled,
          subdomain:        data.subdomain      || '',
          tagline:          data.tagline        || '',
          is_published:     data.is_published   || false,
        }));
        setHexInput(data.brand_color || '#A3E635');
      }
    }).catch(() => {}).finally(() => setLoading(false));

    if (!document.getElementById('branding-fonts')) {
      const link = document.createElement('link');
      link.id = 'branding-fonts'; link.rel = 'stylesheet'; link.href = GOOGLE_FONTS_LOAD_URL;
      document.head.appendChild(link);
    }
  }, []);

  // Subdomain availability check
  useEffect(() => {
    if (!form.subdomain || form.subdomain.length < 3) { setSubdomainStatus(null); return; }
    setSubdomainChecking(true);
    const timer = setTimeout(() => {
      brandingApi.checkSubdomain(form.subdomain)
        .then(setSubdomainStatus)
        .catch(() => setSubdomainStatus(null))
        .finally(() => setSubdomainChecking(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [form.subdomain]);

  const set = (key) => (val) => setForm(prev => ({ ...prev, [key]: val }));
  const setFromEvent = (key) => (e) => set(key)(e.target.type === 'checkbox' ? e.target.checked : e.target.value);

  const handleColorChange = (color) => { set('brand_color')(color); setHexInput(color); };
  const handleHexInput = (e) => {
    setHexInput(e.target.value);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(e.target.value)) set('brand_color')(e.target.value);
  };
  const toggleService = (slug) => {
    set('services_enabled')(form.services_enabled.includes(slug)
      ? form.services_enabled.filter(s => s !== slug)
      : [...form.services_enabled, slug]);
  };

  const handleSave = async () => {
    setSaving(true); setMessage(null);
    const payload = {};
    if (activeTab === 'appearance') {
      Object.assign(payload, { business_name: form.business_name, logo_url: form.logo_url, brand_color: form.brand_color, font_family: form.font_family });
    } else if (activeTab === 'services') {
      if (form.services_enabled.length === 0) { setMessage({ type: 'error', text: 'Select at least one service.' }); setSaving(false); return; }
      Object.assign(payload, { services_enabled: form.services_enabled });
    } else {
      Object.assign(payload, { subdomain: form.subdomain, tagline: form.tagline, is_published: form.is_published });
    }
    try {
      await brandingApi.update(payload);
      setMessage({ type: 'success', text: 'Saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = `${SHOWCASE_BASE}/s/${form.subdomain}`;

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/branding" onNavigate={() => {}} />

      {/* Secondary nav — sits between sidebar and content */}
      <SettingsNav
        items={NAV_TABS}
        activeId={activeTab}
        onSelect={(id) => { setActiveTab(id); setMessage(null); }}
        title="Branding"
      />

      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="max-w-2xl mx-auto md:px-8 md:py-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
              </div>
            ) : (
              <div className="space-y-6">
                  <div className="profile-section">

                    {/* Appearance */}
                    {activeTab === 'appearance' && (
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">Appearance</h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8">Logo, brand color, and font for your public page.</p>

                        <div className="space-y-8">
                          {/* Business Name */}
                          <div>
                            <label className="form-label">Business Name</label>
                            <input className="profile-input" value={form.business_name} onChange={setFromEvent('business_name')} placeholder="Your business name" />
                          </div>

                          <hr className="border-neutral-100 dark:border-neutral-800" />

                          {/* Logo */}
                          <div>
                            <label className="form-label">Logo <span className="text-neutral-400 font-normal">(optional)</span></label>
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 flex-shrink-0 text-base font-bold text-neutral-400">
                                {form.logo_url ? <img src={form.logo_url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} /> : form.business_name?.[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1">
                                <input className="profile-input" value={form.logo_url} onChange={setFromEvent('logo_url')} placeholder="https://example.com/logo.png" />
                                <p className="text-xs text-neutral-400 mt-1.5">Square image, 1:1 ratio. Shown in your page navbar.</p>
                              </div>
                            </div>
                          </div>

                          <hr className="border-neutral-100 dark:border-neutral-800" />

                          {/* Brand Color */}
                          <div>
                            <label className="form-label">Brand Color</label>
                            <div className="flex items-center gap-3">
                              <button onClick={() => setShowColorPicker(p => !p)}
                                className="w-10 h-10 rounded-lg border border-neutral-200 dark:border-neutral-700 flex-shrink-0 cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/30"
                                style={{ background: form.brand_color }}
                                aria-label="Open color picker" />
                              <input className="profile-input font-mono text-sm w-28" value={hexInput} onChange={handleHexInput} maxLength={7} placeholder="#A3E635" />
                            </div>
                            {showColorPicker && (
                              <div className="mt-3">
                                <HexColorPicker color={form.brand_color} onChange={handleColorChange} style={{ width: '100%', maxWidth: '240px' }} />
                              </div>
                            )}
                          </div>

                          <hr className="border-neutral-100 dark:border-neutral-800" />

                          {/* Font */}
                          <div>
                            <label className="form-label">Business Name Font</label>
                            <div className="flex gap-1.5 mb-3">
                              {Object.keys(FONTS).map(cat => (
                                <button key={cat} onClick={() => setFontCategory(cat)}
                                  className={`text-xs px-3 py-1.5 rounded-md font-semibold border transition-colors cursor-pointer ${fontCategory === cat ? 'bg-primary text-neutral-900 border-primary' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400'}`}>
                                  {cat}
                                </button>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {FONTS[fontCategory].map(font => (
                                <button key={font} onClick={() => set('font_family')(font)}
                                  className={`p-3 rounded-lg border text-center transition-colors cursor-pointer ${form.font_family === font ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'}`}>
                                  <div className="text-lg text-neutral-900 dark:text-white" style={{ fontFamily: `'${font}', serif` }}>Aa</div>
                                  <div className="text-[11px] text-neutral-400 mt-1 truncate">{font}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Services */}
                    {activeTab === 'services' && (
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">Services</h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Choose which services appear on your public page.</p>
                        <div className="grid grid-cols-2 gap-2">
                          {PAWNSHOP_SERVICES.map(s => {
                            const on = form.services_enabled.includes(s.slug);
                            return (
                              <button key={s.slug} onClick={() => toggleService(s.slug)}
                                className={`flex items-center gap-3 p-3 rounded-sm border text-left transition-colors ${on ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'}`}>
                                <div className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 ${on ? 'bg-primary text-neutral-900' : 'border border-neutral-300 dark:border-neutral-600'}`}>
                                  {on && '✓'}
                                </div>
                                <span className="material-symbols-outlined text-lg text-neutral-500">{s.icon}</span>
                                <span className={`text-sm font-semibold ${on ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>{s.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Publish */}
                    {activeTab === 'publish' && (
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">Publish</h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Configure your public page URL and go live.</p>
                        <div className="space-y-5">
                          <div>
                            <label className="form-label">Page Slug (URL path)</label>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-neutral-500 whitespace-nowrap">{SHOWCASE_BASE}/s/</span>
                              <input className="profile-input flex-1" value={form.subdomain} onChange={setFromEvent('subdomain')} placeholder="your-business" maxLength={63} />
                            </div>
                            {subdomainChecking && <p className="text-xs text-neutral-400 mt-1">Checking availability...</p>}
                            {subdomainStatus && !subdomainChecking && (
                              <p className={`text-xs mt-1 ${subdomainStatus.available ? 'text-emerald-600' : 'text-red-500'}`}>
                                {subdomainStatus.available ? 'Available!' : subdomainStatus.reason || 'Taken'}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="form-label">Tagline <span className="text-neutral-400 font-normal">(optional)</span></label>
                            <input className="profile-input" value={form.tagline} onChange={setFromEvent('tagline')} maxLength={255} placeholder="Your trusted pawnshop since 1995" />
                            <p className="text-xs text-neutral-400 mt-1">{form.tagline.length}/255</p>
                          </div>
                          <div className="profile-toggle-item">
                            <div className="flex items-center gap-3">
                              <div className="profile-toggle-icon">
                                <span className="material-symbols-outlined text-xl">public</span>
                              </div>
                              <div>
                                <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Publish Page</p>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">Make your page publicly accessible</p>
                              </div>
                            </div>
                            <label className="toggle-switch">
                              <input type="checkbox" checked={form.is_published} onChange={setFromEvent('is_published')} className="toggle-checkbox" />
                              <span className="toggle-slider"></span>
                            </label>
                          </div>
                          {form.subdomain && form.is_published && (
                            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-sm border border-emerald-200 dark:border-emerald-800">
                              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                                Live at{' '}
                                <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">{publicUrl}</a>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {message && (
                      <p className={`text-sm mt-4 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>{message.text}</p>
                    )}

                  <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                    {form.subdomain ? (
                      <a href={`/s/${form.subdomain}`} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center gap-1">
                        <span className="material-symbols-outlined text-base">open_in_new</span>
                        Preview Page
                      </a>
                    ) : <div />}
                    <button className="btn-primary text-sm" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default BrandingPage;
