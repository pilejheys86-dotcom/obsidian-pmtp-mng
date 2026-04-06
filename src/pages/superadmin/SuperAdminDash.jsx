import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart } from '@mui/x-charts/BarChart'
import { LineChart } from '@mui/x-charts/LineChart'
import { Sidebar, Header } from '../../components/layout'
import { StatsCard, StatusBadge } from '../../components/ui'
import { superadminNavigation } from '../../config'
import { useAuth, useTheme } from '../../context'
import { tenantsApi } from '../../lib/api'

// ── Plan Badge (inline) ──────────────────────────────────────────────────────
const PlanBadge = ({ plan }) => {
  const styles = {
    basic: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
    professional: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    enterprise: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  }
  const labels = { basic: 'Basic', professional: 'Pro', enterprise: 'Enterprise' }
  const key = (plan || 'basic').toLowerCase()
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide ${styles[key] || styles.basic}`}>
      {labels[key] || plan}
    </span>
  )
}

// ── Recent Tenant Row ────────────────────────────────────────────────────────
const RecentRow = ({ tenant, onNavigateToTenants }) => {
  const s = {
    active:  { label: 'Active',  type: 'success' },
    blocked: { label: 'Blocked', type: 'destructive' },
    trial:   { label: 'Trial',   type: 'warning' },
    expired: { label: 'Expired', type: 'neutral' },
  }[tenant.status] || { label: tenant.status, type: 'neutral' }

  return (
    <tr className="loan-row">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-sm flex-shrink-0 bg-primary/10 flex items-center justify-center">
            <span className="text-[11px] font-bold text-primary">{tenant.initials}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-800 dark:text-white">{tenant.business_name}</p>
            <p className="text-xs text-neutral-400">{tenant.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5 text-center">
        <PlanBadge plan={(tenant.subscription?.plan || tenant.plan || 'basic').toLowerCase()} />
      </td>
      <td className="px-5 py-3.5 text-center">
        <StatusBadge status={s.label} type={s.type} />
      </td>
      <td className="px-5 py-3.5 text-center text-xs text-neutral-500 dark:text-neutral-400">
        {tenant.created_at
          ? new Date(tenant.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—'}
      </td>
      <td className="px-5 py-3.5 text-center">
        <button
          onClick={onNavigateToTenants}
          className="text-neutral-400 hover:text-primary transition-colors"
          title="Manage in Tenants"
        >
          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
        </button>
      </td>
    </tr>
  )
}

// ── Main Dashboard Component ─────────────────────────────────────────────────
const SuperAdminDash = () => {
  const [currentPath, setCurrentPath] = useState('/superadmin')
  const [stats, setStats] = useState({ total: 0, active: 0, blocked: 0, expiringSoon: 0, totalRevenue: 0, activeUsers: 0, inactiveUsers: 0 })
  const [recentTenants, setRecentTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState({ userGrowth: [], tenantActivity: [], revenueTrend: [] })
  const period = 'monthly'
  const [chartPeriod, setChartPeriod] = useState('year') // 'today' | 'week' | 'month' | 'year' | 'custom'
  const [chartFrom, setChartFrom] = useState('')
  const [chartTo, setChartTo] = useState('')
  const [chartLoading, setChartLoading] = useState(false)
  const { isDarkMode } = useTheme()
  const textColor = isDarkMode ? '#94a3b8' : '#64748b'
  const gridColor = isDarkMode ? '#1e293b' : '#f1f5f9'
  const chartSx = {
    '& .MuiChartsGrid-line': { stroke: gridColor },
    '& .MuiChartsAxis-line': { stroke: gridColor },
    '& .MuiChartsAxis-tick': { stroke: gridColor },
    '& .MuiChartsAxis-tickLabel tspan': { fill: textColor },
    '& .MuiChartsLegend-label': { fill: `${textColor} !important` },
    '& text': { fill: textColor },
  }

  const { profile } = useAuth()

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'Super Admin',
    role: 'Super Admin',
    initials: (profile?.full_name || 'SA').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  }), [profile])

  const statsCards = [
    { icon: 'domain', iconBg: 'bg-primary', iconColor: 'text-white dark:text-neutral-900', label: 'Total Tenants', value: `${stats.total}`, badge: '', badgeType: 'neutral' },
    { icon: 'group', iconBg: 'bg-emerald-500', iconColor: 'text-white', label: 'Active Users', value: `${stats.activeUsers || 0}`, badge: '', badgeType: 'success' },
    { icon: 'person_off', iconBg: 'bg-amber-500', iconColor: 'text-white', label: 'Inactive Users', value: `${stats.inactiveUsers || 0}`, badge: '', badgeType: 'warning' },
    { icon: 'payments', iconBg: 'bg-blue-500', iconColor: 'text-white', label: 'Total Revenue', value: stats.totalRevenue ? `₱${Number(stats.totalRevenue).toLocaleString()}` : '—', badge: '', badgeType: 'neutral' },
  ]

  const getChartDateRange = useCallback(() => {
    const now = new Date()
    let from = '', to = ''
    switch (chartPeriod) {
      case 'today': {
        const d = now.toISOString().slice(0, 10)
        from = d; to = d; break
      }
      case 'week': {
        const weekAgo = new Date(now)
        weekAgo.setDate(weekAgo.getDate() - 7)
        from = weekAgo.toISOString().slice(0, 10)
        to = now.toISOString().slice(0, 10)
        break
      }
      case 'month': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        from = monthStart.toISOString().slice(0, 10)
        to = now.toISOString().slice(0, 10)
        break
      }
      case 'year': {
        // Default — last 12 months (no filter params, backend defaults)
        break
      }
      case 'custom': {
        from = chartFrom; to = chartTo; break
      }
    }
    return { from, to }
  }, [chartPeriod, chartFrom, chartTo])

  const fetchCharts = useCallback(async () => {
    setChartLoading(true)
    try {
      const { from, to } = getChartDateRange()
      const params = {}
      if (from) params.from = from
      if (to) params.to = to

      const [growthRes, activityRes, revenueRes] = await Promise.allSettled([
        tenantsApi.analytics({ type: 'user_growth', period, ...params }),
        tenantsApi.analytics({ type: 'tenant_activity', period, ...params }),
        tenantsApi.analytics({ type: 'revenue_trend', period, ...params }),
      ])
      setChartData({
        userGrowth: growthRes.status === 'fulfilled' ? (growthRes.value.data || []) : [],
        tenantActivity: activityRes.status === 'fulfilled' ? (activityRes.value.data || []) : [],
        revenueTrend: revenueRes.status === 'fulfilled' ? (revenueRes.value.data || []) : [],
      })
    } catch (err) {
      console.error('Chart fetch error:', err)
    } finally {
      setChartLoading(false)
    }
  }, [getChartDateRange, period])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, listRes] = await Promise.allSettled([
        tenantsApi.stats(),
        tenantsApi.list({ limit: 5, sort: 'newest' }),
      ])

      if (statsRes.status === 'fulfilled') setStats(statsRes.value)

      if (listRes.status === 'fulfilled') {
        const mapped = (listRes.value.data || []).map(t => ({
          ...t,
          initials: (t.business_name || '?').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase(),
        }))
        setRecentTenants(mapped)
      } else {
        console.error('Tenants list fetch failed:', listRes.reason)
      }
    } catch (err) {
      console.error('SuperAdmin dash fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(); fetchCharts() }, [])
  useEffect(() => { fetchCharts() }, [chartPeriod, chartFrom, chartTo])

  const navigateTo = (path) => {
    setCurrentPath(path)
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
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
              <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Overview</h1>
              <p className="text-sm text-neutral-500 mt-1">Platform health and tenant summary.</p>
            </div>
            <button onClick={fetchData} className="header-icon-btn self-start" title="Refresh">
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
          </div>

          {/* ── Stats ────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statsCards.map(s => <StatsCard key={s.label} {...s} />)}
          </div>

          {/* ── Chart Time Filter ────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mr-2">Charts Period</p>
            <div className="sa-period-toggle">
              {[
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'This Week' },
                { key: 'month', label: 'This Month' },
                { key: 'year', label: 'This Year' },
                { key: 'custom', label: 'Custom' },
              ].map(p => (
                <button
                  key={p.key}
                  onClick={() => setChartPeriod(p.key)}
                  className={`sa-period-btn ${chartPeriod === p.key ? 'sa-period-btn-active' : ''}`}
                >{p.label}</button>
              ))}
            </div>
            {chartPeriod === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={chartFrom} onChange={e => setChartFrom(e.target.value)} className="sa-filter-input" />
                <span className="text-xs text-neutral-400">to</span>
                <input type="date" value={chartTo} onChange={e => setChartTo(e.target.value)} className="sa-filter-input" />
              </div>
            )}
            {chartLoading && (
              <span className="material-symbols-outlined animate-spin text-primary text-lg ml-2">progress_activity</span>
            )}
          </div>

          {/* ── Charts ──────────────────────────────────── */}
          <div className="sa-chart-grid">
            <div className="sa-chart-card">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">User Growth</h3>
              {chartData.userGrowth.length > 0 ? (
                <LineChart
                  height={250}
                  series={[{ data: chartData.userGrowth.map(d => d.count), label: 'New Users', color: '#A3E635' }]}
                  xAxis={[{ data: chartData.userGrowth.map(d => d.month), scaleType: 'point', tickLabelStyle: { fill: textColor, fontSize: 11 } }]}
                  yAxis={[{ tickLabelStyle: { fill: textColor, fontSize: 11 } }]}
                  sx={chartSx}
                  slotProps={{ legend: { labelStyle: { fill: textColor, fontSize: 12 } } }}
                />
              ) : (
                <div className="h-[250px] flex items-center justify-center text-sm text-neutral-400">No data</div>
              )}
            </div>

            <div className="sa-chart-card">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Tenant Activity</h3>
              {chartData.tenantActivity.length > 0 ? (
                <BarChart
                  height={250}
                  series={[{ data: chartData.tenantActivity.map(d => d.transaction_count), label: 'Transactions', color: '#A3E635' }]}
                  xAxis={[{ data: chartData.tenantActivity.map(d => d.tenant_name.slice(0, 12)), scaleType: 'band', tickLabelStyle: { fill: textColor, fontSize: 11 } }]}
                  yAxis={[{ tickLabelStyle: { fill: textColor, fontSize: 11 } }]}
                  sx={chartSx}
                  slotProps={{ legend: { labelStyle: { fill: textColor, fontSize: 12 } } }}
                />
              ) : (
                <div className="h-[250px] flex items-center justify-center text-sm text-neutral-400">No data</div>
              )}
            </div>

            <div className="sa-chart-card">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Revenue Trend</h3>
              {chartData.revenueTrend.length > 0 ? (
                <LineChart
                  height={250}
                  series={[{ data: chartData.revenueTrend.map(d => d.revenue), label: 'Revenue (₱)', color: '#3B82F6', area: true }]}
                  xAxis={[{ data: chartData.revenueTrend.map(d => d.month), scaleType: 'point', tickLabelStyle: { fill: textColor, fontSize: 11 } }]}
                  yAxis={[{ tickLabelStyle: { fill: textColor, fontSize: 11 } }]}
                  sx={chartSx}
                  slotProps={{ legend: { labelStyle: { fill: textColor, fontSize: 12 } } }}
                />
              ) : (
                <div className="h-[250px] flex items-center justify-center text-sm text-neutral-400">No data</div>
              )}
            </div>
          </div>

          {/* ── Alert Strip (expiring soon) ───────────────── */}
          {stats.expiringSoon > 0 && (
            <div className="flex items-center gap-3 p-4 mb-6 rounded-sm bg-amber-500/5 border border-amber-500/20">
              <span className="material-symbols-outlined text-amber-500 flex-shrink-0">schedule</span>
              <p className="text-sm text-amber-600 dark:text-amber-400 flex-1">
                <strong>{stats.expiringSoon} tenant{stats.expiringSoon !== 1 ? 's' : ''}</strong> have subscriptions expiring within the next 7 days.
              </p>
              <button
                onClick={() => navigateTo('/superadmin/tenants')}
                className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap"
              >
                View all →
              </button>
            </div>
          )}

          {/* ── Recent Tenants Table ──────────────────────── */}
          <div className="dashboard-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Recent Tenants</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Latest signups on the platform</p>
              </div>
              <button
                onClick={() => navigateTo('/superadmin/tenants')}
                className="text-xs font-bold text-primary hover:text-primary-hover transition-colors flex items-center gap-1"
              >
                View all
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>

            {loading ? (
              <div className="py-14 text-center">
                <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                <p className="mt-3 text-sm text-neutral-400">Loading...</p>
              </div>
            ) : recentTenants.length === 0 ? (
              <div className="py-14 text-center">
                <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-700">domain_disabled</span>
                <p className="mt-3 text-sm text-neutral-500">No tenants yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 -mb-6">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                      {['Business', 'Plan', 'Status', 'Joined', ''].map(h => (
                        <th key={h} className="table-th text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {recentTenants.map(t => (
                      <RecentRow
                        key={t.id}
                        tenant={t}
                        onNavigateToTenants={() => navigateTo('/superadmin/tenants')}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}

export default SuperAdminDash
