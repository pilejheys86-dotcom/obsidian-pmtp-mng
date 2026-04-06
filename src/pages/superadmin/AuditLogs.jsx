import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sidebar, Header } from '../../components/layout'
import { Pagination, StatusBadge } from '../../components/ui'
import { superadminNavigation } from '../../config'
import { useAuth } from '../../context'
import { tenantsApi } from '../../lib/api'

// ── Mock Data ─────────────────────────────────────────────────────────────────
const USE_MOCK = false
const mockLogs = [
  { id: '1', action: 'TENANT_BLOCKED', target_type: 'TENANT', target_id: 'abc123', details: { reason: 'Terms violation', business_name: 'Test Shop' }, created_at: '2026-03-20T10:30:00Z', super_admins: { full_name: 'Admin User', email: 'admin@obsidian.com' } },
  { id: '2', action: 'TENANT_APPROVED', target_type: 'TENANT', target_id: 'def456', details: { business_name: 'Gold Shop' }, created_at: '2026-03-19T14:15:00Z', super_admins: { full_name: 'Admin User', email: 'admin@obsidian.com' } },
  { id: '3', action: 'SETTINGS_UPDATED', target_type: 'PLATFORM_SETTINGS', target_id: 'xyz789', details: { system_title: 'Obsidian' }, created_at: '2026-03-18T09:00:00Z', super_admins: { full_name: 'Admin User', email: 'admin@obsidian.com' } },
]

// ── Action Type → StatusBadge type mapping ────────────────────────────────────
const actionStyles = {
  TENANT_BLOCKED:      'danger',
  TENANT_REACTIVATED:  'success',
  TENANT_APPROVED:     'success',
  TENANT_REJECTED:     'danger',
  TENANT_DEACTIVATED:  'warning',
  PLAN_UPDATED:        'info',
  SETTINGS_UPDATED:    'info',
  ADMIN_LOGIN:         'success',
  ADMIN_LOGOUT:        'neutral',
  CREATE_ADMIN:        'info',
  USER_LOGIN:          'success',
  USER_LOGOUT:         'neutral',
}

const actionLabels = {
  TENANT_BLOCKED:      'Tenant Blocked',
  TENANT_REACTIVATED:  'Tenant Reactivated',
  TENANT_APPROVED:     'Tenant Approved',
  TENANT_REJECTED:     'Tenant Rejected',
  TENANT_DEACTIVATED:  'Tenant Deactivated',
  PLAN_UPDATED:        'Plan Updated',
  SETTINGS_UPDATED:    'Settings Updated',
  ADMIN_LOGIN:         'Admin Login',
  ADMIN_LOGOUT:        'Admin Logout',
  CREATE_ADMIN:        'Create Admin',
  USER_LOGIN:          'User Login',
  USER_LOGOUT:         'User Logout',
}

const formatAction = (raw) => actionLabels[raw] || raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const formatTarget = (raw) => raw ? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'

const formatDetails = (action, details, targetType, targetId) => {
  if (!details || typeof details !== 'object') return '—'
  const d = details
  const name = d.full_name || d.business_name || d.email || ''
  const shortId = targetId ? targetId.slice(0, 8) : ''

  switch (action) {
    case 'CREATE_ADMIN':
      return `Created admin ${name}${d.email ? ` (${d.email})` : ''}`
    case 'TENANT_BLOCKED':
      return `Blocked ${name}${d.reason ? ` — ${d.reason}` : ''}`
    case 'TENANT_REACTIVATED':
      return `Reactivated ${name}`
    case 'TENANT_APPROVED':
      return `Approved ${name}`
    case 'TENANT_REJECTED':
      return `Rejected ${name}${d.reason ? ` — ${d.reason}` : ''}`
    case 'TENANT_DEACTIVATED':
      return `Deactivated ${name}${d.reason ? ` — ${d.reason}` : ''}`
    case 'PLAN_UPDATED':
      return `Updated plan for ${name}${d.plan_name ? ` to ${d.plan_name}` : ''}`
    case 'SETTINGS_UPDATED':
      return `Updated platform settings${d.system_title ? ` (${d.system_title})` : ''}`
    case 'USER_LOGIN':
      return `${d.role ? d.role.charAt(0) + d.role.slice(1).toLowerCase() : 'User'} logged in${d.email ? ` — ${d.email}` : ''}`
    case 'USER_LOGOUT':
      return `${d.role ? d.role.charAt(0) + d.role.slice(1).toLowerCase() : 'User'} logged out${d.email ? ` — ${d.email}` : ''}`
    case 'ADMIN_LOGIN':
      return `Admin logged in${d.email ? ` — ${d.email}` : ''}`
    case 'ADMIN_LOGOUT':
      return `Admin logged out${d.email ? ` — ${d.email}` : ''}`
    default: {
      if (name) return name
      const vals = Object.values(d).filter(v => typeof v === 'string').slice(0, 2)
      return vals.length ? vals.join(' — ') : `${formatTarget(targetType)} ${shortId}`
    }
  }
}

// ── Action Options ────────────────────────────────────────────────────────────
const ACTION_OPTIONS = [
  { value: '',                    label: 'All Actions' },
  { value: 'TENANT_BLOCKED',      label: 'Tenant Blocked' },
  { value: 'TENANT_REACTIVATED',  label: 'Tenant Reactivated' },
  { value: 'TENANT_APPROVED',     label: 'Tenant Approved' },
  { value: 'TENANT_REJECTED',     label: 'Tenant Rejected' },
  { value: 'TENANT_DEACTIVATED',  label: 'Tenant Deactivated' },
  { value: 'PLAN_UPDATED',        label: 'Plan Updated' },
  { value: 'SETTINGS_UPDATED',    label: 'Settings Updated' },
  { value: 'ADMIN_LOGIN',         label: 'Admin Login' },
  { value: 'ADMIN_LOGOUT',        label: 'Admin Logout' },
  { value: 'USER_LOGIN',          label: 'User Login' },
  { value: 'USER_LOGOUT',         label: 'User Logout' },
]

// ── Table Columns ─────────────────────────────────────────────────────────────
const COLS = ['User', 'Action', 'Details', 'Timestamp']

// ── Main Page ─────────────────────────────────────────────────────────────────
const AuditLogs = () => {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [filters, setFilters] = useState({ from: '', to: '', admin_id: '', action: '' })
  const [adminOptions, setAdminOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [currentPath, setCurrentPath] = useState('/superadmin/audit-logs')

  const { profile } = useAuth()

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'Super Admin',
    role: 'Super Admin',
    initials: (profile?.full_name || 'SA').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  }), [profile])

  const navigateTo = (path) => {
    setCurrentPath(path)
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const toggleExpand = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Fetch admin options once on mount
  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const res = await tenantsApi.admins()
        setAdminOptions(res.data || [])
      } catch (err) {
        console.error('Failed to fetch admins:', err)
      }
    }
    fetchAdmins()
  }, [])

  // Fetch logs whenever page or filters change
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      if (USE_MOCK) {
        setLogs(mockLogs)
        setTotal(mockLogs.length)
        return
      }
      const params = { page, limit, ...filters }
      const res = await tenantsApi.auditLogs(params)
      setLogs(res.data || [])
      setTotal(res.total || 0)
    } catch (err) {
      console.error('Audit logs fetch error:', err)
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, limit, filters])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const handleRefresh = () => {
    setPage(1)
    fetchLogs()
  }

  return (
    <div className="admin-layout">
      <Sidebar
        navigation={superadminNavigation}
        currentPath={currentPath}
        onNavigate={navigateTo}
      />

      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">

          {/* ── Header ───────────────────────────────────── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Platform Admin</p>
              <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Audit Logs</h1>
              <p className="text-sm text-neutral-500 mt-1">Track all administrative actions taken on the platform.</p>
            </div>
            <button onClick={handleRefresh} className="header-icon-btn self-start" title="Refresh">
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
          </div>

          {/* ── Filter Bar ───────────────────────────────── */}
          <div className="sa-filter-bar mb-6">
            {/* Date From */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-500 whitespace-nowrap">From</label>
              <input
                type="date"
                value={filters.from}
                onChange={e => handleFilterChange('from', e.target.value)}
                className="sa-filter-input"
              />
            </div>

            {/* Date To */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-500 whitespace-nowrap">To</label>
              <input
                type="date"
                value={filters.to}
                onChange={e => handleFilterChange('to', e.target.value)}
                className="sa-filter-input"
              />
            </div>

            {/* Admin filter */}
            <select
              value={filters.admin_id}
              onChange={e => handleFilterChange('admin_id', e.target.value)}
              className="sa-filter-select"
            >
              <option value="">All Admins</option>
              {adminOptions.map(admin => (
                <option key={admin.id} value={admin.id}>
                  {admin.full_name}
                </option>
              ))}
            </select>

            {/* Action type filter */}
            <select
              value={filters.action}
              onChange={e => handleFilterChange('action', e.target.value)}
              className="sa-filter-select"
            >
              {ACTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Clear filters */}
            {(filters.from || filters.to || filters.admin_id || filters.action) && (
              <button
                onClick={() => {
                  setFilters({ from: '', to: '', admin_id: '', action: '' })
                  setPage(1)
                }}
                className="sa-filter-btn"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
                Clear
              </button>
            )}
          </div>

          {/* ── Table ────────────────────────────────────── */}
          <div className="dashboard-card">
            <div className="overflow-x-auto -mx-6 -mb-6">
              <table className="sa-table w-full">
                <thead>
                  <tr>
                    {COLS.map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={COLS.length} className="px-6 py-20 text-center">
                        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                        <p className="mt-3 text-sm text-neutral-400">Loading audit logs...</p>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={COLS.length} className="px-6 py-20 text-center">
                        <span className="material-symbols-outlined text-5xl text-neutral-300 dark:text-neutral-700">history</span>
                        <p className="mt-3 text-sm font-semibold text-neutral-500">No audit logs found</p>
                        <p className="mt-1 text-xs text-neutral-400">Try adjusting your filters or date range.</p>
                      </td>
                    </tr>
                  ) : (
                    logs.map(log => {
                      return (
                        <tr key={log.id}>
                          {/* User */}
                          <td>
                            <div className="flex items-center gap-2.5">
                              <div className="h-7 w-7 rounded-sm flex-shrink-0 bg-primary/10 flex items-center justify-center">
                                <span className="text-[10px] font-bold text-primary">
                                  {(log.super_admins?.full_name || log.details?.full_name || 'Unknown').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-neutral-800 dark:text-white whitespace-nowrap">
                                {log.super_admins?.full_name || log.details?.full_name || '—'}
                              </span>
                            </div>
                          </td>

                          {/* Action */}
                          <td>
                            <StatusBadge
                              status={formatAction(log.action)}
                              type={actionStyles[log.action] || 'neutral'}
                            />
                          </td>

                          {/* Details */}
                          <td>
                            <span className="text-sm text-neutral-600 dark:text-neutral-300">
                              {formatDetails(log.action, log.details, log.target_type, log.target_id)}
                            </span>
                          </td>

                          {/* Timestamp */}
                          <td>
                            <span className="text-sm text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ──────────────────────────────── */}
            {!loading && logs.length > 0 && (
              <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 mt-6">
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil(total / limit)}
                  totalItems={total}
                  itemsPerPage={limit}
                  onPageChange={setPage}
                  itemLabel="logs"
                />
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}

export default AuditLogs
