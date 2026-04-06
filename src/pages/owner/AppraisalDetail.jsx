import { useState, useEffect, useMemo } from 'react'
import { Sidebar, Header } from '../../components/layout'
import { StatusBadge, Modal } from '../../components/ui'
import { getNavigationByRole } from '../../config'
import { useAuth } from '../../context'
import { appraisalsApi, loanSettingsApi } from '../../lib/api'

const STATUS_MAP = {
  PENDING_APPRAISAL: { label: 'Pending Appraisal', type: 'warning' },
  PENDING_APPROVAL: { label: 'Pending Approval', type: 'info' },
  READY_FOR_RELEASE: { label: 'Ready for Release', type: 'success' },
  ISSUED: { label: 'Issued', type: 'success' },
  VAULT: { label: 'In Vault', type: 'success' },
  REDEEMED: { label: 'Redeemed', type: 'info' },
  FORFEITED: { label: 'Forfeited', type: 'danger' },
  AUCTIONED: { label: 'Auctioned', type: 'neutral' },
  MELTED: { label: 'Melted', type: 'neutral' },
  REJECTED: { label: 'Rejected', type: 'danger' },
  DECLINED: { label: 'Declined', type: 'neutral' },
}

const CATEGORY_ICONS = {
  JEWELRY: 'diamond', GOLD: 'diamond', ELECTRONICS: 'smartphone', WATCH: 'watch',
  WATCHES: 'watch', BAGS: 'shopping_bag', TOOLS: 'construction', INSTRUMENTS: 'music_note',
  APPLIANCE: 'kitchen', VEHICLE: 'directions_car', OTHER: 'category',
}

const fmt = (val) => {
  const n = Number(val)
  if (isNaN(n)) return '\u20B10.00'
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const fmtDate = (iso) => {
  if (!iso) return '---'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const DataCell = ({ label, value, mono, large }) => (
  <div className="bg-neutral-50 dark:bg-neutral-800/40 rounded-lg p-3.5 border border-neutral-100 dark:border-neutral-800">
    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">{label}</p>
    <p className={`${large ? 'text-base' : 'text-sm'} font-semibold text-neutral-800 dark:text-neutral-100 ${mono ? 'font-mono' : ''} break-all`}>{value || '---'}</p>
  </div>
)

const TimelineStep = ({ icon, label, date, isLast }) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${date ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-neutral-800'}`}>
        <span className={`material-symbols-rounded text-sm ${date ? 'text-white dark:text-neutral-900' : 'text-neutral-400 dark:text-neutral-600'}`}>{icon}</span>
      </div>
      {!isLast && <div className={`w-px flex-1 mt-1 ${date ? 'bg-neutral-300 dark:bg-neutral-600' : 'bg-neutral-200 dark:bg-neutral-800'}`} />}
    </div>
    <div className={`pb-5 ${isLast ? '' : ''}`}>
      <p className={`text-xs font-semibold ${date ? 'text-neutral-800 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-600'}`}>{label}</p>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{date || 'Pending'}</p>
    </div>
  </div>
)

export default function AppraisalDetail({ itemId }) {
  const { profile } = useAuth()
  const navigation = getNavigationByRole(profile?.role)
  const canAction = ['OWNER', 'MANAGER'].includes(profile?.role)

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'User',
    role: profile?.role || 'Staff',
    initials: (profile?.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2),
  }), [profile])

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loanSettings, setLoanSettings] = useState(null)
  const [approveModal, setApproveModal] = useState(false)
  const [rejectModal, setRejectModal] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [principalLoan, setPrincipalLoan] = useState('')
  const [offeredAmount, setOfferedAmount] = useState('')
  const [storageLocation, setStorageLocation] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [message, setMessage] = useState(null)

  const navigate = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')) }

  useEffect(() => {
    if (!itemId) return
    Promise.all([
      appraisalsApi.get(itemId),
      loanSettingsApi.get().catch(() => null),
    ]).then(([data, settings]) => {
      setItem(data)
      setLoanSettings(settings)
      setPrincipalLoan(data.appraised_value || '')
    }).catch(() => {
      setMessage({ type: 'error', text: 'Failed to load appraisal.' })
    }).finally(() => setLoading(false))
  }, [itemId])

  const handleApprove = async () => {
    try {
      setModalLoading(true)
      await appraisalsApi.approve(item.id, {
        principal_loan: Number(principalLoan),
        offered_amount: offeredAmount ? Number(offeredAmount) : null,
        storage_location: storageLocation || null,
      })
      setApproveModal(false)
      const updated = await appraisalsApi.get(itemId)
      setItem(updated)
      setMessage({ type: 'success', text: 'Appraisal approved. Pawn ticket created.' })
    } catch (err) { setMessage({ type: 'error', text: err.message }) }
    finally { setModalLoading(false) }
  }

  const handleReject = async () => {
    try {
      setModalLoading(true)
      await appraisalsApi.reject(item.id, { reason: rejectReason })
      setRejectModal(false)
      const updated = await appraisalsApi.get(itemId)
      setItem(updated)
      setMessage({ type: 'success', text: 'Appraisal rejected.' })
    } catch (err) { setMessage({ type: 'error', text: err.message }) }
    finally { setModalLoading(false) }
  }

  const isPending = item?.inventory_status === 'APPRAISED'
  const statusInfo = item ? (STATUS_MAP[item.inventory_status] || { label: item.inventory_status, type: 'neutral' }) : null
  const customerName = item?.customers ? `${item.customers.first_name} ${item.customers.last_name}` : 'Unknown'
  const maxLoan = item ? Number(item.appraised_value) * (loanSettings?.ltv_ratio || 0.70) : 0
  const catIcon = item ? (CATEGORY_ICONS[item.category?.toUpperCase()] || 'category') : 'category'
  const itemTitle = item?.general_desc || item?.category || 'Item'
  const itemSubtitle = [item?.brand, item?.model].filter(Boolean).join(' ')

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath="/admin/appraisals" onNavigate={navigate} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">

          {/* Back */}
          <button onClick={() => navigate('/admin/appraisals')}
            className="inline-flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors mb-5">
            <span className="material-symbols-rounded text-lg">arrow_back</span>
            Back to Appraisals
          </button>

          {/* Message */}
          {message && (
            <div className={`flex items-center gap-2 p-3 mb-5 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400'}`}>
              <span className="material-symbols-rounded text-base">{message.type === 'success' ? 'check_circle' : 'error'}</span>
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-neutral-400 dark:text-neutral-500">
              <span className="material-symbols-rounded animate-spin text-2xl mr-2">progress_activity</span>
              Loading...
            </div>
          ) : !item ? (
            <div className="text-center py-20 text-neutral-400 dark:text-neutral-500">
              <span className="material-symbols-rounded text-4xl mb-2 block">error_outline</span>
              Appraisal not found.
            </div>
          ) : (
            <>
              {/* ── Hero Banner ── */}
              <div className="dashboard-card mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-xl bg-neutral-900 dark:bg-white flex items-center justify-center shrink-0">
                    <span className="material-symbols-rounded text-2xl text-white dark:text-neutral-900">{catIcon}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h1 className="text-xl font-display font-bold text-neutral-800 dark:text-neutral-100 truncate">{itemTitle}</h1>
                      {statusInfo && <StatusBadge status={statusInfo.label} type={statusInfo.type} />}
                    </div>
                    {itemSubtitle && <p className="text-sm text-neutral-500 dark:text-neutral-400">{itemSubtitle}</p>}
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 font-mono">ID: {item.id?.slice(0, 8)}</p>
                  </div>
                  {/* Actions */}
                  {canAction && isPending && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setPrincipalLoan(item.appraised_value || ''); setOfferedAmount(''); setStorageLocation(''); setApproveModal(true) }}
                        className="btn-primary text-sm">
                        <span className="material-symbols-rounded text-lg">check_circle</span> Approve
                      </button>
                      <button onClick={() => { setRejectReason(''); setRejectModal(true) }}
                        className="px-4 py-2 rounded-sm bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center gap-2 transition-colors">
                        <span className="material-symbols-rounded text-lg">cancel</span> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Left: Details ── */}
                <div className="lg:col-span-2 space-y-6">

                  {/* Valuation Highlight */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-neutral-900 dark:bg-white rounded-xl p-4 text-center col-span-2 sm:col-span-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">Appraised</p>
                      <p className="text-lg font-extrabold text-white dark:text-neutral-900">{fmt(item.appraised_value)}</p>
                    </div>
                    {item.fair_market_value && (
                      <div className="bg-neutral-50 dark:bg-neutral-800/40 rounded-xl p-4 text-center border border-neutral-100 dark:border-neutral-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">Fair Market</p>
                        <p className="text-lg font-extrabold text-neutral-800 dark:text-neutral-100">{fmt(item.fair_market_value)}</p>
                      </div>
                    )}
                    {loanSettings && (
                      <div className="bg-neutral-50 dark:bg-neutral-800/40 rounded-xl p-4 text-center border border-neutral-100 dark:border-neutral-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">LTV</p>
                        <p className="text-lg font-extrabold text-neutral-800 dark:text-neutral-100">{((loanSettings.ltv_ratio || 0.70) * 100).toFixed(0)}%</p>
                      </div>
                    )}
                    {loanSettings && (
                      <div className="bg-neutral-50 dark:bg-neutral-800/40 rounded-xl p-4 text-center border border-neutral-100 dark:border-neutral-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">Max Loanable</p>
                        <p className="text-lg font-extrabold text-neutral-800 dark:text-neutral-100">{fmt(maxLoan)}</p>
                      </div>
                    )}
                  </div>

                  {/* Item Attributes */}
                  <div className="dashboard-card">
                    <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider mb-4">Item Details</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <DataCell label="Category" value={item.category} />
                      <DataCell label="Condition" value={item.condition || 'Not assessed'} />
                      {item.serial_number && <DataCell label="Serial Number" value={item.serial_number} mono />}
                      {item.weight_grams && <DataCell label="Weight" value={`${item.weight_grams}g`} />}
                      {item.karat && <DataCell label="Karat" value={`${item.karat}K`} />}
                      {item.color && <DataCell label="Color" value={item.color} />}
                    </div>
                  </div>

                  {/* Loan Terms (if approved) */}
                  {item.specific_attrs?.loan_terms && (() => {
                    const lt = item.specific_attrs.loan_terms
                    return (
                      <div className="dashboard-card">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="material-symbols-rounded text-lg text-neutral-400">receipt_long</span>
                          <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider">Loan Terms</h2>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                          <DataCell label="Ticket #" value={lt.ticket_number} mono large />
                          <DataCell label="Principal" value={fmt(lt.principal_loan)} large />
                          <DataCell label="Net Proceeds" value={fmt(lt.net_proceeds)} large />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <DataCell label="Interest Rate" value={`${lt.interest_rate}%/mo`} />
                          <DataCell label="Advance Interest" value={fmt(lt.advance_interest)} />
                          <DataCell label="Service Charge" value={fmt(lt.service_charge_amount || lt.service_charge)} />
                          <DataCell label="Grace Period" value={`${lt.grace_period_days || '---'} days`} />
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                          <DataCell label="Loan Date" value={fmtDate(lt.loan_date)} />
                          <DataCell label="Maturity" value={fmtDate(lt.maturity_date)} />
                          <DataCell label="Expiry" value={fmtDate(lt.expiry_date)} />
                        </div>
                      </div>
                    )
                  })()}

                  {/* Notes */}
                  {item.notes && (
                    <div className="dashboard-card">
                      <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider mb-3">Notes</h2>
                      <p className="text-sm text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">{item.notes}</p>
                    </div>
                  )}
                </div>

                {/* ── Right: Sidebar ── */}
                <div className="space-y-6">

                  {/* Customer */}
                  <div className="dashboard-card">
                    <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider mb-4">Customer</h2>
                    <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-100 dark:border-neutral-800">
                      <div className="w-11 h-11 rounded-full bg-neutral-900 dark:bg-white flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-white dark:text-neutral-900">
                          {item.customers ? `${item.customers.first_name[0]}${item.customers.last_name[0]}` : '?'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 truncate">{customerName}</p>
                        {item.customers?.email && <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{item.customers.email}</p>}
                      </div>
                    </div>
                    {item.customers?.mobile_number && (
                      <div className="mt-3">
                        <DataCell label="Mobile" value={item.customers.mobile_number} />
                      </div>
                    )}
                  </div>

                  {/* Timeline */}
                  <div className="dashboard-card">
                    <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider mb-5">Timeline</h2>
                    <TimelineStep icon="add_circle" label="Submitted" date={fmtDate(item.created_at)} />
                    <TimelineStep icon="diamond" label="Appraised" date={item.appraised_at ? fmtDate(item.appraised_at) : null} />
                    <TimelineStep icon="check_circle" label="Approved" date={item.approved_at ? fmtDate(item.approved_at) : null} />
                    <TimelineStep icon="receipt_long" label="Issued" date={item.inventory_status === 'ISSUED' || item.inventory_status === 'VAULT' ? fmtDate(item.updated_at) : null} isLast />
                  </div>

                  {/* Images */}
                  {item.image_urls && item.image_urls.length > 0 && (
                    <div className="dashboard-card">
                      <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider mb-4">Photos</h2>
                      <div className="grid grid-cols-2 gap-2">
                        {item.image_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 hover:opacity-80 transition-opacity aspect-square">
                            <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Approve Modal */}
      <Modal open={approveModal} onClose={() => setApproveModal(false)} title="Approve & Create Ticket" size="sm">
        {item && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg">
              <div className="w-10 h-10 rounded-lg bg-neutral-900 dark:bg-white flex items-center justify-center shrink-0">
                <span className="material-symbols-rounded text-white dark:text-neutral-900">{catIcon}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-800 dark:text-white">{itemTitle}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Appraised: <span className="font-bold">{fmt(item.appraised_value)}</span></p>
              </div>
            </div>

            {loanSettings && (
              <div className="p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-sm text-sm">
                <div className="flex justify-between"><span className="text-neutral-500">Appraised Value</span><span className="font-semibold">{fmt(item.appraised_value)}</span></div>
                <div className="flex justify-between mt-1"><span className="text-neutral-500">LTV Ratio</span><span>{((loanSettings.ltv_ratio || 0.70) * 100).toFixed(0)}%</span></div>
                <div className="flex justify-between mt-1 border-t border-neutral-200 dark:border-neutral-600 pt-1"><span className="text-neutral-500 font-semibold">Max Loanable</span><span className="font-bold text-lime-600">{fmt(maxLoan)}</span></div>
              </div>
            )}

            <div>
              <label className="form-label">Principal Loan Amount</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 dark:text-neutral-500 text-sm font-medium">{'\u20B1'}</span>
                <input type="number" value={principalLoan} onChange={(e) => setPrincipalLoan(e.target.value)} className="form-input w-full pl-7" placeholder="0.00" min="0" max={maxLoan} step="0.01" />
              </div>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1.5 flex items-center gap-1">
                <span className="material-symbols-rounded text-sm">info</span> Max loanable: {fmt(maxLoan)}
              </p>
              {Number(principalLoan) > maxLoan && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <span className="material-symbols-rounded text-sm">warning</span>Exceeds LTV maximum.
                </p>
              )}
              {principalLoan > 0 && loanSettings && (
                <div className="mt-2 text-xs text-neutral-500 space-y-1">
                  <p>Service Charge: {fmt(loanSettings.service_charge || 10)}</p>
                  <p>Advance Interest ({loanSettings.interest_rate || 3}% x {loanSettings.advance_interest_months || 1}mo): {fmt(principalLoan * (loanSettings.interest_rate || 3) / 100 * (loanSettings.advance_interest_months || 1))}</p>
                  <p className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Est. Net Proceeds: {fmt(principalLoan - (loanSettings.service_charge || 10) - principalLoan * (loanSettings.interest_rate || 3) / 100 * (loanSettings.advance_interest_months || 1))}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Offered Amount (optional)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 dark:text-neutral-500 text-sm font-medium">{'\u20B1'}</span>
                <input type="number" value={offeredAmount} onChange={(e) => setOfferedAmount(e.target.value)} className="form-input w-full pl-7" placeholder="0.00" min="0" step="0.01" />
              </div>
            </div>

            <div>
              <label className="form-label">Storage Location (optional)</label>
              <input type="text" value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} className="form-input w-full" placeholder="e.g. Vault A - Shelf 3" />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => setApproveModal(false)} className="btn-outline">Cancel</button>
              <button type="button" onClick={handleApprove}
                disabled={!principalLoan || Number(principalLoan) <= 0 || Number(principalLoan) > maxLoan || modalLoading}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                {modalLoading ? (<><span className="material-symbols-rounded animate-spin text-lg">progress_activity</span>Approving...</>) : (<><span className="material-symbols-rounded text-lg">check_circle</span>Approve</>)}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Appraisal" size="sm">
        {item && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg">
              <div className="w-10 h-10 rounded-lg bg-neutral-900 dark:bg-white flex items-center justify-center shrink-0">
                <span className="material-symbols-rounded text-white dark:text-neutral-900">{catIcon}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-800 dark:text-white">{itemTitle}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">ID: {item.id?.slice(0, 8)}</p>
              </div>
            </div>

            <div>
              <label className="form-label">Reason for Rejection (optional)</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="form-input w-full min-h-[100px] resize-y" placeholder="Provide a reason..." rows={4} />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => setRejectModal(false)} className="btn-outline">Cancel</button>
              <button type="button" onClick={handleReject} disabled={modalLoading}
                className="px-4 py-2 rounded-sm bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {modalLoading ? (<><span className="material-symbols-rounded animate-spin text-lg">progress_activity</span>Rejecting...</>) : (<><span className="material-symbols-rounded text-lg">cancel</span>Reject</>)}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
