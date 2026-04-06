import { useEffect, useState } from 'react';
import { employeesApi } from '../../lib/api';

const SectionHeader = ({ title }) => (
    <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 pb-4 pt-8 first:pt-0">
        {title}
    </h2>
);

const FieldCell = ({ label, value }) => (
    <div className="py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5">{label}</p>
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{value || '---'}</p>
    </div>
);

const FieldRow = ({ children }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 border-b border-neutral-200/60 dark:border-neutral-800/60">
        {children}
    </div>
);

const StatusPill = ({ active }) => (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase border ${
        active
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800'
    }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-red-500'}`} />
        {active ? 'Active' : 'Suspended'}
    </span>
);

const RoleBadge = ({ role }) => (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
        {role}
    </span>
);

const EmployeeProfile = ({ employeeId, onBack }) => {
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!employeeId) return;
        setLoading(true);
        employeesApi.get(employeeId)
            .then((data) => setEmployee(data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [employeeId]);

    const fullName = employee?.full_name || '';
    const initials = fullName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();

    const fullAddress = employee ? [
        employee.address_line_1,
        employee.address_line_2,
        employee.barangay,
        employee.city_municipality,
        employee.province,
        employee.zip_code,
    ].filter(Boolean).join(', ') : '';

    return (
        <div>
            {/* Back button + header */}
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={onBack}
                    className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                >
                    <span className="material-symbols-outlined text-xl">arrow_back</span>
                </button>
                <div>
                    <nav className="flex mb-1" aria-label="Breadcrumb">
                        <ol className="flex items-center space-x-2">
                            <li><span className="text-neutral-400 dark:text-neutral-500 text-xs font-medium">Management</span></li>
                            <li><span className="text-neutral-300 dark:text-neutral-600 text-xs">/</span></li>
                            <li><button onClick={onBack} className="text-neutral-400 dark:text-neutral-500 text-xs font-medium hover:text-primary transition-colors">Employees</button></li>
                            <li><span className="text-neutral-300 dark:text-neutral-600 text-xs">/</span></li>
                            <li><span className="text-neutral-700 dark:text-white text-xs font-semibold">Profile</span></li>
                        </ol>
                    </nav>
                    <h1 className="text-xl font-display font-bold text-neutral-800 dark:text-neutral-100">Employee Profile</h1>
                </div>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-20">
                    <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                </div>
            )}

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-600 dark:text-red-400">
                    {error}
                </div>
            )}

            {employee && !loading && (
                <div className="pl-14">

                    {/* ── Employee header ───────────────── */}
                    <div className="account-row mt-2">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-sm font-bold text-neutral-600 dark:text-neutral-300">
                                {initials}
                            </div>
                            <div>
                                <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{fullName}</span>
                                <p className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">EMP-{String(employee.id).slice(0, 8).toUpperCase()}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <StatusPill active={employee.is_active} />
                            <RoleBadge role={employee.role} />
                        </div>
                    </div>

                    {/* ── Work Information ──────────────── */}
                    <SectionHeader title="Work Information" />

                    <FieldRow>
                        <FieldCell label="Role" value={employee.role} />
                        <FieldCell label="Branch" value={employee.branches?.branch_name} />
                        <FieldCell label="Work Email" value={employee.email} />
                        <FieldCell
                            label="Date Joined"
                            value={employee.created_at
                                ? new Date(employee.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                                : null}
                        />
                    </FieldRow>

                    {/* ── Personal Information ──────────── */}
                    <SectionHeader title="Personal Information" />

                    <FieldRow>
                        <FieldCell label="Full Name" value={fullName} />
                        <FieldCell label="Phone" value={employee.phone_number} />
                        <FieldCell label="Email" value={employee.email} />
                        <FieldCell
                            label="Date of Birth"
                            value={employee.date_of_birth
                                ? new Date(employee.date_of_birth).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                                : null}
                        />
                    </FieldRow>

                    {/* ── Address ───────────────────────── */}
                    <SectionHeader title="Address" />

                    <FieldRow>
                        <FieldCell label="Province" value={employee.province} />
                        <FieldCell label="City / Municipality" value={employee.city_municipality} />
                        <FieldCell label="Barangay" value={employee.barangay} />
                        <FieldCell label="ZIP Code" value={employee.zip_code} />
                    </FieldRow>
                    {fullAddress && (
                        <FieldRow>
                            <div className="py-4 col-span-2 md:col-span-3 lg:col-span-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5">Full Address</p>
                                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{fullAddress}</p>
                            </div>
                        </FieldRow>
                    )}

                    {/* ── Actions ───────────────────────── */}
                    <SectionHeader title="Actions" />

                    <div className="flex items-center gap-3 pb-4">
                        <button className="account-row-btn">Edit Employee</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeProfile;
