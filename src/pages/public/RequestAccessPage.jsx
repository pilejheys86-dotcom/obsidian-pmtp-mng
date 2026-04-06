import { useState, useEffect } from 'react';
import AddCustomer from '../owner/AddCustomer';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_ORIGIN = API_BASE.replace(/\/api$/, '');

const ObsidianIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333.33 1333.33" fill="currentColor" className={className}>
    <rect y="333.17" width="333.17" height="1000"/>
    <rect x="666.67" y="666.67" width="332.49" height="666.5"/>
    <rect x="666.42" y="1000.58" width="333.17" height="999" transform="translate(-1000.42 1999.75) rotate(-90)"/>
    <rect x="500.5" y="500.5" width="333.5" height="665.51" transform="translate(-499.33 1167.17) rotate(-90)"/>
    <rect x="1000" width="333.33" height="333.33"/>
  </svg>
);

export default function RequestAccessPage({ tenantId }) {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const brandColor = tenant?.brand_color || '#A3E635';
  const showcaseUrl = tenant?.subdomain ? `${SERVER_ORIGIN}/s/${tenant.subdomain}` : null;

  useEffect(() => {
    if (!tenantId) { setError('Invalid link.'); setLoading(false); return; }
    fetch(`${API_BASE}/access-requests/tenant/${tenantId}`)
      .then(r => { if (!r.ok) throw new Error('Tenant not found'); return r.json(); })
      .then(setTenant)
      .catch(() => setError('This page is no longer available.'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  // Inject brand color as CSS variable on the root element
  useEffect(() => {
    if (brandColor) {
      document.documentElement.style.setProperty('--brand', brandColor);
      document.documentElement.style.setProperty('--brand-dim', `color-mix(in srgb, ${brandColor} 12%, transparent)`);
    }
    return () => {
      document.documentElement.style.removeProperty('--brand');
      document.documentElement.style.removeProperty('--brand-dim');
    };
  }, [brandColor]);

  const handleSave = async (payload) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/access-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          full_name: `${payload.personalInfo.firstName} ${payload.personalInfo.lastName}`.trim(),
          email: payload.personalInfo.email,
          mobile_number: payload.personalInfo.mobileNumber || null,
          request_data: payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const BackLink = () => showcaseUrl ? (
    <a href={showcaseUrl} className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors">
      <span className="material-symbols-outlined text-sm">arrow_back</span>
      Back to home
    </a>
  ) : null;

  const PoweredBy = () => (
    <div className="flex items-center justify-center gap-1 text-[11px] text-neutral-500 py-6">
      Powered by
      <a
        href="https://obsidian-platform.tech"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1 font-bold text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        <ObsidianIcon className="w-3.5 h-3.5" />
        Obsidian
      </a>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <span className="material-symbols-outlined animate-spin text-3xl" style={{ color: brandColor }}>progress_activity</span>
      </div>
    );
  }

  if (error && !tenant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] px-4">
        <div className="max-w-sm w-full bg-[#111] rounded-2xl border border-[#1a1a1a] shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-red-500 text-2xl">error</span>
          </div>
          <h1 className="text-lg font-display font-bold text-white mb-2">Page Not Found</h1>
          <p className="text-sm text-neutral-500">{error}</p>
        </div>
        <PoweredBy />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] px-4">
        <div className="max-w-md w-full bg-[#111] rounded-2xl border border-[#1a1a1a] shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: `color-mix(in srgb, ${brandColor} 12%, transparent)` }}>
            <span className="material-symbols-outlined text-3xl" style={{ color: brandColor }}>check_circle</span>
          </div>
          <h1 className="text-xl font-display font-bold text-white mb-2">Request Submitted</h1>
          <p className="text-sm text-neutral-500 leading-relaxed">
            Your access request has been sent to <strong className="text-neutral-200">{tenant.business_name}</strong>. Their staff will review your information and you'll receive an email once approved.
          </p>
          {showcaseUrl && (
            <a
              href={showcaseUrl}
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: brandColor, color: '#0a0a0a' }}
            >
              <span className="material-symbols-outlined text-base">home</span>
              Back to Home
            </a>
          )}
        </div>
        <PoweredBy />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0a0a0a]/85 backdrop-blur-xl border-b border-[#1a1a1a]">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{ background: brandColor, color: '#0a0a0a' }}
              >
                {tenant.business_name?.[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-sm font-bold text-white">{tenant.business_name}</span>
          </div>
          <BackLink />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white mb-2">Request Account Access</h1>
          <p className="text-sm text-neutral-500">
            Fill in your details below. Once approved by {tenant.business_name}, you'll receive login credentials via email.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-900/20 rounded-lg border border-red-800">
            <p className="text-sm text-red-400 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>{error}
            </p>
          </div>
        )}

        <style>{`
          /* Override form theme to match showcase dark style with brand color */
          .brand-form .card { background: #111 !important; border-color: #1a1a1a !important; border-radius: 12px !important; }
          .brand-form .card:hover { border-color: color-mix(in srgb, var(--brand) 25%, transparent) !important; }
          .brand-form input, .brand-form select, .brand-form textarea {
            background: #0a0a0a !important; border-color: #1f1f1f !important; color: #fff !important; border-radius: 8px !important;
          }
          .brand-form input:focus, .brand-form select:focus, .brand-form textarea:focus {
            border-color: var(--brand) !important; box-shadow: 0 0 0 3px var(--brand-dim) !important;
          }
          .brand-form input::placeholder, .brand-form select::placeholder, .brand-form textarea::placeholder { color: #333 !important; }
          .brand-form label { color: #888 !important; }
          .brand-form h3, .brand-form .font-display { color: #e5e5e5 !important; }
          .brand-form p { color: #555 !important; }
          .brand-form .btn-primary, .brand-form button[type="submit"] {
            background: var(--brand) !important; color: #0a0a0a !important; border-radius: 8px !important; font-weight: 700 !important;
          }
          .brand-form .btn-primary:hover, .brand-form button[type="submit"]:hover { opacity: .9 !important; }
          .brand-form .text-neutral-900 { color: #e5e5e5 !important; }
          .brand-form .text-neutral-700, .brand-form .text-neutral-600, .brand-form .text-neutral-500 { color: #777 !important; }
          .brand-form .bg-white, .brand-form .bg-stone-100, .brand-form .dark\\:bg-neutral-800 { background: #111 !important; }
          .brand-form .border-neutral-200, .brand-form .dark\\:border-neutral-700 { border-color: #1a1a1a !important; }
          .brand-form .bg-lime-500, .brand-form .bg-\\[\\#A3E635\\] { background: var(--brand) !important; }
          .brand-form .text-lime-500, .brand-form .text-\\[\\#A3E635\\] { color: var(--brand) !important; }
          .brand-form .material-symbols-outlined { color: inherit; }
          .brand-form .bg-neutral-100, .brand-form .dark\\:bg-neutral-900 { background: transparent !important; }
        `}</style>

        <div className="brand-form">
          <AddCustomer
            onCancel={() => showcaseUrl ? window.location.href = showcaseUrl : window.history.back()}
            onSave={handleSave}
            publicMode
            submitting={submitting}
          />
        </div>
      </div>

      {/* Footer */}
      <PoweredBy />
    </div>
  );
}
