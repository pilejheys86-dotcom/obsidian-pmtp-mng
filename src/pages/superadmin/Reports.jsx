import { useCallback, useEffect, useMemo, useState } from 'react'
import { LineChart, PieChart } from '@mui/x-charts'
import { Sidebar, Header } from '../../components/layout'
import { StatsCard } from '../../components/ui'
import { superadminNavigation } from '../../config'
import { useAuth } from '../../context'
import { exportsApi, tenantsApi } from '../../lib/api'

// ── Mock flag & data ─────────────────────────────────────────────────────────
const USE_MOCK = false

const mockActivityData = [
  { tenant_name: 'Gold Palace Pawnshop', total_transactions: 245, active_loans: 89, customers: 156 },
  { tenant_name: 'Silver Star Lending',  total_transactions: 189, active_loans: 67, customers: 112 },
  { tenant_name: 'Diamond Trust Pawn',   total_transactions: 156, active_loans: 45, customers: 98  },
]

const mockRegistrationData = [
  { month: '2026-01', new_users: 12, cumulative: 12 },
  { month: '2026-02', new_users: 18, cumulative: 30 },
  { month: '2026-03', new_users: 8,  cumulative: 38 },
]

const mockUsageData = {
  avg_loans_per_tenant: 67,
  avg_customers_per_tenant: 122,
  most_active_tenant: { name: 'Gold Palace Pawnshop', transaction_count: 245 },
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtMonth = (str) => {
  if (!str) return '—'
  const [year, month] = str.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const fmtCurrency = (val) =>
  val == null ? '—' : `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (str) => {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Health score badge ────────────────────────────────────────────────────────
const HealthBadge = ({ score }) => {
  if (score == null) return <span className="text-neutral-400">—</span>
  const n = Number(score)
  if (n >= 70) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{n}</span>
  if (n >= 30) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{n}</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{n}</span>
}

// ── Spinner / Empty helpers ───────────────────────────────────────────────────
const Spinner = () => (
  <div className="py-12 text-center">
    <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
    <p className="mt-3 text-sm text-neutral-400">Loading...</p>
  </div>
)

const Empty = ({ icon, text }) => (
  <div className="py-12 text-center">
    <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-700">{icon}</span>
    <p className="mt-3 text-sm text-neutral-500">{text}</p>
  </div>
)

// ── Export buttons ────────────────────────────────────────────────────────────
const ExportButtons = ({ reportType, params = {} }) => (
  <div className="flex items-center gap-2">
    <button
      className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1"
      onClick={() => exportsApi.download(reportType, params)}
    >
      <span className="material-symbols-outlined text-sm">download</span> CSV
    </button>
    <button
      className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1"
      onClick={() => window.print()}
    >
      <span className="material-symbols-outlined text-sm">print</span> PDF
    </button>
  </div>
)

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { key: 'activity',      label: 'Activity' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'usage',         label: 'Usage' },
  { key: 'health',        label: 'Tenant Health' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'pawn_volume',   label: 'Pawn Volume' },
  { key: 'rankings',      label: 'Rankings' },
]

// ── Reports Page ─────────────────────────────────────────────────────────────
const Reports = () => {
  const [currentPath] = useState('/superadmin/reports')
  const { profile } = useAuth()

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'Super Admin',
    role: 'Super Admin',
    initials: (profile?.full_name || 'SA').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  }), [profile])

  // ── Active tab ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('activity')

  // ── Filter state ────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({ from: '', to: '', tenant_id: '' })
  const [tenantOptions, setTenantOptions] = useState([])

  // ── Report data state — original 3 ──────────────────────────────────────
  const [activityData, setActivityData]       = useState([])
  const [registrationData, setRegistrationData] = useState([])
  const [usageData, setUsageData]             = useState(null)
  const [loading, setLoading]                 = useState(true)

  // ── Report data state — new 4 ───────────────────────────────────────────
  const [healthData, setHealthData]           = useState([])
  const [healthSummary, setHealthSummary]     = useState(null)
  const [healthFilter, setHealthFilter]       = useState('all')
  const [healthSort, setHealthSort]           = useState('desc') // asc | desc
  const [healthLoading, setHealthLoading]     = useState(false)

  const [subData, setSubData]                 = useState(null)
  const [subLoading, setSubLoading]           = useState(false)

  const [pawnData, setPawnData]               = useState(null)
  const [pawnPeriod, setPawnPeriod]           = useState('30')
  const [pawnLoading, setPawnLoading]         = useState(false)

  const [rankData, setRankData]               = useState(null)
  const [rankMetric, setRankMetric]           = useState('revenue')
  const [rankPeriod, setRankPeriod]           = useState('30')
  const [rankLimit, setRankLimit]             = useState('10')
  const [rankLoading, setRankLoading]         = useState(false)

  // ── Navigation ──────────────────────────────────────────────────────────
  const navigateTo = (path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  // ── Fetch tenant list for filter dropdown ────────────────────────────────
  useEffect(() => {
    tenantsApi.list()
      .then(res => setTenantOptions(Array.isArray(res) ? res : (res?.data || [])))
      .catch(err => console.error('Reports: tenant list error', err))
  }, [])

  // ── Build shared params ──────────────────────────────────────────────────
  const sharedParams = useMemo(() => ({
    from: filters.from || undefined,
    to: filters.to || undefined,
    tenant_id: filters.tenant_id || undefined,
  }), [filters])

  // ── Fetch original 3 reports ─────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      if (USE_MOCK) {
        setActivityData(mockActivityData)
        setRegistrationData(mockRegistrationData)
        setUsageData(mockUsageData)
        return
      }

      const params = {
        from: filters.from || undefined,
        to: filters.to || undefined,
        tenant_id: filters.tenant_id || undefined,
      }

      const [activityRes, registrationsRes, usageRes] = await Promise.all([
        tenantsApi.reports({ type: 'activity',      ...params }),
        tenantsApi.reports({ type: 'registrations', from: params.from, to: params.to }),
        tenantsApi.reports({ type: 'usage',         from: params.from, to: params.to }),
      ])

      setActivityData(Array.isArray(activityRes) ? activityRes : (activityRes?.data || []))
      setRegistrationData(Array.isArray(registrationsRes) ? registrationsRes : (registrationsRes?.data || []))
      setUsageData(usageRes?.data ?? usageRes ?? null)
    } catch (err) {
      console.error('Reports fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { fetchReports() }, [fetchReports])

  // ── Fetch: Tenant Health ─────────────────────────────────────────────────
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const res = await tenantsApi.health(sharedParams)
      const rows = Array.isArray(res) ? res : (res?.data || [])
      const summary = res?.summary ?? null
      setHealthData(rows)
      setHealthSummary(summary)
    } catch (err) {
      console.error('Health fetch error:', err)
    } finally {
      setHealthLoading(false)
    }
  }, [sharedParams])

  // ── Fetch: Subscriptions ─────────────────────────────────────────────────
  const fetchSubscriptions = useCallback(async () => {
    setSubLoading(true)
    try {
      const res = await tenantsApi.subscriptionAnalytics(sharedParams)
      setSubData(res?.data ?? res ?? null)
    } catch (err) {
      console.error('Subscriptions fetch error:', err)
    } finally {
      setSubLoading(false)
    }
  }, [sharedParams])

  // ── Fetch: Pawn Volume ───────────────────────────────────────────────────
  const fetchPawnVolume = useCallback(async () => {
    setPawnLoading(true)
    try {
      const res = await tenantsApi.pawnVolume({ ...sharedParams, period: pawnPeriod })
      setPawnData(res?.data ?? res ?? null)
    } catch (err) {
      console.error('Pawn volume fetch error:', err)
    } finally {
      setPawnLoading(false)
    }
  }, [sharedParams, pawnPeriod])

  // ── Fetch: Rankings ──────────────────────────────────────────────────────
  const fetchRankings = useCallback(async () => {
    setRankLoading(true)
    try {
      const res = await tenantsApi.rankings({ ...sharedParams, metric: rankMetric, period: rankPeriod, limit: rankLimit })
      setRankData(res?.data ?? res ?? null)
    } catch (err) {
      console.error('Rankings fetch error:', err)
    } finally {
      setRankLoading(false)
    }
  }, [sharedParams, rankMetric, rankPeriod, rankLimit])

  // ── Trigger lazy fetches when switching tabs ─────────────────────────────
  useEffect(() => { if (activeTab === 'health')         fetchHealth() },        [activeTab, fetchHealth])
  useEffect(() => { if (activeTab === 'subscriptions')  fetchSubscriptions() }, [activeTab, fetchSubscriptions])
  useEffect(() => { if (activeTab === 'pawn_volume')    fetchPawnVolume() },    [activeTab, fetchPawnVolume])
  useEffect(() => { if (activeTab === 'rankings')       fetchRankings() },      [activeTab, fetchRankings])

  // ── Usage stats cards ────────────────────────────────────────────────────
  const usageCards = [
    {
      icon: 'receipt_long',
      iconBg: 'bg-primary',
      iconColor: 'text-white dark:text-neutral-900',
      label: 'Avg Loans per Tenant',
      value: usageData ? `${usageData.avg_loans_per_tenant ?? '—'}` : '—',
      badge: '',
      badgeType: 'neutral',
    },
    {
      icon: 'people',
      iconBg: 'bg-emerald-500',
      iconColor: 'text-white',
      label: 'Avg Customers per Tenant',
      value: usageData ? `${usageData.avg_customers_per_tenant ?? '—'}` : '—',
      badge: '',
      badgeType: 'success',
    },
    {
      icon: 'workspace_premium',
      iconBg: 'bg-violet-500',
      iconColor: 'text-white',
      label: 'Most Active Tenant',
      value: usageData?.most_active_tenant?.name || '—',
      badge: usageData?.most_active_tenant?.transaction_count
        ? `${usageData.most_active_tenant.transaction_count} txns`
        : '',
      badgeType: 'neutral',
    },
  ]

  // ── Derived: filtered + sorted health rows ───────────────────────────────
  const filteredHealth = useMemo(() => {
    let rows = [...healthData]
    if (healthFilter === 'healthy')  rows = rows.filter(r => r.health_score >= 70)
    if (healthFilter === 'warning')  rows = rows.filter(r => r.health_score >= 30 && r.health_score < 70)
    if (healthFilter === 'critical') rows = rows.filter(r => r.health_score < 30)
    rows.sort((a, b) => healthSort === 'asc'
      ? (a.health_score ?? 0) - (b.health_score ?? 0)
      : (b.health_score ?? 0) - (a.health_score ?? 0)
    )
    return rows
  }, [healthData, healthFilter, healthSort])

  // ── Render ───────────────────────────────────────────────────────────────
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

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Platform Admin</p>
              <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Reports</h1>
              <p className="text-sm text-neutral-500 mt-1">Platform activity and usage reports.</p>
            </div>
            <button onClick={fetchReports} className="header-icon-btn self-start" title="Refresh">
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
          </div>

          {/* ── Filter Bar ─────────────────────────────────────────────── */}
          <div className="sa-filter-bar mb-6">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <div className="flex items-center gap-2">
                <label className="text-xs text-neutral-500 whitespace-nowrap">From</label>
                <input
                  type="date"
                  className="sa-filter-input"
                  value={filters.from}
                  onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-neutral-500 whitespace-nowrap">To</label>
                <input
                  type="date"
                  className="sa-filter-input"
                  value={filters.to}
                  onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                />
              </div>
              <select
                className="sa-filter-select"
                value={filters.tenant_id}
                onChange={e => setFilters(f => ({ ...f, tenant_id: e.target.value }))}
              >
                <option value="">All Tenants</option>
                {tenantOptions.map(t => (
                  <option key={t.id} value={t.id}>{t.business_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Tabs ───────────────────────────────────────────────────── */}
          <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-700 mb-6 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.key
                    ? 'text-primary border-b-2 border-primary -mb-px'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* Tab: Activity                                                */}
          {/* ════════════════════════════════════════════════════════════ */}
          {activeTab === 'activity' && (
            <div className="dashboard-card">
              <div className="mb-5">
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Tenant Activity Report</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Transactions, active loans, and customer counts per tenant</p>
              </div>

              {loading ? <Spinner /> : activityData.length === 0 ? (
                <Empty icon="bar_chart" text="No activity data available" />
              ) : (
                <div className="overflow-x-auto -mx-6 -mb-6">
                  <table className="sa-table w-full">
                    <thead>
                      <tr>
                        <th>Tenant Name</th>
                        <th className="text-center">Total Transactions</th>
                        <th className="text-center">Active Loans</th>
                        <th className="text-center">Customers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityData.map((row, i) => (
                        <tr key={i}>
                          <td className="font-medium text-neutral-800 dark:text-neutral-100">{row.tenant_name}</td>
                          <td className="text-center">{row.total_transactions?.toLocaleString() ?? '—'}</td>
                          <td className="text-center">{row.active_loans?.toLocaleString() ?? '—'}</td>
                          <td className="text-center">{row.customers?.toLocaleString() ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/* Tab: Registrations                                          */}
          {/* ════════════════════════════════════════════════════════════ */}
          {activeTab === 'registrations' && (
            <div className="dashboard-card">
              <div className="mb-5">
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">User Registration Report</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Monthly new user signups and cumulative growth</p>
              </div>

              {loading ? <Spinner /> : registrationData.length === 0 ? (
                <Empty icon="person_add" text="No registration data available" />
              ) : (
                <div className="overflow-x-auto -mx-6 -mb-6">
                  <table className="sa-table w-full">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="text-center">New Users</th>
                        <th className="text-center">Cumulative Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrationData.map((row, i) => (
                        <tr key={i}>
                          <td className="font-medium text-neutral-800 dark:text-neutral-100">{fmtMonth(row.month)}</td>
                          <td className="text-center">{row.new_users?.toLocaleString() ?? '—'}</td>
                          <td className="text-center">{row.cumulative?.toLocaleString() ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/* Tab: Usage                                                   */}
          {/* ════════════════════════════════════════════════════════════ */}
          {activeTab === 'usage' && (
            <div className="dashboard-card">
              <div className="mb-5">
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Usage Statistics</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Platform-wide averages and top performer</p>
              </div>

              {loading ? <Spinner /> : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {usageCards.map(c => <StatsCard key={c.label} {...c} />)}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/* Tab: Tenant Health                                          */}
          {/* ════════════════════════════════════════════════════════════ */}
          {activeTab === 'health' && (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="dashboard-card flex items-center gap-4">
                  <div className="w-10 h-10 rounded-sm bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-white text-[20px]">check_circle</span>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Healthy</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {healthLoading ? '—' : (healthSummary?.healthy ?? healthData.filter(r => r.health_score >= 70).length)}
                    </p>
                  </div>
                </div>
                <div className="dashboard-card flex items-center gap-4">
                  <div className="w-10 h-10 rounded-sm bg-amber-500 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-white text-[20px]">warning</span>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Warning</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {healthLoading ? '—' : (healthSummary?.warning ?? healthData.filter(r => r.health_score >= 30 && r.health_score < 70).length)}
                    </p>
                  </div>
                </div>
                <div className="dashboard-card flex items-center gap-4">
                  <div className="w-10 h-10 rounded-sm bg-red-500 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-white text-[20px]">error</span>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Critical</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {healthLoading ? '—' : (healthSummary?.critical ?? healthData.filter(r => r.health_score < 30).length)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Table card */}
              <div className="dashboard-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Tenant Health Scores</h2>
                    <p className="text-xs text-neutral-400 mt-0.5">Health score, activity, and subscription status per tenant</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status filter */}
                    <select
                      className="sa-filter-select"
                      value={healthFilter}
                      onChange={e => setHealthFilter(e.target.value)}
                    >
                      <option value="all">All Statuses</option>
                      <option value="healthy">Healthy (70+)</option>
                      <option value="warning">Warning (30-69)</option>
                      <option value="critical">Critical (0-29)</option>
                    </select>
                    {/* Sort toggle */}
                    <button
                      className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1"
                      onClick={() => setHealthSort(s => s === 'desc' ? 'asc' : 'desc')}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {healthSort === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                      </span>
                      Score
                    </button>
                    <ExportButtons reportType="tenant-health" params={sharedParams} />
                  </div>
                </div>

                {healthLoading ? <Spinner /> : filteredHealth.length === 0 ? (
                  <Empty icon="health_and_safety" text="No health data available" />
                ) : (
                  <div className="overflow-x-auto -mx-6 -mb-6">
                    <table className="sa-table w-full">
                      <thead>
                        <tr>
                          <th>Business Name</th>
                          <th className="text-center">Health Score</th>
                          <th>Last Login</th>
                          <th className="text-center">Transactions (30d)</th>
                          <th className="text-center">Active Loans</th>
                          <th>Sub Status</th>
                          <th>Plan</th>
                          <th className="text-center">Days Until Expiry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHealth.map((row, i) => (
                          <tr key={i}>
                            <td className="font-medium text-neutral-800 dark:text-neutral-100">{row.business_name}</td>
                            <td className="text-center"><HealthBadge score={row.health_score} /></td>
                            <td className="text-neutral-500 dark:text-neutral-400 text-xs">{fmtDate(row.last_login)}</td>
                            <td className="text-center">{row.transactions_30d?.toLocaleString() ?? '—'}</td>
                            <td className="text-center">{row.active_loans?.toLocaleString() ?? '—'}</td>
                            <td>
                              <span className={[
                                'inline-flex px-2 py-0.5 rounded-sm text-xs font-semibold',
                                row.subscription_status === 'PAID'    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                row.subscription_status === 'OVERDUE' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                row.subscription_status === 'PENDING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400',
                              ].join(' ')}>
                                {row.subscription_status ?? '—'}
                              </span>
                            </td>
                            <td className="text-xs text-neutral-500 dark:text-neutral-400">{row.plan ?? '—'}</td>
                            <td className="text-center text-xs">{row.days_until_expiry ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/* Tab: Subscriptions                                          */}
          {/* ════════════════════════════════════════════════════════════ */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-6">
              {/* KPI cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    icon: 'payments',
                    bg: 'bg-primary',
                    color: 'text-white dark:text-neutral-900',
                    label: 'Current MRR',
                    value: subLoading ? '—' : fmtCurrency(subData?.mrr),
                  },
                  {
                    icon: 'trending_down',
                    bg: 'bg-red-500',
                    color: 'text-white',
                    label: 'Churn Rate',
                    value: subLoading ? '—' : (subData?.churn_rate != null ? `${Number(subData.churn_rate).toFixed(1)}%` : '—'),
                  },
                  {
                    icon: 'subscriptions',
                    bg: 'bg-violet-500',
                    color: 'text-white',
                    label: 'Active Subscriptions',
                    value: subLoading ? '—' : (subData?.active_subscriptions?.toLocaleString() ?? '—'),
                  },
                ].map(card => (
                  <div key={card.label} className="dashboard-card flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-sm ${card.bg} flex items-center justify-center flex-shrink-0`}>
                      <span className={`material-symbols-outlined ${card.color} text-[20px]`}>{card.icon}</span>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500">{card.label}</p>
                      <p className="text-xl font-bold text-neutral-900 dark:text-white">{card.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts + table */}
              <div className="dashboard-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Subscription Analytics</h2>
                    <p className="text-xs text-neutral-400 mt-0.5">MRR trend, plan distribution, and payment status breakdown</p>
                  </div>
                  <ExportButtons reportType="subscriptions" params={sharedParams} />
                </div>

                {subLoading ? <Spinner /> : !subData ? (
                  <Empty icon="subscriptions" text="No subscription data available" />
                ) : (
                  <div className="space-y-8">
                    {/* MRR Trend line chart */}
                    {Array.isArray(subData.mrr_trend) && subData.mrr_trend.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">MRR Trend</p>
                        <LineChart
                          xAxis={[{
                            data: subData.mrr_trend.map(p => p.month),
                            scaleType: 'band',
                            tickLabelStyle: { fontSize: 11 },
                          }]}
                          series={[{
                            data: subData.mrr_trend.map(p => p.mrr),
                            label: 'MRR',
                            color: '#A3E635',
                            showMark: true,
                          }]}
                          height={220}
                          margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Plan distribution pie chart */}
                      {Array.isArray(subData.plan_distribution) && subData.plan_distribution.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Plan Distribution</p>
                          <PieChart
                            series={[{
                              data: subData.plan_distribution.map((p, i) => ({
                                id: i,
                                value: p.count,
                                label: p.plan,
                              })),
                              innerRadius: 40,
                              outerRadius: 90,
                              paddingAngle: 2,
                              cornerRadius: 4,
                            }]}
                            height={200}
                          />
                        </div>
                      )}

                      {/* Payment status breakdown table */}
                      {Array.isArray(subData.payment_status_breakdown) && subData.payment_status_breakdown.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Payment Status Breakdown</p>
                          <table className="sa-table w-full">
                            <thead>
                              <tr>
                                <th>Status</th>
                                <th className="text-center">Count</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subData.payment_status_breakdown.map((row, i) => (
                                <tr key={i}>
                                  <td>
                                    <span className={[
                                      'inline-flex px-2 py-0.5 rounded-sm text-xs font-semibold',
                                      row.status === 'PAID'    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                      row.status === 'OVERDUE' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                      row.status === 'PENDING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                      'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400',
                                    ].join(' ')}>
                                      {row.status}
                                    </span>
                                  </td>
                                  <td className="text-center font-medium">{row.count?.toLocaleString() ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/* Tab: Pawn Volume                                            */}
          {/* ════════════════════════════════════════════════════════════ */}
          {activeTab === 'pawn_volume' && (
            <div className="space-y-6">
              {/* Period selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-neutral-500 whitespace-nowrap">Period</label>
                {[
                  { value: '7',   label: '7 days' },
                  { value: '30',  label: '30 days' },
                  { value: '90',  label: '90 days' },
                  { value: '365', label: '1 year' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPawnPeriod(opt.value)}
                    className={[
                      'px-3 py-1 rounded-sm text-xs font-medium transition-colors',
                      pawnPeriod === opt.value
                        ? 'bg-primary text-neutral-900'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { icon: 'receipt_long', bg: 'bg-primary',      color: 'text-white dark:text-neutral-900', label: 'Total Loans Issued',          value: pawnData?.total_loans?.toLocaleString() },
                  { icon: 'payments',     bg: 'bg-emerald-500',   color: 'text-white',                       label: 'Total Principal Disbursed',    value: fmtCurrency(pawnData?.total_principal) },
                  { icon: 'trending_up',  bg: 'bg-violet-500',    color: 'text-white',                       label: 'Total Interest Collected',     value: fmtCurrency(pawnData?.total_interest) },
                  { icon: 'inventory_2',  bg: 'bg-amber-500',     color: 'text-white',                       label: 'Total Items in Vault',         value: pawnData?.total_items?.toLocaleString() },
                  { icon: 'people',       bg: 'bg-sky-500',       color: 'text-white',                       label: 'Total Customers',              value: pawnData?.total_customers?.toLocaleString() },
                  { icon: 'calculate',    bg: 'bg-neutral-600',   color: 'text-white',                       label: 'Avg Loan Value',               value: fmtCurrency(pawnData?.avg_loan_value) },
                ].map(card => (
                  <div key={card.label} className="dashboard-card flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-sm ${card.bg} flex items-center justify-center flex-shrink-0`}>
                      <span className={`material-symbols-outlined ${card.color} text-[20px]`}>{card.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-neutral-500 truncate">{card.label}</p>
                      <p className="text-base font-bold text-neutral-900 dark:text-white truncate">
                        {pawnLoading ? '—' : (card.value ?? '—')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Trend chart card */}
              <div className="dashboard-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Pawn Volume Trend</h2>
                    <p className="text-xs text-neutral-400 mt-0.5">Loan volume over the selected period</p>
                  </div>
                  <ExportButtons reportType="pawn-volume" params={{ ...sharedParams, period: pawnPeriod }} />
                </div>

                {pawnLoading ? <Spinner /> : !pawnData ? (
                  <Empty icon="inventory_2" text="No pawn volume data available" />
                ) : Array.isArray(pawnData.trend) && pawnData.trend.length > 0 ? (
                  <LineChart
                    xAxis={[{
                      data: pawnData.trend.map(p => p.label ?? p.date ?? p.month ?? ''),
                      scaleType: 'band',
                      tickLabelStyle: { fontSize: 11 },
                    }]}
                    series={[{
                      data: pawnData.trend.map(p => p.loans ?? p.count ?? 0),
                      label: 'Loans',
                      color: '#A3E635',
                      showMark: true,
                    }]}
                    height={240}
                    margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
                  />
                ) : (
                  <Empty icon="show_chart" text="No trend data for this period" />
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/* Tab: Rankings                                               */}
          {/* ════════════════════════════════════════════════════════════ */}
          {activeTab === 'rankings' && (
            <div className="space-y-6">
              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Metric selector */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500 whitespace-nowrap">Metric</label>
                  <select
                    className="sa-filter-select"
                    value={rankMetric}
                    onChange={e => setRankMetric(e.target.value)}
                  >
                    <option value="revenue">Revenue</option>
                    <option value="loans">Loans</option>
                    <option value="customers">Customers</option>
                    <option value="transactions">Transactions</option>
                  </select>
                </div>

                {/* Period selector */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500 whitespace-nowrap">Period</label>
                  {[
                    { value: '7',   label: '7d' },
                    { value: '30',  label: '30d' },
                    { value: '90',  label: '90d' },
                    { value: '365', label: '1y' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setRankPeriod(opt.value)}
                      className={[
                        'px-3 py-1 rounded-sm text-xs font-medium transition-colors',
                        rankPeriod === opt.value
                          ? 'bg-primary text-neutral-900'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Limit selector */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500 whitespace-nowrap">Show</label>
                  <select
                    className="sa-filter-select"
                    value={rankLimit}
                    onChange={e => setRankLimit(e.target.value)}
                  >
                    <option value="10">Top 10</option>
                    <option value="25">Top 25</option>
                    <option value="50">Top 50</option>
                  </select>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Tenant Rankings</h2>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Ranked by <span className="capitalize">{rankMetric}</span> over the last {rankPeriod} days
                      {rankData?.platform_total != null && (
                        <> · Platform total: <span className="font-semibold text-neutral-600 dark:text-neutral-300">
                          {rankMetric === 'revenue' ? fmtCurrency(rankData.platform_total) : rankData.platform_total?.toLocaleString()}
                        </span></>
                      )}
                    </p>
                  </div>
                  <ExportButtons reportType="rankings" params={{ ...sharedParams, metric: rankMetric, period: rankPeriod, limit: rankLimit }} />
                </div>

                {rankLoading ? <Spinner /> : !rankData || !Array.isArray(rankData.rows) || rankData.rows.length === 0 ? (
                  <Empty icon="leaderboard" text="No rankings data available" />
                ) : (
                  <div className="overflow-x-auto -mx-6 -mb-6">
                    <table className="sa-table w-full">
                      <thead>
                        <tr>
                          <th className="text-center w-12">Rank</th>
                          <th>Business Name</th>
                          <th className="text-center">Branches</th>
                          <th className="text-right">Value</th>
                          <th className="text-right">% of Platform</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankData.rows.map((row, i) => {
                          const pct = row.pct_of_platform ?? (rankData.platform_total
                            ? ((row.value / rankData.platform_total) * 100)
                            : null)
                          return (
                            <tr key={i}>
                              <td className="text-center">
                                <span className={[
                                  'inline-flex w-6 h-6 items-center justify-center rounded-sm text-xs font-bold',
                                  i === 0 ? 'bg-amber-400 text-amber-900' :
                                  i === 1 ? 'bg-neutral-300 text-neutral-800 dark:bg-neutral-600 dark:text-neutral-200' :
                                  i === 2 ? 'bg-orange-300 text-orange-900' :
                                  'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
                                ].join(' ')}>
                                  {i + 1}
                                </span>
                              </td>
                              <td className="font-medium text-neutral-800 dark:text-neutral-100">{row.business_name}</td>
                              <td className="text-center text-neutral-500">{row.branches?.toLocaleString() ?? '—'}</td>
                              <td className="text-right font-semibold text-neutral-800 dark:text-neutral-100">
                                {rankMetric === 'revenue' ? fmtCurrency(row.value) : row.value?.toLocaleString() ?? '—'}
                              </td>
                              <td className="text-right">
                                {pct != null ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-20 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary rounded-full"
                                        style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-neutral-500 w-10 text-right">{pct.toFixed(1)}%</span>
                                  </div>
                                ) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default Reports
