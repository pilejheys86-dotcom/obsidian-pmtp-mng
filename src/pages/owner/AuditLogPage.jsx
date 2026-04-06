import { useState, useEffect } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { auditLogApi, employeesApi } from '../../lib/api';

function buildSidebarUser(profile) {
  const name = profile?.full_name || 'User';
  const parts = name.split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, role: profile?.role || '', initials };
}

const PAGE_SIZE = 20;

const CATEGORIES = ['All', 'AUTH', 'APPRAISAL', 'LOAN', 'PAYMENT', 'CUSTOMER', 'INVENTORY', 'SETTINGS', 'EMPLOYEE'];

const CATEGORY_COLORS = {
  AUTH: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  APPRAISAL: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  LOAN: 'bg-primary/10 text-primary border-primary/20',
  PAYMENT: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  CUSTOMER: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  INVENTORY: 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20',
  SETTINGS: 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20',
  EMPLOYEE: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
};

function exportAuditPdf(rows, businessName) {
  const now = new Date().toLocaleString();
  const headers = ['Date & Time', 'Employee', 'Category', 'Description'];
  const html = `<!DOCTYPE html>
<html><head><title>Audit Log</title>
<style>
  @page { size: A4 landscape; margin: 20mm 16mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; padding: 40px; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .header-left h1 { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .header-left p { font-size: 11px; color: #666; margin-top: 2px; }
  .header-right { text-align: right; }
  .header-right .biz { font-size: 14px; font-weight: 700; }
  .header-right .date { font-size: 10px; color: #888; margin-top: 2px; }
  .summary { display: flex; gap: 24px; margin-bottom: 20px; }
  .summary-card { background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px 16px; flex: 1; }
  .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: 600; }
  .summary-card .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; table-layout: fixed; }
  thead th { background: #1a1a1a; color: #fff; text-align: left; padding: 10px 14px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th:first-child { border-radius: 6px 0 0 0; width: 18%; }
  thead th:nth-child(2) { width: 18%; }
  thead th:nth-child(3) { width: 14%; }
  thead th:last-child { border-radius: 0 6px 0 0; width: 50%; }
  tbody td { padding: 9px 14px; border-bottom: 1px solid #eee; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .cat-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #f0f0f0; }
  .footer { text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #e5e5e5; padding-top: 12px; }
</style></head><body>
<div class="header">
  <div class="header-left"><h1>Audit Log</h1><p>Employee activity report</p></div>
  <div class="header-right"><div class="biz">${businessName || 'Obsidian'}</div><div class="date">Generated: ${now}</div></div>
</div>
<div class="summary">
  <div class="summary-card"><div class="label">Entries Shown</div><div class="value">${rows.length}</div></div>
  <div class="summary-card"><div class="label">Report</div><div class="value">Audit Log</div></div>
  <div class="summary-card"><div class="label">Generated</div><div class="value">${new Date().toLocaleDateString()}</div></div>
</div>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.length === 0 ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:#999">No entries</td></tr>` :
  rows.map(r => `<tr>
    <td style="white-space:nowrap">${new Date(r.created_at).toLocaleString()}</td>
    <td>${r.user?.full_name || '\u2013'}</td>
    <td><span class="cat-badge">${r.category}</span></td>
    <td>${r.description}</td>
  </tr>`).join('')}
</tbody></table>
<div class="footer">${businessName || 'Obsidian'} \u2014 Pawnshop Management System \u2014 Confidential</div>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

const AuditLogPage = () => {
  const { profile } = useAuth();
  const navigation = getNavigationByRole(profile?.role);
  const currentUser = buildSidebarUser(profile);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState('');
  const [userId, setUserId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    employeesApi.list({ limit: 100 })
      .then(res => setEmployees(res.data || res || []))
      .catch(() => {});
  }, []);

  const fetchLogs = (p = page) => {
    setLoading(true);
    const params = { page: p, limit: PAGE_SIZE };
    if (category) params.category = category;
    if (userId) params.user_id = userId;
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    auditLogApi.list(params)
      .then(res => { setLogs(res.data || []); setTotal(res.total || 0); })
      .catch(() => { setLogs([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(page); }, [page]);

  const handleFilter = () => { setPage(1); fetchLogs(1); };
  const handleClear = () => {
    setCategory(''); setUserId(''); setFromDate(''); setToDate('');
    setPage(1);
    setLoading(true);
    auditLogApi.list({ page: 1, limit: PAGE_SIZE })
      .then(res => { setLogs(res.data || []); setTotal(res.total || 0); })
      .catch(() => { setLogs([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/audit-log" onNavigate={() => {}} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">
          <div className="md:px-8 md:py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">Audit Log</h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Monitor employee activity across your pawnshop</p>
              </div>
            </div>

            {/* Filters */}
            <div className="profile-section mb-6">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="form-label">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="profile-input text-sm">
                    {CATEGORIES.map(c => (
                      <option key={c} value={c === 'All' ? '' : c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Employee</label>
                  <select value={userId} onChange={e => setUserId(e.target.value)} className="profile-input text-sm">
                    <option value="">All</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">From</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="profile-input text-sm" />
                </div>
                <div>
                  <label className="form-label">To</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="profile-input text-sm" />
                </div>
                <button onClick={handleFilter} className="btn-primary text-xs px-4 py-2.5">Apply</button>
                {(category || userId || fromDate || toDate) && (
                  <button onClick={handleClear} className="btn-outline text-xs px-4 py-2.5">Clear</button>
                )}
                <div className="ml-auto">
                  <button
                    onClick={() => exportAuditPdf(logs, profile?.tenants?.business_name)}
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
                  <table className="w-full text-sm border-collapse table-fixed">
                    <colgroup>
                      <col className="w-1/4" />
                      <col className="w-1/4" />
                      <col className="w-1/4" />
                      <col className="w-1/4" />
                    </colgroup>
                    <thead>
                      <tr className="bg-neutral-100 dark:bg-neutral-800">
                        <th className="px-5 py-2.5 text-center text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Date & Time</th>
                        <th className="px-5 py-2.5 text-center text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Employee</th>
                        <th className="px-5 py-2.5 text-center text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Category</th>
                        <th className="px-5 py-2.5 text-center text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.length === 0 && (
                        <tr><td colSpan={4} className="px-5 py-8 text-center text-neutral-400">No audit log entries found.</td></tr>
                      )}
                      {logs.map((log, i) => (
                        <tr key={log.id} className={`border-b border-neutral-100 dark:border-neutral-800 ${i % 2 === 1 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}>
                          <td className="px-5 py-2.5 text-center text-neutral-700 dark:text-neutral-300 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="px-5 py-2.5 text-center font-medium text-neutral-800 dark:text-neutral-100">{log.user?.full_name || '–'}</td>
                          <td className="px-5 py-2.5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${CATEGORY_COLORS[log.category] || CATEGORY_COLORS.SETTINGS}`}>
                              {log.category}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-center text-neutral-700 dark:text-neutral-300">{log.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <span className="text-xs text-neutral-400">
                      Showing {logs.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} entries
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

export default AuditLogPage;
