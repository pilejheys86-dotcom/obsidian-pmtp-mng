import { useEffect, useMemo, useState } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { Pagination, StatsCard, StatusBadge } from '../../components/ui';
import { getNavigationByRole } from '../../config';
import AddCustomer from './AddCustomer';
import CustomerProfile from './CustomerProfile';
import { useAuth } from '../../context';
import { customersApi, accessRequestsApi } from '../../lib/api';

// Customer Row Component
const CustomerRow = ({ customer, onViewProfile, onArchive }) => {
    return (
        <tr className="loan-row">
            <td className="px-6 py-4 text-center text-sm font-mono font-medium text-neutral-500 dark:text-neutral-400">{customer.customerId}</td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-3 w-52 mx-auto">
                    <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                        {customer.avatar ? (
                            <img alt={customer.name} className="w-full h-full object-cover object-center" src={customer.avatar} />
                        ) : (
                            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">{customer.initials}</span>
                        )}
                    </div>
                    <span className="text-sm font-semibold text-neutral-800 dark:text-white truncate">{customer.name}</span>
                </div>
            </td>
            <td className="px-6 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{customer.email}</td>
            <td className="px-6 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{customer.phone}</td>
            <td className="px-6 py-4 text-center text-sm">
                <span className={`font-bold ${customer.totalLoans === 0 ? 'text-neutral-400' : ''}`}>
                    {customer.totalLoans}
                </span>
            </td>
            <td className="px-6 py-4 text-center">
                <StatusBadge status={customer.status} type={customer.statusType} />
            </td>
            <td className="px-6 py-4 text-center">
                <div className="flex items-center justify-center gap-1">
                    <button
                        onClick={() => onViewProfile(customer.rawId)}
                        className="text-neutral-400 hover:text-primary transition-colors"
                        title="View Profile"
                    >
                        <span className="material-symbols-outlined">visibility</span>
                    </button>
                    <button
                        onClick={() => onArchive(customer)}
                        className="text-neutral-400 hover:text-red-500 transition-colors"
                        title="Archive Customer"
                    >
                        <span className="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </td>
        </tr>
    );
};

// Archived Customer Row Component
const ArchivedRow = ({ customer, onRestore, onPermanentDelete }) => {
    return (
        <tr className="loan-row">
            <td className="px-6 py-4 text-center text-sm font-mono font-medium text-neutral-500 dark:text-neutral-400">{customer.customerId}</td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-3 w-52 mx-auto">
                    <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                        <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">{customer.initials}</span>
                    </div>
                    <span className="text-sm font-semibold text-neutral-800 dark:text-white truncate">{customer.name}</span>
                </div>
            </td>
            <td className="px-6 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{customer.email}</td>
            <td className="px-6 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{customer.phone}</td>
            <td className="px-6 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
                {new Date(customer.archivedAt).toLocaleDateString()}
            </td>
            <td className="px-6 py-4 text-center">
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => onRestore(customer)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                        <span className="material-symbols-outlined text-base">restore</span>
                        Restore
                    </button>
                    <button
                        onClick={() => onPermanentDelete(customer)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                    >
                        <span className="material-symbols-outlined text-base">delete_forever</span>
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    );
};

// Customer Loan History Component
const CustomerLoanHistory = ({ customerId, customerName, onBack }) => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    useEffect(() => {
        if (!customerId) return;
        setLoading(true);
        customersApi.get(customerId)
            .then((data) => setTickets(data.pawn_tickets || []))
            .catch(() => setTickets([]))
            .finally(() => setLoading(false));
    }, [customerId]);

    const statusStyles = {
        ACTIVE: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
        REDEEMED: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
        EXPIRED: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
        FORFEITED: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
        RENEWED: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    };

    const filtered = tickets.filter((t) => {
        if (dateFrom && t.created_at < dateFrom) return false;
        if (dateTo && t.created_at > `${dateTo}T23:59:59.999Z`) return false;
        return true;
    });

    const clearFilters = () => { setDateFrom(''); setDateTo(''); };

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors mb-4">
                    <span className="material-symbols-outlined text-lg">arrow_back</span>
                    Back to Profile
                </button>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Management / Customers</p>
                <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">
                    Loan History
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                    All loan transactions for <strong className="text-neutral-700 dark:text-neutral-300">{customerName}</strong>
                </p>
            </div>

            {/* Filters */}
            <div className="sa-filter-bar mb-6">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">From</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="sa-filter-input" />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">To</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="sa-filter-input" />
                </div>
                {(dateFrom || dateTo) && (
                    <button onClick={clearFilters} className="sa-filter-btn text-neutral-500 hover:text-neutral-800 dark:hover:text-white">
                        Clear
                    </button>
                )}
                <span className="text-xs text-neutral-400 ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="dashboard-card p-12 text-center">
                    <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-600 mb-3">receipt_long</span>
                    <p className="text-sm text-neutral-400 dark:text-neutral-500">
                        {tickets.length === 0 ? 'No loan history found.' : 'No records match the selected filters.'}
                    </p>
                </div>
            ) : (
                <div className="dashboard-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left">
                            <thead>
                                <tr className="border-b border-neutral-200/60 dark:border-neutral-700/50">
                                    <th className="px-5 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Ticket #</th>
                                    <th className="px-5 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Item</th>
                                    <th className="px-5 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Principal</th>
                                    <th className="px-5 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Interest</th>
                                    <th className="px-5 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Maturity</th>
                                    <th className="px-5 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Created</th>
                                    <th className="px-5 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/30">
                                {filtered.map((t) => (
                                    <tr key={t.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                        <td className="px-5 py-3.5 text-sm font-mono font-medium text-neutral-700 dark:text-neutral-300">{t.ticket_number}</td>
                                        <td className="px-5 py-3.5 text-sm text-neutral-600 dark:text-neutral-400">{t.pawn_items?.general_desc || '---'}</td>
                                        <td className="px-5 py-3.5 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                                            {Number(t.principal_loan).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">
                                            {t.interest_rate ? `${t.interest_rate}%` : '---'}
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">
                                            {new Date(t.maturity_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">
                                            {new Date(t.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${statusStyles[t.status] || ''}`}>
                                                {t.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// Confirmation Modal
const ConfirmModal = ({ open, title, message, confirmLabel, confirmColor, onConfirm, onCancel, loading }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-display font-bold text-neutral-800 dark:text-white mb-2">{title}</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">{message}</p>
                <div className="flex items-center justify-end gap-3">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors ${
                            confirmColor === 'red'
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-primary hover:bg-primary/90 text-neutral-900'
                        } disabled:opacity-50`}
                    >
                        {loading ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

const Customers = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [currentPath, setCurrentPath] = useState('/admin/customers');
    const [view, setView] = useState('list'); // 'list' | 'add' | 'profile' | 'history'
    const [tab, setTab] = useState('active'); // 'active' | 'archived'
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [historyCustomerName, setHistoryCustomerName] = useState('');
    const [customers, setCustomers] = useState([]);
    const [archivedCustomers, setArchivedCustomers] = useState([]);
    const [stats, setStats] = useState({ totalCustomers: 0, activeLoanHolders: 0, newThisMonth: 0 });
    const [currentPage, setCurrentPage] = useState(1);
    const [archivedPage, setArchivedPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [archivedTotal, setArchivedTotal] = useState(0);
    const [saveError, setSaveError] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [savedCustomerName, setSavedCustomerName] = useState('');
    const [confirmModal, setConfirmModal] = useState({ open: false, customer: null, action: null });
    const [actionLoading, setActionLoading] = useState(false);
    const [requestsTab, setRequestsTab] = useState('customers'); // 'customers' | 'requests'
    const [accessRequests, setAccessRequests] = useState([]);
    const [reqLoading, setReqLoading] = useState(false);
    const [reqCount, setReqCount] = useState(0);
    const { profile } = useAuth();
    const navigation = getNavigationByRole(profile?.role);

    const itemsPerPage = 5;

    const currentUser = useMemo(() => ({
        name: profile?.full_name || 'User',
        role: profile?.role || 'Admin',
        initials: (profile?.full_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2),
    }), [profile]);

    const navigateTo = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

    const statsData = [
        { icon: 'groups', iconBg: 'bg-primary', iconColor: 'text-white dark:text-neutral-900', badge: '', badgeType: 'success', label: 'Total Customers', value: `${stats.totalCustomers || 0}` },
        { icon: 'assignment_return', iconBg: 'bg-blue-500', iconColor: 'text-white', badge: '', badgeType: 'success', label: 'Active Loan Holders', value: `${stats.activeLoanHolders || 0}` },
        { icon: 'person_add', iconBg: 'bg-purple-500', iconColor: 'text-white', badge: '', badgeType: 'success', label: 'New Customers (MTD)', value: `${stats.newThisMonth || 0}` },
        { icon: 'account_balance_wallet', iconBg: 'bg-emerald-500', iconColor: 'text-white', badge: '', badgeType: 'neutral', label: 'Avg. Customer LV', value: '—' },
    ];

    // Debounce search input (400ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setCurrentPage(1);
            setArchivedPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Fetch pending requests count (for badge)
    useEffect(() => {
        accessRequestsApi.list({ status: 'PENDING' })
            .then(data => setReqCount(Array.isArray(data) ? data.length : 0))
            .catch(() => {});
    }, []);

    // Fetch requests when tab switches to 'requests'
    useEffect(() => {
        if (requestsTab !== 'requests') return;
        setReqLoading(true);
        accessRequestsApi.list({ status: 'PENDING' })
            .then(data => setAccessRequests(Array.isArray(data) ? data : []))
            .catch(() => {})
            .finally(() => setReqLoading(false));
    }, [requestsTab]);

    const fetchData = async () => {
        const [statsRes, listRes, archivedRes] = await Promise.all([
            customersApi.stats(),
            customersApi.list({ page: currentPage, limit: itemsPerPage, search: debouncedSearch }),
            customersApi.archived({ page: 1, limit: 1 }),
        ]);

        setArchivedTotal(archivedRes.total || 0);

        const mapped = (listRes.data || []).map((c) => {
            const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim();
            const initials = fullName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
            return {
                rawId: c.id,
                customerId: `CUS-${String(c.id).slice(0, 8).toUpperCase()}`,
                name: fullName || 'Unknown',
                initials,
                avatar: '',
                email: c.email || '---',
                phone: c.mobile_number || '---',
                totalLoans: c.totalLoans || 0,
                status: c.activeLoans > 0 ? 'Active' : 'Inactive',
                statusType: c.activeLoans > 0 ? 'success' : 'neutral',
            };
        });

        setStats(statsRes);
        setCustomers(mapped);
        setTotalItems(listRes.total || 0);
    };

    const fetchArchived = async () => {
        const res = await customersApi.archived({ page: archivedPage, limit: itemsPerPage, search: debouncedSearch });
        const mapped = (res.data || []).map((c) => {
            const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim();
            const initials = fullName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
            return {
                rawId: c.id,
                customerId: `CUS-${String(c.id).slice(0, 8).toUpperCase()}`,
                name: fullName || 'Unknown',
                initials,
                email: c.email || '---',
                phone: c.mobile_number || '---',
                archivedAt: c.deleted_at,
            };
        });
        setArchivedCustomers(mapped);
        setArchivedTotal(res.total || 0);
    };

    useEffect(() => {
        fetchData().catch((err) => console.error('Customers fetch error:', err));
    }, [currentPage, debouncedSearch]);

    useEffect(() => {
        if (tab === 'archived') {
            fetchArchived().catch((err) => console.error('Archived fetch error:', err));
        }
    }, [archivedPage, debouncedSearch, tab]);

    const handleArchive = async () => {
        if (!confirmModal.customer) return;
        setActionLoading(true);
        try {
            await customersApi.delete(confirmModal.customer.rawId);
            setConfirmModal({ open: false, customer: null, action: null });
            await fetchData();
            if (tab === 'archived') await fetchArchived();
        } catch (err) {
            console.error('Archive error:', err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!confirmModal.customer) return;
        setActionLoading(true);
        try {
            await customersApi.restore(confirmModal.customer.rawId);
            setConfirmModal({ open: false, customer: null, action: null });
            await fetchArchived();
            await fetchData();
        } catch (err) {
            console.error('Restore error:', err);
        } finally {
            setActionLoading(false);
        }
    };

    const handlePermanentDelete = async () => {
        if (!confirmModal.customer) return;
        setActionLoading(true);
        try {
            await customersApi.permanentDelete(confirmModal.customer.rawId);
            setConfirmModal({ open: false, customer: null, action: null });
            await fetchArchived();
        } catch (err) {
            console.error('Permanent delete error:', err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleNavigate = (path) => {
        setCurrentPath(path);
    };

    const handleSaveCustomer = async (payload) => {
        setSaveError('');

        const addressText = [
            payload.address.addressLine1,
            payload.address.addressLine2,
            payload.address.barangay,
            payload.address.cityText,
            payload.address.provinceText,
            payload.address.zipCode,
        ].filter(Boolean).join(', ');

        const docSource = payload.kyc.mode === 'primary'
            ? [payload.kyc.primaryId]
            : payload.kyc.secondaryIds;

        try {
            await customersApi.create({
                first_name: payload.personalInfo.firstName,
                middle_name: payload.personalInfo.middleName || null,
                last_name: payload.personalInfo.lastName,
                date_of_birth: payload.personalInfo.dateOfBirth,
                nationality: 'Filipino',
                present_address: addressText,
                present_address_line1: payload.address.addressLine1,
                present_address_line2: payload.address.addressLine2 || null,
                present_province_code: payload.address.province || null,
                present_province: payload.address.provinceText || null,
                present_city_code: payload.address.city || null,
                present_city: payload.address.cityText || null,
                present_barangay: payload.address.barangay || null,
                present_zip_code: payload.address.zipCode || null,
                mobile_number: payload.personalInfo.mobileNumber,
                email: payload.personalInfo.email,
                risk_rating: 'LOW',
                kyc_documents: docSource.map((d) => ({
                    id_type: d.idType,
                    id_number: d.idNumber,
                    expiry_date: d.issuedDate || null,
                    image_front_url: d.frontFile || 'pending-upload',
                    image_back_url: d.backFile || null,
                    specimen_sig_url: d.frontFile || 'pending-upload',
                })),
            });

            setSavedCustomerName(`${payload.personalInfo.firstName} ${payload.personalInfo.lastName}`);
            setShowSuccess(true);
            await fetchData();
        } catch (err) {
            setSaveError(err.message || 'Unable to create customer.');
            throw err;
        }
    };

    return (
        <div className="admin-layout">
            <Sidebar
                navigation={navigation}
                currentPath={currentPath}
                onNavigate={handleNavigate}
            />

            <main className="admin-main">
                <Header user={currentUser} />
                <div className="admin-content custom-scrollbar">
                    {/* Header — hidden when viewing profile */}
                    {view !== 'profile' && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                            <div>
                                <nav className="flex mb-2" aria-label="Breadcrumb">
                                    <ol className="flex items-center space-x-2">
                                        <li>
                                            <span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Management</span>
                                        </li>
                                        <li>
                                            <span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span>
                                        </li>
                                        <li>
                                            <span className="text-neutral-700 dark:text-white text-sm font-semibold">Customers</span>
                                        </li>
                                    </ol>
                                </nav>
                                <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
                                    Customer Management
                                </h1>
                            </div>
                            <div className="flex items-center gap-4">
                                <button className="header-icon-btn">
                                    <span className="material-symbols-outlined">notifications</span>
                                    <span className="notification-dot" />
                                </button>
                                {view === 'list' && (
                                    <button className="btn-primary" onClick={() => setView('add')}>
                                        <span className="material-symbols-outlined text-lg">person_add</span>
                                        Add New Customer
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Customer Profile view */}
                    {view === 'profile' && selectedCustomerId && (
                        <CustomerProfile
                            customerId={selectedCustomerId}
                            onBack={() => { setView('list'); setSelectedCustomerId(null); }}
                            onViewHistory={(id, name) => { setHistoryCustomerName(name); setView('history'); }}
                        />
                    )}

                    {/* Customer Loan History view */}
                    {view === 'history' && selectedCustomerId && (
                        <CustomerLoanHistory
                            customerId={selectedCustomerId}
                            customerName={historyCustomerName}
                            onBack={() => setView('profile')}
                        />
                    )}

                    {/* Add Customer form view */}
                    {view === 'add' && (
                        <AddCustomer
                            onCancel={() => setView('list')}
                            onSave={handleSaveCustomer}
                            apiError={saveError}
                            onClearError={() => setSaveError('')}
                        />
                    )}

                    {/* KPI Cards */}
                    {view === 'list' && (
                    <>
                    {/* Top-level tabs: All Customers vs Pending Requests */}
                    <div className="flex gap-0 border-b border-neutral-200 dark:border-neutral-700 mb-6">
                        <button onClick={() => setRequestsTab('customers')}
                            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${requestsTab === 'customers' ? 'border-primary text-neutral-900 dark:text-white' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}>
                            All Customers
                        </button>
                        <button onClick={() => setRequestsTab('requests')}
                            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${requestsTab === 'requests' ? 'border-primary text-neutral-900 dark:text-white' : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}>
                            Pending Requests
                            {reqCount > 0 && (
                                <span className="bg-primary text-neutral-900 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{reqCount}</span>
                            )}
                        </button>
                    </div>

                    {requestsTab === 'customers' && (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {statsData.map((stat, index) => (
                            <StatsCard key={index} {...stat} />
                        ))}
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-1 mb-6 border-b border-neutral-200 dark:border-neutral-700">
                        <button
                            onClick={() => { setTab('active'); setCurrentPage(1); }}
                            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                                tab === 'active'
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                            }`}
                        >
                            Active Customers
                        </button>
                        <button
                            onClick={() => { setTab('archived'); setArchivedPage(1); }}
                            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                                tab === 'archived'
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                            }`}
                        >
                            <span className="material-symbols-outlined text-base">inventory_2</span>
                            Archived
                            {archivedTotal > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                                    {archivedTotal}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Filters Row */}
                    <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-6">
                        <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-center">
                            <div className="relative w-full sm:w-96 group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 group-focus-within:text-primary transition-colors">
                                        search
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="loans-search"
                                    placeholder={tab === 'active' ? 'Search customers by name, ID or phone...' : 'Search archived customers...'}
                                />
                            </div>
                        </div>
                        {tab === 'active' && (
                        <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
                            <button className="filter-btn flex items-center gap-2 px-3 py-2 text-sm font-medium">
                                <span className="material-symbols-outlined text-base">filter_list</span>
                                Filters
                            </button>
                            <button className="filter-btn flex items-center gap-2 px-3 py-2 text-sm font-medium">
                                <span className="material-symbols-outlined text-base">download</span>
                                Export
                            </button>
                        </div>
                        )}
                    </div>

                    {/* Active Customers Table */}
                    {tab === 'active' && (
                    <div className="loans-table-container">
                        <div className="overflow-x-auto custom-scrollbar flex-1">
                            <table className="min-w-full text-center text-sm whitespace-nowrap">
                                <thead className="loans-table-header">
                                    <tr>
                                        <th scope="col" className="table-th">Customer ID</th>
                                        <th scope="col" className="table-th">Customer Name</th>
                                        <th scope="col" className="table-th">Email</th>
                                        <th scope="col" className="table-th">Phone Number</th>
                                        <th scope="col" className="table-th">Total Loans</th>
                                        <th scope="col" className="table-th">Status</th>
                                        <th scope="col" className="table-th">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                    {customers.map((customer) => (
                                        <CustomerRow
                                            key={customer.customerId}
                                            customer={customer}
                                            onViewProfile={(id) => { setSelectedCustomerId(id); setView('profile'); }}
                                            onArchive={(c) => setConfirmModal({ open: true, customer: c, action: 'archive' })}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={Math.max(1, Math.ceil(totalItems / itemsPerPage))}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            itemLabel="customers"
                            onPageChange={setCurrentPage}
                        />
                    </div>
                    )}

                    {/* Archived Customers Table */}
                    {tab === 'archived' && (
                    <div className="loans-table-container">
                        <div className="overflow-x-auto custom-scrollbar flex-1">
                            {archivedCustomers.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-500">
                                    <span className="material-symbols-outlined text-5xl mb-3">inventory_2</span>
                                    <p className="text-sm font-medium">No archived customers</p>
                                    <p className="text-xs mt-1">Deleted customers will appear here</p>
                                </div>
                            ) : (
                            <table className="min-w-full text-center text-sm whitespace-nowrap">
                                <thead className="loans-table-header">
                                    <tr>
                                        <th scope="col" className="table-th">Customer ID</th>
                                        <th scope="col" className="table-th">Customer Name</th>
                                        <th scope="col" className="table-th">Email</th>
                                        <th scope="col" className="table-th">Phone Number</th>
                                        <th scope="col" className="table-th">Archived Date</th>
                                        <th scope="col" className="table-th">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                    {archivedCustomers.map((customer) => (
                                        <ArchivedRow
                                            key={customer.rawId}
                                            customer={customer}
                                            onRestore={(c) => setConfirmModal({ open: true, customer: c, action: 'restore' })}
                                            onPermanentDelete={(c) => setConfirmModal({ open: true, customer: c, action: 'permanent' })}
                                        />
                                    ))}
                                </tbody>
                            </table>
                            )}
                        </div>
                        {archivedCustomers.length > 0 && (
                        <Pagination
                            currentPage={archivedPage}
                            totalPages={Math.max(1, Math.ceil(archivedTotal / itemsPerPage))}
                            totalItems={archivedTotal}
                            itemsPerPage={itemsPerPage}
                            itemLabel="archived customers"
                            onPageChange={setArchivedPage}
                        />
                        )}
                    </div>
                    )}

                    {/* Confirmation Modal */}
                    <ConfirmModal
                        open={confirmModal.open}
                        title={
                            confirmModal.action === 'archive' ? 'Archive Customer'
                                : confirmModal.action === 'permanent' ? 'Permanently Delete Customer'
                                : 'Restore Customer'
                        }
                        message={
                            confirmModal.action === 'archive'
                                ? `Are you sure you want to archive "${confirmModal.customer?.name}"? The customer data will be moved to the archived section and can be restored later.`
                                : confirmModal.action === 'permanent'
                                ? `Are you sure you want to permanently delete "${confirmModal.customer?.name}"? This action cannot be undone and all associated data will be removed.`
                                : `Are you sure you want to restore "${confirmModal.customer?.name}"? The customer will be moved back to the active customers list.`
                        }
                        confirmLabel={
                            confirmModal.action === 'archive' ? 'Archive'
                                : confirmModal.action === 'permanent' ? 'Delete Forever'
                                : 'Restore'
                        }
                        confirmColor={confirmModal.action === 'restore' ? 'green' : 'red'}
                        onConfirm={
                            confirmModal.action === 'archive' ? handleArchive
                                : confirmModal.action === 'permanent' ? handlePermanentDelete
                                : handleRestore
                        }
                        onCancel={() => setConfirmModal({ open: false, customer: null, action: null })}
                        loading={actionLoading}
                    />
                    </>
                    )}

                    {requestsTab === 'requests' && (
                        <div>
                            {reqLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
                                </div>
                            ) : accessRequests.length === 0 ? (
                                <div className="text-center py-16 text-neutral-400">No pending requests.</div>
                            ) : (
                                <table className="loan-table w-full">
                                    <thead>
                                        <tr>
                                            <th className="loan-th text-left">Name</th>
                                            <th className="loan-th">Email</th>
                                            <th className="loan-th">Mobile</th>
                                            <th className="loan-th">Requested</th>
                                            <th className="loan-th">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {accessRequests.map(r => (
                                            <tr key={r.id} className="loan-row cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                                                onClick={() => navigateTo(`/admin/customers/requests/${r.id}`)}>
                                                <td className="px-6 py-4 text-sm font-semibold text-neutral-800 dark:text-neutral-200">{r.full_name}</td>
                                                <td className="px-6 py-4 text-sm text-center text-neutral-500">{r.email}</td>
                                                <td className="px-6 py-4 text-sm text-center text-neutral-500">{r.mobile_number || '—'}</td>
                                                <td className="px-6 py-4 text-sm text-center text-neutral-500">{new Date(r.requested_at).toLocaleDateString('en-PH')}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                                                        <button className="btn-primary text-xs px-3 py-1.5"
                                                            onClick={async () => {
                                                                try {
                                                                    await accessRequestsApi.approve(r.id);
                                                                    setAccessRequests(prev => prev.filter(x => x.id !== r.id));
                                                                    setReqCount(c => Math.max(0, c - 1));
                                                                } catch (err) { alert(err.message); }
                                                            }}>
                                                            Approve
                                                        </button>
                                                        <button className="btn-outline text-xs px-3 py-1.5 text-red-500 border-red-200 dark:border-red-900"
                                                            onClick={() => navigateTo(`/admin/customers/requests/${r.id}`)}>
                                                            Review
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                    </>
                    )}
                </div>
            </main>

            {/* ── Success Modal ── */}
            {showSuccess && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-sm text-center overflow-hidden">
                        <div className="px-8 pt-8 pb-6">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-4xl">check_circle</span>
                            </div>
                            <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-1">Customer Added</h3>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                <span className="font-semibold text-neutral-700 dark:text-neutral-200">{savedCustomerName}</span> has been successfully added to the system.
                            </p>
                        </div>
                        <div className="px-8 pb-6">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowSuccess(false);
                                    setSavedCustomerName('');
                                    setView('list');
                                }}
                                className="w-full px-5 py-2.5 rounded-lg text-sm font-bold bg-primary hover:bg-primary-hover text-white dark:text-neutral-900 shadow-sm shadow-primary/20 transition-all active:scale-[0.98]"
                            >
                                Back to Customers
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Customers;
