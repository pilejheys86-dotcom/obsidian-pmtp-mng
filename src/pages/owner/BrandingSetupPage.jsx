import { useState, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Sidebar, Header } from '../../components/layout';
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

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const STEP_LABELS = ['Identity', 'Branding', 'Services'];

const BrandingSetupPage = () => {
  const { profile } = useAuth();
  const currentUser  = buildSidebarUser(profile);
  const navigation   = getNavigationByRole(profile?.role);
  const [step, setStep]         = useState(0);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [fontCategory, setFontCategory] = useState('Serif');

  const [identity, setIdentity] = useState({
    business_name: '',
    logo_url: '',
  });
  const [branding, setBranding] = useState({ brand_color: '#A3E635', font_family: 'Playfair Display' });
  const [hexInput,  setHexInput]  = useState('#A3E635');
  const [services,  setServices]  = useState(['gold_jewelry', 'electronics', 'watches']);

  // Preload identity from existing profile
  useEffect(() => {
    brandingApi.get().then(data => {
      if (data?.tenants?.business_name) setIdentity(prev => ({ ...prev, business_name: data.tenants.business_name }));
      if (data?.tenants?.logo_url)      setIdentity(prev => ({ ...prev, logo_url: data.tenants.logo_url }));
      if (data?.brand_color)   { setBranding(prev => ({ ...prev, brand_color: data.brand_color })); setHexInput(data.brand_color); }
      if (data?.font_family)   setBranding(prev => ({ ...prev, font_family: data.font_family }));
      if (data?.services_enabled?.length) setServices(data.services_enabled);
    }).catch(() => {});

    // Load all fonts for the picker
    if (!document.getElementById('wizard-fonts')) {
      const link = document.createElement('link');
      link.id = 'wizard-fonts'; link.rel = 'stylesheet'; link.href = GOOGLE_FONTS_LOAD_URL;
      document.head.appendChild(link);
    }
  }, []);

  const navigate = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

  const handleSkip = () => navigate('/admin');

  const handleColorChange = (color) => {
    setBranding(prev => ({ ...prev, brand_color: color }));
    setHexInput(color);
  };

  const handleHexInput = (e) => {
    const val = e.target.value;
    setHexInput(val);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val)) {
      setBranding(prev => ({ ...prev, brand_color: val }));
    }
  };

  const toggleService = (slug) => {
    setServices(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  };

  const saveStep = async () => {
    setSaving(true); setError(null);
    try {
      if (step === 0) {
        await brandingApi.update({ business_name: identity.business_name, logo_url: identity.logo_url });
      } else if (step === 1) {
        await brandingApi.update({ brand_color: branding.brand_color, font_family: branding.font_family });
      } else {
        if (services.length === 0) { setError('Select at least one service.'); setSaving(false); return; }
        await brandingApi.update({ services_enabled: services });
        navigate('/admin/branding');
        return;
      }
      setStep(s => s + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/branding/setup" onNavigate={() => {}} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="flex flex-col sm:flex-row rounded-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden sm:min-h-[480px]">

              {/* Left panel */}
              <div className="sm:w-48 bg-neutral-50 dark:bg-neutral-800/50 border-b sm:border-b-0 sm:border-r border-neutral-200 dark:border-neutral-700 p-4 sm:p-5 flex sm:flex-col flex-shrink-0">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-3 sm:mb-4">Setup Steps</p>
                <div className="flex sm:flex-col gap-1 overflow-x-auto">
                  {STEP_LABELS.map((label, i) => (
                    <div key={label} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-semibold
                      ${i < step  ? 'text-primary' : ''}
                      ${i === step ? 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white' : ''}
                      ${i > step  ? 'text-neutral-400 dark:text-neutral-600' : ''}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                        ${i < step  ? 'bg-primary text-neutral-900' : ''}
                        ${i === step ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900' : ''}
                        ${i > step  ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400' : ''}`}>
                        {i < step ? '✓' : i + 1}
                      </div>
                      {label}
                    </div>
                  ))}
                </div>
                <div className="sm:mt-auto sm:pt-6 ml-auto sm:ml-0">
                  <button onClick={handleSkip} className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 underline whitespace-nowrap">
                    Set up later →
                  </button>
                </div>
              </div>

              {/* Right panel */}
              <div className="flex-1 p-4 sm:p-7">
                {/* Step 0: Identity */}
                {step === 0 && (
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-1">Identify your business</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Your business name and logo shown on your public page.</p>
                    <div className="space-y-5">
                      <div>
                        <label className="form-label">Business Name</label>
                        <input className="profile-input" value={identity.business_name}
                          onChange={e => setIdentity(p => ({ ...p, business_name: e.target.value }))}
                          placeholder="Goldsmith Pawnshop" />
                      </div>
                      <div>
                        <label className="form-label">Logo URL <span className="text-neutral-400 font-normal">(optional)</span></label>
                        <input className="profile-input" value={identity.logo_url}
                          onChange={e => setIdentity(p => ({ ...p, logo_url: e.target.value }))}
                          placeholder="https://i.imgur.com/your-logo.png" />
                        <p className="text-xs text-neutral-400 mt-1.5">Must be a square image (1:1 ratio). PNG or JPG.</p>
                        {identity.logo_url && (
                          <img src={identity.logo_url} alt="Logo preview"
                            className="mt-2 w-16 h-16 rounded-sm object-cover border border-neutral-200 dark:border-neutral-700"
                            onError={e => { e.target.style.display = 'none'; }} />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 1: Branding */}
                {step === 1 && (
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-1">Brand your page</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Pick a color and a font for your public page.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label className="form-label">Brand Color</label>
                        <HexColorPicker color={branding.brand_color} onChange={handleColorChange} style={{ width: '100%', height: '160px' }} />
                        <div className="flex items-center gap-2 mt-3">
                          <div className="w-8 h-8 rounded-sm border border-neutral-200 dark:border-neutral-700 flex-shrink-0" style={{ background: branding.brand_color }} />
                          <input className="profile-input font-mono text-sm" value={hexInput} onChange={handleHexInput} maxLength={7} placeholder="#A3E635" />
                        </div>
                      </div>
                      <div>
                        <label className="form-label">Business Name Font</label>
                        <div className="flex gap-1.5 mb-3">
                          {Object.keys(FONTS).map(cat => (
                            <button key={cat} onClick={() => setFontCategory(cat)}
                              className={`text-xs px-3 py-1.5 rounded-sm font-semibold border transition-colors ${fontCategory === cat ? 'bg-primary text-neutral-900 border-primary' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400'}`}>
                              {cat}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {FONTS[fontCategory].map(font => (
                            <button key={font} onClick={() => setBranding(p => ({ ...p, font_family: font }))}
                              className={`p-2.5 rounded-sm border text-center transition-colors ${branding.font_family === font ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'}`}>
                              <div className="text-base text-neutral-900 dark:text-white" style={{ fontFamily: `'${font}', serif` }}>Aa</div>
                              <div className="text-xs text-neutral-400 mt-1 truncate">{font}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Services */}
                {step === 2 && (
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-1">Select your services</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Choose what your shop accepts. At least one required.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {PAWNSHOP_SERVICES.map(s => {
                        const on = services.includes(s.slug);
                        return (
                          <button key={s.slug} onClick={() => toggleService(s.slug)}
                            className={`flex items-center gap-3 p-3 rounded-sm border text-left transition-colors ${on ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'}`}>
                            <div className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 ${on ? 'bg-primary text-neutral-900' : 'border border-neutral-300 dark:border-neutral-600'}`}>
                              {on && '✓'}
                            </div>
                            <span className="material-symbols-outlined text-lg text-neutral-500 dark:text-neutral-400">{s.icon}</span>
                            <span className={`text-sm font-semibold ${on ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

                <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                  {step > 0
                    ? <button onClick={() => setStep(s => s - 1)} className="btn-secondary text-sm">← Back</button>
                    : <div />
                  }
                  <button onClick={saveStep} disabled={saving} className="btn-primary text-sm">
                    {saving ? 'Saving...' : step === 2 ? 'Finish Setup' : 'Next →'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BrandingSetupPage;
