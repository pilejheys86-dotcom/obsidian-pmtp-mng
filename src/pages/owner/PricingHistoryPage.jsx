import { useState, useEffect } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { pricingApi } from '../../lib/api';

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const PAGE_SIZE = 20;

function fmtRate(val) {
  if (val == null) return '–';
  return `₱ ${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

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

const GOLD_HEADERS = ['Date & Time', 'Karat', 'Old Rate', 'New Rate', 'Updated By'];
const SILVER_HEADERS = ['Date & Time', 'Purity', 'Old Rate', 'New Rate', 'Updated By'];

const goldRowMapper = h => [
  new Date(h.changed_at).toLocaleString(),
  h.karat,
  fmtRate(h.old_rate),
  fmtRate(h.new_rate),
  h.changed_by_user?.full_name || '–',
];

const silverRowMapper = h => [
  new Date(h.changed_at).toLocaleString(),
  h.purity_mark,
  fmtRate(h.old_rate),
  fmtRate(h.new_rate),
  h.changed_by_user?.full_name || '–',
];

const PricingHistoryPage = () => {
  const { profile } = useAuth();
  const navigation = getNavigationByRole(profile?.role);
  const currentUser = buildSidebarUser(profile);

  const params = new URLSearchParams(window.location.search);
  const [type, setType] = useState(params.get('type') === 'silver' ? 'silver' : 'gold');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchHistory = (p = page, fd = fromDate, td = toDate) => {
    setLoading(true);
    const params = { page: p, limit: PAGE_SIZE };
    if (fd) params.from_date = fd;
    if (td) params.to_date = td;
    const apiFn = type === 'silver' ? pricingApi.getSilverHistory : pricingApi.getGoldHistory;
    apiFn(params)
      .then(res => { setHistory(res.data || []); setTotal(res.total || 0); })
      .catch(() => { setHistory([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { setPage(1); }, [type]);
  useEffect(() => { fetchHistory(page, fromDate, toDate); }, [type, page]);

  const handleFilter = () => { setPage(1); fetchHistory(1, fromDate, toDate); };
  const handleClear = () => { setFromDate(''); setToDate(''); setPage(1); fetchHistory(1, '', ''); };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const headers = type === 'gold' ? GOLD_HEADERS : SILVER_HEADERS;
  const rowMapper = type === 'gold' ? goldRowMapper : silverRowMapper;
  const title = type === 'gold' ? 'Gold Price History' : 'Silver Price History';

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/pricing" onNavigate={() => {}} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="md:px-8 md:py-6">
            {/* Breadcrumb + heading */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <nav className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                  <a href="/admin/pricing" className="hover:text-neutral-600 dark:hover:text-neutral-300">Pricing</a>
                  <span className="material-symbols-outlined text-xs">chevron_right</span>
                  <span className="text-neutral-700 dark:text-white font-semibold">Price History</span>
                </nav>
                <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">{title}</h1>
              </div>
              <a href="/admin/pricing" className="btn-outline flex items-center gap-2 text-xs">
                <span className="material-symbols-outlined text-base">arrow_back</span>
                Back to Pricing
              </a>
            </div>

            {/* Filters bar */}
            <div className="profile-section mb-6">
              <div className="flex flex-wrap items-end gap-4">
                {/* Type toggle */}
                <div>
                  <label className="form-label">Type</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setType('gold')}
                      className={`text-xs px-3 py-2 rounded-sm font-semibold border transition-colors ${type === 'gold' ? 'bg-primary text-neutral-900 border-primary' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400'}`}
                    >Gold</button>
                    <button
                      onClick={() => setType('silver')}
                      className={`text-xs px-3 py-2 rounded-sm font-semibold border transition-colors ${type === 'silver' ? 'bg-primary text-neutral-900 border-primary' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400'}`}
                    >Silver</button>
                  </div>
                </div>

                {/* Date range */}
                <div>
                  <label className="form-label">From</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="profile-input text-sm" />
                </div>
                <div>
                  <label className="form-label">To</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="profile-input text-sm" />
                </div>

                <button onClick={handleFilter} className="btn-primary text-xs px-4 py-2.5">Apply</button>
                {(fromDate || toDate) && (
                  <button onClick={handleClear} className="btn-outline text-xs px-4 py-2.5">Clear</button>
                )}

                <div className="ml-auto">
                  <button
                    onClick={() => exportHistoryPdf(title, history, headers, rowMapper, profile?.tenants?.business_name)}
                    className="btn-outline flex items-center gap-2 text-xs"
                  >
                    <span className="material-symbols-outlined text-base">download</span>
                    Export PDF
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="profile-section">
              {loading ? (
                <div className="flex justify-center py-12">
                  <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
                </div>
              ) : (
                <>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-neutral-100 dark:bg-neutral-800">
                        {headers.map((h, i) => (
                          <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700 ${i >= 2 && i <= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 && (
                        <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-neutral-400">No history entries found.</td></tr>
                      )}
                      {history.map((h, i) => {
                        const cells = rowMapper(h);
                        return (
                          <tr key={h.id} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
                            {cells.map((c, ci) => (
                              <td key={ci} className={`px-4 py-2.5 ${ci >= 2 && ci <= 3 ? 'text-right' : ''} ${ci === 1 ? 'font-bold text-primary' : ''} ${ci === 3 ? 'font-bold text-neutral-800 dark:text-neutral-100' : ci === 2 ? 'text-neutral-400' : 'text-neutral-700 dark:text-neutral-300'}`}>
                                {c}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <span className="text-xs text-neutral-400">
                      Showing {history.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} entries
                    </span>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <button disabled={page <= 1} onClick={() => setPage(1)} className="btn-outline text-xs px-2.5 py-1.5">
                          <span className="material-symbols-outlined text-sm">first_page</span>
                        </button>
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-outline text-xs px-3 py-1.5">Prev</button>
                        <span className="text-xs text-neutral-400">Page {page} of {totalPages}</span>
                        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-outline text-xs px-3 py-1.5">Next</button>
                        <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="btn-outline text-xs px-2.5 py-1.5">
                          <span className="material-symbols-outlined text-sm">last_page</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PricingHistoryPage;
