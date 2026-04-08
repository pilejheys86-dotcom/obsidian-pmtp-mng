import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Sidebar, Header } from '../../components/layout'
import { Pagination, StatusBadge } from '../../components/ui'
import { superadminNavigation } from '../../config'
import { useAuth } from '../../context'
import { backupApi, tenantsApi } from '../../lib/api'

// ── ObsidianIcon (inline, no wordmark) ───────────────────────────────────────
const ObsidianIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333.33 1333.33" fill="currentColor" className={className}>
    <rect y="333.17" width="333.17" height="1000" />
    <rect x="666.67" y="666.67" width="332.49" height="666.5" />
    <rect x="666.42" y="1000.58" width="333.17" height="999" transform="translate(-1000.42 1999.75) rotate(-90)" />
    <rect x="500.5" y="500.5" width="333.5" height="665.51" transform="translate(-499.33 1167.17) rotate(-90)" />
    <rect x="1000" width="333.33" height="333.33" />
  </svg>
)

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (!bytes) return '\u2014'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

const STAGE_LABELS = [
  'tenants', 'branches', 'tenant_users', 'customers', 'kyc_documents',
  'tenant_loan_settings', 'tenant_branding', 'pawn_items', 'pawn_tickets',
  'transactions', 'subscriptions', 'tenant_audit_logs',
]

// ── Backup Overlay ───────────────────────────────────────────────────────────
const BackupOverlay = ({ active, mode, onComplete, done }) => {
  const [stageIndex, setStageIndex] = useState(0)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!active) {
      setStageIndex(0)
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      setStageIndex(prev => {
        if (prev < STAGE_LABELS.length - 1) return prev + 1
        return prev
      })
    }, 250)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [active])

  // When the API resolves (done becomes true), jump to 100% then dismiss
  useEffect(() => {
    if (done && active) {
      setStageIndex(STAGE_LABELS.length)
      if (intervalRef.current) clearInterval(intervalRef.current)
      const timeout = setTimeout(() => {
        onComplete?.()
      }, 400)
      return () => clearTimeout(timeout)
    }
  }, [done, active, onComplete])

  if (!active) return null

  const progress = done
    ? 100
    : Math.min(((stageIndex + 1) / STAGE_LABELS.length) * 95, 95)

  const currentLabel = done
    ? 'Complete!'
    : `${mode} ${STAGE_LABELS[Math.min(stageIndex, STAGE_LABELS.length - 1)]}...`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6">
        <ObsidianIcon className="w-16 h-16 animate-pulse text-neutral-400 dark:text-neutral-500" />
        <div className="h-1.5 w-64 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-neutral-900 dark:bg-white transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-neutral-400">{currentLabel}</p>
      </div>
    </div>
  )
}

// ── Tenant Selector Modal ────────────────────────────────────────────────────
const TenantSelectorModal = ({ tenants, loading, onSelect, onClose }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
    <div className="bg-white dark:bg-neutral-800 rounded-sm shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between p-5 border-b border-neutral-100 dark:border-neutral-700">
        <h3 className="text-base font-display font-bold text-neutral-900 dark:text-white">Select Tenant</h3>
        <button onClick={onClose} className="header-icon-btn">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>
      <div className="overflow-y-auto flex-1 p-2">
        {loading ? (
          <div className="flex flex-col items-center py-12">
            <span className="material-symbols-outlined animate-spin text-2xl text-primary">progress_activity</span>
            <p className="mt-3 text-sm text-neutral-400">Loading tenants...</p>
          </div>
        ) : tenants.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-600">store</span>
            <p className="mt-3 text-sm text-neutral-500">No tenants found</p>
          </div>
        ) : (
          tenants.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="w-full text-left px-4 py-3 rounded-sm hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors flex items-center gap-3 group"
            >
              <div className="h-8 w-8 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">
                  {(t.business_name || '?').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-800 dark:text-white truncate">{t.business_name}</p>
                <p className="text-xs text-neutral-400 truncate">{t.id}</p>
              </div>
              <span className="material-symbols-outlined text-lg text-neutral-300 dark:text-neutral-600 group-hover:text-primary transition-colors">
                chevron_right
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  </div>
)

// ── Restore Preview Modal ────────────────────────────────────────────────────
const RestorePreviewModal = ({ preview, onConfirm, onClose, restoring }) => {
  const [confirmText, setConfirmText] = useState('')
  const canRestore = confirmText === 'RESTORE'

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-800 rounded-sm shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-neutral-100 dark:border-neutral-700">
          <h3 className="text-base font-display font-bold text-neutral-900 dark:text-white">Restore Preview</h3>
          <button onClick={onClose} className="header-icon-btn">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-neutral-400 mb-1">Backup Date</p>
              <p className="text-sm font-medium text-neutral-800 dark:text-white">
                {preview.generated_at ? new Date(preview.generated_at).toLocaleString() : '\u2014'}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 mb-1">Type</p>
              <p className="text-sm font-medium text-neutral-800 dark:text-white capitalize">{preview.type || '\u2014'}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 mb-1">Scope</p>
              <p className="text-sm font-medium text-neutral-800 dark:text-white">{preview.tenant_name || 'All Tenants'}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 mb-1">Total Rows</p>
              <p className="text-sm font-medium text-neutral-800 dark:text-white">{(preview.total_rows || 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Table counts */}
          {preview.table_counts && Object.keys(preview.table_counts).length > 0 && (
            <div>
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Table Row Counts</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(preview.table_counts).map(([table, count]) => (
                  <div key={table} className="flex items-center justify-between px-3 py-2 rounded-sm bg-neutral-50 dark:bg-neutral-700/40">
                    <span className="text-xs text-neutral-600 dark:text-neutral-300 font-medium">{table}</span>
                    <span className="text-xs font-bold text-neutral-800 dark:text-white">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="rounded-sm bg-red-500/10 border border-red-500/20 p-4">
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-red-500 text-lg flex-shrink-0 mt-0.5">warning</span>
              <p className="text-sm text-red-600 dark:text-red-400">
                This will delete and replace all existing data for the selected scope. This action cannot be undone.
              </p>
            </div>
          </div>

          {/* Confirmation input */}
          <div>
            <label className="form-label">
              Type <span className="font-bold text-red-500">RESTORE</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="RESTORE"
              className="form-input w-full"
              autoFocus
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-neutral-100 dark:border-neutral-700">
          <button onClick={onClose} className="btn-outline" disabled={restoring}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!canRestore || restoring}
            className={`btn-primary ${!canRestore ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {restoring ? (
              <>
                <span className="material-symbols-outlined animate-spin text-sm mr-1.5">progress_activity</span>
                Restoring...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm mr-1.5">restore</span>
                Restore
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Format Dropdown ──────────────────────────────────────────────────────────
const FormatDropdown = ({ onSelect, onClose }) => (
  <div className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-sm shadow-lg overflow-hidden min-w-[120px]">
    {['json', 'csv'].map(fmt => (
      <button
        key={fmt}
        onClick={() => { onSelect(fmt); onClose() }}
        className="w-full text-left px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors font-medium uppercase"
      >
        {fmt}
      </button>
    ))}
  </div>
)

// ── Main Page ────────────────────────────────────────────────────────────────
const Backup = () => {
  const [currentPath] = useState('/superadmin/backup')
  const { profile } = useAuth()

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'Super Admin',
    role: 'Super Admin',
    initials: (profile?.full_name || 'SA').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  }), [profile])

  const navigateTo = (path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  // ── State ────────────────────────────────────────────────
  const [history, setHistory] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(true)
  const limit = 10

  const [message, setMessage] = useState(null) // { type: 'success'|'error', text }

  // Full backup dropdown
  const [showFullDropdown, setShowFullDropdown] = useState(false)
  const fullDropdownRef = useRef(null)

  // Tenant backup
  const [showTenantModal, setShowTenantModal] = useState(false)
  const [tenants, setTenants] = useState([])
  const [tenantsLoading, setTenantsLoading] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState(null)
  const [showTenantFormatDropdown, setShowTenantFormatDropdown] = useState(false)
  const tenantDropdownRef = useRef(null)

  // Overlay
  const [overlayActive, setOverlayActive] = useState(false)
  const [overlayMode, setOverlayMode] = useState('Exporting')
  const [overlayDone, setOverlayDone] = useState(false)
  const overlayCompleteRef = useRef(null)

  // Restore
  const [dragOver, setDragOver] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const fileInputRef = useRef(null)

  // ── Close dropdowns on outside click ─────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (fullDropdownRef.current && !fullDropdownRef.current.contains(e.target)) {
        setShowFullDropdown(false)
      }
      if (tenantDropdownRef.current && !tenantDropdownRef.current.contains(e.target)) {
        setShowTenantFormatDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Auto-dismiss message ─────────────────────────────────
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(t)
  }, [message])

  // ── Fetch History ────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await backupApi.history({ page: historyPage, limit })
      setHistory(res.data || [])
      setHistoryTotal(res.total || 0)
    } catch (err) {
      console.error('Failed to fetch backup history:', err)
      setHistory([])
      setHistoryTotal(0)
    } finally {
      setHistoryLoading(false)
    }
  }, [historyPage])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  // ── Fetch Tenants (for tenant backup modal) ──────────────
  const openTenantModal = async () => {
    setShowTenantModal(true)
    setTenantsLoading(true)
    try {
      const res = await tenantsApi.list()
      setTenants(res.data || [])
    } catch (err) {
      console.error('Failed to fetch tenants:', err)
      setTenants([])
    } finally {
      setTenantsLoading(false)
    }
  }

  // ── Generate Backup (full or tenant) ─────────────────────
  const handleGenerate = useCallback(async (type, format, tenantId = null) => {
    setOverlayMode('Exporting')
    setOverlayDone(false)
    setOverlayActive(true)

    try {
      const payload = { type, format }
      if (tenantId) payload.tenant_id = tenantId

      const res = await backupApi.generate(payload)

      // Mark overlay as done
      setOverlayDone(true)

      // Download the file
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="(.+?)"/)
      const filename = match ? match[1] : `obsidian-backup.${format === 'csv' ? 'csv' : 'json'}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      setMessage({ type: 'success', text: `Backup generated and downloaded successfully.` })
      fetchHistory()
    } catch (err) {
      console.error('Backup generation failed:', err)
      setMessage({ type: 'error', text: err.message || 'Failed to generate backup.' })
      setOverlayActive(false)
      setOverlayDone(false)
    }
  }, [fetchHistory])

  const handleOverlayComplete = useCallback(() => {
    setOverlayActive(false)
    setOverlayDone(false)
  }, [])

  // ── Full Backup Format Select ────────────────────────────
  const handleFullFormatSelect = (format) => {
    handleGenerate('full', format)
  }

  // ── Tenant Backup Flow ───────────────────────────────────
  const handleTenantSelect = (tenant) => {
    setSelectedTenant(tenant)
    setShowTenantModal(false)
    setShowTenantFormatDropdown(true)
  }

  const handleTenantFormatSelect = (format) => {
    if (!selectedTenant) return
    handleGenerate('tenant', format, selectedTenant.id)
    setSelectedTenant(null)
    setShowTenantFormatDropdown(false)
  }

  // ── Drag & Drop / File Select ────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFilePreview(file)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFilePreview(file)
    e.target.value = ''
  }

  const handleFilePreview = async (file) => {
    if (!file.name.endsWith('.json')) {
      setMessage({ type: 'error', text: 'Only .json backup files are accepted.' })
      return
    }

    setPreviewLoading(true)
    try {
      const data = await backupApi.preview(file)
      if (data.valid) {
        setPreviewData(data)
      } else {
        setMessage({ type: 'error', text: 'Invalid backup file. Please check the file and try again.' })
      }
    } catch (err) {
      console.error('Preview failed:', err)
      setMessage({ type: 'error', text: err.message || 'Failed to preview backup file.' })
    } finally {
      setPreviewLoading(false)
    }
  }

  // ── Restore ──────────────────────────────────────────────
  const handleRestore = async () => {
    if (!fileInputRef.current?.files?.[0] && !previewData) return

    setRestoring(true)
    setOverlayMode('Restoring')
    setOverlayDone(false)
    setOverlayActive(true)
    setPreviewData(null)

    try {
      // Re-use the file from the input or reconstruct
      const fileInput = document.querySelector('#restore-file-input')
      const file = fileInput?.files?.[0]
      if (!file) {
        throw new Error('No file selected for restore.')
      }

      await backupApi.restore(file)

      setOverlayDone(true)
      setMessage({ type: 'success', text: 'Backup restored successfully.' })
      fetchHistory()
    } catch (err) {
      console.error('Restore failed:', err)
      setMessage({ type: 'error', text: err.message || 'Failed to restore backup.' })
      setOverlayActive(false)
      setOverlayDone(false)
    } finally {
      setRestoring(false)
    }
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="admin-layout">
      <Sidebar navigation={superadminNavigation} currentPath={currentPath} onNavigate={navigateTo} />

      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">

          {/* ── Message Banner ───────────────────────────── */}
          {message && (
            <div className={`mb-6 flex items-center gap-3 px-4 py-3 rounded-sm border ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
            }`}>
              <span className="material-symbols-outlined text-lg flex-shrink-0">
                {message.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <p className="text-sm font-medium flex-1">{message.text}</p>
              <button onClick={() => setMessage(null)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}

          {/* ── Header ──────────────────────────────────── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Platform Admin</p>
              <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Backup & Restore</h1>
              <p className="text-sm text-neutral-500 mt-1">Generate, download, and restore platform data.</p>
            </div>

            <div className="flex items-center gap-3 self-start">
              {/* Full Platform Backup */}
              <div className="relative" ref={fullDropdownRef}>
                <button
                  onClick={() => { setShowFullDropdown(prev => !prev); setShowTenantFormatDropdown(false) }}
                  className="btn-primary"
                >
                  <span className="material-symbols-outlined text-sm mr-1.5">backup</span>
                  Full Platform Backup
                </button>
                {showFullDropdown && (
                  <FormatDropdown
                    onSelect={handleFullFormatSelect}
                    onClose={() => setShowFullDropdown(false)}
                  />
                )}
              </div>

              {/* Tenant Backup */}
              <div className="relative" ref={tenantDropdownRef}>
                <button
                  onClick={() => { openTenantModal(); setShowFullDropdown(false) }}
                  className="btn-outline"
                >
                  <span className="material-symbols-outlined text-sm mr-1.5">domain</span>
                  Tenant Backup
                </button>
                {showTenantFormatDropdown && selectedTenant && (
                  <FormatDropdown
                    onSelect={handleTenantFormatSelect}
                    onClose={() => { setShowTenantFormatDropdown(false); setSelectedTenant(null) }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Backup History Table ─────────────────────── */}
          <div className="dashboard-card">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Backup History</h2>
            <div className="overflow-x-auto -mx-6 -mb-6">
              <table className="sa-table w-full">
                <thead>
                  <tr>
                    {['Date', 'Type', 'Scope', 'Format', 'Size', 'Status'].map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center">
                        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                        <p className="mt-3 text-sm text-neutral-400">Loading backup history...</p>
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center">
                        <span className="material-symbols-outlined text-5xl text-neutral-300 dark:text-neutral-700">cloud_off</span>
                        <p className="mt-3 text-sm font-semibold text-neutral-500">No backups yet</p>
                        <p className="mt-1 text-xs text-neutral-400">Generate your first backup using the buttons above.</p>
                      </td>
                    </tr>
                  ) : (
                    history.map(entry => (
                      <tr key={entry.id}>
                        <td>
                          <span className="text-sm text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
                            {entry.created_at ? new Date(entry.created_at).toLocaleString() : '\u2014'}
                          </span>
                        </td>
                        <td>
                          <StatusBadge
                            status={entry.type === 'full' ? 'Full' : 'Tenant'}
                            type={entry.type === 'full' ? 'info' : 'neutral'}
                          />
                        </td>
                        <td>
                          <span className="text-sm text-neutral-600 dark:text-neutral-300">
                            {entry.tenant_name || 'All Tenants'}
                          </span>
                        </td>
                        <td>
                          <StatusBadge
                            status={(entry.format || 'json').toUpperCase()}
                            type={entry.format === 'csv' ? 'warning' : 'success'}
                          />
                        </td>
                        <td>
                          <span className="text-sm text-neutral-500 dark:text-neutral-400">
                            {formatBytes(entry.size_bytes)}
                          </span>
                        </td>
                        <td>
                          <StatusBadge
                            status={entry.status || 'Success'}
                            type={entry.status === 'Failed' ? 'danger' : 'success'}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!historyLoading && history.length > 0 && (
              <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 mt-6">
                <Pagination
                  currentPage={historyPage}
                  totalPages={Math.ceil(historyTotal / limit)}
                  totalItems={historyTotal}
                  itemsPerPage={limit}
                  onPageChange={setHistoryPage}
                  itemLabel="backups"
                />
              </div>
            )}
          </div>

          {/* ── Restore Section ──────────────────────────── */}
          <div className="dashboard-card mt-6">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Restore from Backup</h2>
            <p className="text-xs text-neutral-500 mb-4">Upload a previously exported .json backup file to preview and restore data.</p>

            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('restore-file-input')?.click()}
              className={`relative border-2 border-dashed rounded-sm p-10 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
              }`}
            >
              {previewLoading ? (
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                  <p className="mt-3 text-sm text-neutral-400">Analyzing backup file...</p>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-600">upload_file</span>
                  <p className="mt-3 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                    Drag and drop a backup file here, or click to browse
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">Accepts .json files only</p>
                </>
              )}
              <input
                id="restore-file-input"
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

        </div>
      </main>

      {/* ── Modals & Overlays ─────────────────────────────── */}
      {showTenantModal && (
        <TenantSelectorModal
          tenants={tenants}
          loading={tenantsLoading}
          onSelect={handleTenantSelect}
          onClose={() => setShowTenantModal(false)}
        />
      )}

      {previewData && (
        <RestorePreviewModal
          preview={previewData}
          onConfirm={handleRestore}
          onClose={() => setPreviewData(null)}
          restoring={restoring}
        />
      )}

      <BackupOverlay
        active={overlayActive}
        mode={overlayMode}
        onComplete={handleOverlayComplete}
        done={overlayDone}
      />
    </div>
  )
}

export default Backup
