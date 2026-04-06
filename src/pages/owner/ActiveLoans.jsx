import { useEffect, useMemo, useState } from 'react';
import { Sidebar, Header } from '../../components/layout';
import { Pagination, StatsCard, StatusBadge, Modal, EmptyState } from '../../components/ui';
import { getNavigationByRole } from '../../config';
import { useAuth } from '../../context';
import { pawnTicketsApi, renewalsApi, paymentsApi, loanSettingsApi } from '../../lib/api';

// Payment method options
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'GCASH', label: 'GCash' },
  { value: 'PAYMAYA', label: 'PayMaya' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
];

// Status → badge type mapping
const STATUS_TYPE_MAP = {
  ACTIVE: 'success',
  RENEWED: 'info',
  REDEEMED: 'neutral',
  EXPIRED: 'warning',
  FORFEITED: 'danger',
};


// Penalty computation helper
const computePenalty = (ticket, penaltyRate = 3) => {
  if (!ticket.maturity_date) return { penaltyAmount: 0, overdueMonths: 0 }
  const now = new Date()
  const maturity = new Date(ticket.maturity_date)
  if (now <= maturity) return { penaltyAmount: 0, overdueMonths: 0 }

  const overdueMs = now - maturity
  const overdueMonths = Math.ceil(overdueMs / (30 * 24 * 60 * 60 * 1000))
  const penaltyAmount = Number(ticket.principal_loan) * (penaltyRate / 100) * overdueMonths
  return { penaltyAmount, overdueMonths }
}

// Select Dropdown Component
const SelectDropdown = ({ options, placeholder, className = '', value, onChange }) => (
  <div className={`relative ${className}`}>
    <select className="loans-select" value={value} onChange={(e) => onChange?.(e.target.value)}>
      {placeholder && <option disabled value="">{placeholder}</option>}
      {options.map((option, index) => (
        <option key={index} value={option.value || option}>
          {option.label || option}
        </option>
      ))}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-neutral-500">
      <span className="material-symbols-outlined text-sm">expand_more</span>
    </div>
  </div>
);

// Loan Row Component
const LoanRow = ({ loan, onAction }) => {
  const interestClasses = {
    positive: 'text-primary',
    neutral: 'text-neutral-400 dark:text-neutral-400',
    danger: 'text-red-400',
  };

  const dueDateClass = loan.statusType === 'danger' ? 'text-red-400 font-medium' : 'text-neutral-400 dark:text-neutral-400';

  return (
    <tr
      className={`loan-row ${loan.isHighlighted ? 'loan-row-highlighted' : ''}`}
      onClick={() => onAction('detail', loan)}
    >
      <td className="px-6 py-4 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
        {loan.id}
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-sm bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-white flex-shrink-0">
            {loan.initials}
          </div>
          <span className="text-sm font-semibold text-neutral-800 dark:text-white">{loan.customerName}</span>
        </div>
      </td>
      <td className="px-4 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{loan.itemDescription}</td>
      <td className="px-4 py-4 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
        {loan.principalDisplay}
      </td>
      <td className="px-4 py-4 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
        {loan.interestRateDisplay}
      </td>
      <td className={`px-4 py-4 text-center text-sm font-medium ${interestClasses[loan.interestType]}`}>
        {loan.interestAccruedDisplay}
      </td>
      <td className={`px-4 py-4 text-center text-sm ${dueDateClass}`}>{loan.dueDate}</td>
      <td className="px-6 py-4 text-center">
        <StatusBadge status={loan.status} type={loan.statusType} />
      </td>
      <td className="px-4 py-4 text-center">
        <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 text-lg">chevron_right</span>
      </td>
    </tr>
  );
};

// ── Loan Detail Page (inline, replaces list) ──────────────
const LoanDetailPage = ({ loan, onBack, onAction, penaltyRate = 3, serviceChargeAmt = 10 }) => {
  const [payments, setPayments] = useState([]);
  const [renewals, setRenewals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [infoModal, setInfoModal] = useState(null);
  const historyPerPage = 5;

  useEffect(() => {
    if (!loan?.rawId) return;
    setLoading(true);
    Promise.all([
      paymentsApi.summary(loan.rawId),
      renewalsApi.history(loan.rawId),
    ])
      .then(([payRes, renRes]) => {
        setPayments(payRes.payments || payRes.data || payRes || []);
        setRenewals(renRes.data || renRes || []);
      })
      .catch((err) => console.error('Detail fetch error:', err))
      .finally(() => setLoading(false));
  }, [loan?.rawId]);

  if (!loan) return null;

  const canRedeem = ['ACTIVE', 'RENEWED'].includes(loan.rawStatus);
  const canRenew = loan.rawStatus === 'ACTIVE';

  // Compute next due
  const maturity = new Date(loan.maturityRaw);
  const now = new Date();
  const daysLeft = Math.ceil((maturity - now) / (1000 * 60 * 60 * 24));
  const isOverdue = daysLeft < 0;
  const { penaltyAmount, overdueMonths } = computePenalty(
    { maturity_date: loan.maturityRaw, principal_loan: loan.principalRaw },
    penaltyRate
  );
  const interestDue = Number(loan.principalRaw) * (Number(loan.interestRateRaw) / 100);
  const formatCurrency = (amount) => `\u20B1${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let dueLabel = `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
  let dueColor = 'text-neutral-600 dark:text-neutral-300';
  if (daysLeft < 0) {
    dueLabel = `${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} overdue`;
    dueColor = 'text-red-500';
  } else if (daysLeft <= 7) {
    dueLabel = `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
    dueColor = 'text-amber-500';
  }

  // Merge payments + renewals into unified history, add past due entries
  const allHistory = [
    ...(Array.isArray(payments) ? payments : []).map(p => ({
      type: p.trans_type || 'PAYMENT',
      date: p.trans_date,
      amount: Number(p.principal_paid || 0) + Number(p.interest_paid || 0) + Number(p.penalty_paid || 0) + Number(p.service_charge_paid || 0),
      method: p.payment_method || '—',
      receipt: p.receipt_number || null,
      badge: p.trans_type === 'DISBURSEMENT' ? 'warning' : 'info',
    })),
    ...(Array.isArray(renewals) ? renewals : []).map(r => ({
      type: 'RENEWAL',
      date: r.created_at,
      amount: Number(r.interest_paid || 0),
      method: r.payment_method || '—',
      badge: 'success',
    })),
  ];

  // Add past due entry if overdue
  if (daysLeft < 0) {
    allHistory.push({
      type: 'PAST DUE',
      date: loan.maturityRaw,
      amount: 0,
      method: '—',
      badge: 'danger',
    });
  }

  allHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalHistoryPages = Math.max(1, Math.ceil(allHistory.length / historyPerPage));
  const paginatedHistory = allHistory.slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage);

  const typeBadgeStyles = {
    RENEWAL: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    FULL_REDEMPTION: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    INTEREST_ONLY: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
    PARTIAL_PAYMENT: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    DISBURSEMENT: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
    'PAST DUE': 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    PAYMENT: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors mb-4">
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Active Loans
        </button>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Operations / Active Loans</p>
            <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">
              {loan.id}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">{loan.customerName} — {loan.itemDescription}</p>
          </div>
          <StatusBadge status={loan.status} type={loan.statusType} />
        </div>
      </div>

      {/* ── Loan Details Card ─────────────────────────── */}
      <div className="dashboard-card p-6 mb-6">
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-5">Loan Details</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-5">
          {[
            ['Ticket Number', loan.id],
            ['Customer', loan.customerName],
            ['Item Category', loan.itemDescription],
            ['Principal Loan', loan.principalDisplay],
            ['Interest Rate', loan.interestRateDisplay],
            ['Interest Accrued', loan.interestAccruedDisplay],
            ['Loan Date', loan.loanDate],
            ['Net Proceeds', loan.netProceedsDisplay || loan.principalDisplay],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{value}</p>
            </div>
          ))}
        </div>

        {/* Next Due */}
        <div className="mt-6 pt-5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1">Maturity Date</p>
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{loan.dueDate}</p>
          </div>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${daysLeft < 0 ? 'bg-red-50 dark:bg-red-900/20' : daysLeft <= 7 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20'} ${dueColor}`}>
            <span className="material-symbols-outlined text-sm">{daysLeft < 0 ? 'error' : daysLeft <= 7 ? 'schedule' : 'check_circle'}</span>
            {dueLabel}
          </div>
        </div>

        {/* Penalty Breakdown — shown only when overdue */}
        {isOverdue && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-sm text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-red-700 dark:text-red-400">Regular Interest</span>
              <span>{formatCurrency(interestDue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-700 dark:text-red-400">Penalty ({penaltyRate}% × {overdueMonths} mo)</span>
              <span>{formatCurrency(penaltyAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-red-200 dark:border-red-700 pt-1 font-semibold">
              <span className="text-red-800 dark:text-red-300">Total Due</span>
              <span>{formatCurrency(interestDue + penaltyAmount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Payment Action Cards ──────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Renew Card */}
        <div className={`dashboard-card p-6 flex flex-col ${!canRenew ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-sm bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-blue-500">autorenew</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Renew Loan</h3>
              <p className="text-xs text-neutral-500">Extend maturity by 30 days</p>
            </div>
            <button onClick={() => setInfoModal('renew')} className="w-7 h-7 rounded-full border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:border-neutral-400 transition-colors cursor-pointer flex-shrink-0" aria-label="Info about renewal">
              <span className="material-symbols-outlined text-[16px]">info</span>
            </button>
          </div>
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 mb-4 space-y-1.5 flex-1">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Interest Due</span>
              <span className="text-neutral-700 dark:text-neutral-300">{'\u20B1'}{(Number(loan.principalRaw) * Number(loan.interestRateRaw) / 100).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Service Charge</span>
              <span className="text-neutral-700 dark:text-neutral-300">{'\u20B1'}{serviceChargeAmt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm pt-1.5 border-t border-neutral-200 dark:border-neutral-700">
              <span className="font-bold text-neutral-800 dark:text-white">Total</span>
              <span className="font-bold text-primary">{'\u20B1'}{(Number(loan.principalRaw) * Number(loan.interestRateRaw) / 100 + serviceChargeAmt).toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={() => canRenew && onAction('renew', loan)}
            disabled={!canRenew}
            className="w-full py-2.5 text-sm font-bold rounded-sm bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Process Renewal
          </button>
        </div>

        {/* Partial Payment Card */}
        <div className={`dashboard-card p-6 flex flex-col ${!canRedeem ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-sm bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-amber-500">payments</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Partial Payment</h3>
              <p className="text-xs text-neutral-500">Pay interest + reduce principal</p>
            </div>
            <button onClick={() => setInfoModal('partial')} className="w-7 h-7 rounded-full border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:border-neutral-400 transition-colors cursor-pointer flex-shrink-0" aria-label="Info about partial payment">
              <span className="material-symbols-outlined text-[16px]">info</span>
            </button>
          </div>
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 mb-4 space-y-1.5 flex-1">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Interest Due</span>
              <span className="text-neutral-700 dark:text-neutral-300">{'\u20B1'}{(Number(loan.principalRaw) * Number(loan.interestRateRaw) / 100).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Service Charge</span>
              <span className="text-neutral-700 dark:text-neutral-300">{'\u20B1'}{serviceChargeAmt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Principal</span>
              <span className="text-neutral-700 dark:text-neutral-300">{loan.principalDisplay}</span>
            </div>
          </div>
          <button
            onClick={() => canRedeem && onAction('partial', loan)}
            disabled={!canRedeem}
            className="w-full py-2.5 text-sm font-bold rounded-sm bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Process Partial Payment
          </button>
        </div>

        {/* Redeem Card */}
        <div className={`dashboard-card p-6 flex flex-col ${!canRedeem ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-sm bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-emerald-500">redeem</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Redeem Item</h3>
              <p className="text-xs text-neutral-500">Full payment to release item</p>
            </div>
            <button onClick={() => setInfoModal('redeem')} className="w-7 h-7 rounded-full border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:border-neutral-400 transition-colors cursor-pointer flex-shrink-0" aria-label="Info about redemption">
              <span className="material-symbols-outlined text-[16px]">info</span>
            </button>
          </div>
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 mb-4 space-y-1.5 flex-1">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Principal</span>
              <span className="text-neutral-700 dark:text-neutral-300">{loan.principalDisplay}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Interest</span>
              <span className="text-neutral-700 dark:text-neutral-300">{loan.interestAccruedDisplay}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Service Charge</span>
              <span className="text-neutral-700 dark:text-neutral-300">{'\u20B1'}{serviceChargeAmt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm pt-1.5 border-t border-neutral-200 dark:border-neutral-700">
              <span className="font-bold text-neutral-800 dark:text-white">Total</span>
              <span className="font-bold text-primary">{'\u20B1'}{(Number(loan.principalRaw) + Number(loan.interestAccruedRaw) + serviceChargeAmt).toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={() => canRedeem && onAction('redeem', loan)}
            disabled={!canRedeem}
            className="w-full py-2.5 text-sm font-bold rounded-sm bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Process Redemption
          </button>
        </div>
      </div>

      {/* ── Info Modal ──────────────────────────────────── */}
      {infoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setInfoModal(null)}>
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-sm w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                {infoModal === 'renew' && 'Renew Loan'}
                {infoModal === 'partial' && 'Partial Payment'}
                {infoModal === 'redeem' && 'Redeem Item'}
              </h3>
              <button onClick={() => setInfoModal(null)} className="w-7 h-7 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer" aria-label="Close">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              {infoModal === 'renew' && 'Pay the accrued interest and service charge to extend the loan maturity by 30 days. The principal balance remains unchanged.'}
              {infoModal === 'partial' && 'Pay interest + service charge + any amount toward principal. A new ticket will be issued with the reduced balance.'}
              {infoModal === 'redeem' && 'Pay the full outstanding balance (principal + interest + service charge) to release the pawned item. The ticket will be marked as redeemed.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Payment History ────────────────────────────── */}
      <div className="dashboard-card overflow-hidden">
        <div className="p-6 pb-0">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Transaction History</p>
          <p className="text-xs text-neutral-500 mb-4">{allHistory.length} record{allHistory.length !== 1 ? 's' : ''} total</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : allHistory.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-600 mb-2">receipt_long</span>
            <p className="text-sm text-neutral-400 dark:text-neutral-500">No transaction history yet.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-neutral-200/60 dark:border-neutral-700/50">
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/30">
                  {paginatedHistory.map((h, i) => (
                    <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${typeBadgeStyles[h.type] || typeBadgeStyles.PAYMENT}`}>
                          {h.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">
                        {h.date ? new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-sm font-semibold text-neutral-800 dark:text-neutral-200 text-right">
                        {h.amount > 0 ? `\u20B1${h.amount.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-neutral-500 dark:text-neutral-400">{h.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalHistoryPages > 1 && (
              <div className="px-6 py-4 border-t border-neutral-100 dark:border-neutral-800">
                <Pagination
                  currentPage={historyPage}
                  totalPages={totalHistoryPages}
                  totalItems={allHistory.length}
                  itemsPerPage={historyPerPage}
                  itemLabel="records"
                  onPageChange={setHistoryPage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Renewal mode definitions
const RENEW_MODES = [
  { key: 'interest_only', icon: 'toll', label: 'Interest Only', desc: 'Pay monthly interest to extend the term' },
  { key: 'partial_interest', icon: 'savings', label: 'Partial Interest', desc: 'Pay toward accumulated interest' },
];

// Shared select + input classes
const selectClass = 'w-full px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/50';

// ── Renew Modal (3 modes) ─────────────────────────────────
const RenewModal = ({ open, onClose, loan, loanSettings, onSuccess }) => {
  const [step, setStep] = useState('form');
  const [mode, setMode] = useState('interest_only');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [partialAmount, setPartialAmount] = useState(0);
  const [receiptData, setReceiptData] = useState(null);

  const principal = Number(loan?.principalRaw || 0);
  const interestRate = Number(loan?.interestRateRaw || 0);
  const monthlyInterest = principal * (interestRate / 100);
  const interestAccrued = Number(loan?.interestAccruedRaw || 0);
  const penaltyRate = loanSettings?.penalty_interest_rate ?? 3;

  // Penalty computation
  const computePenaltyAmount = () => {
    if (!loan?.maturityRaw) return 0;
    const now = new Date();
    const maturity = new Date(loan.maturityRaw);
    if (now <= maturity) return 0;
    const overdueMs = now - maturity;
    const overdueMonths = Math.ceil(overdueMs / (30 * 24 * 60 * 60 * 1000));
    return principal * (penaltyRate / 100) * overdueMonths;
  };

  const penaltyAmount = computePenaltyAmount();
  const isOverdue = penaltyAmount > 0;

  useEffect(() => {
    if (open) {
      setStep('form');
      setMode('interest_only');
      setPaymentMethod('CASH');
      setReferenceNumber('');
      setReceiptData(null);
      setPartialAmount(interestAccrued > 0 ? Math.min(interestAccrued, monthlyInterest) : monthlyInterest);
    }
  }, [open, interestAccrued, monthlyInterest]);

  if (!loan) return null;

  const currentMaturity = new Date(loan.maturityRaw);
  const newMaturity = new Date(currentMaturity);
  newMaturity.setDate(newMaturity.getDate() + 30);
  const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const amountByMode = {
    interest_only: monthlyInterest + penaltyAmount,
    partial_interest: partialAmount + penaltyAmount,
  };
  const totalAmount = amountByMode[mode];

  const paymentTypeByMode = {
    interest_only: 'INTEREST_ONLY',
    partial_interest: 'PARTIAL_PAYMENT',
  };

  const needsReference = paymentMethod !== 'CASH';
  const canSubmit = !processing
    && !(mode === 'partial_interest' && partialAmount <= 0)
    && !(needsReference && !referenceNumber.trim());

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      let result;
      result = await paymentsApi.process({
        ticket_id: loan.rawId,
        amount_paid: totalAmount,
        payment_type: paymentTypeByMode[mode],
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim() || undefined,
      });
      setReceiptData(result);
      setStep('success');
    } catch (err) {
      console.error('Renewal error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const modeLabels = {
    interest_only: 'Interest Only',
    partial_interest: 'Partial Interest',
  };

  // ── Success Receipt Step ──
  if (step === 'success') {
    return (
      <Modal open={open} onClose={onClose} title="Renewal Successful" size="md">
        <div className="space-y-5">
          <div className="flex flex-col items-center py-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-3xl text-emerald-500">check_circle</span>
            </div>
            <p className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Payment Processed</p>
            <p className="text-xs text-neutral-500 mt-1">Receipt #{receiptData?.receipt_number || '—'}</p>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Ticket</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{loan.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Customer</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{loan.customerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Item</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate ml-4">{loan.itemDescription}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Payment Mode</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{modeLabels[mode]}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            {mode === 'interest_only' && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Monthly Interest ({interestRate}%)</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{monthlyInterest.toLocaleString()}</span>
              </div>
            )}
            {mode === 'partial_interest' && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Partial Payment</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{partialAmount.toLocaleString()}</span>
              </div>
            )}
            {isOverdue && (
              <div className="flex justify-between text-sm">
                <span className="text-red-500 dark:text-red-400">Penalty ({penaltyRate}%)</span>
                <span className="font-medium text-red-500 dark:text-red-400">{'\u20B1'}{penaltyAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5 flex justify-between items-baseline">
              <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">Total Paid</span>
              <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{'\u20B1'}{totalAmount.toLocaleString()}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Payment Method</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label || paymentMethod}
              </span>
            </div>
            {needsReference && referenceNumber.trim() && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Reference #</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{referenceNumber}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Date</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">New Maturity</span>
              <span className="font-medium text-blue-500">{fmtDate(newMaturity)}</span>
            </div>
          </div>

          <button
            onClick={() => { onClose(); onSuccess(); }}
            className="w-full py-3 text-sm font-bold rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  // ── Payment Form Step ──
  return (
    <Modal open={open} onClose={onClose} title="Renew Pawn Ticket" size="md">
      <div className="space-y-5">
        {/* Loan info */}
        <div className="flex items-center gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-700/50">
          <div className="w-10 h-10 rounded-sm bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-blue-500">autorenew</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 truncate">{loan.id}</p>
            <p className="text-xs text-neutral-500 truncate">{loan.customerName} — {loan.itemDescription}</p>
          </div>
        </div>

        {/* Overdue warning */}
        {isOverdue && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/15 border border-red-200/50 dark:border-red-800/30">
            <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">This loan is overdue. Penalty of {'\u20B1'}{penaltyAmount.toLocaleString()} is included.</p>
          </div>
        )}

        {/* Mode selector — radio cards */}
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-3">Payment Mode</label>
          <div className="space-y-2">
            {RENEW_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-lg border-2 text-left transition-all ${
                  mode === m.key
                    ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10'
                    : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  mode === m.key
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                }`}>
                  <span className="material-symbols-outlined text-lg">{m.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${mode === m.key ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-700 dark:text-neutral-300'}`}>{m.label}</p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{m.desc}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  mode === m.key ? 'border-blue-500' : 'border-neutral-300 dark:border-neutral-600'
                }`}>
                  {mode === m.key && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Partial interest amount input */}
        {mode === 'partial_interest' && (
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Interest Amount to Pay</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">{'\u20B1'}</span>
              <input
                type="number"
                value={partialAmount}
                onChange={(e) => setPartialAmount(Math.max(0, Number(e.target.value)))}
                min={0}
                step={0.01}
                className={`pl-8 pr-3 ${selectClass}`}
              />
            </div>
            {interestAccrued > 0 && (
              <p className="text-[11px] text-neutral-400 mt-1.5">Accumulated interest: {'\u20B1'}{interestAccrued.toLocaleString()}</p>
            )}
          </div>
        )}

        {/* Calculation breakdown */}
        <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
          {mode === 'interest_only' && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Monthly Interest ({interestRate}%)</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{monthlyInterest.toLocaleString()}</span>
            </div>
          )}
          {mode === 'partial_interest' && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Partial Payment</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{partialAmount.toLocaleString()}</span>
            </div>
          )}
          {isOverdue && (
            <div className="flex justify-between text-sm">
              <span className="text-red-500 dark:text-red-400">Penalty ({penaltyRate}%)</span>
              <span className="font-medium text-red-500 dark:text-red-400">{'\u20B1'}{penaltyAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5 flex justify-between items-baseline">
            <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">Total</span>
            <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{'\u20B1'}{totalAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs pt-1">
            <span className="text-neutral-400">{loan.dueDate}</span>
            <span className="text-neutral-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">arrow_forward</span>
              <span className="text-blue-500 font-semibold">{fmtDate(newMaturity)}</span>
            </span>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Payment Method</label>
          <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setReferenceNumber(''); }} className={selectClass}>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* Reference number (non-cash) */}
        {needsReference && (
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Reference Number</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Enter payment reference number"
              className={selectClass}
            />
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 text-sm font-bold rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
              Processing...
            </span>
          ) : `Pay ${'\u20B1'}${totalAmount.toLocaleString()}`}
        </button>
      </div>
    </Modal>
  );
};

// ── Partial Payment Modal ─────────────────────────────────
const PartialPaymentModal = ({ open, onClose, loan, loanSettings, onSuccess }) => {
  const [step, setStep] = useState('form');
  const [principalPayment, setPrincipalPayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    if (open) { setStep('form'); setPrincipalPayment(''); setPaymentMethod('CASH'); setReferenceNumber(''); setReceiptData(null); }
  }, [open]);

  if (!loan) return null;

  const principal = Number(loan.principalRaw || 0);
  const interestRate = Number(loan.interestRateRaw || 3);
  const monthlyInterest = principal * (interestRate / 100);
  const principalAmt = Number(principalPayment) || 0;
  const totalPayment = monthlyInterest + principalAmt;
  const newPrincipal = principal - principalAmt;
  const needsReference = paymentMethod !== 'CASH';
  const canSubmit = !processing && principalAmt > 0 && principalAmt < principal && !(needsReference && !referenceNumber.trim());

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      const result = await paymentsApi.process({
        ticket_id: loan.rawId,
        amount_paid: totalPayment,
        principal_amount: principalAmt,
        interest_amount: monthlyInterest,
        payment_type: 'PARTIAL_REDEMPTION',
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim() || undefined,
      });
      setReceiptData(result);
      setStep('success');
    } catch (err) {
      console.error('Partial payment error:', err);
    } finally {
      setProcessing(false);
    }
  };

  if (step === 'success') {
    return (
      <Modal open={open} onClose={onClose} title="Partial Payment Successful" size="sm">
        <div className="space-y-5">
          <div className="flex flex-col items-center py-3">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-3xl text-amber-500">check_circle</span>
            </div>
            <p className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Payment Processed</p>
            <p className="text-xs text-neutral-500 mt-1">A new ticket has been issued with the reduced principal.</p>
          </div>
          <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Interest Paid</span>
              <span className="font-medium">{'\u20B1'}{monthlyInterest.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Principal Paid</span>
              <span className="font-medium">{'\u20B1'}{principalAmt.toLocaleString()}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5 flex justify-between">
              <span className="font-bold">New Principal</span>
              <span className="font-bold text-primary">{'\u20B1'}{newPrincipal.toLocaleString()}</span>
            </div>
          </div>
          <button onClick={() => { onClose(); onSuccess(); }} className="w-full py-2.5 text-sm font-bold rounded-sm bg-primary hover:bg-primary/90 text-neutral-900 transition-colors">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Partial Payment" size="sm">
      <div className="space-y-5">
        <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Current Principal</span>
            <span className="font-bold">{'\u20B1'}{principal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Interest Due ({interestRate}%)</span>
            <span className="font-medium">{'\u20B1'}{monthlyInterest.toLocaleString()}</span>
          </div>
        </div>

        <div>
          <label className="form-label">Amount Toward Principal</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 text-sm font-medium">{'\u20B1'}</span>
            <input type="number" value={principalPayment} onChange={(e) => setPrincipalPayment(e.target.value)}
              className="form-input w-full pl-7" placeholder="0.00" min="1" max={principal - 1} step="0.01" />
          </div>
          <p className="text-xs text-neutral-400 mt-1">Enter any amount less than the full principal ({'\u20B1'}{principal.toLocaleString()}).</p>
          {principalAmt >= principal && <p className="text-xs text-red-500 mt-1">For full payment, use Redeem Item instead.</p>}
        </div>

        {principalAmt > 0 && principalAmt < principal && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-sm p-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>Interest</span><span>{'\u20B1'}{monthlyInterest.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Principal Payment</span><span>{'\u20B1'}{principalAmt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-amber-300 dark:border-amber-700 pt-1.5">
              <span>Total Due</span><span>{'\u20B1'}{totalPayment.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-amber-700 dark:text-amber-400 pt-1">
              <span>New Principal</span><span className="font-bold">{'\u20B1'}{newPrincipal.toLocaleString()}</span>
            </div>
          </div>
        )}

        <div>
          <label className="form-label">Payment Method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="form-input w-full">
            <option value="CASH">Cash</option>
            <option value="E_WALLET">E-Wallet</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </select>
        </div>
        {needsReference && (
          <div>
            <label className="form-label">Reference Number</label>
            <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="form-input w-full" placeholder="Transaction reference #" />
          </div>
        )}
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="w-full py-2.5 text-sm font-bold rounded-sm bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {processing ? 'Processing...' : `Pay ${'\u20B1'}${totalPayment.toLocaleString()}`}
        </button>
      </div>
    </Modal>
  );
};

// ── Redeem Modal ──────────────────────────────────────────
const RedeemModal = ({ open, onClose, loan, loanSettings, onSuccess }) => {
  const [step, setStep] = useState('form');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    if (open) {
      setStep('form');
      setPaymentMethod('CASH');
      setReferenceNumber('');
      setReceiptData(null);
    }
  }, [open]);

  if (!loan) return null;

  const principal = Number(loan.principalRaw || 0);
  const interestAccrued = Number(loan.interestAccruedRaw || 0);
  const serviceChargeAmt = Number(loanSettings?.service_charge ?? 10);
  const penaltyRate = loanSettings?.penalty_interest_rate ?? 3;

  // Penalty computation
  const computePenaltyAmount = () => {
    if (!loan.maturityRaw) return 0;
    const now = new Date();
    const maturity = new Date(loan.maturityRaw);
    if (now <= maturity) return 0;
    const overdueMs = now - maturity;
    const overdueMonths = Math.ceil(overdueMs / (30 * 24 * 60 * 60 * 1000));
    return principal * (penaltyRate / 100) * overdueMonths;
  };

  const penaltyAmount = computePenaltyAmount();
  const isOverdue = penaltyAmount > 0;
  const totalDue = principal + interestAccrued + penaltyAmount + serviceChargeAmt;

  const needsReference = paymentMethod !== 'CASH';
  const canSubmit = !processing && !(needsReference && !referenceNumber.trim());

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      const result = await paymentsApi.process({
        ticket_id: loan.rawId,
        amount_paid: totalDue,
        payment_type: 'FULL_REDEMPTION',
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim() || undefined,
      });
      setReceiptData(result);
      setStep('success');
    } catch (err) {
      console.error('Redemption error:', err);
    } finally {
      setProcessing(false);
    }
  };

  // ── Success Receipt Step ──
  if (step === 'success') {
    return (
      <Modal open={open} onClose={onClose} title="Redemption Successful" size="sm">
        <div className="space-y-5">
          <div className="flex flex-col items-center py-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-3xl text-emerald-500">check_circle</span>
            </div>
            <p className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Item Redeemed</p>
            <p className="text-xs text-neutral-500 mt-1">Receipt #{receiptData?.receipt_number || '—'}</p>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Ticket</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{loan.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Customer</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{loan.customerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Item</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate ml-4">{loan.itemDescription}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Principal</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{principal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Interest Accrued</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{interestAccrued.toLocaleString()}</span>
            </div>
            {isOverdue && (
              <div className="flex justify-between text-sm">
                <span className="text-red-500 dark:text-red-400">Penalty ({penaltyRate}%)</span>
                <span className="font-medium text-red-500 dark:text-red-400">{'\u20B1'}{penaltyAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Service Charge</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{serviceChargeAmt.toLocaleString()}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5 flex justify-between items-baseline">
              <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">Total Paid</span>
              <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{'\u20B1'}{totalDue.toLocaleString()}</span>
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Payment Method</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label || paymentMethod}
              </span>
            </div>
            {needsReference && referenceNumber.trim() && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Reference #</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{referenceNumber}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Date</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-sm p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-amber-500 text-sm">inventory_2</span>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase">Item Release Required</p>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Please hand the pawned item back to the customer and confirm the release below.
            </p>
          </div>

          <button
            onClick={() => { onClose(); onSuccess(); }}
            className="w-full py-3 text-sm font-bold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">assignment_turned_in</span>
            Confirm Item Released to Customer
          </button>
        </div>
      </Modal>
    );
  }

  // ── Payment Form Step ──
  return (
    <Modal open={open} onClose={onClose} title="Redeem Pawn Ticket" size="sm">
      <div className="space-y-5">
        {/* Loan info */}
        <div className="flex items-center gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-700/50">
          <div className="w-10 h-10 rounded-sm bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-emerald-500">redeem</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 truncate">{loan.id}</p>
            <p className="text-xs text-neutral-500 truncate">{loan.customerName} — {loan.itemDescription}</p>
          </div>
        </div>

        {/* Mode label */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200/50 dark:border-emerald-800/30">
          <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Full payment of principal + accumulated interest</p>
        </div>

        {/* Overdue warning */}
        {isOverdue && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/15 border border-red-200/50 dark:border-red-800/30">
            <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">This loan is overdue. Penalty of {'\u20B1'}{penaltyAmount.toLocaleString()} is included.</p>
          </div>
        )}

        {/* Calculation breakdown */}
        <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-4 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">Principal</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{principal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">Interest Accrued</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{interestAccrued.toLocaleString()}</span>
          </div>
          {isOverdue && (
            <div className="flex justify-between text-sm">
              <span className="text-red-500 dark:text-red-400">Penalty ({penaltyRate}%)</span>
              <span className="font-medium text-red-500 dark:text-red-400">{'\u20B1'}{penaltyAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">Service Charge</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{'\u20B1'}{serviceChargeAmt.toLocaleString()}</span>
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5 flex justify-between items-baseline">
            <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">Total Due</span>
            <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{'\u20B1'}{totalDue.toLocaleString()}</span>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Payment Method</label>
          <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setReferenceNumber(''); }} className={selectClass}>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* Reference number (non-cash) */}
        {needsReference && (
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Reference Number</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Enter payment reference number"
              className={selectClass}
            />
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 text-sm font-bold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
              Processing...
            </span>
          ) : `Redeem — ${'\u20B1'}${totalDue.toLocaleString()}`}
        </button>
      </div>
    </Modal>
  );
};

// ── Main Component ────────────────────────────────────────
const ActiveLoans = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [currentPath, setCurrentPath] = useState('/admin/loans');
  const [currentPage, setCurrentPage] = useState(1);
  const [tickets, setTickets] = useState([]);
  const [rawTickets, setRawTickets] = useState([]);
  const [stats, setStats] = useState({ active: 0, expiringSoon: 0, overdue: 0, renewedThisMonth: 0 });
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loanSettings, setLoanSettings] = useState(null);

  // View state
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [selectedLoan, setSelectedLoan] = useState(null);

  // Modal state
  const [redeemModal, setRedeemModal] = useState({ open: false, loan: null });
  const [renewModal, setRenewModal] = useState({ open: false, loan: null });
  const [partialModal, setPartialModal] = useState({ open: false, loan: null });

  const { profile } = useAuth();
  const navigation = getNavigationByRole(profile?.role);

  const itemsPerPage = 10;

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'User',
    role: profile?.role || 'Admin',
    initials: (profile?.full_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2),
  }), [profile]);

  // Fetch loan settings once on mount
  useEffect(() => {
    loanSettingsApi.get()
      .then((settings) => setLoanSettings(settings))
      .catch(() => {});
  }, []);

  // Debounce search input (400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const mappedStatus = statusFilter === 'All Statuses'
        ? 'ACTIVE'
        : statusFilter === 'Expiring Soon' || statusFilter === 'Overdue'
          ? 'ACTIVE'
          : statusFilter.toUpperCase();

      const [statsRes, listRes] = await Promise.all([
        pawnTicketsApi.stats(),
        pawnTicketsApi.list({
          page: currentPage,
          limit: itemsPerPage,
          search: debouncedSearch,
          ...(mappedStatus ? { status: mappedStatus } : {}),
        }),
      ]);

      const mapped = (listRes.data || []).map((loan) => {
        const customerName = loan.customers
          ? `${loan.customers.first_name} ${loan.customers.last_name}`
          : 'Unknown';
        const initials = customerName
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        let status = loan.status;
        let statusType = STATUS_TYPE_MAP[loan.status] || 'neutral';
        if (loan.isOverdue) {
          status = 'Overdue';
          statusType = 'danger';
        } else if (loan.isExpiringSoon) {
          status = 'Expiring Soon';
          statusType = 'warning';
        }

        return {
          rawId: loan.id,
          id: loan.ticket_number,
          customerName,
          initials,
          itemDescription: loan.pawn_items?.category || 'N/A',
          principalRaw: loan.principal_loan || 0,
          principalDisplay: `\u20B1${Number(loan.principal_loan || 0).toLocaleString()}`,
          interestRateRaw: loan.interest_rate || 0,
          interestRateDisplay: `${Number(loan.interest_rate || 0)}%`,
          interestAccruedRaw: loan.interestAccrued || 0,
          interestAccruedDisplay: `+\u20B1${Number(loan.interestAccrued || 0).toLocaleString()}`,
          interestType: Number(loan.interestAccrued || 0) > 200 ? 'danger' : 'neutral',
          maturityRaw: loan.maturity_date,
          dueDate: new Date(loan.maturity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          loanDate: loan.loan_date
            ? new Date(loan.loan_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'N/A',
          netProceedsDisplay: loan.net_proceeds
            ? `\u20B1${Number(loan.net_proceeds).toLocaleString()}`
            : undefined,
          rawStatus: loan.status,
          status,
          statusType,
          isHighlighted: loan.isExpiringSoon,
        };
      });

      setStats(statsRes);
      setTickets(mapped);
      setRawTickets(listRes.data || []);
      setTotalItems(listRes.total || 0);
    } catch (err) {
      console.error('Active loans fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, debouncedSearch, statusFilter]);

  const handleAction = (action, loan) => {
    switch (action) {
      case 'detail':
        setSelectedLoan(loan);
        setView('detail');
        break;
      case 'redeem':
        setRedeemModal({ open: true, loan });
        break;
      case 'renew':
        setRenewModal({ open: true, loan });
        break;
      case 'partial':
        setPartialModal({ open: true, loan });
        break;
      case 'interest':
        setRenewModal({ open: true, loan });
        break;
    }
  };

  const handleModalSuccess = () => {
    setRedeemModal({ open: false, loan: null });
    setRenewModal({ open: false, loan: null });
    setPartialModal({ open: false, loan: null });
    if (view === 'detail' && selectedLoan) {
      // Refresh the detail page data by re-setting the loan
      setSelectedLoan({ ...selectedLoan });
    }
    fetchData();
  };

  const statsData = [
    {
      icon: 'credit_score',
      iconBg: 'bg-primary',
      iconColor: 'text-white',
      badge: '',
      badgeType: 'success',
      label: 'Total Active Loans',
      value: String(stats.active || stats.activeCount || 0),
    },
    {
      icon: 'warning',
      iconBg: 'bg-amber-500',
      iconColor: 'text-white',
      badge: '',
      badgeType: 'warning',
      label: 'Expiring Soon',
      value: String(stats.expiringSoon || stats.expiringSoonCount || 0),
    },
    {
      icon: 'error',
      iconBg: 'bg-red-500',
      iconColor: 'text-white',
      badge: '',
      badgeType: 'warning',
      label: 'Overdue Loans',
      value: String(stats.overdue || stats.overdueCount || 0),
    },
    {
      icon: 'autorenew',
      iconBg: 'bg-blue-500',
      iconColor: 'text-white',
      badge: '',
      badgeType: 'success',
      label: 'Renewed This Month',
      value: String(stats.renewedThisMonth || 0),
    },
  ];

  const handleNavigate = (path) => {
    setCurrentPath(path);
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

          {/* Detail View */}
          {view === 'detail' && selectedLoan && (
            <LoanDetailPage
              loan={selectedLoan}
              onBack={() => { setView('list'); setSelectedLoan(null) }}
              onAction={handleAction}
              penaltyRate={loanSettings?.penalty_interest_rate ?? 3}
              serviceChargeAmt={Number(loanSettings?.service_charge ?? 10)}
            />
          )}

          {view === 'list' && (
          <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <nav className="flex mb-2" aria-label="Breadcrumb">
                <ol className="flex items-center space-x-2">
                  <li>
                    <span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Operations</span>
                  </li>
                  <li>
                    <span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span>
                  </li>
                  <li>
                    <span className="text-neutral-700 dark:text-white text-sm font-semibold">Active Loans</span>
                  </li>
                </ol>
              </nav>
              <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
                Active Loans
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <button className="header-icon-btn">
                <span className="material-symbols-outlined">notifications</span>
                <span className="notification-dot" />
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsData.map((stat, index) => (
              <StatsCard key={index} {...stat} />
            ))}
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
                  placeholder="Search by Loan ID, Customer, or Item..."
                />
              </div>
            </div>
            <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
              <SelectDropdown
                options={['All Statuses', 'Active', 'Overdue', 'Renewed', 'Expiring Soon']}
                className="w-full sm:w-40"
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <button className="filter-btn">
                <span className="material-symbols-outlined text-xl">filter_list</span>
              </button>
            </div>
          </div>

          {/* Loans Table */}
          <div className="loans-table-container">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <span className="material-symbols-outlined text-2xl text-neutral-300 dark:text-neutral-600 animate-spin">progress_activity</span>
                </div>
              ) : tickets.length === 0 ? (
                <EmptyState
                  icon="credit_score"
                  title="No loans found"
                  description="Try adjusting your search or filter criteria."
                />
              ) : (
                <table className="min-w-full text-center text-sm whitespace-nowrap">
                  <thead className="loans-table-header">
                    <tr>
                      <th scope="col" className="table-th text-center">Loan ID</th>
                      <th scope="col" className="table-th text-center">Customer Name</th>
                      <th scope="col" className="table-th text-center">Item Category</th>
                      <th scope="col" className="table-th text-center">Principal</th>
                      <th scope="col" className="table-th text-center">Interest Rate</th>
                      <th scope="col" className="table-th text-center">Interest Accrued</th>
                      <th scope="col" className="table-th text-center">Due Date</th>
                      <th scope="col" className="table-th text-center">Status</th>
                      <th scope="col" className="table-th text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {tickets.map((loan) => (
                      <LoanRow key={loan.id} loan={loan} onAction={handleAction} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={Math.max(1, Math.ceil(totalItems / itemsPerPage))}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              itemLabel="loans"
              onPageChange={setCurrentPage}
            />
          </div>
          </>
          )}
        </div>
      </main>

      {/* Modals */}
      <RedeemModal
        open={redeemModal.open}
        onClose={() => setRedeemModal({ open: false, loan: null })}
        loan={redeemModal.loan}
        loanSettings={loanSettings}
        onSuccess={handleModalSuccess}
      />
      <RenewModal
        open={renewModal.open}
        onClose={() => setRenewModal({ open: false, loan: null })}
        loan={renewModal.loan}
        loanSettings={loanSettings}
        onSuccess={handleModalSuccess}
      />
      <PartialPaymentModal
        open={partialModal.open}
        onClose={() => setPartialModal({ open: false, loan: null })}
        loan={partialModal.loan}
        loanSettings={loanSettings}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
};

export default ActiveLoans;
