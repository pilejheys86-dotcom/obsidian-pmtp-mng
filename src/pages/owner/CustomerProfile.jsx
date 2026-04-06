import { useEffect, useState } from 'react';
import { customersApi } from '../../lib/api';

const ID_TYPE_LABELS = {
  PHILSYS: 'PhilSys National ID', DRIVERS_LICENSE: "Driver's License",
  SSS: 'SSS ID', PHILHEALTH: 'PhilHealth ID', TIN: 'TIN ID',
  POSTAL: 'Postal ID', POSTAL_ID: 'Postal ID', VOTERS: "Voter's ID",
  VOTERS_ID: "Voter's ID", PRC: 'PRC ID', PRC_ID: 'PRC ID',
  PASSPORT: 'Passport', UMID: 'UMID', GSIS: 'GSIS ID',
}
const formatIdType = (code) => code ? (ID_TYPE_LABELS[code] || code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) : code

// ── Reusable components (matching ProfilePage pattern) ──

const SectionHeader = ({ title }) => (
    <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 pb-4 pt-8 first:pt-0">
        {title}
    </h2>
);

const AccountRow = ({ label, value, description, action }) => (
    <div className="account-row">
        <div className="flex-1">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</p>
            {value && <p className="text-sm text-neutral-500 dark:text-neutral-400">{value}</p>}
            {description && <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{description}</p>}
        </div>
        {action}
    </div>
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
            : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-600'
    }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
        {active ? 'Active' : 'Inactive'}
    </span>
);

const RiskBadge = ({ risk }) => {
    const styles = {
        LOW: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
        MEDIUM: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
        HIGH: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
    };
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${styles[risk] || styles.LOW}`}>
            {risk || 'LOW'}
        </span>
    );
};

const LoanRow = ({ ticket }) => {
    const statusStyles = {
        ACTIVE: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
        REDEEMED: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
        EXPIRED: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
        FORFEITED: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
        RENEWED: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    };

    return (
        <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
            <td className="px-4 py-3 text-sm font-mono font-medium text-neutral-700 dark:text-neutral-300">{ticket.ticket_number}</td>
            <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">{ticket.pawn_items?.general_desc || '---'}</td>
            <td className="px-4 py-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                {Number(ticket.principal_loan).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
            </td>
            <td className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
                {new Date(ticket.maturity_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
            </td>
            <td className="px-4 py-3">
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${statusStyles[ticket.status] || ''}`}>
                    {ticket.status}
                </span>
            </td>
        </tr>
    );
};

// ── Main Component ──────────────────────────────────────

const CustomerProfile = ({ customerId, onBack, onViewHistory }) => {
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!customerId) return;
        setLoading(true);
        customersApi.get(customerId)
            .then((data) => setCustomer(data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [customerId]);

    const fullName = customer ? `${customer.first_name || ''} ${customer.middle_name || ''} ${customer.last_name || ''}`.replace(/\s+/g, ' ').trim() : '';
    const initials = fullName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    const activeLoans = (customer?.pawn_tickets || []).filter((t) => t.status === 'ACTIVE').length;
    const totalLoans = (customer?.pawn_tickets || []).length;

    const fullAddress = customer ? [
        customer.present_address,
        customer.barangay,
        customer.city_municipality,
        customer.province,
        customer.zip_code,
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
                            <li><button onClick={onBack} className="text-neutral-400 dark:text-neutral-500 text-xs font-medium hover:text-primary transition-colors">Customers</button></li>
                            <li><span className="text-neutral-300 dark:text-neutral-600 text-xs">/</span></li>
                            <li><span className="text-neutral-700 dark:text-white text-xs font-semibold">Profile</span></li>
                        </ol>
                    </nav>
                    <h1 className="text-xl font-display font-bold text-neutral-800 dark:text-neutral-100">Customer Profile</h1>
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

            {customer && !loading && (
                <div className="pl-14">

                    {/* ── Customer header ───────────────── */}
                    <div className="account-row mt-2">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-sm font-bold text-neutral-600 dark:text-neutral-300">
                                {initials}
                            </div>
                            <div>
                                <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{fullName}</span>
                                <p className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">CUS-{String(customer.id).slice(0, 8).toUpperCase()}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <StatusPill active={activeLoans > 0} />
                            <RiskBadge risk={customer.risk_rating} />
                            <div className="flex items-center gap-6 ml-4 pl-4 border-l border-neutral-200/60 dark:border-neutral-700/50">
                                <div className="text-center">
                                    <p className="text-xl font-extrabold text-neutral-800 dark:text-neutral-100">{activeLoans}</p>
                                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium uppercase tracking-wider">Active</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-xl font-extrabold text-neutral-800 dark:text-neutral-100">{totalLoans}</p>
                                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium uppercase tracking-wider">Total</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Personal Information ──────────── */}
                    <SectionHeader title="Personal Information" />

                    <FieldRow>
                        <FieldCell label="Full Name" value={fullName} />
                        <FieldCell
                            label="Date of Birth"
                            value={customer.date_of_birth
                                ? new Date(customer.date_of_birth).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
                                : null}
                        />
                        <FieldCell label="Nationality" value={customer.nationality} />
                    </FieldRow>
                    <FieldRow>
                        <FieldCell label="Mobile Number" value={customer.mobile_number} />
                        <FieldCell label="Email" value={customer.email} />
                    </FieldRow>

                    {/* ── Address ───────────────────────── */}
                    <SectionHeader title="Address" />

                    <FieldRow>
                        <FieldCell label="Province" value={customer.province} />
                        <FieldCell label="City / Municipality" value={customer.city_municipality} />
                        <FieldCell label="Barangay" value={customer.barangay} />
                        <FieldCell label="ZIP Code" value={customer.zip_code} />
                    </FieldRow>
                    <FieldRow>
                        <div className="py-4 col-span-2 md:col-span-3 lg:col-span-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5">Full Address</p>
                            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{fullAddress || '---'}</p>
                        </div>
                    </FieldRow>

                    {/* ── KYC Documents ─────────────────── */}
                    {customer.kyc_documents && customer.kyc_documents.length > 0 && (
                        <>
                            <SectionHeader title="KYC Documents" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-neutral-200/60 dark:border-neutral-800/60">
                                {customer.kyc_documents.map((doc, i) => {
                                    const meta = doc.metadata || {};
                                    return (
                                        <div key={doc.id || i} className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700/40 overflow-hidden">
                                            {doc.image_url && (
                                                <img src={doc.image_url} alt={`${meta.id_type || ''} ${doc.label || ''}`} className="w-full h-40 object-cover" />
                                            )}
                                            <div className="p-3 flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                                                    <span className="material-symbols-outlined text-base text-neutral-500 dark:text-neutral-400">id_card</span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{formatIdType(meta.id_type)} — {doc.label}</p>
                                                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{meta.id_number}</p>
                                                </div>
                                                {meta.expiry_date && (
                                                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                                                        {new Date(meta.expiry_date).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* ── Loan History (recent 3) ─────────── */}
                    <SectionHeader title="Loan History" />

                    {totalLoans === 0 ? (
                        <div className="py-4 border-b border-neutral-200/60 dark:border-neutral-800/60">
                            <p className="text-sm text-neutral-400 dark:text-neutral-500">No loan history yet.</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto border-b border-neutral-200/60 dark:border-neutral-800/60">
                                <table className="min-w-full text-left">
                                    <thead>
                                        <tr className="border-b border-neutral-200/60 dark:border-neutral-700/50">
                                            <th className="px-4 pb-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Ticket #</th>
                                            <th className="px-4 pb-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Item</th>
                                            <th className="px-4 pb-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Principal</th>
                                            <th className="px-4 pb-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Maturity</th>
                                            <th className="px-4 pb-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/30">
                                        {(customer.pawn_tickets || []).slice(0, 3).map((t) => (
                                            <LoanRow key={t.id} ticket={t} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {totalLoans > 3 && (
                                <div className="pt-4 pb-2">
                                    <button
                                        onClick={() => onViewHistory && onViewHistory(customerId, fullName)}
                                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                                    >
                                        View Full History
                                        <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default CustomerProfile;
