import { useState, useEffect, useMemo } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { Sidebar, Header } from '../../components/layout';
import { getNavigationByRole } from '../../config';
import { useTheme, useAuth } from '../../context';
import { reportsApi, exportsApi, customersApi, branchesApi } from '../../lib/api';

// ── KPI Card ────────────────────────────────────────────
const StatsCard = ({ icon, iconBg, label, value, sub, subType }) => (
    <div className="kpi-card">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <div className={`kpi-icon ${iconBg}`}>
                    <span className={`material-symbols-outlined text-xl text-white`}>{icon}</span>
                </div>
                <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{label}</span>
            </div>
            <button className="p-1 rounded-sm hover:bg-neutral-200/50 dark:hover:bg-neutral-600/50 text-neutral-400 dark:text-neutral-500 transition-colors">
                <span className="material-symbols-outlined text-lg">more_vert</span>
            </button>
        </div>
        <h3 className="kpi-value">{value}</h3>
        {sub && (
            <div className="flex items-center gap-2 mt-3">
                <span className={`kpi-badge ${subType === 'success' ? 'kpi-badge-success' : subType === 'warning' ? 'kpi-badge-warning' : 'kpi-badge-neutral'}`}>
                    {subType === 'success' && <span className="material-symbols-outlined text-xs">trending_up</span>}
                    {subType === 'warning' && <span className="material-symbols-outlined text-xs">trending_down</span>}
                    {sub}
                </span>
            </div>
        )}
    </div>
);

// ── Revenue Bar Chart ────────────────────────────────────
const RevenueChart = ({ revenue = {} }) => {
    const { isDarkMode } = useTheme();
    const textColor = isDarkMode ? '#94a3b8' : '#64748b';
    const gridColor = isDarkMode ? '#1e293b' : '#f1f5f9';

    const categories = ['Interest', 'Penalties', 'Disbursed', 'Redeemed', 'Auction'];
    const values = [
        revenue.totalInterest || 0,
        revenue.totalPenalties || 0,
        revenue.totalDisbursed || 0,
        revenue.totalRedeemed || 0,
        revenue.totalAuctionSales || 0,
    ];

    return (
        <div className="lg:col-span-2 dashboard-card flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                    <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Revenue Breakdown</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        Revenue by transaction type
                    </p>
                </div>
            </div>
            <div className="w-full" style={{ height: 340 }}>
                <BarChart
                    xAxis={[{
                        scaleType: 'band',
                        data: categories,
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
                        data: values,
                        color: '#525252',
                        label: 'Amount',
                        valueFormatter: (v) => `₱${(v || 0).toLocaleString()}`,
                    }]}
                    grid={{ horizontal: true }}
                    borderRadius={6}
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

// ── Loan Status Donut Chart ──────────────────────────────
const LoanStatusDonut = ({ loans = {} }) => {
    const { isDarkMode } = useTheme();

    const total = (loans.totalLoans || 0) || 1;
    const redemptionPct = loans.redemptionRate || 0;

    const donutData = [
        { id: 0, value: loans.redeemed || 0, label: 'Redeemed', color: '#22c55e' },
        { id: 1, value: loans.forfeited || 0, label: 'Forfeited', color: '#f97316' },
        { id: 2, value: loans.expired || 0, label: 'Expired', color: isDarkMode ? '#475569' : '#cbd5e1' },
        { id: 3, value: Math.max(0, (loans.totalLoans || 0) - (loans.redeemed || 0) - (loans.forfeited || 0) - (loans.expired || 0)), label: 'Active', color: '#3b82f6' },
    ];

    return (
        <div className="dashboard-card flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Loan Status</h3>
                <button className="p-1.5 rounded-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors">
                    <span className="material-symbols-outlined text-[18px]">open_in_full</span>
                </button>
            </div>

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
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100 leading-none">{redemptionPct}%</span>
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mt-0.5">Redeemed</span>
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {donutData.map((item) => (
                    <div key={item.id} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{item.label}</span>
                    </div>
                ))}
            </div>

            <div className="border-t border-neutral-100 dark:border-neutral-700 pt-4">
                <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Total Loans</p>
                <p className="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100 mt-1">{(loans.totalLoans || 0).toLocaleString()}</p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">Default rate: {loans.defaultRate || 0}%</p>
                <div className="mt-3 h-1.5 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${redemptionPct}%` }} />
                </div>
            </div>
        </div>
    );
};

// ── Inventory Table ──────────────────────────────────────
const InventoryTable = ({ inventory = {} }) => {
    const categories = Object.entries(inventory);
    const totalItems = categories.reduce((s, [, v]) => s + v.count, 0);
    const totalValue = categories.reduce((s, [, v]) => s + v.totalValue, 0);

    const categoryIcons = {
        JEWELRY: 'diamond',
        VEHICLE: 'directions_car',
        GADGET: 'smartphone',
        APPLIANCE: 'kitchen',
        OTHER: 'category',
    };

    const categoryColors = {
        JEWELRY: 'bg-amber-500',
        VEHICLE: 'bg-blue-500',
        GADGET: 'bg-purple-500',
        APPLIANCE: 'bg-teal-500',
        OTHER: 'bg-neutral-500',
    };

    return (
        <div className="dashboard-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Inventory by Category</h3>
                <div className="flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                    <span>{totalItems} items</span>
                    <span className="text-neutral-300 dark:text-neutral-600">|</span>
                    <span>₱{(totalValue || 0).toLocaleString()}</span>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-neutral-100 dark:border-neutral-700">
                            {['Category', 'Items', 'Total Value', 'Avg Value', '% of Inventory'].map(h => (
                                <th key={h} className="pb-3 pr-4 text-left text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50 dark:divide-neutral-700/50">
                        {categories.map(([cat, data]) => (
                            <tr key={cat} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                                <td className="py-3.5 pr-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${categoryColors[cat] || 'bg-neutral-500'} flex items-center justify-center`}>
                                            <span className="material-symbols-outlined text-white text-sm">{categoryIcons[cat] || 'category'}</span>
                                        </div>
                                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">{cat}</span>
                                    </div>
                                </td>
                                <td className="py-3.5 pr-4 text-neutral-600 dark:text-neutral-300 font-medium">{data.count}</td>
                                <td className="py-3.5 pr-4 font-semibold text-neutral-800 dark:text-neutral-200">₱{(data.totalValue || 0).toLocaleString()}</td>
                                <td className="py-3.5 pr-4 text-neutral-500 dark:text-neutral-400">
                                    ₱{data.count > 0 ? Math.round(data.totalValue / data.count).toLocaleString() : 0}
                                </td>
                                <td className="py-3.5">
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${categoryColors[cat] || 'bg-neutral-500'}`}
                                                style={{ width: `${totalItems > 0 ? (data.count / totalItems * 100) : 0}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                            {totalItems > 0 ? (data.count / totalItems * 100).toFixed(1) : 0}%
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

// ── Customer Risk Table ──────────────────────────────────
const CustomerRiskTable = ({ risk = {} }) => {
    const total = Object.values(risk).reduce((s, v) => s + v, 0) || 1;

    const riskConfig = {
        LOW: { color: 'bg-emerald-500', textColor: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30', icon: 'verified_user' },
        MEDIUM: { color: 'bg-amber-500', textColor: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30', icon: 'shield' },
        HIGH: { color: 'bg-red-500', textColor: 'text-red-600 bg-red-50 dark:bg-red-900/30', icon: 'gpp_maybe' },
    };

    return (
        <div className="dashboard-card">
            <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-6">Customer Risk Distribution</h3>
            <div className="space-y-4">
                {Object.entries(risk).map(([level, count]) => {
                    const cfg = riskConfig[level] || riskConfig.LOW;
                    const pct = (count / total * 100).toFixed(1);
                    return (
                        <div key={level} className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg ${cfg.color} flex items-center justify-center flex-shrink-0`}>
                                <span className="material-symbols-outlined text-white text-lg">{cfg.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{level} Risk</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg.textColor}`}>{count}</span>
                                        <span className="text-xs text-neutral-400">{pct}%</span>
                                    </div>
                                </div>
                                <div className="h-1.5 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${cfg.color}`} style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Export Buttons ───────────────────────────────────────
const ExportButtons = ({ reportType, params = {} }) => {
    const [exporting, setExporting] = useState(false);

    const handleExportCsv = async () => {
        setExporting(true);
        try {
            await exportsApi.download(reportType, params);
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={handleExportCsv}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-sm border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors disabled:opacity-50"
            >
                <span className="material-symbols-outlined text-[16px]">download</span>
                {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-sm border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
            >
                <span className="material-symbols-outlined text-[16px]">print</span>
                Print PDF
            </button>
        </div>
    );
};

// ── Tab 2: Daily Transactions ─────────────────────────────
const DailyTransactionsTab = () => {
    const today = new Date().toISOString().split('T')[0];
    const [date, setDate] = useState(today);
    const [branchId, setBranchId] = useState('');
    const [branches, setBranches] = useState([]);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        branchesApi.list().then(res => setBranches(res.branches || res || [])).catch(() => {});
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const params = { date };
                if (branchId) params.branch_id = branchId;
                const res = await reportsApi.dailyTransactions(params);
                setData(res);
            } catch (err) {
                console.error('Daily transactions fetch error:', err);
                setData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [date, branchId]);

    const transactions = data?.transactions || [];
    const summary = data?.summary || {};

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="dashboard-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-neutral-400">calendar_today</span>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="chart-select"
                            />
                        </div>
                        <select
                            value={branchId}
                            onChange={e => setBranchId(e.target.value)}
                            className="chart-select"
                        >
                            <option value="">All Branches</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.branch_name}</option>
                            ))}
                        </select>
                    </div>
                    <ExportButtons reportType="daily-transactions" params={{ date, ...(branchId ? { branch_id: branchId } : {}) }} />
                </div>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatsCard icon="payments" iconBg="bg-blue-500" label="Total Disbursed" value={`₱${(summary.totalDisbursed || 0).toLocaleString()}`} />
                <StatsCard icon="savings" iconBg="bg-emerald-500" label="Total Collected" value={`₱${(summary.totalCollected || 0).toLocaleString()}`} />
                <StatsCard icon="trending_up" iconBg="bg-primary" label="Total Interest" value={`₱${(summary.totalInterest || 0).toLocaleString()}`} />
                <StatsCard icon="warning" iconBg="bg-orange-500" label="Total Penalties" value={`₱${(summary.totalPenalties || 0).toLocaleString()}`} />
                <StatsCard icon="receipt_long" iconBg="bg-purple-500" label="Transactions" value={`${summary.count || 0}`} />
            </div>

            {/* Table */}
            <div className="dashboard-card">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-6">Transaction Log</h3>
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-500">
                        <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                        <p className="text-sm font-medium">No transactions found for this date</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-100 dark:border-neutral-700">
                                    {['Time', 'Type', 'Customer', 'Ticket #', 'Item', 'Amount', 'Processed By'].map(h => (
                                        <th key={h} className="pb-3 pr-4 text-left text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-50 dark:divide-neutral-700/50">
                                {transactions.map((tx, i) => (
                                    <tr key={tx.id || i} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                                        <td className="py-3 pr-4 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                                            {tx.time || (tx.created_at ? new Date(tx.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—')}
                                        </td>
                                        <td className="py-3 pr-4">
                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                                tx.type === 'PAYMENT' ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30' :
                                                tx.type === 'DISBURSEMENT' ? 'text-blue-700 bg-blue-50 dark:bg-blue-900/30' :
                                                tx.type === 'PENALTY' ? 'text-red-700 bg-red-50 dark:bg-red-900/30' :
                                                'text-neutral-600 bg-neutral-100 dark:bg-neutral-700'
                                            }`}>
                                                {tx.type || '—'}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-4 font-medium text-neutral-800 dark:text-neutral-200">{tx.customer_name || '—'}</td>
                                        <td className="py-3 pr-4 font-mono text-xs text-neutral-500 dark:text-neutral-400">{tx.ticket_number || '—'}</td>
                                        <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300 max-w-[160px] truncate">{tx.item_description || '—'}</td>
                                        <td className="py-3 pr-4 font-semibold text-neutral-800 dark:text-neutral-200">₱{(tx.amount || 0).toLocaleString()}</td>
                                        <td className="py-3 text-neutral-500 dark:text-neutral-400">{tx.processed_by || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700/30">
                                    <td colSpan={5} className="py-3 pr-4 text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                                        Summary
                                    </td>
                                    <td className="py-3 pr-4 font-bold text-neutral-800 dark:text-neutral-100">
                                        ₱{(summary.totalCollected || 0).toLocaleString()}
                                    </td>
                                    <td className="py-3 text-xs text-neutral-500 dark:text-neutral-400">{summary.count || 0} txns</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Tab 3: Overdue Loans ──────────────────────────────────
const OverdueLoansTab = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await reportsApi.overdueLoans({});
                setData(res);
            } catch (err) {
                console.error('Overdue loans fetch error:', err);
                setData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const loans = data?.loans || [];
    const summary = data?.summary || {};

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="dashboard-card">
                <div className="flex items-center justify-between">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        Showing current overdue and expiring loans across all branches.
                    </p>
                    <ExportButtons reportType="overdue-loans" params={{}} />
                </div>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatsCard
                    icon="warning"
                    iconBg="bg-red-500"
                    label="Total Overdue"
                    value={`${summary.totalOverdue || 0}`}
                    sub="Loans past maturity"
                    subType="warning"
                />
                <StatsCard
                    icon="schedule"
                    iconBg="bg-amber-500"
                    label="Expiring Soon"
                    value={`${summary.totalExpiringSoon || 0}`}
                    sub="Within 7 days"
                    subType="warning"
                />
                <StatsCard
                    icon="account_balance_wallet"
                    iconBg="bg-orange-500"
                    label="Total At-Risk Value"
                    value={`₱${(summary.totalAtRiskValue || 0).toLocaleString()}`}
                    sub="Principal + accrued"
                    subType="warning"
                />
            </div>

            {/* Table */}
            <div className="dashboard-card">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-6">Overdue & Expiring Loans</h3>
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                    </div>
                ) : loans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-500">
                        <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
                        <p className="text-sm font-medium">No overdue loans — all clear!</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-100 dark:border-neutral-700">
                                    {['Ticket #', 'Customer', 'Item', 'Principal', 'Maturity Date', 'Days Overdue', 'Penalty Accrued', 'Status'].map(h => (
                                        <th key={h} className="pb-3 pr-4 text-left text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-50 dark:divide-neutral-700/50">
                                {loans.map((loan, i) => (
                                    <tr key={loan.id || i} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                                        <td className="py-3.5 pr-4 font-mono text-xs text-neutral-500 dark:text-neutral-400">{loan.ticket_number || '—'}</td>
                                        <td className="py-3.5 pr-4 font-medium text-neutral-800 dark:text-neutral-200">{loan.customer_name || '—'}</td>
                                        <td className="py-3.5 pr-4 text-neutral-600 dark:text-neutral-300 max-w-[160px] truncate">{loan.item_description || '—'}</td>
                                        <td className="py-3.5 pr-4 font-semibold text-neutral-800 dark:text-neutral-200">₱{(loan.principal || 0).toLocaleString()}</td>
                                        <td className="py-3.5 pr-4 text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
                                            {loan.maturity_date ? new Date(loan.maturity_date).toLocaleDateString('en-PH') : '—'}
                                        </td>
                                        <td className="py-3.5 pr-4">
                                            <span className={`font-bold ${(loan.days_overdue || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                                {loan.days_overdue > 0 ? `${loan.days_overdue}d` : '—'}
                                            </span>
                                        </td>
                                        <td className="py-3.5 pr-4 text-neutral-600 dark:text-neutral-300">₱{(loan.penalty_accrued || 0).toLocaleString()}</td>
                                        <td className="py-3.5">
                                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                                                loan.status === 'OVERDUE'
                                                    ? 'text-red-700 bg-red-50 dark:bg-red-900/30'
                                                    : 'text-amber-700 bg-amber-50 dark:bg-amber-900/30'
                                            }`}>
                                                {loan.status || 'OVERDUE'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700/30">
                                    <td colSpan={3} className="py-3 pr-4 text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                                        Totals
                                    </td>
                                    <td className="py-3 pr-4 font-bold text-neutral-800 dark:text-neutral-100">
                                        ₱{loans.reduce((s, l) => s + (l.principal || 0), 0).toLocaleString()}
                                    </td>
                                    <td colSpan={2} />
                                    <td className="py-3 pr-4 font-bold text-red-600 dark:text-red-400">
                                        ₱{loans.reduce((s, l) => s + (l.penalty_accrued || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="py-3 text-xs text-neutral-500 dark:text-neutral-400">{loans.length} loans</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Tab 4: Branch Comparison ──────────────────────────────
const BranchComparisonTab = () => {
    const [period, setPeriod] = useState('30');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await reportsApi.branchComparison({ period });
                setData(res);
            } catch (err) {
                console.error('Branch comparison fetch error:', err);
                setData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [period]);

    const branches = data?.branches || [];

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="dashboard-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <select
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        className="chart-select"
                    >
                        <option value="7">Last 7 Days</option>
                        <option value="30">Last 30 Days</option>
                        <option value="90">Last 90 Days</option>
                        <option value="365">This Year</option>
                    </select>
                    <ExportButtons reportType="branch-comparison" params={{ period }} />
                </div>
            </div>

            {/* Table */}
            <div className="dashboard-card">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-6">Branch Performance Comparison</h3>
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                    </div>
                ) : branches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-500">
                        <span className="material-symbols-outlined text-4xl mb-2">store</span>
                        <p className="text-sm font-medium">No branch data available for this period</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-100 dark:border-neutral-700">
                                    {['Branch', 'Loans', 'Disbursed', 'Collected', 'Active Value', 'Customers', 'Transactions'].map(h => (
                                        <th key={h} className="pb-3 pr-4 text-left text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-50 dark:divide-neutral-700/50">
                                {branches.map((b, i) => (
                                    <tr key={b.branch_id || i} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                                        <td className="py-3.5 pr-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-neutral-800 dark:bg-neutral-600 flex items-center justify-center flex-shrink-0">
                                                    <span className="material-symbols-outlined text-white text-sm">store</span>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-neutral-800 dark:text-neutral-200 leading-tight">{b.branch_name || '—'}</p>
                                                    {b.branch_code && <p className="text-[10px] text-neutral-400">{b.branch_code}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3.5 pr-4 font-medium text-neutral-700 dark:text-neutral-300">{b.loans || 0}</td>
                                        <td className="py-3.5 pr-4 font-semibold text-blue-600 dark:text-blue-400">₱{(b.disbursed || 0).toLocaleString()}</td>
                                        <td className="py-3.5 pr-4 font-semibold text-emerald-600 dark:text-emerald-400">₱{(b.collected || 0).toLocaleString()}</td>
                                        <td className="py-3.5 pr-4 font-semibold text-neutral-800 dark:text-neutral-200">₱{(b.active_loans_value || 0).toLocaleString()}</td>
                                        <td className="py-3.5 pr-4 text-neutral-600 dark:text-neutral-300">{b.customers || 0}</td>
                                        <td className="py-3.5 text-neutral-600 dark:text-neutral-300">{b.transactions || 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700/30">
                                    <td className="py-3 pr-4 text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Totals</td>
                                    <td className="py-3 pr-4 font-bold text-neutral-800 dark:text-neutral-100">{branches.reduce((s, b) => s + (b.loans || 0), 0)}</td>
                                    <td className="py-3 pr-4 font-bold text-blue-600 dark:text-blue-400">₱{branches.reduce((s, b) => s + (b.disbursed || 0), 0).toLocaleString()}</td>
                                    <td className="py-3 pr-4 font-bold text-emerald-600 dark:text-emerald-400">₱{branches.reduce((s, b) => s + (b.collected || 0), 0).toLocaleString()}</td>
                                    <td className="py-3 pr-4 font-bold text-neutral-800 dark:text-neutral-100">₱{branches.reduce((s, b) => s + (b.active_loans_value || 0), 0).toLocaleString()}</td>
                                    <td className="py-3 pr-4 font-bold text-neutral-800 dark:text-neutral-100">{branches.reduce((s, b) => s + (b.customers || 0), 0)}</td>
                                    <td className="py-3 font-bold text-neutral-800 dark:text-neutral-100">{branches.reduce((s, b) => s + (b.transactions || 0), 0)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Tab 5: Customer History ───────────────────────────────
const CustomerHistoryTab = () => {
    const [customers, setCustomers] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingCustomers, setLoadingCustomers] = useState(true);
    const [expandedTicket, setExpandedTicket] = useState(null);

    useEffect(() => {
        customersApi.list({ limit: 100 })
            .then(res => setCustomers(res.customers || res.data || res || []))
            .catch(() => {})
            .finally(() => setLoadingCustomers(false));
    }, []);

    useEffect(() => {
        if (!selectedCustomerId) { setData(null); return; }
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await reportsApi.customerHistory(selectedCustomerId);
                setData(res);
            } catch (err) {
                console.error('Customer history fetch error:', err);
                setData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedCustomerId]);

    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return customers;
        const s = searchTerm.toLowerCase();
        return customers.filter(c =>
            `${c.first_name} ${c.last_name}`.toLowerCase().includes(s) ||
            (c.mobile_number || '').includes(s) ||
            (c.email || '').toLowerCase().includes(s)
        );
    }, [customers, searchTerm]);

    const customer = data?.customer || {};
    const tickets = data?.tickets || [];
    const totals = data?.totals || {};

    const riskColors = {
        LOW: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30',
        MEDIUM: 'text-amber-700 bg-amber-50 dark:bg-amber-900/30',
        HIGH: 'text-red-700 bg-red-50 dark:bg-red-900/30',
    };

    const statusColors = {
        ACTIVE: 'text-blue-700 bg-blue-50 dark:bg-blue-900/30',
        REDEEMED: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30',
        FORFEITED: 'text-orange-700 bg-orange-50 dark:bg-orange-900/30',
        EXPIRED: 'text-neutral-600 bg-neutral-100 dark:bg-neutral-700',
        OVERDUE: 'text-red-700 bg-red-50 dark:bg-red-900/30',
    };

    return (
        <div className="space-y-6">
            {/* Customer Selector */}
            <div className="dashboard-card">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="flex-1 max-w-lg space-y-2">
                        <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                            Search Customer
                        </label>
                        <input
                            type="text"
                            placeholder="Search by name, phone, or email..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="chart-select w-full"
                        />
                        <select
                            value={selectedCustomerId}
                            onChange={e => setSelectedCustomerId(e.target.value)}
                            className="chart-select w-full"
                            disabled={loadingCustomers}
                        >
                            <option value="">{loadingCustomers ? 'Loading customers...' : 'Select a customer...'}</option>
                            {filteredCustomers.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.first_name} {c.last_name} — {c.mobile_number || c.email || c.id}
                                </option>
                            ))}
                        </select>
                    </div>
                    {selectedCustomerId && (
                        <ExportButtons reportType="customer-history" params={{ customer_id: selectedCustomerId }} />
                    )}
                </div>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                </div>
            )}

            {!loading && data && (
                <>
                    {/* Customer Info Card */}
                    <div className="dashboard-card">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                    <span className="text-lg font-bold text-black">
                                        {(customer.first_name?.[0] || '') + (customer.last_name?.[0] || '')}
                                    </span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                                        {customer.first_name} {customer.last_name}
                                    </h3>
                                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                        {customer.mobile_number || customer.email || '—'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${riskColors[customer.risk_rating] || riskColors.LOW}`}>
                                    {customer.risk_rating || 'LOW'} RISK
                                </span>
                                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                                    {customer.total_loans || 0} total loans
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Totals KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <StatsCard icon="payments" iconBg="bg-blue-500" label="Total Borrowed" value={`₱${(totals.totalBorrowed || 0).toLocaleString()}`} />
                        <StatsCard icon="trending_up" iconBg="bg-primary" label="Interest Paid" value={`₱${(totals.totalInterestPaid || 0).toLocaleString()}`} />
                        <StatsCard icon="warning" iconBg="bg-orange-500" label="Penalties Paid" value={`₱${(totals.totalPenaltiesPaid || 0).toLocaleString()}`} />
                        <StatsCard icon="check_circle" iconBg="bg-emerald-500" label="Active / Redeemed" value={`${totals.activeCount || 0} / ${totals.redeemedCount || 0}`} />
                        <StatsCard icon="gavel" iconBg="bg-red-500" label="Forfeited" value={`${totals.forfeitedCount || 0}`} />
                    </div>

                    {/* Tickets Table */}
                    <div className="dashboard-card">
                        <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-6">Loan History</h3>
                        {tickets.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-500">
                                <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                                <p className="text-sm font-medium">No loan history found for this customer</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-neutral-100 dark:border-neutral-700">
                                            <th className="pb-3 pr-2 w-8" />
                                            {['Ticket #', 'Item', 'Principal', 'Interest Rate', 'Status', 'Created', 'Maturity', 'Redeemed At'].map(h => (
                                                <th key={h} className="pb-3 pr-4 text-left text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tickets.map((ticket, i) => (
                                            <>
                                                <tr
                                                    key={ticket.id || i}
                                                    className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors border-b border-neutral-50 dark:border-neutral-700/50 cursor-pointer"
                                                    onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
                                                >
                                                    <td className="py-3.5 pr-2">
                                                        <span className="material-symbols-outlined text-[16px] text-neutral-400">
                                                            {expandedTicket === ticket.id ? 'expand_less' : 'expand_more'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 pr-4 font-mono text-xs text-neutral-500 dark:text-neutral-400">{ticket.ticket_number || '—'}</td>
                                                    <td className="py-3.5 pr-4 text-neutral-600 dark:text-neutral-300 max-w-[160px] truncate">{ticket.item_description || '—'}</td>
                                                    <td className="py-3.5 pr-4 font-semibold text-neutral-800 dark:text-neutral-200">₱{(ticket.principal || 0).toLocaleString()}</td>
                                                    <td className="py-3.5 pr-4 text-neutral-500 dark:text-neutral-400">{ticket.interest_rate != null ? `${ticket.interest_rate}%` : '—'}</td>
                                                    <td className="py-3.5 pr-4">
                                                        <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${statusColors[ticket.status] || statusColors.ACTIVE}`}>
                                                            {ticket.status || 'ACTIVE'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 pr-4 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                                                        {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-PH') : '—'}
                                                    </td>
                                                    <td className="py-3.5 pr-4 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                                                        {ticket.maturity_date ? new Date(ticket.maturity_date).toLocaleDateString('en-PH') : '—'}
                                                    </td>
                                                    <td className="py-3.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                                                        {ticket.redeemed_at ? new Date(ticket.redeemed_at).toLocaleDateString('en-PH') : '—'}
                                                    </td>
                                                </tr>
                                                {expandedTicket === ticket.id && (ticket.transactions || []).length > 0 && (
                                                    <tr key={`${ticket.id}-expanded`} className="bg-neutral-50 dark:bg-neutral-800/50">
                                                        <td colSpan={9} className="px-6 pb-4 pt-2">
                                                            <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Transactions</p>
                                                            <table className="w-full text-xs">
                                                                <thead>
                                                                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                                                                        {['Date', 'Type', 'Amount', 'Reference'].map(h => (
                                                                            <th key={h} className="pb-2 pr-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{h}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                                                                    {(ticket.transactions || []).map((tx, j) => (
                                                                        <tr key={tx.id || j} className="hover:bg-neutral-100 dark:hover:bg-neutral-700/30">
                                                                            <td className="py-2 pr-4 text-neutral-500 dark:text-neutral-400">
                                                                                {tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-PH') : '—'}
                                                                            </td>
                                                                            <td className="py-2 pr-4 font-medium text-neutral-700 dark:text-neutral-300">{tx.type || '—'}</td>
                                                                            <td className="py-2 pr-4 font-semibold text-neutral-800 dark:text-neutral-200">₱{(tx.amount || 0).toLocaleString()}</td>
                                                                            <td className="py-2 font-mono text-neutral-400">{tx.reference_number || '—'}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {!loading && !data && !selectedCustomerId && (
                <div className="dashboard-card flex flex-col items-center justify-center py-20 text-neutral-400 dark:text-neutral-500">
                    <span className="material-symbols-outlined text-5xl mb-3">person_search</span>
                    <p className="text-base font-medium text-neutral-600 dark:text-neutral-300">Select a customer to view their loan history</p>
                    <p className="text-sm mt-1">Search by name, phone, or email above</p>
                </div>
            )}
        </div>
    );
};

// ── Tab Bar ───────────────────────────────────────────────
const tabs = [
    { id: 'overview', label: 'Overview', icon: 'bar_chart' },
    { id: 'daily', label: 'Daily Transactions', icon: 'receipt_long' },
    { id: 'overdue', label: 'Overdue Loans', icon: 'warning' },
    { id: 'branches', label: 'Branch Comparison', icon: 'store' },
    { id: 'customer', label: 'Customer History', icon: 'person_search' },
];

// ── Main Reports Page ────────────────────────────────────
const Reports = () => {
    const { profile } = useAuth();
    const navigation = getNavigationByRole(profile?.role);
    const [activeTab, setActiveTab] = useState('overview');
    const [period, setPeriod] = useState('30');
    const [loans, setLoans] = useState({});
    const [revenue, setRevenue] = useState({});
    const [customers, setCustomers] = useState({});
    const [inventory, setInventory] = useState({});
    const [loading, setLoading] = useState(true);

    const currentUser = useMemo(() => ({
        name: profile?.full_name || 'User',
        role: profile?.role || 'Admin',
        initials: (profile?.full_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2),
    }), [profile]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const [loanData, revData, custData, invData] = await Promise.all([
                reportsApi.loans({ period }),
                reportsApi.revenue({ period }),
                reportsApi.customers(),
                reportsApi.inventory(),
            ]);
            setLoans(loanData);
            setRevenue(revData);
            setCustomers(custData.riskDistribution || {});
            setInventory(invData.categoryDistribution || {});
        } catch (err) {
            console.error('Reports fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'overview') fetchReports();
    }, [period, activeTab]);

    const totalRevenue = (revenue.totalInterest || 0) + (revenue.totalPenalties || 0) + (revenue.totalAuctionSales || 0);
    const totalInventoryValue = Object.values(inventory).reduce((s, v) => s + (v.totalValue || 0), 0);
    const totalCustomers = Object.values(customers).reduce((s, v) => s + v, 0);

    return (
        <div className="admin-layout">
            <Sidebar
                navigation={navigation}
                currentPath="/admin/reports"
                onNavigate={() => {}}
            />
            <main className="admin-main">
                <Header user={currentUser} />
                <div className="admin-content custom-scrollbar">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <nav className="flex mb-2" aria-label="Breadcrumb">
                                <ol className="flex items-center space-x-2">
                                    <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Analytics</span></li>
                                    <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                                    <li><span className="text-neutral-700 dark:text-white text-sm font-semibold">Reports</span></li>
                                </ol>
                            </nav>
                            <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
                                Reports
                            </h1>
                        </div>
                        {activeTab === 'overview' && (
                            <div className="flex items-center gap-3">
                                <select
                                    value={period}
                                    onChange={(e) => setPeriod(e.target.value)}
                                    className="chart-select"
                                >
                                    <option value="7">Last 7 Days</option>
                                    <option value="30">Last 30 Days</option>
                                    <option value="90">Last 90 Days</option>
                                    <option value="365">This Year</option>
                                </select>
                                <button
                                    onClick={fetchReports}
                                    className="p-2 rounded-sm border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">refresh</span>
                                </button>
                                <ExportButtons reportType="overview" params={{ period }} />
                            </div>
                        )}
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex items-center gap-1 mb-8 border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto pb-px">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
                                    activeTab === tab.id
                                        ? 'border-primary text-neutral-900 dark:text-neutral-100'
                                        : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab: Overview */}
                    {activeTab === 'overview' && (
                        loading ? (
                            <div className="flex items-center justify-center py-20">
                                <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
                            </div>
                        ) : (
                            <>
                                {/* KPI Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                    <StatsCard
                                        icon="monetization_on"
                                        iconBg="bg-primary"
                                        label="Total Revenue"
                                        value={`₱${(totalRevenue || 0).toLocaleString()}`}
                                        sub={`${period} day period`}
                                        subType="neutral"
                                    />
                                    <StatsCard
                                        icon="receipt_long"
                                        iconBg="bg-blue-500"
                                        label="Total Loans"
                                        value={`${loans.totalLoans || 0}`}
                                        sub={`${loans.redemptionRate || 0}% redeemed`}
                                        subType="success"
                                    />
                                    <StatsCard
                                        icon="inventory_2"
                                        iconBg="bg-purple-500"
                                        label="Inventory Value"
                                        value={`₱${(totalInventoryValue || 0).toLocaleString()}`}
                                        sub={`${Object.values(inventory).reduce((s, v) => s + v.count, 0)} items in vault`}
                                        subType="neutral"
                                    />
                                    <StatsCard
                                        icon="group"
                                        iconBg="bg-orange-500"
                                        label="Total Customers"
                                        value={`${totalCustomers}`}
                                        sub={`${customers.HIGH || 0} high risk`}
                                        subType={customers.HIGH > 0 ? 'warning' : 'success'}
                                    />
                                </div>

                                {/* Charts Row */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                                    <RevenueChart revenue={revenue} />
                                    <LoanStatusDonut loans={loans} />
                                </div>

                                {/* Tables Row */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div className="lg:col-span-2">
                                        <InventoryTable inventory={inventory} />
                                    </div>
                                    <CustomerRiskTable risk={customers} />
                                </div>
                            </>
                        )
                    )}

                    {/* Tab: Daily Transactions */}
                    {activeTab === 'daily' && <DailyTransactionsTab />}

                    {/* Tab: Overdue Loans */}
                    {activeTab === 'overdue' && <OverdueLoansTab />}

                    {/* Tab: Branch Comparison */}
                    {activeTab === 'branches' && <BranchComparisonTab />}

                    {/* Tab: Customer History */}
                    {activeTab === 'customer' && <CustomerHistoryTab />}
                </div>
            </main>
        </div>
    );
};

export default Reports;
