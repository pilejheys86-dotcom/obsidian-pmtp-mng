import { useState, useEffect } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useTheme } from '../../context';
import { useAuth } from '../../context';
import { dashboardApi, brandingApi } from '../../lib/api';

// Stats Card Component
const StatsCard = ({ icon, iconBg, iconColor, badge, badgeType, label, value }) => {
  const isPositive = badgeType === 'success';
  const isWarning = badgeType === 'warning';

  return (
    <div className="kpi-card">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`kpi-icon ${iconBg}`}>
            <span className={`material-symbols-outlined text-xl ${iconColor}`}>{icon}</span>
          </div>
          <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{label}</span>
        </div>
        <button className="p-1 rounded-sm hover:bg-neutral-200/50 dark:hover:bg-neutral-600/50 text-neutral-400 dark:text-neutral-500 transition-colors">
          <span className="material-symbols-outlined text-lg">more_vert</span>
        </button>
      </div>

      {/* Value */}
      <h3 className="kpi-value">{value}</h3>

      {/* Badge Row */}
      <div className="flex items-center gap-2 mt-3">
        <span className={`kpi-badge ${isPositive ? 'kpi-badge-success' : isWarning ? 'kpi-badge-warning' : 'kpi-badge-neutral'}`}>
          {isPositive && <span className="material-symbols-outlined text-xs">trending_up</span>}
          {isWarning && <span className="material-symbols-outlined text-xs">trending_down</span>}
          {badge}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">from last month</span>
      </div>
    </div>
  );
};

// Workflow / Portfolio Donut Chart Component
const WorkflowDonutChart = ({ portfolio = {} }) => {
  const { isDarkMode } = useTheme();

  const total = Object.values(portfolio).reduce((s, v) => s + v, 0) || 1;
  const redeemedPct = ((portfolio.REDEEMED || 0) / total * 100).toFixed(1);

  const donutData = [
    { id: 0, value: portfolio.REDEEMED || 0, label: 'Redeemed',  color: '#f97316' },
    { id: 1, value: portfolio.ACTIVE || 0, label: 'Active',    color: '#fdba74' },
    { id: 2, value: portfolio.FORFEITED || 0,  label: 'Forfeited', color: isDarkMode ? '#475569' : '#cbd5e1' },
    { id: 3, value: (portfolio.EXPIRED || 0) + (portfolio.RENEWED || 0),  label: 'Other',   color: isDarkMode ? '#1e293b' : '#e2e8f0' },
  ];

  return (
    <div className="dashboard-card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Portfolio Status</h3>
        <button className="p-1.5 rounded-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors">
          <span className="material-symbols-outlined text-[18px]">open_in_full</span>
        </button>
      </div>

      {/* Donut Chart  */}
      <div className="relative w-[200px] h-[200px] mx-auto flex-shrink-0">
        <PieChart
          series={[{
            data: donutData,
            innerRadius: 62,
            outerRadius: 90,
            paddingAngle: 3,
            cornerRadius: 5,
            startAngle: -90,
            endAngle: 270,
          }]}
          width={200}
          height={200}
          margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
          slotProps={{ legend: { hidden: true } }}
          sx={{
            '& .MuiChartsLegend-root': { display: 'none !important' },
            '& .MuiChartsTooltip-root': {
              backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
              borderColor: isDarkMode ? '#334155' : '#e2e8f0',
              borderRadius: '8px',
              color: isDarkMode ? '#f1f5f9' : '#0f172a',
            },
          }}
        />
        {/* Centred label  */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100 leading-none">{redeemedPct}%</span>
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mt-0.5">Redeemed</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {donutData.map((item) => (
          <div key={item.id} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Bottom stats */}
      <div className="border-t border-neutral-100 dark:border-neutral-700 pt-4">
        <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Active Loans</p>
        <p className="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100 mt-1">{(portfolio.ACTIVE || 0).toLocaleString()}</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">Total tickets: {total.toLocaleString()}</p>
        <div className="mt-3 h-1.5 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${redeemedPct}%` }} />
        </div>
      </div>
    </div>
  );
};

// Recent Activities Table Component
const RecentActivities = ({ activities = [] }) => {
  const [search, setSearch]   = useState('');

  const statusClasses = {
    success: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30',
    warning: 'text-amber-600  bg-amber-50  dark:bg-amber-900/30',
    info:    'text-blue-600   bg-blue-50   dark:bg-blue-900/30',
  };

  const statusTypeMap = {
    ACTIVE: 'info', REDEEMED: 'success', RENEWED: 'info',
    EXPIRED: 'warning', FORFEITED: 'warning',
    DISBURSEMENT: 'info', RENEWAL: 'info', REDEMPTION: 'success', AUCTION_SALE: 'success',
  };

  const formatStatus = (status) => status.replace(/_/g, ' ');

  // Transform API data to display format
  const rows = activities.map(a => ({
    id: a.receipt_number || a.id,
    date: new Date(a.trans_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
    item: a.pawn_tickets?.pawn_items?.general_desc || '—',
    category: a.pawn_tickets?.pawn_items?.category || '—',
    status: a.trans_type,
    statusType: statusTypeMap[a.trans_type] || 'info',
    customer: a.pawn_tickets?.customers
      ? `${a.pawn_tickets.customers.first_name} ${a.pawn_tickets.customers.last_name.charAt(0)}.`
      : '—',
    amount: `₱${(Number(a.principal_paid) + Number(a.interest_paid) + Number(a.penalty_paid)).toLocaleString()}`,
  }));

  const filtered = rows.filter(
    (a) =>
      a.item.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 5);

  return (
    <div className="dashboard-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Recent Activities</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[18px]">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-9 pr-4 py-2 text-sm bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-sm text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary w-44"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 dark:border-neutral-700">
              {['Item ID', 'Date', 'Item Name', 'Category', 'Status', 'Customer', 'Amount'].map((h) => (
                <th key={h} className="pb-3 pr-4 text-left text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50 dark:divide-neutral-700/50">
            {filtered.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors group"
              >
                <td className="py-3.5 pr-4 font-semibold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">{row.id}</td>
                <td className="py-3.5 pr-4 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{row.date}</td>
                <td className="py-3.5 pr-4 font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{row.item}</td>
                <td className="py-3.5 pr-4 text-neutral-500 dark:text-neutral-400">{row.category}</td>
                <td className="py-3.5 pr-4">
                  <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${statusClasses[row.statusType]}`}>
                    {formatStatus(row.status)}
                  </span>
                </td>
                <td className="py-3.5 pr-4 text-neutral-600 dark:text-neutral-300">{row.customer}</td>
                <td className="py-3.5">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">{row.amount}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400">
                      <span className="material-symbols-outlined text-[16px]">expand_more</span>
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Loan Activity Bar Chart Component
const LoanActivityChart = ({ chartData = [] }) => {
  const { isDarkMode } = useTheme();

  const textColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#1e293b' : '#f1f5f9';

  const chartDays = chartData.map(d => d.day);
  const chartValues = chartData.map(d => d.amount);

  return (
    <div className="lg:col-span-2 dashboard-card flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Loan Activity</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Overview of loan issuance over the last 7 days
          </p>
        </div>
        <select className="chart-select">
          <option>Last 7 Days</option>
          <option>Last 30 Days</option>
          <option>This Year</option>
        </select>
      </div>
      <div className="w-full" style={{ height: 340 }}>
        <BarChart
          xAxis={[{
            scaleType: 'band',
            data: chartDays,
            tickLabelStyle: { fill: textColor, fontSize: 12, fontFamily: 'inherit' },
            disableLine: true,
            disableTicks: true,
          }]}
          yAxis={[{
            tickLabelStyle: { fill: textColor, fontSize: 12, fontFamily: 'inherit' },
            disableLine: true,
            disableTicks: true,
            valueFormatter: (v) => `₱${(v / 1000).toFixed(0)}k`,
          }]}
          series={[{
            data: chartValues,
            color: '#525252',
            label: 'Loan Value',
            valueFormatter: (v) => `₱${v.toLocaleString()}`,
          }]}
          grid={{ horizontal: true }}
          borderRadius={6}
          width={undefined}
          height={340}
          margin={{ top: 8, right: 8, bottom: 32, left: 52 }}
          slotProps={{ legend: { hidden: true } }}
          sx={{
            width: '100%',
            '& .MuiChartsLegend-root': { display: 'none' },
            '& .MuiChartsGrid-line': { stroke: gridColor },
            '& .MuiChartsAxis-root .MuiChartsAxis-line': { display: 'none' },
            '& .MuiChartsTooltip-root': {
              backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
              borderColor: isDarkMode ? '#334155' : '#e2e8f0',
              color: isDarkMode ? '#f1f5f9' : '#0f172a',
              borderRadius: '8px',
            },
          }}
        />
      </div>
    </div>
  );
};

const AdminDash = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState('/admin');
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNudge, setShowNudge] = useState(false);
  const { profile, session } = useAuth();
  const navigation = getNavigationByRole(profile?.role);

  const currentUser = {
    name: profile?.full_name || 'User',
    role: profile?.role || 'Admin',
    initials: (profile?.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2),
  };

  useEffect(() => {
    if (!session) return;
    dashboardApi.getStats()
      .then(data => setDashData(data))
      .catch(err => console.error('Dashboard fetch error:', err))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    const dismissed = localStorage.getItem('branding_nudge_dismissed');
    if (dismissed) return;
    brandingApi.get()
        .then(data => { if (!data?.is_published) setShowNudge(true); })
        .catch(() => {});
  }, []);

  const stats = dashData?.stats || {};
  const role = profile?.role;

  // ── Role-based KPI definitions ──────────────────────────
  const allKpis = {
    activeLoans: {
      icon: 'monetization_on', iconBg: 'bg-primary', iconColor: 'text-white dark:text-neutral-900',
      badge: `${stats.activeLoansCount || 0}`, badgeType: 'success',
      label: 'Total Active Loans',
      value: `₱${(stats.totalActiveLoanValue || 0).toLocaleString()}`,
    },
    inventoryValue: {
      icon: 'inventory_2', iconBg: 'bg-blue-500', iconColor: 'text-white',
      badge: '', badgeType: 'success',
      label: 'Inventory Value',
      value: `₱${(stats.inventoryValue || 0).toLocaleString()}`,
    },
    newCustomers: {
      icon: 'person_add', iconBg: 'bg-purple-500', iconColor: 'text-white',
      badge: '', badgeType: 'success',
      label: 'New Customers',
      value: `${stats.newCustomers || 0}`,
    },
    pendingAppraisals: {
      icon: 'assignment_late', iconBg: 'bg-orange-500', iconColor: 'text-white',
      badge: '', badgeType: 'warning',
      label: 'Pending Appraisals',
      value: `${stats.pendingAppraisals || 0}`,
    },
    revenueToday: {
      icon: 'payments', iconBg: 'bg-emerald-500', iconColor: 'text-white',
      badge: '', badgeType: 'success',
      label: 'Revenue Today',
      value: `₱${(stats.revenueToday || 0).toLocaleString()}`,
    },
    overdueItems: {
      icon: 'schedule', iconBg: 'bg-red-500', iconColor: 'text-white',
      badge: '', badgeType: 'warning',
      label: 'Overdue Items',
      value: `${stats.overdueItems || 0}`,
    },
    appraisalsCompleted: {
      icon: 'verified', iconBg: 'bg-emerald-500', iconColor: 'text-white',
      badge: '', badgeType: 'success',
      label: 'Appraisals Completed',
      value: `${stats.appraisalsCompleted || 0}`,
    },
    pendingAudits: {
      icon: 'fact_check', iconBg: 'bg-amber-500', iconColor: 'text-white',
      badge: '', badgeType: 'warning',
      label: 'Pending Audits',
      value: `${stats.pendingAudits || 0}`,
    },
    transactionsToday: {
      icon: 'receipt_long', iconBg: 'bg-blue-500', iconColor: 'text-white',
      badge: '', badgeType: 'success',
      label: 'Transactions Today',
      value: `${stats.transactionsToday || 0}`,
    },
    paymentsCollected: {
      icon: 'account_balance_wallet', iconBg: 'bg-primary', iconColor: 'text-white dark:text-neutral-900',
      badge: '', badgeType: 'success',
      label: 'Payments Collected',
      value: `₱${(stats.paymentsCollected || 0).toLocaleString()}`,
    },
  };

  // ── Role → KPI mapping ──────────────────────────────────
  const roleKpiKeys = {
    OWNER:     ['activeLoans', 'inventoryValue', 'newCustomers', 'pendingAppraisals'],
    ADMIN:     ['activeLoans', 'inventoryValue', 'newCustomers', 'pendingAppraisals'],
    MANAGER:   ['activeLoans', 'inventoryValue', 'pendingAppraisals', 'overdueItems'],
    APPRAISER: ['pendingAppraisals', 'appraisalsCompleted', 'activeLoans', 'inventoryValue'],
    AUDITOR:   ['activeLoans', 'overdueItems', 'inventoryValue', 'pendingAudits'],
    CASHIER:   ['activeLoans', 'transactionsToday', 'paymentsCollected', 'revenueToday'],
  };

  // ── Role → Section visibility ───────────────────────────
  const roleSections = {
    OWNER:     { loanChart: true, portfolio: true, activities: true },
    ADMIN:     { loanChart: true, portfolio: true, activities: true },
    MANAGER:   { loanChart: true, portfolio: true, activities: true },
    APPRAISER: { loanChart: false, portfolio: false, activities: false },
    AUDITOR:   { loanChart: false, portfolio: true, activities: false },
    CASHIER:   { loanChart: false, portfolio: false, activities: true },
  };

  const kpiKeys = roleKpiKeys[role] || roleKpiKeys.OWNER;
  const statsData = kpiKeys.map(k => allKpis[k]);
  const sections = roleSections[role] || roleSections.OWNER;

  const navigate = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

  const handleNavigate = (path, item) => {
    console.log('Navigating to:', path, item);
    setCurrentPath(path);
    // In real app: use router navigation
    // navigate(path);
  };

  return (
    <div className="admin-layout">
      {/* Reusable Sidebar */}
      <Sidebar
        navigation={navigation}
        currentPath={currentPath}
        onNavigate={handleNavigate}
      />

      {/* Main Content */}
      <main className="admin-main">
        <Header user={currentUser} />
        {/* Dashboard Content */}
        <div className="admin-content custom-scrollbar">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
              Overview Dashboard
            </h1>
            <div className="flex items-center gap-6">
              {/* Search */}
              <div className="relative hidden md:block">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xl">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="header-search"
                  placeholder="Search loans, items..."
                />
              </div>
              {/* Notifications */}
              <button className="header-icon-btn">
                <span className="material-symbols-outlined">notifications</span>
                <span className="notification-dot" />
              </button>
            </div>
          </div>

          {/* Branding setup nudge */}
          {showNudge && (
            <div className="mb-6 flex items-center justify-between gap-4 p-4 rounded-sm bg-orange-500/10 border border-orange-500/20">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-orange-500 text-xl">web</span>
                <div>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">Your public page isn't set up yet</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Complete your branding to go live and attract customers.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => navigate('/admin/branding/setup')} className="text-xs px-4 py-2 rounded-sm font-bold bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                  Set Up Now
                </button>
                <button onClick={() => { setShowNudge(false); localStorage.setItem('branding_nudge_dismissed', '1'); }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsData.map((stat, index) => (
              <StatsCard key={index} {...stat} />
            ))}
          </div>

          {/* Charts Row: conditionally rendered based on role */}
          {(sections.loanChart || sections.portfolio) && (
            <div className={`grid grid-cols-1 ${sections.loanChart && sections.portfolio ? 'lg:grid-cols-3' : sections.portfolio ? 'lg:grid-cols-1 max-w-md' : 'lg:grid-cols-1'} gap-6 mb-8`}>
              {sections.loanChart && <LoanActivityChart chartData={dashData?.chartData || []} />}
              {sections.portfolio && <WorkflowDonutChart portfolio={dashData?.portfolio || {}} />}
            </div>
          )}

          {/* Recent Activities — conditionally rendered */}
          {sections.activities && <RecentActivities activities={dashData?.recentActivities || []} />}
        </div>
      </main>
    </div>
  );
};

export default AdminDash;
