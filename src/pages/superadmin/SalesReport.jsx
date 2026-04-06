import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart } from '@mui/x-charts/BarChart'
import { Sidebar, Header } from '../../components/layout'
import { StatsCard } from '../../components/ui'
import { superadminNavigation } from '../../config'
import { useAuth, useTheme } from '../../context'
import { tenantsApi } from '../../lib/api'

// ── Mock Data ─────────────────────────────────────────────────────────────────
const USE_MOCK = false
const mockKpis = {
  total_platform_revenue: 15800,
  total_transaction_volume: 2450000,
  avg_revenue_per_tenant: 790,
  top_performing_tenant: 'Gold Palace Pawnshop',
}
const mockTopTenants = [
  { tenant_name: 'Gold Palace Pawnshop', plan: 'enterprise', transaction_count: 245, transaction_volume: 850000, subscription_amount: 199 },
  { tenant_name: 'Silver Star Lending', plan: 'professional', transaction_count: 189, transaction_volume: 620000, subscription_amount: 79 },
  { tenant_name: 'Diamond Trust Pawn', plan: 'professional', transaction_count: 156, transaction_volume: 480000, subscription_amount: 79 },
]

// ── Plan Badge (inline) ───────────────────────────────────────────────────────
const PlanBadge = ({ plan }) => {
  const styles = {
    basic: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
    professional: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    enterprise: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  }
  const key = (plan || 'basic').toLowerCase()
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide ${styles[key] || styles.basic}`}>
      {plan}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
const SalesReport = () => {
  const [currentPath, setCurrentPath] = useState('/superadmin/sales')
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
  const [period, setPeriod] = useState('monthly')
  const [kpis, setKpis] = useState({
    total_platform_revenue: 0,
    total_transaction_volume: 0,
    avg_revenue_per_tenant: 0,
    top_performing_tenant: '—',
  })
  const [topTenants, setTopTenants] = useState([])
  const [recentTransactions, setRecentTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const { profile } = useAuth()

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'Super Admin',
    role: 'Super Admin',
    initials: (profile?.full_name || 'SA').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  }), [profile])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      if (USE_MOCK) {
        setKpis(mockKpis)
        setTopTenants(mockTopTenants)
        setRecentTransactions([])
        return
      }
      const res = await tenantsApi.sales({ period })
      setKpis(res.kpis || mockKpis)
      setTopTenants(res.top_tenants || [])
      setRecentTransactions(res.recent_transactions || [])
    } catch (err) {
      console.error('SalesReport fetch error:', err)
      setKpis(mockKpis)
      setTopTenants(mockTopTenants)
      setRecentTransactions([])
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])

  const navigateTo = (path) => {
    setCurrentPath(path)
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const statsCards = [
    {
      icon: 'payments',
      iconBg: 'bg-primary',
      iconColor: 'text-white dark:text-neutral-900',
      label: 'Total Platform Revenue',
      value: `₱${Number(kpis.total_platform_revenue).toLocaleString()}`,
      badge: '',
      badgeType: 'neutral',
    },
    {
      icon: 'swap_horiz',
      iconBg: 'bg-blue-500',
      iconColor: 'text-white',
      label: 'Total Transaction Volume',
      value: `₱${Number(kpis.total_transaction_volume).toLocaleString()}`,
      badge: '',
      badgeType: 'neutral',
    },
    {
      icon: 'analytics',
      iconBg: 'bg-violet-500',
      iconColor: 'text-white',
      label: 'Avg Revenue / Tenant',
      value: `₱${Number(kpis.avg_revenue_per_tenant).toLocaleString()}`,
      badge: '',
      badgeType: 'neutral',
    },
    {
      icon: 'emoji_events',
      iconBg: 'bg-amber-500',
      iconColor: 'text-white',
      label: 'Top Tenant',
      value: kpis.top_performing_tenant || '—',
      badge: '',
      badgeType: 'neutral',
    },
  ]

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

          {/* ── Header ─────────────────────────────────────── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Platform Admin</p>
              <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Sales Report</h1>
              <p className="text-sm text-neutral-500 mt-1">Revenue, transaction volume, and top-performing tenants.</p>
            </div>
            <button onClick={fetchData} className="header-icon-btn self-start" title="Refresh">
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
          </div>

          {/* ── Period Toggle ────────────────────────────────── */}
          <div className="sa-period-toggle mb-6">
            {['daily', 'weekly', 'monthly'].map(p => (
              <button
                key={p}
                className={`sa-period-btn ${period === p ? 'sa-period-btn-active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* ── KPI Cards ────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statsCards.map(s => <StatsCard key={s.label} {...s} />)}
          </div>

          {/* ── Revenue by Tenant Chart ──────────────────────── */}
          <div className="sa-chart-card mb-8" style={{ padding: '20px' }}>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Revenue by Tenant</h3>
            {loading ? (
              <div className="h-[300px] flex items-center justify-center">
                <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
              </div>
            ) : topTenants.length > 0 ? (
              <BarChart
                height={300}
                series={[
                  { data: topTenants.map(t => t.subscription_amount), label: 'Subscription (₱)', color: '#A3E635' },
                  { data: topTenants.map(t => t.transaction_volume), label: 'Tx Volume (₱)', color: '#3B82F6' },
                ]}
                xAxis={[{ data: topTenants.map(t => t.tenant_name.slice(0, 12)), scaleType: 'band', tickLabelStyle: { fill: textColor, fontSize: 11 } }]}
                yAxis={[{ tickLabelStyle: { fill: textColor, fontSize: 11 } }]}
                sx={chartSx}
                slotProps={{ legend: { labelStyle: { fill: textColor, fontSize: 12 } } }}
              />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-neutral-400">No data</div>
            )}
          </div>

          {/* ── Top Performing Tenants Table ─────────────────── */}
          <div className="dashboard-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Top Performing Tenants</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Ranked by transaction volume for the selected period</p>
              </div>
            </div>

            {loading ? (
              <div className="py-14 text-center">
                <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                <p className="mt-3 text-sm text-neutral-400">Loading...</p>
              </div>
            ) : topTenants.length === 0 ? (
              <div className="py-14 text-center">
                <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-700">bar_chart</span>
                <p className="mt-3 text-sm text-neutral-500">No sales data available</p>
                <p className="mt-1 text-xs text-neutral-400">Try selecting a different period.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 -mb-6">
                <table className="sa-table w-full">
                  <thead>
                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                      {['#', 'Tenant Name', 'Plan', 'Transactions', 'Volume (₱)', 'Subscription (₱)'].map(h => (
                        <th key={h} className="table-th text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {topTenants.map((tenant, idx) => (
                      <tr key={tenant.tenant_name} className="loan-row">
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold
                            ${idx === 0 ? 'bg-amber-400/20 text-amber-600 dark:text-amber-400' : ''}
                            ${idx === 1 ? 'bg-neutral-200/60 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400' : ''}
                            ${idx === 2 ? 'bg-orange-400/10 text-orange-500' : ''}
                            ${idx > 2 ? 'text-neutral-400' : ''}
                          `}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-sm flex-shrink-0 bg-primary/10 flex items-center justify-center">
                              <span className="text-[11px] font-bold text-primary">
                                {tenant.tenant_name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-neutral-800 dark:text-white">{tenant.tenant_name}</p>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <PlanBadge plan={tenant.plan} />
                        </td>
                        <td className="px-5 py-3.5 text-center text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          {Number(tenant.transaction_count).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-center text-sm font-semibold text-neutral-800 dark:text-white">
                          ₱{Number(tenant.transaction_volume).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-center text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          ₱{Number(tenant.subscription_amount).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Transaction History Summary ──────────────────── */}
          <div className="dashboard-card mt-8">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Transaction History</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Most recent platform-wide transactions</p>
              </div>
            </div>

            {loading ? (
              <div className="py-14 text-center">
                <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                <p className="mt-3 text-sm text-neutral-400">Loading...</p>
              </div>
            ) : recentTransactions.length === 0 ? (
              <div className="py-14 text-center">
                <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-700">receipt_long</span>
                <p className="mt-3 text-sm text-neutral-500">No transactions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 -mb-6">
                <table className="sa-table w-full">
                  <thead>
                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                      {['Tenant', 'Type', 'Amount (₱)', 'Date'].map(h => (
                        <th key={h} className="table-th text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {recentTransactions.map(tx => (
                      <tr key={tx.id} className="loan-row">
                        <td className="px-5 py-3.5 text-sm font-medium text-neutral-800 dark:text-white">{tx.tenant_name}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center text-sm font-semibold text-neutral-800 dark:text-white">
                          ₱{Number(tx.amount).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-center text-sm text-neutral-500 dark:text-neutral-400">
                          {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
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

export default SalesReport
