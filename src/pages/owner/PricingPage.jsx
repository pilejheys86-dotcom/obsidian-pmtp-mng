// src/pages/owner/PricingPage.jsx
import { useState, useEffect } from 'react';
import { Sidebar, Header, SettingsNav } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { pricingApi, loanSettingsApi } from '../../lib/api';

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

// Format rate for display — returns "–" for null/undefined, formatted peso amount otherwise
function fmtRate(val) {
  if (val == null) return '–';
  return `₱ ${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

// Opens a new window with a styled, print-friendly table and triggers browser print
function exportHistoryPdf(title, rows, headers, rowMapper, businessName) {
  const now = new Date().toLocaleString();
  const html = `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>
  @page { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; padding: 40px; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .header-left h1 { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .header-left p { font-size: 11px; color: #666; margin-top: 2px; }
  .header-right { text-align: right; }
  .header-right .biz { font-size: 14px; font-weight: 700; color: #1a1a1a; }
  .header-right .date { font-size: 10px; color: #888; margin-top: 2px; }
  .summary { display: flex; gap: 24px; margin-bottom: 20px; }
  .summary-card { background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px 16px; flex: 1; }
  .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: 600; }
  .summary-card .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
  thead th { background: #1a1a1a; color: #fff; text-align: left; padding: 10px 14px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th:first-child { border-radius: 6px 0 0 0; }
  thead th:last-child { border-radius: 0 6px 0 0; }
  tbody td { padding: 9px 14px; border-bottom: 1px solid #eee; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .text-right { text-align: right; }
  .text-bold { font-weight: 700; }
  .footer { text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #e5e5e5; padding-top: 12px; }
</style></head><body>
<div class="header">
  <div class="header-left">
    <h1>${title}</h1>
    <p>Rate change audit trail</p>
  </div>
  <div class="header-right">
    <div class="biz">${businessName || 'Obsidian'}</div>
    <div class="date">Generated: ${now}</div>
  </div>
</div>
<div class="summary">
  <div class="summary-card"><div class="label">Total Entries</div><div class="value">${rows.length}</div></div>
  <div class="summary-card"><div class="label">Report Type</div><div class="value">${title.includes('Gold') ? 'Gold Rates' : 'Silver Rates'}</div></div>
  <div class="summary-card"><div class="label">Generated</div><div class="value">${new Date().toLocaleDateString()}</div></div>
</div>
<table><thead><tr>${headers.map((h, i) => `<th class="${i >= 2 && i <= 3 ? 'text-right' : ''}">${h}</th>`).join('')}</tr></thead>
<tbody>${rows.length === 0 ? `<tr><td colspan="${headers.length}" style="text-align:center;padding:24px;color:#999">No data available</td></tr>` :
  rows.map(r => {
    const cells = rowMapper(r);
    return `<tr>${cells.map((c, i) => `<td class="${i >= 2 && i <= 3 ? 'text-right' : ''} ${i === 3 ? 'text-bold' : ''}">${c}</td>`).join('')}</tr>`;
  }).join('')}
</tbody></table>
<div class="footer">${businessName || 'Obsidian'} &mdash; Pawnshop Management System &mdash; Confidential</div>
</body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.print(); };
}

const PRICING_SECTIONS = [
  { id: 'gold',       icon: 'workspace_premium', label: 'Gold Prices' },
  { id: 'silver',     icon: 'water_drop',        label: 'Silver Prices' },
  { id: 'conditions', icon: 'inventory',          label: 'Item Conditions' },
  { id: 'terms',      icon: 'gavel',             label: 'Pawning Terms' },
];


// ── Live Rates Modal ───────────────────────────────────────────────────────────
const LiveRatesModal = ({ url, title, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-2xl w-full max-w-4xl mx-4 flex flex-col" style={{ height: '80vh' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-neutral-700">
        <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{title}</span>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <iframe
        src={url}
        title={title}
        className="flex-1 w-full rounded-b-lg"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  </div>
);

// ── Gold Panel ─────────────────────────────────────────────────────────────────
const GOLD_KARATS = [
  { karat: '24K', purity: '99.9%', name: 'Fine Gold' },
  { karat: '22K', purity: '91.7%', name: 'Standard Gold' },
  { karat: '21K', purity: '87.5%', name: '–' },
  { karat: '18K', purity: '75.0%', name: 'Gold Jewelry' },
  { karat: '14K', purity: '58.3%', name: 'Common Jewelry' },
  { karat: '10K', purity: '41.7%', name: 'Low Karat' },
];

const GoldPanel = () => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'OWNER';
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    pricingApi.getGoldRates().then(data => {
      const map = {};
      (data || []).forEach(r => { map[r.karat] = r.rate_per_gram; });
      setRates(map);
      if (data?.length) setLastUpdated(data[0].updated_at);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const HISTORY_LIMIT = 5;

  useEffect(() => {
    if (!isOwner) return;
    setHistoryLoading(true);
    pricingApi.getGoldHistory({ page: historyPage, limit: HISTORY_LIMIT })
      .then(res => { setHistory(res.data || []); setHistoryTotal(res.total || 0); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [isOwner, historyPage]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = GOLD_KARATS.map(k => ({ karat: k.karat, rate_per_gram: parseFloat(rates[k.karat]) || 0 }));
      await pricingApi.updateGoldRates(payload);
      setMessage({ type: 'success', text: 'Gold rates saved successfully.' });
      setLastUpdated(new Date().toISOString());
      if (isOwner) {
        pricingApi.getGoldHistory({ page: 1, limit: HISTORY_LIMIT })
          .then(res => { setHistory(res.data || []); setHistoryTotal(res.total || 0); setHistoryPage(1); });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="profile-section flex items-center justify-center py-16">
      <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
    </div>
  );

  return (
    <div className="profile-section">
      {showModal && <LiveRatesModal url="https://goldpricez.com/ph/gram" title="Live Gold Prices (PHP)" onClose={() => setShowModal(false)} />}
      <div className="profile-section-header">
        <div className="profile-section-icon">
          <span className="material-symbols-outlined">workspace_premium</span>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Gold Price Manager</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Set your buying/appraising rate per gram for each karat purity</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-outline flex items-center gap-2 text-xs">
          <span className="material-symbols-outlined text-base">wifi</span>
          Live Rates
        </button>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 mb-4">
        <table className="w-full min-w-[480px] text-sm border-collapse">
          <thead>
            <tr className="bg-neutral-100 dark:bg-neutral-800">
              <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Karat</th>
              <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Purity</th>
              <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700 hidden sm:table-cell">Common Name</th>
              <th className="px-3 sm:px-4 py-2.5 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Rate per Gram (₱)</th>
            </tr>
          </thead>
          <tbody>
            {GOLD_KARATS.map((k, i) => (
              <tr key={k.karat} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
                <td className="px-3 sm:px-4 py-2.5 font-bold text-primary whitespace-nowrap">{k.karat}</td>
                <td className="px-3 sm:px-4 py-2.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{k.purity}</td>
                <td className="px-3 sm:px-4 py-2.5 text-neutral-700 dark:text-neutral-300 hidden sm:table-cell">{k.name}</td>
                <td className="px-3 sm:px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs text-neutral-400">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rates[k.karat] || ''}
                      onChange={e => setRates(prev => ({ ...prev, [k.karat]: e.target.value }))}
                      className="profile-input w-24 sm:w-28 text-right text-sm font-semibold"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6">
        <button onClick={handleSave} disabled={saving} className="btn-primary whitespace-nowrap">
          {saving ? 'Saving...' : 'Save Gold Rates'}
        </button>
        {lastUpdated && (
          <span className="text-xs text-neutral-400">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </span>
        )}
      </div>
      {message && (
        <p className={`text-sm mb-4 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}

      {isOwner && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Price History</p>
              <span className="text-xs bg-neutral-900 text-primary px-2 py-0.5 rounded-sm font-semibold">OWNER ONLY</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportHistoryPdf('Gold Price History', history, ['Date & Time', 'Karat', 'Old Rate', 'New Rate', 'Updated By'], h => [
                  new Date(h.changed_at).toLocaleString(),
                  h.karat,
                  fmtRate(h.old_rate),
                  fmtRate(h.new_rate),
                  h.changed_by_user?.full_name || '–',
                ], profile?.tenants?.business_name)}
                className="btn-outline flex items-center gap-2 text-xs"
              >
                <span className="material-symbols-outlined text-base">download</span>
                Export PDF
              </button>
              <a href="/admin/pricing/history?type=gold" className="btn-outline flex items-center gap-2 text-xs">
                <span className="material-symbols-outlined text-base">open_in_new</span>
                View Full History
              </a>
            </div>
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-6">
              <span className="material-symbols-outlined animate-spin text-neutral-400">progress_activity</span>
            </div>
          ) : (
            <>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-100 dark:bg-neutral-800">
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Date & Time</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Karat</th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Old Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">New Rate</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Updated By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-neutral-400">No history yet.</td></tr>
                  )}
                  {history.map((h, i) => (
                    <tr key={h.id} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
                      <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">{new Date(h.changed_at).toLocaleString()}</td>
                      <td className="px-3 py-2 font-bold text-primary">{h.karat}</td>
                      <td className="px-3 py-2 text-right text-neutral-400">{fmtRate(h.old_rate)}</td>
                      <td className="px-3 py-2 text-right font-bold text-neutral-800 dark:text-neutral-100">{fmtRate(h.new_rate)}</td>
                      <td className="px-3 py-2 text-neutral-500">{h.changed_by_user?.full_name || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {historyTotal > HISTORY_LIMIT && (
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-neutral-400">{historyTotal} total entries</span>
                  <div className="flex items-center gap-2">
                    <button disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)} className="btn-outline text-xs px-3 py-1.5">Prev</button>
                    <span className="text-xs text-neutral-400">Page {historyPage} of {Math.ceil(historyTotal / HISTORY_LIMIT)}</span>
                    <button disabled={historyPage * HISTORY_LIMIT >= historyTotal} onClick={() => setHistoryPage(p => p + 1)} className="btn-outline text-xs px-3 py-1.5">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── Silver Panel ───────────────────────────────────────────────────────────────
const SILVER_PURITIES = [
  { mark: '999', purity: '99.9%', name: 'Fine Silver' },
  { mark: '958', purity: '95.8%', name: 'Britannia Silver' },
  { mark: '925', purity: '92.5%', name: 'Sterling Silver' },
  { mark: '900', purity: '90.0%', name: 'Coin Silver' },
  { mark: '835', purity: '83.5%', name: 'Standard Silver' },
  { mark: '800', purity: '80.0%', name: 'Low Purity Silver' },
];

const SilverPanel = () => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'OWNER';
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    pricingApi.getSilverRates().then(data => {
      const map = {};
      (data || []).forEach(r => { map[r.purity_mark] = r.rate_per_gram; });
      setRates(map);
      if (data?.length) setLastUpdated(data[0].updated_at);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const HISTORY_LIMIT = 5;

  useEffect(() => {
    if (!isOwner) return;
    setHistoryLoading(true);
    pricingApi.getSilverHistory({ page: historyPage, limit: HISTORY_LIMIT })
      .then(res => { setHistory(res.data || []); setHistoryTotal(res.total || 0); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [isOwner, historyPage]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = SILVER_PURITIES.map(s => ({ purity_mark: s.mark, rate_per_gram: parseFloat(rates[s.mark]) || 0 }));
      await pricingApi.updateSilverRates(payload);
      setMessage({ type: 'success', text: 'Silver rates saved successfully.' });
      setLastUpdated(new Date().toISOString());
      if (isOwner) {
        pricingApi.getSilverHistory({ page: 1, limit: HISTORY_LIMIT })
          .then(res => { setHistory(res.data || []); setHistoryTotal(res.total || 0); setHistoryPage(1); });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="profile-section flex items-center justify-center py-16">
      <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
    </div>
  );

  return (
    <div className="profile-section">
      {showModal && <LiveRatesModal url="https://goldpricez.com/silver-rates/philippines/gram" title="Live Silver Prices (PHP)" onClose={() => setShowModal(false)} />}
      <div className="profile-section-header">
        <div className="profile-section-icon">
          <span className="material-symbols-outlined">water_drop</span>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Silver Price Manager</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Set your buying/appraising rate per gram for each silver purity</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-outline flex items-center gap-2 text-xs">
          <span className="material-symbols-outlined text-base">wifi</span>
          Live Rates
        </button>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 mb-4">
        <table className="w-full min-w-[480px] text-sm border-collapse">
          <thead>
            <tr className="bg-neutral-100 dark:bg-neutral-800">
              <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Purity Mark</th>
              <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Purity %</th>
              <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700 hidden sm:table-cell">Common Name</th>
              <th className="px-3 sm:px-4 py-2.5 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">Rate per Gram (₱)</th>
            </tr>
          </thead>
          <tbody>
            {SILVER_PURITIES.map((s, i) => (
              <tr key={s.mark} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
                <td className="px-3 sm:px-4 py-2.5 font-bold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">{s.mark}</td>
                <td className="px-3 sm:px-4 py-2.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{s.purity}</td>
                <td className="px-3 sm:px-4 py-2.5 text-neutral-700 dark:text-neutral-300 hidden sm:table-cell">{s.name}</td>
                <td className="px-3 sm:px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs text-neutral-400">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rates[s.mark] || ''}
                      onChange={e => setRates(prev => ({ ...prev, [s.mark]: e.target.value }))}
                      className="profile-input w-24 sm:w-28 text-right text-sm font-semibold"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6">
        <button onClick={handleSave} disabled={saving} className="btn-primary whitespace-nowrap">
          {saving ? 'Saving...' : 'Save Silver Rates'}
        </button>
        {lastUpdated && (
          <span className="text-xs text-neutral-400">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </span>
        )}
      </div>
      {message && (
        <p className={`text-sm mb-4 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}

      {isOwner && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Price History</p>
              <span className="text-xs bg-neutral-900 text-primary px-2 py-0.5 rounded-sm font-semibold">OWNER ONLY</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportHistoryPdf('Silver Price History', history, ['Date & Time', 'Purity', 'Old Rate', 'New Rate', 'Updated By'], h => [
                  new Date(h.changed_at).toLocaleString(),
                  h.purity_mark,
                  fmtRate(h.old_rate),
                  fmtRate(h.new_rate),
                  h.changed_by_user?.full_name || '–',
                ], profile?.tenants?.business_name)}
                className="btn-outline flex items-center gap-2 text-xs"
              >
                <span className="material-symbols-outlined text-base">download</span>
                Export PDF
              </button>
              <a href="/admin/pricing/history?type=silver" className="btn-outline flex items-center gap-2 text-xs">
                <span className="material-symbols-outlined text-base">open_in_new</span>
                View Full History
              </a>
            </div>
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-6">
              <span className="material-symbols-outlined animate-spin text-neutral-400">progress_activity</span>
            </div>
          ) : (
            <>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-100 dark:bg-neutral-800">
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Date & Time</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Purity</th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Old Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">New Rate</th>
                    <th className="px-3 py-2 text-left font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Updated By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-neutral-400">No history yet.</td></tr>
                  )}
                  {history.map((h, i) => (
                    <tr key={h.id} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
                      <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">{new Date(h.changed_at).toLocaleString()}</td>
                      <td className="px-3 py-2 font-bold text-neutral-700 dark:text-neutral-200">{h.purity_mark}</td>
                      <td className="px-3 py-2 text-right text-neutral-400">{fmtRate(h.old_rate)}</td>
                      <td className="px-3 py-2 text-right font-bold text-neutral-800 dark:text-neutral-100">{fmtRate(h.new_rate)}</td>
                      <td className="px-3 py-2 text-neutral-500">{h.changed_by_user?.full_name || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {historyTotal > HISTORY_LIMIT && (
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-neutral-400">{historyTotal} total entries</span>
                  <div className="flex items-center gap-2">
                    <button disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)} className="btn-outline text-xs px-3 py-1.5">Prev</button>
                    <span className="text-xs text-neutral-400">Page {historyPage} of {Math.ceil(historyTotal / HISTORY_LIMIT)}</span>
                    <button disabled={historyPage * HISTORY_LIMIT >= historyTotal} onClick={() => setHistoryPage(p => p + 1)} className="btn-outline text-xs px-3 py-1.5">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── Item Conditions Panel ──────────────────────────────────────────────────────
const ConditionsPanel = () => {
  const [conditions, setConditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    pricingApi.getItemConditions()
      .then(data => setConditions(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (name) => {
    setConditions(prev => prev.map(c => c.condition_name === name ? { ...c, is_active: !c.is_active } : c));
  };

  const handleMultiplier = (name, value) => {
    setConditions(prev => prev.map(c => c.condition_name === name ? { ...c, multiplier_pct: value } : c));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await pricingApi.updateItemConditions(conditions.map(c => ({
        condition_name: c.condition_name,
        multiplier_pct: parseFloat(c.multiplier_pct) || 0,
        is_active: c.is_active,
      })));
      setMessage({ type: 'success', text: 'Item conditions saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="profile-section flex items-center justify-center py-16">
      <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
    </div>
  );

  return (
    <div className="profile-section">
      <div className="profile-section-header">
        <div className="profile-section-icon">
          <span className="material-symbols-outlined">inventory</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Item Conditions</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Each active condition applies a multiplier to the appraised value</p>
        </div>
      </div>

      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="bg-neutral-100 dark:bg-neutral-800">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Active</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Condition</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Description</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Multiplier (%)</th>
          </tr>
        </thead>
        <tbody>
          {conditions.map((c, i) => (
            <tr key={c.condition_name} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''} ${!c.is_active ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2.5">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={c.is_active}
                    onChange={() => handleToggle(c.condition_name)}
                    className="toggle-checkbox"
                  />
                  <span className="toggle-slider"></span>
                </label>
              </td>
              <td className="px-4 py-2.5 font-bold text-neutral-800 dark:text-neutral-100">{c.condition_name}</td>
              <td className="px-4 py-2.5 text-xs text-neutral-500 dark:text-neutral-400">{c.description}</td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!c.is_active}
                    value={c.multiplier_pct || ''}
                    onChange={e => handleMultiplier(c.condition_name, e.target.value)}
                    className="profile-input w-20 text-right text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs text-neutral-400">%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {message && (
        <p className={`text-sm mb-3 ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}
      <button onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : 'Save Conditions'}
      </button>
    </div>
  );
};

// ── Pawning Terms Panel ────────────────────────────────────────────────────────
const TermsPanel = () => {
  const [form, setForm] = useState({ penalty_interest_rate: '', service_charge: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loanSettingsApi.get()
      .then(data => {
        if (data) {
          setForm({
            penalty_interest_rate: data.penalty_interest_rate ?? '',
            service_charge: data.service_charge ?? '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const penaltyAmt = form.penalty_interest_rate
    ? (10000 * (parseFloat(form.penalty_interest_rate) / 100)).toFixed(2)
    : null;

  const feeAmt = form.service_charge !== '' ? Number(form.service_charge).toFixed(2) : null;

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await loanSettingsApi.update({
        penalty_interest_rate: form.penalty_interest_rate !== '' ? Number(form.penalty_interest_rate) : undefined,
        service_charge: form.service_charge !== '' ? Number(form.service_charge) : undefined,
      });
      setMessage({ type: 'success', text: 'Pawning terms saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="profile-section flex items-center justify-center py-16">
      <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
    </div>
  );

  return (
    <div className="profile-section">
      <div className="profile-section-header">
        <div className="profile-section-icon">
          <span className="material-symbols-outlined">gavel</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Pawning Terms</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Define penalty and service fee rules for all pawn transactions</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Penalty Rate */}
        <div className="p-5 bg-neutral-50 dark:bg-neutral-800/50 rounded-sm border border-neutral-200 dark:border-neutral-700">
          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 mb-1">Late Payment Penalty</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">Applied as a percentage of the principal loan when a payment is overdue</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.penalty_interest_rate}
              onChange={e => setForm(prev => ({ ...prev, penalty_interest_rate: e.target.value }))}
              className="profile-input w-28 text-center text-lg font-bold"
              placeholder="0.00"
            />
            <span className="text-sm font-bold text-neutral-500">% of principal</span>
          </div>
          {penaltyAmt && (
            <p className="text-xs text-neutral-400 mt-2">
              Example: ₱ 10,000 principal → <strong className="text-neutral-700 dark:text-neutral-200">₱ {Number(penaltyAmt).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> penalty per overdue period
            </p>
          )}
        </div>

        {/* Service Fee */}
        <div className="p-5 bg-neutral-50 dark:bg-neutral-800/50 rounded-sm border border-neutral-200 dark:border-neutral-700">
          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 mb-1">Service Charge</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">Fixed amount deducted from the loan at disbursement.</p>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-neutral-500">{'\u20B1'}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.service_charge}
              onChange={e => setForm(prev => ({ ...prev, service_charge: e.target.value }))}
              className="profile-input w-28 text-center text-lg font-bold"
              placeholder="10.00"
            />
          </div>
          {feeAmt && (
            <p className="text-xs text-neutral-400 mt-2">
              Example: ₱ 10,000 principal → fee = <strong className="text-neutral-700 dark:text-neutral-200">₱ {Number(feeAmt).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
            </p>
          )}
        </div>

        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
            {message.text}
          </p>
        )}
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Pawning Terms'}
        </button>
      </div>
    </div>
  );
};

// ── Panel map ──────────────────────────────────────────────────────────────────
const PANELS = { gold: GoldPanel, silver: SilverPanel, conditions: ConditionsPanel, terms: TermsPanel };

// ── PricingPage ────────────────────────────────────────────────────────────────
const PricingPage = () => {
  const { profile } = useAuth();
  const navigation = getNavigationByRole(profile?.role);
  const currentUser = buildSidebarUser(profile);
  const [currentPath, setCurrentPath] = useState('/admin/pricing');
  const [activeTab, setActiveTab] = useState('gold');

  const ActivePanel = PANELS[activeTab];

  return (
    <div className="admin-layout">
      {/* Main sidebar */}
      <Sidebar navigation={navigation} currentPath={currentPath} onNavigate={setCurrentPath} />

      {/* Secondary pricing nav — sits between sidebar and content */}
      <SettingsNav
        items={PRICING_SECTIONS}
        activeId={activeTab}
        onSelect={setActiveTab}
        title="Pricing"
      />

      {/* Main content */}
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="md:px-8 md:py-6">
            <ActivePanel />
          </div>
        </div>
      </main>
    </div>
  );
};

export default PricingPage;
