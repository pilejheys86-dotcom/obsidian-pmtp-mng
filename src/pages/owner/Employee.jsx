import { useEffect, useMemo, useState } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { Pagination, Modal } from '../../components/ui';
import { getNavigationByRole } from '../../config';
import AddEmployee from './AddEmployee';
import EmployeeProfile from './EmployeeProfile';
import { useAuth } from '../../context';
import { employeesApi } from '../../lib/api';

// Stats Card Component
const StatsCard = ({ icon, iconBg, iconColor, badge, badgeType, label, value }) => {
    const isPositive = badgeType === 'success';
    const isWarning = badgeType === 'danger';

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

// Status Badge Component
const StatusBadge = ({ status, type }) => {
    const statusClasses = {
        success: 'bg-primary/10 text-primary border-primary/20',
        warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        danger: 'bg-red-500/10 text-red-500 border-red-500/20',
    };

    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${statusClasses[type]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${type === 'success' ? 'bg-primary' : type === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
            {status}
        </span>
    );
};

// KYC Status Badge Component
const KycBadge = ({ status }) => {
    const styles = {
        VERIFIED:  'bg-primary/10 text-primary border-primary/20',
        SUBMITTED: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        REJECTED:  'bg-red-500/10 text-red-500 border-red-500/20',
        PENDING:   'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border-neutral-200 dark:border-neutral-700',
    };
    const labels = { VERIFIED: 'Verified', SUBMITTED: 'Submitted', REJECTED: 'Rejected', PENDING: 'Pending' };
    const key = status || 'PENDING';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${styles[key] || styles.PENDING}`}>
            {labels[key] || key}
        </span>
    );
};

// Employee Row Component
const EmployeeRow = ({ employee, onView, onSuspend, onKycAction, canSuspend }) => {
    return (
        <tr className="loan-row">
            <td className="px-6 py-4 text-center text-sm font-mono text-neutral-500 dark:text-neutral-400">{employee.id}</td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-3 w-52 mx-auto">
                    <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                        {employee.avatar ? (
                            <img alt={employee.name} className="w-full h-full object-cover object-center" src={employee.avatar} />
                        ) : (
                            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">{employee.initials}</span>
                        )}
                    </div>
                    <span className="text-sm font-semibold text-neutral-800 dark:text-white truncate">{employee.name}</span>
                </div>
            </td>
            <td className="px-6 py-4 text-center">
                <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-sm text-xs font-medium">
                    {employee.role}
                </span>
            </td>
            <td className="px-6 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{employee.email}</td>
            <td className="px-6 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{employee.dateJoined}</td>
            <td className="px-6 py-4 text-center">
                <StatusBadge status={employee.status} type={employee.statusType} />
            </td>
            <td className="px-6 py-4 text-center">
                <KycBadge status={employee.kyc_status} />
            </td>
            <td className="px-6 py-4 text-center">
                <div className="flex items-center justify-center gap-1">
                    <button
                        onClick={() => onView(employee)}
                        className="text-neutral-400 hover:text-primary transition-colors"
                        title="View Profile"
                    >
                        <span className="material-symbols-outlined">visibility</span>
                    </button>
                    {(employee.kyc_status === 'SUBMITTED' || employee.kyc_status === 'PENDING') && (
                        <>
                            <button
                                onClick={() => onKycAction(employee, 'approve')}
                                className="text-neutral-400 hover:text-primary transition-colors"
                                title="Approve KYC"
                            >
                                <span className="material-symbols-outlined">verified</span>
                            </button>
                            <button
                                onClick={() => onKycAction(employee, 'reject')}
                                className="text-neutral-400 hover:text-red-500 transition-colors"
                                title="Reject KYC"
                            >
                                <span className="material-symbols-outlined">cancel</span>
                            </button>
                        </>
                    )}
                    {canSuspend && (
                        <button
                            onClick={() => onSuspend(employee)}
                            className={`transition-colors ${employee.isActive ? 'text-neutral-400 hover:text-red-500' : 'text-neutral-400 hover:text-primary'}`}
                            title={employee.isActive ? 'Suspend Account' : 'Reactivate Account'}
                        >
                            <span className="material-symbols-outlined">
                                {employee.isActive ? 'block' : 'check_circle'}
                            </span>
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
};

const Employee = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [currentPath, setCurrentPath] = useState('/admin/employees');
    const [view, setView] = useState('list'); // 'list' | 'add' | 'profile'
    const [tab, setTab] = useState('active'); // 'active' | 'suspended'
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [stats, setStats] = useState({ totalEmployees: 0, activeStaff: 0, roles: 0 });
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [suspendedCount, setSuspendedCount] = useState(0);
    const { profile } = useAuth();
    const navigation = getNavigationByRole(profile?.role);

    const itemsPerPage = 5;

    const currentUser = useMemo(() => ({
        name: profile?.full_name || 'User',
        role: profile?.role || 'Admin',
        initials: (profile?.full_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2),
    }), [profile]);

    const statsData = [
        { icon: 'groups', iconBg: 'bg-primary', iconColor: 'text-white dark:text-neutral-900', badge: '', badgeType: 'success', label: 'Total Employees', value: `${stats.totalEmployees || 0}` },
        { icon: 'person_check', iconBg: 'bg-blue-500', iconColor: 'text-white', badge: '', badgeType: 'danger', label: 'Active Staff', value: `${stats.activeStaff || 0}` },
        { icon: 'badge', iconBg: 'bg-purple-500', iconColor: 'text-white', badge: '', badgeType: 'neutral', label: 'Roles', value: `${stats.roles || 0}` },
        { icon: 'trending_up', iconBg: 'bg-emerald-500', iconColor: 'text-white', badge: '', badgeType: 'success', label: 'Avg. Performance', value: '—' },
    ];

    // Debounce search input (400ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setCurrentPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const mapEmployees = (data) => (data || []).map((e) => {
        const initials = (e.full_name || 'U')
            .split(' ')
            .filter(Boolean)
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
        return {
            rawId: e.id,
            id: `EMP-${String(e.id).slice(0, 8)}`,
            name: e.full_name || 'Unknown',
            avatar: '',
            initials,
            role: e.role,
            email: e.email || '—',
            phone: e.phone_number || '—',
            branch: e.branches?.branch_name || '—',
            dateJoined: new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            status: e.is_active ? 'Active' : 'Suspended',
            statusType: e.is_active ? 'success' : 'danger',
            isActive: e.is_active,
            kyc_status: e.kyc_status || 'PENDING',
        };
    });

    const fetchData = async () => {
        const activeFilter = tab === 'active' ? 'true' : 'false';
        const [statsRes, listRes, oppositeRes] = await Promise.all([
            employeesApi.stats(),
            employeesApi.list({ page: currentPage, limit: itemsPerPage, search: debouncedSearch, active: activeFilter }),
            employeesApi.list({ page: 1, limit: 1, active: tab === 'active' ? 'false' : 'true' }),
        ]);

        setStats(statsRes);
        setEmployees(mapEmployees(listRes.data));
        setTotalItems(listRes.total || 0);
        if (tab === 'active') {
            setSuspendedCount(oppositeRes.total || 0);
        } else {
            setSuspendedCount(listRes.total || 0);
        }
    };

    useEffect(() => {
        fetchData().catch((err) => console.error('Employees fetch error:', err));
    }, [currentPage, debouncedSearch, tab]);

    // ── Modal state ──────────────────────────────────────
    const [suspendModal, setSuspendModal] = useState({ open: false, employee: null, loading: false });
    const [kycModal, setKycModal] = useState({ open: false, employee: null, action: null, loading: false });

    // ── Suspend / Reactivate ─────────────────────────────
    const handleSuspendConfirm = async () => {
        const emp = suspendModal.employee;
        if (!emp) return;
        setSuspendModal((prev) => ({ ...prev, loading: true }));
        try {
            await employeesApi.update(emp.rawId, { is_active: !emp.isActive });
            setSuspendModal({ open: false, employee: null, loading: false });
            await fetchData();
        } catch (err) {
            console.error('Suspend/reactivate failed:', err);
            setSuspendModal((prev) => ({ ...prev, loading: false }));
        }
    };

    // ── Approve / Reject KYC ──────────────────────────────
    const handleKycConfirm = async () => {
        const { employee: emp, action } = kycModal;
        if (!emp) return;
        setKycModal((prev) => ({ ...prev, loading: true }));
        try {
            if (action === 'approve') {
                await employeesApi.approveKyc(emp.rawId);
            } else {
                await employeesApi.rejectKyc(emp.rawId);
            }
            setKycModal({ open: false, employee: null, action: null, loading: false });
            await fetchData();
        } catch (err) {
            console.error('KYC action failed:', err);
            setKycModal((prev) => ({ ...prev, loading: false }));
        }
    };

    const canSuspendEmployee = (employee) => {
        const myRole = profile?.role;
        const myId = profile?.id;
        const isSelf = employee.rawId === myId;
        return !isSelf && (myRole === 'OWNER' || myRole === 'ADMIN' || (myRole === 'MANAGER' && employee.role !== 'MANAGER'));
    };

    const handleNavigate = (path) => {
        setCurrentPath(path);
    };

    const handleSaveEmployee = async (form) => {
        await employeesApi.create(form);
        setView('list');
        await fetchData();
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
                                            <span className="text-neutral-700 dark:text-white text-sm font-semibold">Employees</span>
                                        </li>
                                    </ol>
                                </nav>
                                <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
                                    Employee Management
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
                                        Add New Employee
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Employee Profile view */}
                    {view === 'profile' && selectedEmployeeId && (
                        <EmployeeProfile
                            employeeId={selectedEmployeeId}
                            onBack={() => { setView('list'); setSelectedEmployeeId(null); }}
                        />
                    )}

                    {/* Add Employee form view */}
                    {view === 'add' && (
                        <AddEmployee
                            onCancel={() => setView('list')}
                            onSave={handleSaveEmployee}
                        />
                    )}

                    {/* KPI Cards */}
                    {view === 'list' && (
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
                                Active Employees
                            </button>
                            <button
                                onClick={() => { setTab('suspended'); setCurrentPage(1); }}
                                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                                    tab === 'suspended'
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                                }`}
                            >
                                <span className="material-symbols-outlined text-base">block</span>
                                Suspended
                                {suspendedCount > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                                        {suspendedCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </>
                    )}

                    {/* Filters Row */}
                    {view === 'list' && (
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
                                        placeholder={tab === 'active' ? 'Search employees by name, ID or role...' : 'Search suspended employees...'}
                                    />
                                </div>
                            </div>
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
                        </div>
                    )}

                    {/* Employees Table */}
                    {view === 'list' && (
                        <div className="loans-table-container">
                            <div className="overflow-x-auto custom-scrollbar flex-1">
                                <table className="min-w-full text-center text-sm whitespace-nowrap">
                                    <thead className="loans-table-header">
                                        <tr>
                                            <th scope="col" className="table-th">Employee ID</th>
                                            <th scope="col" className="table-th">Name & Profile</th>
                                            <th scope="col" className="table-th">Role</th>
                                            <th scope="col" className="table-th">Email / Contact</th>
                                            <th scope="col" className="table-th">Date Joined</th>
                                            <th scope="col" className="table-th">Status</th>
                                            <th scope="col" className="table-th">KYC</th>
                                            <th scope="col" className="table-th">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                        {employees.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" className="px-6 py-16 text-center">
                                                    <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-600 mb-2 block">
                                                        {tab === 'active' ? 'group_off' : 'block'}
                                                    </span>
                                                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                                        {tab === 'active' ? 'No active employees found.' : 'No suspended employees found.'}
                                                    </p>
                                                </td>
                                            </tr>
                                        ) : (
                                            employees.map((employee) => (
                                                <EmployeeRow
                                                    key={employee.id}
                                                    employee={employee}
                                                    onView={(emp) => { setSelectedEmployeeId(emp.rawId); setView('profile'); }}
                                                    onSuspend={(emp) => setSuspendModal({ open: true, employee: emp, loading: false })}
                                                    onKycAction={(emp, action) => setKycModal({ open: true, employee: emp, action, loading: false })}
                                                    canSuspend={canSuspendEmployee(employee)}
                                                />
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {/* Pagination */}
                            <Pagination
                                currentPage={currentPage}
                                totalPages={Math.max(1, Math.ceil(totalItems / itemsPerPage))}
                                totalItems={totalItems}
                                itemsPerPage={itemsPerPage}
                                itemLabel="employees"
                                onPageChange={setCurrentPage}
                            />
                        </div>
                    )}
                </div>
            </main>

            {/* ── Suspend / Reactivate Confirmation Modal ── */}
            <Modal
                open={suspendModal.open}
                onClose={() => setSuspendModal({ open: false, employee: null, loading: false })}
                title={suspendModal.employee?.isActive ? 'Suspend Employee' : 'Reactivate Employee'}
                size="sm"
            >
                {suspendModal.employee && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-700/30">
                            <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-white">
                                {suspendModal.employee.initials}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-neutral-800 dark:text-white">{suspendModal.employee.name}</p>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">{suspendModal.employee.role} &middot; {suspendModal.employee.email}</p>
                            </div>
                        </div>

                        <p className="text-sm text-neutral-600 dark:text-neutral-300">
                            {suspendModal.employee.isActive
                                ? 'This will suspend the employee\'s account. They will no longer be able to log in or access the system until reactivated.'
                                : 'This will reactivate the employee\'s account, restoring their ability to log in and access the system.'}
                        </p>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setSuspendModal({ open: false, employee: null, loading: false })}
                                className="btn-outline"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSuspendConfirm}
                                disabled={suspendModal.loading}
                                className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-sm text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                                    suspendModal.employee.isActive
                                        ? 'bg-red-500 hover:bg-red-600 text-white'
                                        : 'bg-primary hover:bg-primary-hover text-white dark:text-neutral-900'
                                }`}
                            >
                                {suspendModal.loading ? (
                                    <>
                                        <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                                        Processing...
                                    </>
                                ) : suspendModal.employee.isActive ? (
                                    <>
                                        <span className="material-symbols-outlined text-[18px]">block</span>
                                        Suspend
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                        Reactivate
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── KYC Approve / Reject Confirmation Modal ── */}
            <Modal
                open={kycModal.open}
                onClose={() => setKycModal({ open: false, employee: null, action: null, loading: false })}
                title={kycModal.action === 'approve' ? 'Approve KYC' : 'Reject KYC'}
                size="sm"
            >
                {kycModal.employee && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-700/30">
                            <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-white">
                                {kycModal.employee.initials}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-neutral-800 dark:text-white">{kycModal.employee.name}</p>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">{kycModal.employee.role} &middot; {kycModal.employee.email}</p>
                            </div>
                        </div>

                        <p className="text-sm text-neutral-600 dark:text-neutral-300">
                            {kycModal.action === 'approve'
                                ? 'This will verify the employee\'s KYC documents and mark their identity as confirmed.'
                                : 'This will reject the employee\'s KYC submission. They will need to resubmit their documents.'}
                        </p>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setKycModal({ open: false, employee: null, action: null, loading: false })}
                                className="btn-outline"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleKycConfirm}
                                disabled={kycModal.loading}
                                className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-sm text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                                    kycModal.action === 'approve'
                                        ? 'bg-primary hover:bg-primary-hover text-white dark:text-neutral-900'
                                        : 'bg-red-500 hover:bg-red-600 text-white'
                                }`}
                            >
                                {kycModal.loading ? (
                                    <>
                                        <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                                        Processing...
                                    </>
                                ) : kycModal.action === 'approve' ? (
                                    <>
                                        <span className="material-symbols-outlined text-[18px]">verified</span>
                                        Approve
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[18px]">cancel</span>
                                        Reject
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Employee;