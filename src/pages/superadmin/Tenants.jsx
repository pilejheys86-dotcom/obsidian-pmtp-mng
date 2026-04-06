import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sidebar, Header } from '../../components/layout'
import { Pagination, StatsCard, StatusBadge } from '../../components/ui'
import { superadminNavigation } from '../../config'
import { useAuth } from '../../context'
import { tenantsApi } from '../../lib/api'

const ID_TYPE_LABELS = {
  PHILSYS: 'PhilSys National ID', DRIVERS_LICENSE: "Driver's License",
  SSS: 'SSS ID', PHILHEALTH: 'PhilHealth ID', TIN: 'TIN ID',
  POSTAL: 'Postal ID', POSTAL_ID: 'Postal ID', VOTERS: "Voter's ID",
  VOTERS_ID: "Voter's ID", PRC: 'PRC ID', PRC_ID: 'PRC ID',
  PASSPORT: 'Passport', UMID: 'UMID', GSIS: 'GSIS ID',
}
const formatIdType = (code) => code ? (ID_TYPE_LABELS[code] || code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) : null

// ── Plan Badge ───────────────────────────────────────────────────────────────
const PlanBadge = ({ plan }) => {
  const styles = {
    free: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    basic: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
    professional: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    enterprise: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  }
  const labels = { free: 'Free', basic: 'Basic', professional: 'Professional', enterprise: 'Enterprise' }
  const key = (plan || 'free').toLowerCase()
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wide ${styles[key] || styles.free}`}>
      {labels[key] || plan}
    </span>
  )
}

// ── Due Date Cell ────────────────────────────────────────────────────────────
const DueCell = ({ dateStr }) => {
  if (!dateStr) return <span className="text-neutral-400">—</span>
  const due = new Date(dateStr)
  const daysLeft = Math.ceil((due - new Date()) / (1000 * 60 * 60 * 24))

  let colorClass = 'text-neutral-500 dark:text-neutral-400'
  let icon = null
  if (daysLeft < 0) {
    colorClass = 'text-red-500'
    icon = <span className="material-symbols-outlined text-xs leading-none">warning</span>
  } else if (daysLeft <= 7) {
    colorClass = 'text-amber-500'
    icon = <span className="material-symbols-outlined text-xs leading-none">schedule</span>
  }

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${colorClass}`}>
      {icon}
      {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  )
}

// ── Info Row (drawer helper) ─────────────────────────────────────────────────
const InfoRow = ({ icon, label, value }) => (
  <div className="flex items-start gap-3">
    <span className="material-symbols-outlined text-neutral-400 text-[18px] flex-shrink-0 mt-0.5">{icon}</span>
    <span className="text-sm text-neutral-500 w-28 flex-shrink-0">{label}</span>
    <span className="text-sm font-medium text-neutral-800 dark:text-white break-all">{value}</span>
  </div>
)

// ── Tenant Table Row ─────────────────────────────────────────────────────────
const TenantRow = ({ tenant, onView, onBlock, onReactivate, onApprove, onReject, onDeactivate }) => {
  const isBlocked = tenant.status === 'SUSPENDED'
  const isPending = tenant.status === 'PENDING' || tenant.owner?.kyc_status === 'SUBMITTED'
  const isActive  = tenant.status === 'ACTIVE' && tenant.owner?.kyc_status !== 'SUBMITTED'

  return (
    <tr className="loan-row">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-sm flex-shrink-0 bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">{tenant.initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-800 dark:text-white truncate max-w-[160px]">{tenant.business_name}</p>
            <p className="text-[11px] text-neutral-400 font-mono">{tenant.id_display}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 text-center">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{tenant.owner_name}</p>
        <p className="text-xs text-neutral-400 truncate max-w-[180px] mx-auto">{tenant.email}</p>
      </td>
      <td className="px-4 py-3.5 text-center">
        <PlanBadge plan={tenant.plan} />
      </td>
      <td className="px-4 py-3.5 text-center">
        <StatusBadge status={tenant.statusLabel} type={tenant.statusType} />
      </td>
      <td className="px-4 py-3.5 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {tenant.last_payment || <span className="text-neutral-400">—</span>}
      </td>
      <td className="px-4 py-3.5 text-center">
        <DueCell dateStr={tenant.next_due_date} />
      </td>
      <td className="px-4 py-3.5 text-center">
        <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{tenant.branches_count ?? 1}</span>
      </td>
      <td className="px-4 py-3.5 text-center">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onView(tenant)}
            className="p-1.5 rounded-sm text-neutral-400 hover:text-primary hover:bg-primary/10 transition-colors"
            title="View Details"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
          </button>

          {isPending && (
            <>
              <button
                onClick={() => onApprove(tenant)}
                className="p-1.5 rounded-sm text-neutral-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                title="Approve Tenant"
              >
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
              </button>
              <button
                onClick={() => onReject(tenant)}
                className="p-1.5 rounded-sm text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title="Reject Tenant"
              >
                <span className="material-symbols-outlined text-[18px]">cancel</span>
              </button>
            </>
          )}

          {isBlocked && (
            <button
              onClick={() => onReactivate(tenant)}
              className="p-1.5 rounded-sm text-neutral-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
              title="Reactivate"
            >
              <span className="material-symbols-outlined text-[18px]">lock_open</span>
            </button>
          )}

          {isActive && (
            <>
              <button
                onClick={() => onDeactivate(tenant)}
                className="p-1.5 rounded-sm text-neutral-400 hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                title="Deactivate Tenant"
              >
                <span className="material-symbols-outlined text-[18px]">pause_circle</span>
              </button>
              <button
                onClick={() => onBlock(tenant)}
                className="p-1.5 rounded-sm text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title="Block Tenant"
              >
                <span className="material-symbols-outlined text-[18px]">block</span>
              </button>
            </>
          )}

          {!isPending && !isBlocked && !isActive && (
            <button
              onClick={() => onBlock(tenant)}
              className="p-1.5 rounded-sm text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
              title="Block Tenant"
            >
              <span className="material-symbols-outlined text-[18px]">block</span>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Block Modal ──────────────────────────────────────────────────────────────
const BlockModal = ({ tenant, onConfirm, onClose }) => {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('A reason is required.'); return }
    setSaving(true)
    try {
      await onConfirm(tenant.rawId, reason.trim())
    } catch (e) {
      setError(e.message || 'Failed to block tenant.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-sm shadow-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center gap-4 p-6 border-b border-neutral-100 dark:border-neutral-800">
          <div className="w-10 h-10 rounded-sm bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-red-500">block</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">Block Tenant</h3>
            <p className="text-sm text-neutral-500">Suspend access for <strong className="text-neutral-700 dark:text-neutral-300">{tenant?.business_name}</strong></p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="form-label">Reason <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError('') }}
              rows={3}
              placeholder="e.g. Non-payment, Terms of service violation..."
              className="w-full px-3 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-sm text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-500 resize-none transition-all"
            />
            {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
          </div>
          <div className="flex items-start gap-2 p-3 rounded-sm bg-red-500/5 border border-red-500/20">
            <span className="material-symbols-outlined text-red-500 text-[16px] flex-shrink-0 mt-0.5">info</span>
            <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
              All users under this tenant lose access immediately. The reason will be visible to the tenant.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || saving}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-sm transition-colors"
          >
            {saving
              ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              : <span className="material-symbols-outlined text-sm">block</span>}
            Block Tenant
          </button>
          <button onClick={onClose} className="w-full py-2.5 text-sm font-semibold rounded-sm border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Approve Modal ────────────────────────────────────────────────────────────
const ApproveModal = ({ tenant, onConfirm, onClose }) => {
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try { await onConfirm(tenant.rawId) }
    catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-sm shadow-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center gap-4 p-6 border-b border-neutral-100 dark:border-neutral-800">
          <div className="w-10 h-10 rounded-sm bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-emerald-500">check_circle</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">Approve Tenant</h3>
            <p className="text-sm text-neutral-500">Activate account for <strong className="text-neutral-700 dark:text-neutral-300">{tenant?.business_name}</strong></p>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-2 p-3 rounded-sm bg-emerald-500/5 border border-emerald-500/20">
            <span className="material-symbols-outlined text-emerald-500 text-[16px] flex-shrink-0 mt-0.5">info</span>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 leading-relaxed">
              The tenant will be approved and granted full access to the platform immediately.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn-secondary px-5 py-2.5 text-sm">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-sm transition-colors"
          >
            {saving
              ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              : <span className="material-symbols-outlined text-sm">check_circle</span>}
            Approve Tenant
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reject Modal ──────────────────────────────────────────────────────────────
const RejectModal = ({ tenant, onConfirm, onClose }) => {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('A reason is required.'); return }
    setSaving(true)
    try {
      await onConfirm(tenant.rawId, reason.trim())
    } catch (e) {
      setError(e.message || 'Failed to reject tenant.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-sm shadow-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center gap-4 p-6 border-b border-neutral-100 dark:border-neutral-800">
          <div className="w-10 h-10 rounded-sm bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-red-500">cancel</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">Reject Tenant</h3>
            <p className="text-sm text-neutral-500">Decline registration for <strong className="text-neutral-700 dark:text-neutral-300">{tenant?.business_name}</strong></p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="form-label">Reason <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError('') }}
              rows={3}
              placeholder="e.g. Incomplete documents, Failed KYC verification..."
              className="w-full px-3 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-sm text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-500 resize-none transition-all"
            />
            {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
          </div>
          <div className="flex items-start gap-2 p-3 rounded-sm bg-red-500/5 border border-red-500/20">
            <span className="material-symbols-outlined text-red-500 text-[16px] flex-shrink-0 mt-0.5">info</span>
            <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
              The tenant registration will be rejected. The reason will be communicated to the applicant.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn-secondary px-5 py-2.5 text-sm">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-sm transition-colors"
          >
            {saving
              ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              : <span className="material-symbols-outlined text-sm">cancel</span>}
            Reject Tenant
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Deactivate Modal ──────────────────────────────────────────────────────────
const DeactivateModal = ({ tenant, onConfirm, onClose }) => {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('A reason is required.'); return }
    setSaving(true)
    try {
      await onConfirm(tenant.rawId, reason.trim())
    } catch (e) {
      setError(e.message || 'Failed to deactivate tenant.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-sm shadow-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center gap-4 p-6 border-b border-neutral-100 dark:border-neutral-800">
          <div className="w-10 h-10 rounded-sm bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-amber-500">pause_circle</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">Deactivate Tenant</h3>
            <p className="text-sm text-neutral-500">Suspend account for <strong className="text-neutral-700 dark:text-neutral-300">{tenant?.business_name}</strong></p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="form-label">Reason <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError('') }}
              rows={3}
              placeholder="e.g. Account review, Subscription lapsed..."
              className="w-full px-3 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-sm text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500 resize-none transition-all"
            />
            {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
          </div>
          <div className="flex items-start gap-2 p-3 rounded-sm bg-amber-500/5 border border-amber-500/20">
            <span className="material-symbols-outlined text-amber-500 text-[16px] flex-shrink-0 mt-0.5">info</span>
            <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
              The tenant account will be deactivated. Users will lose access until the account is reactivated.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || saving}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-sm transition-colors"
          >
            {saving
              ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              : <span className="material-symbols-outlined text-sm">pause_circle</span>}
            Deactivate Tenant
          </button>
          <button onClick={onClose} className="w-full py-2.5 text-sm font-semibold rounded-sm border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Reactivate Modal ─────────────────────────────────────────────────────────
const ReactivateModal = ({ tenant, onConfirm, onClose }) => {
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try { await onConfirm(tenant.rawId) }
    catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-sm shadow-2xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center gap-4 p-6 border-b border-neutral-100 dark:border-neutral-800">
          <div className="w-10 h-10 rounded-sm bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-emerald-500">lock_open</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">Reactivate Tenant</h3>
            <p className="text-sm text-neutral-500">Restore access for <strong className="text-neutral-700 dark:text-neutral-300">{tenant?.business_name}</strong></p>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-2 p-3 rounded-sm bg-emerald-500/5 border border-emerald-500/20">
            <span className="material-symbols-outlined text-emerald-500 text-[16px] flex-shrink-0 mt-0.5">info</span>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 leading-relaxed">
              All users under this tenant will regain full access immediately.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn-secondary px-5 py-2.5 text-sm">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-sm transition-colors"
          >
            {saving
              ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              : <span className="material-symbols-outlined text-sm">lock_open</span>}
            Reactivate
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Drawer ────────────────────────────────────────────────────────────
const TenantDetailPage = ({ tenant, onBack, onBlock, onReactivate, onApprove, onReject, onDeactivate }) => {
  if (!tenant) return null
  const isBlocked  = tenant.status === 'SUSPENDED'
  const isPending  = tenant.status === 'PENDING' || tenant.owner?.kyc_status === 'SUBMITTED' || tenant.kyc_status === 'SUBMITTED'
  const isActive   = tenant.status === 'ACTIVE' && tenant.owner?.kyc_status !== 'SUBMITTED' && tenant.kyc_status !== 'SUBMITTED'

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors mb-4">
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Tenants
        </button>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-base font-bold text-primary">{tenant.initials}</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">Tenant Profile</p>
              <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">{tenant.business_name}</h1>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">{tenant.id_display}</p>
            </div>
          </div>
          <StatusBadge status={tenant.statusLabel} type={tenant.statusType} />
        </div>
      </div>

      {/* Alerts */}
      {isBlocked && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-sm bg-red-500/5 border border-red-500/20 mb-6">
          <span className="material-symbols-outlined text-red-500 text-base flex-shrink-0 mt-0.5">block</span>
          <div>
            <p className="text-xs font-bold text-red-600 dark:text-red-400">This tenant is currently blocked</p>
            {tenant.blocked_reason && (
              <p className="text-xs text-red-500/80 mt-1 leading-relaxed">Reason: {tenant.blocked_reason}</p>
            )}
          </div>
        </div>
      )}
      {isPending && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-sm bg-amber-500/5 border border-amber-500/20 mb-6">
          <span className="material-symbols-outlined text-amber-500 text-base flex-shrink-0 mt-0.5">pending</span>
          <div>
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400">This tenant is pending approval</p>
            <p className="text-xs text-amber-500/80 mt-1 leading-relaxed">Review the details below and approve or reject this registration.</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-8">
        {isPending && (
          <>
            <button onClick={() => onApprove(tenant)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-sm transition-colors">
              <span className="material-symbols-outlined text-sm">check_circle</span> Approve
            </button>
            <button onClick={() => onReject(tenant)} className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-sm rounded-sm transition-colors">
              <span className="material-symbols-outlined text-sm">cancel</span> Reject
            </button>
          </>
        )}
        {isBlocked && (
          <button onClick={() => onReactivate(tenant)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-sm transition-colors">
            <span className="material-symbols-outlined text-sm">lock_open</span> Reactivate
          </button>
        )}
        {isActive && (
          <>
            <button onClick={() => onDeactivate(tenant)} className="inline-flex items-center gap-2 px-5 py-2.5 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-bold text-sm rounded-sm transition-colors">
              <span className="material-symbols-outlined text-sm">pause_circle</span> Deactivate
            </button>
            <button onClick={() => onBlock(tenant)} className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-sm rounded-sm transition-colors">
              <span className="material-symbols-outlined text-sm">block</span> Block
            </button>
          </>
        )}
        {!isPending && !isBlocked && !isActive && (
          <button onClick={() => onBlock(tenant)} className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-sm rounded-sm transition-colors">
            <span className="material-symbols-outlined text-sm">block</span> Block Tenant
          </button>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business Information */}
        <div className="dashboard-card p-6">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">Business Information</p>
          <div className="space-y-3.5">
            <InfoRow icon="store" label="Business Name" value={tenant.business_name} />
            <InfoRow icon="verified" label="BSP Reg. No." value={tenant.bsp_registration_no || '—'} />
            <InfoRow icon="badge" label="SEC/DTI No." value={tenant.sec_dti_registration_no || '—'} />
            <InfoRow icon="receipt_long" label="TIN Number" value={tenant.tin_number || '—'} />
            <InfoRow icon="person" label="Owner" value={tenant.owner?.full_name || '—'} />
            <InfoRow icon="email" label="Email" value={tenant.contact_email || '—'} />
            <InfoRow icon="phone" label="Phone" value={tenant.contact_phone || '—'} />
            <InfoRow icon="calendar_today" label="Member Since" value={tenant.created_at ? new Date(tenant.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'} />
          </div>
        </div>

        {/* Public Page */}
        {tenant.tenant_branding?.is_published && tenant.tenant_branding?.subdomain ? (
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 border border-neutral-200 dark:border-neutral-700">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Public Page</p>
            <a
              href={`${window.location.origin}/s/${tenant.tenant_branding.subdomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary font-semibold underline flex items-center gap-1"
            >
              /s/{tenant.tenant_branding.subdomain}
              <span className="material-symbols-outlined text-sm">open_in_new</span>
            </a>
          </div>
        ) : (
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-sm p-3 border border-neutral-200 dark:border-neutral-700">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Public Page</p>
            <p className="text-sm text-neutral-400 dark:text-neutral-500">Not published yet</p>
          </div>
        )}

        {/* Main Branch */}
        <div className="dashboard-card p-6">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">Main Branch</p>
          <div className="space-y-3.5">
            <InfoRow icon="storefront" label="Branch Name" value={tenant.main_branch?.branch_name || '—'} />
            <InfoRow icon="location_on" label="Address" value={tenant.main_branch?.address || '—'} />
            <InfoRow icon="map" label="Province" value={tenant.main_branch?.province || '—'} />
            <InfoRow icon="location_city" label="City" value={tenant.main_branch?.city_municipality || '—'} />
            <InfoRow icon="pin_drop" label="Barangay" value={tenant.main_branch?.barangay || '—'} />
            <InfoRow icon="markunread_mailbox" label="ZIP Code" value={tenant.main_branch?.zip_code || '—'} />
            <InfoRow icon="call" label="Branch Phone" value={tenant.main_branch?.phone || '—'} />
            <InfoRow icon="domain" label="Total Branches" value={`${tenant.branches_count ?? 1}`} />
          </div>
        </div>

        {/* ID Verification */}
        <div className="dashboard-card p-6">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">ID Verification</p>
          <div className="space-y-3.5">
            <InfoRow icon="badge" label="ID Type" value={formatIdType(tenant.owner?.id_type) || '—'} />
            <InfoRow icon="fact_check" label="KYC Status" value={tenant.owner?.kyc_status || '—'} />
          </div>
          {tenant.owner?.id_front_url && (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-neutral-500 mb-1.5">Front of ID</p>
                <img src={tenant.owner.id_front_url} alt="ID Front" className="w-full max-w-xs rounded-lg border border-neutral-200 dark:border-neutral-700" />
              </div>
              {tenant.owner?.id_back_url && (
                <div>
                  <p className="text-xs text-neutral-500 mb-1.5">Back of ID</p>
                  <img src={tenant.owner.id_back_url} alt="ID Back" className="w-full max-w-xs rounded-lg border border-neutral-200 dark:border-neutral-700" />
                </div>
              )}
            </div>
          )}
          {!tenant.owner?.id_front_url && (
            <p className="mt-3 text-xs text-neutral-400 italic">No ID uploaded yet.</p>
          )}
        </div>

        {/* Subscription */}
        <div className="dashboard-card p-6">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">Subscription</p>
          <div className="rounded-sm bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800 overflow-hidden">
            {[
              { label: 'Plan', render: () => <PlanBadge plan={tenant.plan} /> },
              { label: 'Status', render: () => <StatusBadge status={tenant.statusLabel} type={tenant.statusType} /> },
              { label: 'Monthly Fee', render: () => <span className="text-sm font-semibold text-neutral-800 dark:text-white">{tenant.plan_amount || '—'}</span> },
              { label: 'Last Payment', render: () => <span className="text-sm text-neutral-700 dark:text-neutral-300">{tenant.last_payment || '—'}</span> },
              { label: 'Next Due', render: () => <DueCell dateStr={tenant.next_due_date} /> },
            ].map(({ label, render }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-neutral-500">{label}</span>
                {render()}
              </div>
            ))}
          </div>

          {/* Activity Stats */}
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4 mt-6">Activity</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Active Loans', value: tenant.active_loans ?? '—', icon: 'monetization_on' },
              { label: 'Customers', value: tenant.customers_count ?? '—', icon: 'group' },
              { label: 'Employees', value: tenant.employees_count ?? '—', icon: 'badge' },
            ].map(s => (
              <div key={s.label} className="p-3.5 rounded-sm bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 text-center">
                <span className="material-symbols-outlined text-neutral-400 text-[18px]">{s.icon}</span>
                <p className="text-lg font-bold text-neutral-800 dark:text-white mt-1">{s.value}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
const SuperAdminTenants = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [currentPath, setCurrentPath] = useState('/superadmin/tenants')
  const [tenants, setTenants] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, blocked: 0, expiringSoon: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(true)

  const [blockTarget, setBlockTarget] = useState(null)
  const [reactivateTarget, setReactivateTarget] = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [view, setView] = useState('list') // 'list' | 'detail'
  const [approveTarget, setApproveTarget] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [deactivateTarget, setDeactivateTarget] = useState(null)

  const { profile } = useAuth()
  const itemsPerPage = 10

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'Super Admin',
    role: 'Super Admin',
    initials: (profile?.full_name || 'SA').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  }), [profile])

  const statsCards = [
    { icon: 'domain', iconBg: 'bg-primary', iconColor: 'text-white dark:text-neutral-900', label: 'Total Tenants', value: `${stats.total}`, badge: '', badgeType: 'neutral' },
    { icon: 'check_circle', iconBg: 'bg-emerald-500', iconColor: 'text-white', label: 'Active', value: `${stats.active}`, badge: '', badgeType: 'success' },
    { icon: 'block', iconBg: 'bg-red-500', iconColor: 'text-white', label: 'Blocked', value: `${stats.blocked}`, badge: '', badgeType: 'neutral' },
    { icon: 'schedule', iconBg: 'bg-amber-500', iconColor: 'text-white', label: 'Expiring Soon', value: `${stats.expiringSoon}`, badge: '', badgeType: 'warning' },
  ]

  // Debounce search input (400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCurrentPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page: currentPage, limit: itemsPerPage, search: debouncedSearch }
      if (statusFilter !== 'all') params.status = statusFilter
      if (planFilter !== 'all') params.plan = planFilter

      const [statsRes, listRes] = await Promise.all([
        tenantsApi.stats(),
        tenantsApi.list(params),
      ])
      setStats(statsRes)

      const statusMap = {
        ACTIVE:      { label: 'Active',      type: 'success' },
        SUSPENDED:   { label: 'Suspended',   type: 'destructive' },
        DEACTIVATED: { label: 'Deactivated', type: 'neutral' },
      }

      const mapped = (listRes.data || []).map(t => {
        const name = t.business_name || 'Unknown'
        const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()
        const kycPending = t.owner?.kyc_status === 'SUBMITTED' || t.owner?.kyc_status === 'PENDING'
        const s = kycPending
          ? { label: 'Pending Verification', type: 'warning' }
          : (statusMap[t.status] || { label: t.status, type: 'neutral' })
        return {
          ...t,
          rawId: t.id,
          id_display: `TEN-${String(t.id).slice(0, 8).toUpperCase()}`,
          initials,
          statusLabel: s.label,
          statusType: s.type,
          plan: (t.subscription?.plan || t.plan || 'free').toLowerCase(),
          plan_amount: t.subscription?.amount != null ? (Number(t.subscription.amount) === 0 ? 'Free' : `₱${Number(t.subscription.amount).toLocaleString()}/mo`) : '—',
          last_payment: t.subscription?.last_payment_date
            ? new Date(t.subscription.last_payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : null,
          next_due_date: t.subscription?.next_due_date || null,
        }
      })

      setTenants(mapped)
      setTotalItems(listRes.total || 0)
    } catch (err) {
      console.error('Tenants fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, debouncedSearch, statusFilter, planFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleBlock = async (tenantId, reason) => {
    await tenantsApi.block(tenantId, { reason })
    setBlockTarget(null)
    setDetailTarget(null)
    fetchData()
  }

  const handleReactivate = async (tenantId) => {
    await tenantsApi.reactivate(tenantId)
    setReactivateTarget(null)
    setDetailTarget(null)
    fetchData()
  }

  const handleApprove = async (tenantId) => {
    await tenantsApi.approve(tenantId)
    setApproveTarget(null)
    setDetailTarget(null)
    fetchData()
  }

  const handleReject = async (tenantId, reason) => {
    await tenantsApi.reject(tenantId, { reason })
    setRejectTarget(null)
    setDetailTarget(null)
    fetchData()
  }

  const handleDeactivate = async (tenantId, reason) => {
    await tenantsApi.deactivate(tenantId, { reason })
    setDeactivateTarget(null)
    setDetailTarget(null)
    fetchData()
  }

  const navigateTo = (path) => {
    setCurrentPath(path)
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const COLS = ['Tenant', 'Owner / Contact', 'Plan', 'Status', 'Last Payment', 'Next Due', 'Branches', 'Actions']

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

          {/* Detail View */}
          {view === 'detail' && detailTarget && (
            <TenantDetailPage
              tenant={detailTarget}
              onBack={() => { setView('list'); setDetailTarget(null) }}
              onBlock={t => { setView('list'); setDetailTarget(null); setBlockTarget(t) }}
              onReactivate={t => { setView('list'); setDetailTarget(null); setReactivateTarget(t) }}
              onApprove={t => { setView('list'); setDetailTarget(null); setApproveTarget(t) }}
              onReject={t => { setView('list'); setDetailTarget(null); setRejectTarget(t) }}
              onDeactivate={t => { setView('list'); setDetailTarget(null); setDeactivateTarget(t) }}
            />
          )}

          {view === 'list' && (
          <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Platform Admin</p>
              <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Tenant Management</h1>
              <p className="text-sm text-neutral-500 mt-1">View, manage, and control access for all platform tenants.</p>
            </div>
            <button onClick={fetchData} className="header-icon-btn self-start" title="Refresh">
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statsCards.map(s => <StatsCard key={s.label} {...s} />)}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-400">
                  <span className="material-symbols-outlined text-[18px]">search</span>
                </span>
                <input
                  type="text"
                  placeholder="Search tenants..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="loans-search"
                />
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-400">
                  <span className="material-symbols-outlined text-[16px]">filter_list</span>
                </span>
                <select
                  value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1) }}
                  className="loans-select pl-8 w-40"
                >
                  <option value="all">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DEACTIVATED">Deactivated</option>
                </select>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-400">
                  <span className="material-symbols-outlined text-[16px]">workspace_premium</span>
                </span>
                <select
                  value={planFilter}
                  onChange={e => { setPlanFilter(e.target.value); setCurrentPage(1) }}
                  className="loans-select pl-8 w-44"
                >
                  <option value="all">All Plans</option>
                  <option value="basic">Basic</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>

            <div className="loans-table-container">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="loans-table-header">
                    <tr>
                      {COLS.map(h => <th key={h} className="table-th text-xs whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {loading ? (
                      <tr>
                        <td colSpan={COLS.length} className="px-6 py-20 text-center">
                          <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                          <p className="mt-3 text-sm text-neutral-400">Loading tenants...</p>
                        </td>
                      </tr>
                    ) : tenants.length === 0 ? (
                      <tr>
                        <td colSpan={COLS.length} className="px-6 py-20 text-center">
                          <span className="material-symbols-outlined text-5xl text-neutral-300 dark:text-neutral-700">domain_disabled</span>
                          <p className="mt-3 text-sm font-semibold text-neutral-500">No tenants found</p>
                          <p className="mt-1 text-xs text-neutral-400">Try adjusting your search or filters.</p>
                        </td>
                      </tr>
                    ) : (
                      tenants.map(t => (
                        <TenantRow
                          key={t.rawId}
                          tenant={t}
                          onView={(t) => { setDetailTarget(t); setView('detail') }}
                          onBlock={setBlockTarget}
                          onReactivate={setReactivateTarget}
                          onApprove={setApproveTarget}
                          onReject={setRejectTarget}
                          onDeactivate={setDeactivateTarget}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="loans-table-footer">
                <p className="pagination-info">
                  Showing{' '}
                  <span>{totalItems === 0 ? 0 : Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}</span>
                  –<span>{Math.min(currentPage * itemsPerPage, totalItems)}</span>
                  {' '}of <span>{totalItems}</span> tenants
                </p>
                <Pagination
                  currentPage={currentPage}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </main>

      {blockTarget && (
        <BlockModal tenant={blockTarget} onConfirm={handleBlock} onClose={() => setBlockTarget(null)} />
      )}
      {reactivateTarget && (
        <ReactivateModal tenant={reactivateTarget} onConfirm={handleReactivate} onClose={() => setReactivateTarget(null)} />
      )}
      {approveTarget && (
        <ApproveModal tenant={approveTarget} onConfirm={handleApprove} onClose={() => setApproveTarget(null)} />
      )}
      {rejectTarget && (
        <RejectModal tenant={rejectTarget} onConfirm={handleReject} onClose={() => setRejectTarget(null)} />
      )}
      {deactivateTarget && (
        <DeactivateModal tenant={deactivateTarget} onConfirm={handleDeactivate} onClose={() => setDeactivateTarget(null)} />
      )}
    </div>
  )
}

export default SuperAdminTenants
