import { useState, useEffect, useCallback } from 'react'
import { Sidebar, Header, SettingsNav } from '../../../components/layout'
import { StatusBadge, Modal, EmptyState } from '../../../components/ui'
import { getNavigationByRole } from '../../../config'
import { useAuth } from '../../../context'
import { appraisalsApi, customersApi } from '../../../lib/api'
import IssueTicketModal from './IssueTicketModal'
import PawnTicketPrint from './PawnTicketPrint'

const formatCurrency = (val) => `₱${Number(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

const STATUS_MAP = {
  'Awaiting Appraisal': 'info',
  'Awaiting Approval': 'info',
  'Ready for Release': 'success',
  'Issued': 'neutral',
  'Redeemed': 'neutral',
  'Declined': 'danger',
  'Rejected': 'danger',
}

const CATEGORIES = [
  { value: 'JEWELRY', label: 'Jewelry', icon: 'diamond' },
  { value: 'GADGET', label: 'Gadget', icon: 'smartphone' },
  { value: 'VEHICLE', label: 'Vehicle', icon: 'directions_car' },
  { value: 'APPLIANCE', label: 'Appliance', icon: 'kitchen' },
  { value: 'OTHER', label: 'Other', icon: 'category' },
]

function buildSidebarUser(p) {
  const name = p?.full_name || 'User'
  const parts = name.split(' ')
  const initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  return { name, role: p?.role || '', initials }
}

const navigate = (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')) }

const NAV_ITEMS = [
  { id: 'intake', label: 'Accept Item', icon: 'add_circle' },
  { id: 'my-items', label: 'My Submissions', icon: 'inventory_2' },
  { id: 'issuance', label: 'Ticket Issuance', icon: 'receipt_long' },
]

const CashierWorkspace = () => {
  const { profile } = useAuth()
  const currentUser = buildSidebarUser(profile)
  const navItems = getNavigationByRole(profile?.role)
  const [currentPath, setCurrentPath] = useState('/admin/appraisals')
  const [activeTab, setActiveTab] = useState('intake')
  const [view, setView] = useState('list')

  // Intake state
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [intakeLoading, setIntakeLoading] = useState(false)
  const [intakeSuccess, setIntakeSuccess] = useState(null)

  // My Items state
  const [myItems, setMyItems] = useState([])
  const [myItemsLoading, setMyItemsLoading] = useState(false)

  // Issuance state
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState({})
  const [queueLoading, setQueueLoading] = useState(false)
  const [issueItem, setIssueItem] = useState(null)
  const [declineModal, setDeclineModal] = useState(null)
  const [declineReason, setDeclineReason] = useState('')

  // Print state
  const [printData, setPrintData] = useState(null)

  // Customer search with debounce
  useEffect(() => {
    if (customerSearch.length < 2) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await customersApi.list({ search: customerSearch, limit: 5 })
        setCustomerResults(res.data || res || [])
      } catch { setCustomerResults([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch])

  const fetchMyItems = useCallback(async () => {
    setMyItemsLoading(true)
    try {
      const data = await appraisalsApi.myItems()
      setMyItems(data || [])
    } catch { setMyItems([]) }
    setMyItemsLoading(false)
  }, [])

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true)
    try {
      const [statsData, queueData] = await Promise.all([
        appraisalsApi.stats(),
        appraisalsApi.queue({ status: 'APPRAISED' }),
      ])
      setStats(statsData)
      setQueue((queueData.data || queueData || []).filter(i => i.inventory_status === 'APPRAISED' && i.specific_attrs?.loan_terms))
    } catch { setQueue([]) }
    setQueueLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'my-items') fetchMyItems()
    if (activeTab === 'issuance') fetchQueue()
  }, [activeTab, fetchMyItems, fetchQueue])

  const handleIntakeSubmit = async () => {
    if (!selectedCustomer || !category) return
    setIntakeLoading(true)
    try {
      const item = await appraisalsApi.intake({
        customer_id: selectedCustomer.id,
        category,
        description: description.trim() || undefined,
      })
      setIntakeSuccess(item)
      setSelectedCustomer(null)
      setCustomerSearch('')
      setCategory('')
      setDescription('')
    } catch (err) {
      alert(err.message || 'Failed to accept item')
    }
    setIntakeLoading(false)
  }

  const handleIssueSuccess = (data) => {
    setPrintData({ ticket: data.ticket, item: issueItem })
    setIssueItem(null)
    setView('print')
  }

  const handleDecline = async () => {
    if (!declineModal) return
    try {
      await appraisalsApi.decline(declineModal.id, { reason: declineReason })
      setDeclineModal(null)
      setDeclineReason('')
      fetchQueue()
    } catch (err) {
      alert(err.message || 'Failed to decline')
    }
  }

  // Print view
  if (view === 'print' && printData) {
    return (
      <div className="admin-layout">
        <Sidebar navigation={navItems} currentPath={currentPath} onNavigate={setCurrentPath} />
        <SettingsNav
          items={NAV_ITEMS}
          activeId={activeTab}
          onSelect={setActiveTab}
          title="Item Processing"
          badge={{ issuance: stats.readyForRelease }}
        />
        <main className="admin-main">
          <Header user={currentUser} />
          <div className="admin-content custom-scrollbar">
            <div className="flex items-center gap-3 mb-6 print:hidden">
              <button onClick={() => { setView('list'); setPrintData(null) }} className="text-sm text-neutral-400 hover:text-primary transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-lg">arrow_back</span> Back to queue
              </button>
              <button onClick={() => window.print()} className="btn-primary text-sm ml-auto">
                <span className="material-symbols-outlined text-sm mr-1.5">print</span> Print Ticket
              </button>
            </div>
            <PawnTicketPrint ticket={printData.ticket} item={printData.item} profile={profile} />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="admin-layout">
      <Sidebar navigation={navItems} currentPath={currentPath} onNavigate={setCurrentPath} />
      <SettingsNav
        items={NAV_ITEMS}
        activeId={activeTab}
        onSelect={setActiveTab}
        title="Item Processing"
        badge={{ issuance: stats.readyForRelease }}
      />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">

          {/* Mobile tab selector (visible only below md) */}
          <div className="flex lg:hidden gap-1 mb-6 overflow-x-auto">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === item.id
                    ? 'bg-primary text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          {/* ═══ ACCEPT ITEM TAB ═══ */}
          {activeTab === 'intake' && (
            <div className="max-w-2xl mx-auto">
              {/* Page header */}
              <div className="mb-8">
                <nav className="flex mb-2" aria-label="Breadcrumb">
                  <ol className="flex items-center space-x-2">
                    <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Transactions</span></li>
                    <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                    <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Item Processing</span></li>
                    <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                    <li><span className="text-neutral-700 dark:text-white text-sm font-semibold">Accept Item</span></li>
                  </ol>
                </nav>
                <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">Item Processing</h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Accept items, track progress, and issue pawn tickets</p>
              </div>
              {intakeSuccess ? (
                <div className="dashboard-card overflow-hidden">
                  {/* Top accent bar */}
                  <div className="h-1 bg-gradient-to-r from-emerald-400 to-emerald-500" />
                  <div className="px-8 py-12 text-center">
                    {/* Icon */}
                    <div className="relative inline-flex items-center justify-center mb-6">
                      <div className="w-20 h-20 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center">
                        <span className="material-symbols-outlined text-emerald-500 text-4xl">check_circle</span>
                      </div>
                    </div>
                    {/* Text */}
                    <h3 className="text-xl font-display font-bold text-neutral-900 dark:text-white mb-2">Item Accepted</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs mx-auto mb-2">
                      The{' '}
                      <span className="font-semibold text-neutral-700 dark:text-neutral-200 capitalize">
                        {intakeSuccess.category?.toLowerCase()}
                      </span>{' '}
                      item has been queued for appraisal.
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-8">
                      An appraiser will review it shortly.
                    </p>
                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <button onClick={() => setIntakeSuccess(null)} className="btn-primary text-sm">
                        <span className="material-symbols-outlined text-sm mr-1.5">add_circle</span>
                        Accept Another Item
                      </button>
                      <button onClick={() => setActiveTab('my-items')} className="btn-outline text-sm">
                        <span className="material-symbols-outlined text-sm mr-1.5">inventory_2</span>
                        View My Submissions
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Customer Selection Card */}
                  <section className="dashboard-card">
                    <div className="px-6 pt-5 pb-4 border-b border-neutral-100 dark:border-neutral-700/60">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 bg-primary/10">
                          <span className="material-symbols-outlined text-[16px] text-primary">person</span>
                        </div>
                        <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white">Customer</h2>
                      </div>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 ml-[38px]">Search for an existing customer or add a new one</p>
                    </div>
                    <div className="p-6">
                      {selectedCustomer ? (
                        <div className="flex items-center justify-between p-3.5 border border-primary/20 bg-primary/5 dark:bg-primary/10 rounded-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-primary">
                                {(selectedCustomer.first_name?.[0] || '') + (selectedCustomer.last_name?.[0] || '')}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-neutral-900 dark:text-white">{selectedCustomer.first_name} {selectedCustomer.last_name}</p>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">{selectedCustomer.mobile_number || selectedCustomer.email}</p>
                            </div>
                          </div>
                          <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
                            className="text-neutral-400 hover:text-red-500 transition-colors">
                            <span className="material-symbols-outlined text-lg">close</span>
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xl">search</span>
                            <input
                              type="text"
                              placeholder="Search customer by name or mobile..."
                              value={customerSearch}
                              onChange={e => setCustomerSearch(e.target.value)}
                              className="loans-search"
                            />
                          </div>
                          {customerResults.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-sm shadow-lg max-h-48 overflow-y-auto">
                              {customerResults.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustomerResults([]) }}
                                  className="w-full text-left px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 text-sm flex items-center gap-3 transition-colors"
                                >
                                  <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">
                                      {(c.first_name?.[0] || '') + (c.last_name?.[0] || '')}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-neutral-900 dark:text-white">{c.first_name} {c.last_name}</span>
                                    <span className="text-neutral-400 dark:text-neutral-500 ml-2 text-xs">{c.mobile_number}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => navigate('/admin/customers?action=add&redirect=/admin/appraisals')}
                            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary font-semibold hover:underline"
                          >
                            <span className="material-symbols-outlined text-base">person_add</span>
                            Register New Customer
                          </button>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Item Details Card */}
                  <section className="dashboard-card">
                    <div className="px-6 pt-5 pb-4 border-b border-neutral-100 dark:border-neutral-700/60">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 bg-blue-500/10">
                          <span className="material-symbols-outlined text-[16px] text-blue-500">category</span>
                        </div>
                        <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white">Item Details</h2>
                      </div>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 ml-[38px]">Select the item category and provide a brief description</p>
                    </div>
                    <div className="p-6 space-y-5">
                      <div>
                        <label className="form-label">Category</label>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {CATEGORIES.map(cat => (
                            <button
                              key={cat.value}
                              onClick={() => setCategory(cat.value)}
                              className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-sm text-xs font-semibold border transition-colors ${
                                category === cat.value
                                  ? 'border-primary bg-primary/5 dark:bg-primary/10 text-primary'
                                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-500'
                              }`}
                            >
                              <span className="material-symbols-outlined text-lg">{cat.icon}</span>
                              {cat.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="form-label">Brief Description <span className="font-normal text-neutral-400 normal-case">(optional)</span></label>
                        <input
                          type="text"
                          placeholder='e.g. "Gold necklace 18K" or "iPhone 15 Pro"'
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                          className="profile-input"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Submit */}
                  <button
                    onClick={handleIntakeSubmit}
                    disabled={!selectedCustomer || !category || intakeLoading}
                    className="btn-primary w-full text-sm justify-center"
                  >
                    {intakeLoading ? (
                      <><span className="material-symbols-outlined animate-spin text-sm mr-1.5">progress_activity</span> Accepting...</>
                    ) : (
                      <><span className="material-symbols-outlined text-sm mr-1.5">check_circle</span> Accept Item for Appraisal</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══ MY SUBMISSIONS TAB ═══ */}
          {activeTab === 'my-items' && (
            <div className="max-w-5xl mx-auto">
              {/* Page header */}
              <div className="mb-8">
                <nav className="flex mb-2" aria-label="Breadcrumb">
                  <ol className="flex items-center space-x-2">
                    <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Transactions</span></li>
                    <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                    <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Item Processing</span></li>
                    <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                    <li><span className="text-neutral-700 dark:text-white text-sm font-semibold">My Submissions</span></li>
                  </ol>
                </nav>
                <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">Item Processing</h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Accept items, track progress, and issue pawn tickets</p>
              </div>
              {myItemsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
                </div>
              ) : myItems.length === 0 ? (
                <EmptyState
                  icon="inventory_2"
                  title="No items submitted yet"
                  description="Items you accept will appear here so you can track their appraisal progress."
                />
              ) : (
                <div className="loans-table-container">
                  <div className="loans-table-header">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="table-th text-left">Customer</th>
                          <th className="table-th text-center">Category</th>
                          <th className="table-th text-left">Description</th>
                          <th className="table-th text-center">Status</th>
                          <th className="table-th text-center">Submitted</th>
                        </tr>
                      </thead>
                    </table>
                  </div>
                  <div className="overflow-y-auto">
                    <table className="w-full">
                      <tbody>
                        {myItems.map(item => (
                          <tr key={item.id} className="loan-row">
                            <td className="px-4 py-4 text-sm font-semibold text-neutral-800 dark:text-white">{item.customer_name}</td>
                            <td className="px-4 py-4 text-sm text-center text-neutral-500 dark:text-neutral-400">{item.category}</td>
                            <td className="px-4 py-4 text-sm text-neutral-500 dark:text-neutral-400">{item.general_desc || '—'}</td>
                            <td className="px-4 py-4 text-center">
                              <StatusBadge status={item.status_label} type={STATUS_MAP[item.status_label] || 'neutral'} />
                            </td>
                            <td className="px-4 py-4 text-sm text-center text-neutral-500 dark:text-neutral-400">
                              {new Date(item.created_at).toLocaleDateString('en-PH')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ TICKET ISSUANCE TAB ═══ */}
          {activeTab === 'issuance' && (
            <div className="max-w-5xl mx-auto">
              {/* Page header */}
              <div className="mb-8">
                <nav className="flex mb-2" aria-label="Breadcrumb">
                  <ol className="flex items-center space-x-2">
                    <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Transactions</span></li>
                    <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                    <li><span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">Item Processing</span></li>
                    <li><span className="text-neutral-300 dark:text-neutral-600 text-sm">/</span></li>
                    <li><span className="text-neutral-700 dark:text-white text-sm font-semibold">Ticket Issuance</span></li>
                  </ol>
                </nav>
                <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">Item Processing</h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Accept items, track progress, and issue pawn tickets</p>
              </div>
              {/* KPI Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[
                  { label: 'Ready for Release', value: String(stats.readyForRelease || 0) },
                  { label: 'Issued Today', value: String(stats.issuedToday || 0) },
                  { label: 'Cash Disbursed Today', value: formatCurrency(stats.cashDisbursedToday || 0) },
                ].map(s => (
                  <div key={s.label} className="kpi-card">
                    <p className="text-sm font-bold text-neutral-700 dark:text-neutral-200">{s.label}</p>
                    <div className="-mx-4 sm:-mx-5 my-2 sm:my-3 border-t border-neutral-100 dark:border-neutral-800" />
                    <h3 className="kpi-value">{s.value}</h3>
                  </div>
                ))}
              </div>

              {queueLoading ? (
                <div className="flex items-center justify-center py-16">
                  <span className="material-symbols-outlined animate-spin text-2xl text-neutral-400">progress_activity</span>
                </div>
              ) : queue.length === 0 ? (
                <EmptyState
                  icon="receipt_long"
                  title="No items ready for release"
                  description="Approved items will appear here for ticket issuance."
                />
              ) : (
                <div className="loans-table-container">
                  <div className="loans-table-header">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="table-th text-left">Customer</th>
                          <th className="table-th text-left">Item</th>
                          <th className="table-th text-center">Appraised</th>
                          <th className="table-th text-center">Net Proceeds</th>
                          <th className="table-th text-center">Ticket #</th>
                          <th className="table-th text-center">Actions</th>
                        </tr>
                      </thead>
                    </table>
                  </div>
                  <div className="overflow-y-auto">
                    <table className="w-full">
                      <tbody>
                        {queue.map(item => {
                          const lt = item.specific_attrs?.loan_terms || {}
                          return (
                            <tr key={item.id} className="loan-row">
                              <td className="px-4 py-4 text-sm font-semibold text-neutral-800 dark:text-white">
                                {item.customers ? `${item.customers.first_name} ${item.customers.last_name}` : '—'}
                              </td>
                              <td className="px-4 py-4 text-sm text-neutral-500 dark:text-neutral-400">
                                {[item.brand, item.model, item.general_desc].filter(Boolean).join(' — ') || item.category}
                              </td>
                              <td className="px-4 py-4 text-sm text-center">{formatCurrency(item.appraised_value)}</td>
                              <td className="px-4 py-4 text-sm text-center font-semibold text-emerald-600">{formatCurrency(lt.net_proceeds)}</td>
                              <td className="px-4 py-4 text-sm text-center font-mono text-xs text-neutral-500">{lt.ticket_number || '—'}</td>
                              <td className="px-4 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={() => setIssueItem(item)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
                                    <span className="material-symbols-outlined text-base">receipt_long</span>
                                    Issue
                                  </button>
                                  <button onClick={() => setDeclineModal(item)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                                    <span className="material-symbols-outlined text-base">close</span>
                                    Decline
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Issue Ticket Modal */}
          {issueItem && (
            <IssueTicketModal item={issueItem} onClose={() => setIssueItem(null)} onSuccess={handleIssueSuccess} />
          )}

          {/* Decline Modal */}
          {declineModal && (
            <Modal open={!!declineModal} onClose={() => { setDeclineModal(null); setDeclineReason('') }} title="Decline Offer" size="sm">
              <div className="space-y-4">
                <div className="p-3 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg">
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    <span className="font-semibold">{declineModal.customers ? `${declineModal.customers.first_name} ${declineModal.customers.last_name}` : 'Customer'}</span>
                    <span className="text-neutral-400 mx-2">·</span>
                    {declineModal.category}
                  </p>
                </div>
                <div>
                  <label className="form-label">Reason for declining</label>
                  <textarea
                    placeholder="Optional — explain why the offer was declined"
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    className="profile-input min-h-[80px] resize-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button onClick={() => { setDeclineModal(null); setDeclineReason('') }} className="btn-outline text-sm">Cancel</button>
                  <button onClick={handleDecline} className="px-4 py-2.5 rounded-sm text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors">Decline</button>
                </div>
              </div>
            </Modal>
          )}

        </div>
      </main>
    </div>
  )
}

export default CashierWorkspace
