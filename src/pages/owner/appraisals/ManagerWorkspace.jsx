import { useEffect, useMemo, useState } from 'react'
import { Sidebar, Header } from '../../../components/layout'
import { Pagination, StatsCard, StatusBadge, EmptyState, Modal } from '../../../components/ui'
import { getNavigationByRole } from '../../../config'
import { useAuth } from '../../../context'
import { appraisalsApi, loanSettingsApi } from '../../../lib/api'

const ITEMS_PER_PAGE = 10

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

const formatCurrency = (val) => {
  const num = Number(val)
  if (isNaN(num)) return '\u20B10.00'
  return `\u20B1${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (!iso) return '---'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ManagerWorkspace() {
  const { profile } = useAuth()
  const navigation = getNavigationByRole(profile?.role)

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'User',
    role: profile?.role || 'Staff',
    initials: (profile?.full_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2),
  }), [profile])

  const [currentPath, setCurrentPath] = useState('/admin/appraisals')
  const [activeTab, setActiveTab] = useState('approval') // 'approval' | 'all'

  // List state
  const [stats, setStats] = useState({ pendingApproval: 0, approvedToday: 0, rejected: 0, readyForRelease: 0 })
  const [queue, setQueue] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Modal state
  const [approveModal, setApproveModal] = useState({ open: false, item: null })
  const [rejectModal, setRejectModal] = useState({ open: false, item: null })
  const [modalLoading, setModalLoading] = useState(false)

  // Approve form
  const [principalLoan, setPrincipalLoan] = useState('')
  const [offeredAmount, setOfferedAmount] = useState('')
  const [storageLocation, setStorageLocation] = useState('')

  // Loan settings
  const [loanSettings, setLoanSettings] = useState(null)

  // Reject form
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await loanSettingsApi.get()
        setLoanSettings(settings)
      } catch {}
    }
    fetchSettings()
  }, [])

  const fetchQueue = async () => {
    try {
      setLoading(true)
      const params = { page: currentPage, limit: ITEMS_PER_PAGE }
      if (activeTab === 'approval') params.status = 'APPRAISED'

      const [statsRes, queueRes] = await Promise.all([
        appraisalsApi.stats(),
        appraisalsApi.queue(params),
      ])
      setStats(statsRes)
      setQueue(queueRes.data || [])
      setTotalItems(queueRes.total || 0)
    } catch (err) {
      console.error('Manager workspace fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueue()
  }, [currentPage, activeTab])

  const handleApprove = async () => {
    try {
      setModalLoading(true)
      await appraisalsApi.approve(approveModal.item.id, {
        principal_loan: Number(principalLoan),
        offered_amount: offeredAmount ? Number(offeredAmount) : null,
        storage_location: storageLocation || null,
      })
      setApproveModal({ open: false, item: null })
      setPrincipalLoan('')
      setOfferedAmount('')
      setStorageLocation('')
      fetchQueue()
    } catch (err) {
      console.error('Approve error:', err)
    } finally {
      setModalLoading(false)
    }
  }

  const handleReject = async () => {
    try {
      setModalLoading(true)
      await appraisalsApi.reject(rejectModal.item.id, { reason: rejectReason })
      setRejectModal({ open: false, item: null })
      setRejectReason('')
      fetchQueue()
    } catch (err) {
      console.error('Reject error:', err)
    } finally {
      setModalLoading(false)
    }
  }

  const statsData = [
    { icon: 'approval', iconBg: 'bg-blue-500', iconColor: 'text-white', label: 'Pending Approval', value: String(stats.pendingApproval || 0) },
    { icon: 'check_circle', iconBg: 'bg-emerald-500', iconColor: 'text-white', label: 'Approved Today', value: String(stats.approvedToday || stats.approved || 0) },
    { icon: 'cancel', iconBg: 'bg-red-500', iconColor: 'text-white', label: 'Rejected', value: String(stats.rejected || 0) },
    { icon: 'local_shipping', iconBg: 'bg-primary', iconColor: 'text-white', label: 'Ready for Release', value: String(stats.readyForRelease || 0) },
  ]

  const tabs = [
    { id: 'approval', label: 'Approval Queue' },
    { id: 'all', label: 'All Items' },
  ]

  return (
    <div className="admin-layout">
      <Sidebar navigation={navigation} currentPath={currentPath} onNavigate={setCurrentPath} />

      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <nav className="flex mb-2" aria-label="Breadcrumb">
                <ol className="flex items-center space-x-2">
                  <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Operations</span></li>
                  <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                  <li><span className="text-neutral-700 dark:text-white text-sm font-semibold">Appraisals</span></li>
                </ol>
              </nav>
              <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">Approval Queue</h1>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsData.map((stat, index) => <StatsCard key={index} {...stat} />)}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-6 border-b border-neutral-200 dark:border-neutral-700">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setCurrentPage(1) }}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Queue Table */}
          <div className="loans-table-container">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-neutral-400 dark:text-neutral-500">
                  <span className="material-symbols-rounded animate-spin text-2xl mr-2">progress_activity</span>
                  Loading appraisals...
                </div>
              ) : queue.length === 0 ? (
                <EmptyState icon="assignment" title="No appraisals found" description={activeTab === 'approval' ? 'No items pending approval.' : 'No items in the queue.'} />
              ) : (
                <table className="min-w-full text-center text-sm whitespace-nowrap">
                  <thead className="loans-table-header">
                    <tr>
                      <th className="table-th text-center">Item</th>
                      <th className="table-th text-center">Customer</th>
                      <th className="table-th text-center">Category</th>
                      <th className="table-th text-center">Value</th>
                      <th className="table-th text-center">Status</th>
                      <th className="table-th text-center">Date</th>
                      <th className="table-th text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {queue.map((item) => {
                      const statusInfo = STATUS_MAP[item.inventory_status] || { label: item.inventory_status, type: 'neutral' }
                      const customerName = item.customers ? `${item.customers.first_name} ${item.customers.last_name}` : 'Unknown'
                      const isPending = item.inventory_status === 'APPRAISED'

                      return (
                        <tr key={item.id} className="loan-row">
                          <td className="px-4 py-4 text-center">
                            <p className="text-neutral-600 dark:text-neutral-300 font-semibold">{item.general_desc || '---'}</p>
                            {(item.brand || item.serial_number) && (
                              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{[item.brand, item.model].filter(Boolean).join(' ')}{item.serial_number && ` \u00B7 S/N: ${item.serial_number}`}</p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center text-neutral-500 dark:text-neutral-400">{customerName}</td>
                          <td className="px-4 py-4 text-center text-neutral-500 dark:text-neutral-400">{item.category || '---'}</td>
                          <td className="px-4 py-4 text-center font-bold text-neutral-600 dark:text-neutral-300">{item.appraised_value ? formatCurrency(item.appraised_value) : '---'}</td>
                          <td className="px-4 py-4 text-center"><StatusBadge status={statusInfo.label} type={statusInfo.type} /></td>
                          <td className="px-4 py-4 text-center text-neutral-500 dark:text-neutral-400">{formatDate(item.created_at)}</td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <a href={`/admin/appraisals/${item.id}`}
                                onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', `/admin/appraisals/${item.id}`); window.dispatchEvent(new PopStateEvent('popstate')) }}
                                className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                                title="View Details">
                                <span className="material-symbols-rounded text-lg">visibility</span>
                              </a>
                              {isPending && (
                                <>
                                  <button onClick={() => { setPrincipalLoan(item.appraised_value || ''); setOfferedAmount(''); setStorageLocation(''); setApproveModal({ open: true, item }) }}
                                    className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                    title="Approve">
                                    <span className="material-symbols-rounded text-lg">check_circle</span>
                                  </button>
                                  <button onClick={() => { setRejectReason(''); setRejectModal({ open: true, item }) }}
                                    className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Reject">
                                    <span className="material-symbols-rounded text-lg">cancel</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {!loading && queue.length > 0 && (
              <Pagination currentPage={currentPage} totalPages={Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))} totalItems={totalItems} itemsPerPage={ITEMS_PER_PAGE} itemLabel="appraisals" onPageChange={setCurrentPage} />
            )}
          </div>
        </div>
      </main>

      {/* Approve Modal */}
      <Modal open={approveModal.open} onClose={() => setApproveModal({ open: false, item: null })} title="Approve & Create Ticket" size="sm">
        {approveModal.item && (
          <div className="space-y-5">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg space-y-1">
              <p className="text-sm font-semibold text-neutral-800 dark:text-white">{approveModal.item.general_desc}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Appraised Value: <span className="font-bold text-primary">{formatCurrency(approveModal.item.appraised_value)}</span></p>
            </div>

            {approveModal.item.fair_market_value && approveModal.item.fair_market_value !== approveModal.item.appraised_value && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                <span className="material-symbols-rounded text-sm">analytics</span>
                Fair Market Value: <span className="font-bold">{formatCurrency(approveModal.item.fair_market_value)}</span>
              </div>
            )}

            {approveModal.item && loanSettings && (
              <div className="mb-3 p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-sm text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Appraised Value</span>
                  <span className="font-semibold">{formatCurrency(approveModal.item.appraised_value)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-neutral-500">LTV Ratio</span>
                  <span>{((loanSettings.ltv_ratio || 0.70) * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between mt-1 border-t border-neutral-200 dark:border-neutral-600 pt-1">
                  <span className="text-neutral-500 font-semibold">Max Loanable</span>
                  <span className="font-bold text-lime-600">{formatCurrency(approveModal.item.appraised_value * (loanSettings.ltv_ratio || 0.70))}</span>
                </div>
              </div>
            )}

            <div>
              <label className="form-label">Principal Loan Amount</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 dark:text-neutral-500 text-sm font-medium">{'\u20B1'}</span>
                <input type="number" value={principalLoan} onChange={(e) => setPrincipalLoan(e.target.value)} className="form-input w-full pl-7" placeholder="0.00" min="0" max={approveModal.item ? approveModal.item.appraised_value * (loanSettings?.ltv_ratio || 0.70) : undefined} step="0.01" />
              </div>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1.5 flex items-center gap-1">
                <span className="material-symbols-rounded text-sm">info</span>
                Loan cannot exceed {((loanSettings?.ltv_ratio || 0.70) * 100).toFixed(0)}% LTV — max loanable: {formatCurrency(approveModal.item.appraised_value * (loanSettings?.ltv_ratio || 0.70))}.
              </p>
              {Number(principalLoan) > Number(approveModal.item.appraised_value) * (loanSettings?.ltv_ratio || 0.70) && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <span className="material-symbols-rounded text-sm">warning</span>Amount exceeds the LTV-based maximum loanable amount.
                </p>
              )}
              {principalLoan > 0 && loanSettings && (
                <div className="mt-2 text-xs text-neutral-500 space-y-1">
                  <p>Service Charge: {formatCurrency(loanSettings.service_charge || 10)}</p>
                  <p>Advance Interest ({loanSettings.interest_rate || 3}% × {loanSettings.advance_interest_months || 1}mo): {formatCurrency(principalLoan * (loanSettings.interest_rate || 3) / 100 * (loanSettings.advance_interest_months || 1))}</p>
                  <p className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Est. Net Proceeds: {formatCurrency(
                      principalLoan
                      - (loanSettings.service_charge || 10)
                      - principalLoan * (loanSettings.interest_rate || 3) / 100 * (loanSettings.advance_interest_months || 1)
                    )}
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
              <input type="text" value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} className="form-input w-full" placeholder="e.g. Vault A - Shelf 3 - Bin 12" />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => setApproveModal({ open: false, item: null })} className="btn-outline">Cancel</button>
              <button type="button" onClick={handleApprove}
                disabled={!principalLoan || Number(principalLoan) <= 0 || Number(principalLoan) > Number(approveModal.item.appraised_value) * (loanSettings?.ltv_ratio || 0.70) || modalLoading}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                {modalLoading ? (<><span className="material-symbols-rounded animate-spin text-lg">progress_activity</span>Approving...</>) : (<><span className="material-symbols-rounded text-lg">check_circle</span>Approve & Create Ticket</>)}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal open={rejectModal.open} onClose={() => setRejectModal({ open: false, item: null })} title="Reject Appraisal" size="sm">
        {rejectModal.item && (
          <div className="space-y-5">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg space-y-1">
              <p className="text-sm font-semibold text-neutral-800 dark:text-white">{rejectModal.item.general_desc}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">ID: {rejectModal.item.id?.slice(0, 8)}</p>
            </div>

            <div>
              <label className="form-label">Reason for Rejection (optional)</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="form-input w-full min-h-[100px] resize-y" placeholder="Provide a reason for rejecting this appraisal..." rows={4} />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => setRejectModal({ open: false, item: null })} className="btn-outline">Cancel</button>
              <button type="button" onClick={handleReject} disabled={modalLoading}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {modalLoading ? (<><span className="material-symbols-rounded animate-spin text-lg">progress_activity</span>Rejecting...</>) : (<><span className="material-symbols-rounded text-lg">cancel</span>Reject Appraisal</>)}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
