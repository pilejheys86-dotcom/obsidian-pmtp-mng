import { useEffect, useMemo, useState } from 'react'
import { Sidebar, Header } from '../../../components/layout'
import { Pagination, StatsCard, StatusBadge, StepNav, EmptyState } from '../../../components/ui'
import { getNavigationByRole } from '../../../config'
import { useAuth } from '../../../context'
import { appraisalsApi, customersApi, pricingApi } from '../../../lib/api'

// ── Constants ────────────────────────────────────────────
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

const CATEGORIES = [
  { value: 'JEWELRY', label: 'Jewelry' },
  { value: 'VEHICLE', label: 'Vehicle' },
  { value: 'GADGET', label: 'Gadget' },
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'OTHER', label: 'Other' },
]

// Conditions fetched dynamically from item_conditions table (managed in Pricing module)

const KARATS = [24, 22, 21, 18, 14, 10]

const ACCESSORIES_BY_CATEGORY = {
  JEWELRY: ['Box', 'Certificate', 'Receipt'],
  GADGET: ['Box', 'Certificate', 'Receipt', 'Charger', 'Manual', 'Warranty Card'],
  APPLIANCE: ['Box', 'Certificate', 'Receipt', 'Charger', 'Manual', 'Warranty Card'],
  VEHICLE: ['OR/CR', 'Deed of Sale', 'Spare Key', 'Manual', 'Warranty Card', 'Insurance', 'Emission Test Cert'],
  OTHER: ['Box', 'Certificate', 'Receipt'],
}

const FORM_STEPS = [
  { id: 'customer', icon: 'person', label: 'Customer' },
  { id: 'item', icon: 'inventory_2', label: 'Item Details' },
  { id: 'valuation', icon: 'calculate', label: 'Valuation' },
  { id: 'review', icon: 'fact_check', label: 'Review' },
]

const formatCurrency = (val) => {
  const num = Number(val)
  if (isNaN(num)) return '\u20B10.00'
  return `\u20B1${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (!iso) return '---'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const INITIAL_FORM = {
  category: '',
  metal_type: '',
  general_desc: '',
  item_condition: '',
  weight_grams: '',
  karat: '',
  brand: '',
  model: '',
  serial_number: '',
  gadget_color: '',
  storage_capacity: '',
  appliance_brand: '',
  appliance_model: '',
  appliance_serial: '',
  size_capacity: '',
  wattage: '',
  appliance_color: '',
  vehicle_make: '',
  vehicle_model: '',
  vehicle_year: '',
  vehicle_color: '',
  plate_number: '',
  engine_number: '',
  chassis_number: '',
  mileage: '',
  transmission: '',
  fuel_type: '',
  accessories: [],
  appraised_value: '',
}

export default function AppraiserWorkspace() {
  const { profile } = useAuth()
  const navigation = getNavigationByRole(profile?.role)

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'User',
    role: profile?.role || 'Staff',
    initials: (profile?.full_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2),
  }), [profile])

  // ── Layout state
  const [currentPath, setCurrentPath] = useState('/admin/appraisals')
  const [view, setView] = useState('list')

  // ── List state
  const [stats, setStats] = useState({ appraisedToday: 0, pendingApproval: 0, approved: 0, rejected: 0 })
  const [queue, setQueue] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // ── Selected intake item (from queue)
  const [selectedItem, setSelectedItem] = useState(null)

  // ── Form state
  const [activeStep, setActiveStep] = useState('customer')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customAccessory, setCustomAccessory] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [customerLoading, setCustomerLoading] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [calcResult, setCalcResult] = useState(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [conditions, setConditions] = useState([])

  // Fetch item conditions from pricing module
  useEffect(() => {
    pricingApi.getItemConditions()
      .then(data => setConditions((data || []).filter(c => c.is_active)))
      .catch(() => {})
  }, [])

  // ── Step validation
  const completedSteps = useMemo(() => {
    const customer = !!selectedCustomer
    const itemBase = !!(formData.category && formData.item_condition && formData.general_desc.trim())
    let itemExtra = true
    if (formData.category === 'JEWELRY') {
      itemExtra = !!(formData.weight_grams && formData.karat)
    } else if (formData.category === 'GADGET') {
      itemExtra = !!(formData.brand.trim() && formData.model.trim() && formData.serial_number.trim())
    }
    const item = itemBase && itemExtra
    const valuation = !!(formData.appraised_value && Number(formData.appraised_value) > 0)
    return { customer, item, valuation, review: customer && item && valuation }
  }, [selectedCustomer, formData])

  // ── Data fetching
  const fetchQueue = async () => {
    try {
      setLoading(true)
      const [statsRes, queueRes] = await Promise.all([
        appraisalsApi.stats(),
        appraisalsApi.queue({ page: currentPage, limit: ITEMS_PER_PAGE, status: 'PENDING_APPRAISAL' }),
      ])
      setStats(statsRes)
      const raw = queueRes.data || queueRes || []
      setQueue(raw.filter(i => i.inventory_status === 'PENDING_APPRAISAL'))
      setTotalItems(queueRes.total || 0)
    } catch (err) {
      console.error('Appraisals fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (view === 'list') fetchQueue()
  }, [currentPage, view])

  // ── Customer search with debounce
  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomerResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        setCustomerLoading(true)
        const res = await customersApi.list({ page: 1, limit: 10, search: customerSearch })
        const results = res.data || []
        const q = customerSearch.trim().toLowerCase()
        const words = q.split(/\s+/).filter(Boolean)
        results.sort((a, b) => {
          const scoreMatch = (c) => {
            const first = (c.first_name || '').toLowerCase()
            const last = (c.last_name || '').toLowerCase()
            const full = `${first} ${last}`
            let score = 0
            if (full === q) score += 100
            if (full.startsWith(q)) score += 50
            for (const w of words) {
              if (first.startsWith(w)) score += 20
              if (last.startsWith(w)) score += 20
              if (first.includes(w)) score += 5
              if (last.includes(w)) score += 5
            }
            return score
          }
          return scoreMatch(b) - scoreMatch(a)
        })
        setCustomerResults(results)
      } catch (err) {
        console.error('Customer search error:', err)
      } finally {
        setCustomerLoading(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [customerSearch])

  // ── Scroll-based step tracking
  useEffect(() => {
    if (view !== 'submit') return
    let rafId
    const scrollContainer = document.querySelector('.custom-scrollbar') || window
    const handleScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const offset = 120
        let current = FORM_STEPS[0]?.id
        for (const s of FORM_STEPS) {
          const el = document.getElementById(s.id)
          if (el) {
            const rect = el.getBoundingClientRect()
            if (rect.top <= offset) current = s.id
          }
        }
        setActiveStep((prev) => (prev === current ? prev : current))
      })
    }
    const timer = setTimeout(handleScroll, 150)
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(rafId)
      scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [view])

  // ── Handlers
  const handleFormChange = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'category') {
        next.accessories = []
        if (value !== 'JEWELRY') { next.metal_type = ''; next.weight_grams = ''; next.karat = '' }
        if (value !== 'VEHICLE') { next.vehicle_make = ''; next.vehicle_model = ''; next.vehicle_year = ''; next.vehicle_color = ''; next.plate_number = ''; next.engine_number = ''; next.chassis_number = ''; next.mileage = ''; next.transmission = ''; next.fuel_type = '' }
        if (value !== 'GADGET') { next.brand = ''; next.model = ''; next.serial_number = ''; next.gadget_color = ''; next.storage_capacity = '' }
        if (value !== 'APPLIANCE') { next.appliance_brand = ''; next.appliance_model = ''; next.appliance_serial = ''; next.size_capacity = ''; next.wattage = ''; next.appliance_color = '' }
      }
      return next
    })
  }

  const handleAccessoryToggle = (acc) => {
    setFormData((prev) => ({
      ...prev,
      accessories: prev.accessories.includes(acc)
        ? prev.accessories.filter((a) => a !== acc)
        : [...prev.accessories, acc],
    }))
  }

  const handleCalculate = async () => {
    try {
      setCalcLoading(true)
      const res = await appraisalsApi.calculate({
        weight_grams: Number(formData.weight_grams),
        karat: Number(formData.karat),
        item_condition: formData.item_condition,
      })
      setCalcResult(res)
      handleFormChange('appraised_value', res.appraised_value || '')
    } catch (err) {
      console.error('Calculate error:', err)
    } finally {
      setCalcLoading(false)
    }
  }

  const handleSubmitAppraisal = async () => {
    try {
      setSubmitLoading(true)
      const payload = {
        customer_id: selectedCustomer.id,
        category: formData.category,
        description: formData.general_desc,
        condition: formData.item_condition,
        accessories: formData.accessories,
        appraised_value: Number(formData.appraised_value),
        fair_market_value: Number(formData.appraised_value),
        brand: formData.brand || null,
        model: formData.model || null,
        serial_number: formData.serial_number || null,
        weight_grams: formData.weight_grams ? Number(formData.weight_grams) : null,
        karat: formData.karat ? Number(formData.karat) : null,
        ...(selectedItem ? { item_id: selectedItem.id } : {}),
      }
      await appraisalsApi.submit(payload)
      resetForm()
      setView('list')
    } catch (err) {
      console.error('Submit appraisal error:', err)
    } finally {
      setSubmitLoading(false)
    }
  }

  const resetForm = () => {
    setActiveStep('customer')
    setCustomerSearch('')
    setCustomerResults([])
    setSelectedCustomer(null)
    setSelectedItem(null)
    setFormData(INITIAL_FORM)
    setCalcResult(null)
  }

  // ── KPI data
  const statsData = [
    { icon: 'pending', iconBg: 'bg-amber-500', iconColor: 'text-white', label: 'Awaiting Appraisal', value: String(stats.pendingAppraisal || 0) },
    { icon: 'task_alt', iconBg: 'bg-primary', iconColor: 'text-white', label: 'Appraised Today', value: String(stats.appraisedToday || stats.completedToday || 0) },
    { icon: 'check_circle', iconBg: 'bg-emerald-500', iconColor: 'text-white', label: 'Approved', value: String(stats.approved || 0) },
    { icon: 'cancel', iconBg: 'bg-red-500', iconColor: 'text-white', label: 'Rejected', value: String(stats.rejected || 0) },
  ]

  return (
    <div className="admin-layout">
      <Sidebar
        navigation={navigation}
        currentPath={currentPath}
        onNavigate={setCurrentPath}
      />

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
                  <li>
                    {view === 'submit' ? (
                      <>
                        <button onClick={() => { setView('list'); resetForm() }} className="text-neutral-400 dark:text-neutral-500 text-sm font-medium hover:text-primary transition-colors">Appraisals</button>
                        <span className="text-neutral-300 dark:text-neutral-600 text-sm mx-2">/</span>
                        <span className="text-neutral-700 dark:text-white text-sm font-semibold">New Appraisal</span>
                      </>
                    ) : (
                      <span className="text-neutral-700 dark:text-white text-sm font-semibold">Appraisals</span>
                    )}
                  </li>
                </ol>
              </nav>
              <h1 className="text-2xl font-display font-bold text-neutral-800 dark:text-neutral-100">
                {view === 'submit' ? 'New Appraisal' : 'Appraisal Workspace'}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {view === 'submit' && (
                <button className="btn-secondary" onClick={() => { setView('list'); resetForm() }}>
                  <span className="material-symbols-rounded text-lg">arrow_back</span>
                  Back to Queue
                </button>
              )}
            </div>
          </div>

          {/* Submit View */}
          {view === 'submit' && (
            <div className="space-y-6">
              <div className="sticky top-0 z-20 bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-md -mx-4 px-4 sm:px-8 py-4 border-b border-neutral-200/60 dark:border-neutral-700/40">
                <StepNav steps={FORM_STEPS} active={activeStep} completedSteps={completedSteps} />
              </div>

              <div className="flex flex-col gap-6">
                {/* 1. Customer */}
                <section id="customer" className="rounded-sm border shadow-sm scroll-mt-24 bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700">
                  <div className="px-6 pt-5 pb-4 border-b border-neutral-100 dark:border-neutral-700/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 bg-primary/10">
                        <span className="material-symbols-rounded text-[16px] text-primary">person</span>
                      </div>
                      <h2 className="text-[15px] font-bold text-neutral-800 dark:text-neutral-100">
                        {selectedItem ? 'Customer (from Intake)' : 'Select Customer'}
                      </h2>
                    </div>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 ml-[38px]">
                      {selectedItem
                        ? 'Customer was set during intake and cannot be changed.'
                        : 'Search for an existing customer to associate with this appraisal.'}
                    </p>
                  </div>
                  <div className="p-6 space-y-5">
                    {selectedCustomer ? (
                      <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                          {`${selectedCustomer.first_name?.[0] || ''}${selectedCustomer.last_name?.[0] || ''}`.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-800 dark:text-white">{selectedCustomer.first_name} {selectedCustomer.last_name}</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">ID: {selectedCustomer.id?.slice(0, 8)}</p>
                        </div>
                        {!selectedItem && (
                          <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setCustomerResults([]) }} className="text-neutral-400 hover:text-red-500 transition-colors" title="Change customer">
                            <span className="material-symbols-rounded text-lg">close</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="material-symbols-rounded text-neutral-400 dark:text-neutral-500 group-focus-within:text-primary transition-colors">search</span>
                          </div>
                          <input type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="form-input pl-10 w-full" placeholder="Search by name, ID, or contact..." />
                        </div>
                        {customerLoading && (
                          <div className="flex items-center gap-2 py-4 text-sm text-neutral-500 dark:text-neutral-400">
                            <span className="material-symbols-rounded animate-spin text-base">progress_activity</span>
                            Searching customers...
                          </div>
                        )}
                        {!customerLoading && customerResults.length > 0 && (
                          <div className="border border-neutral-200/60 dark:border-neutral-700/50 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-700/50 max-h-72 overflow-y-auto custom-scrollbar">
                            {customerResults.map((c) => (
                              <button key={c.id} type="button" onClick={() => { setSelectedCustomer(c); setCustomerResults([]) }} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700/40">
                                <div className="h-9 w-9 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-white flex-shrink-0">
                                  {`${c.first_name?.[0] || ''}${c.last_name?.[0] || ''}`.toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-neutral-800 dark:text-white truncate">{c.first_name} {c.last_name}</p>
                                  <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                                    {c.email && <span className="truncate">{c.email}</span>}
                                    {c.email && <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>}
                                    <span className="font-mono flex-shrink-0">ID: {c.id?.slice(0, 8)}</span>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {!customerLoading && customerSearch.trim() && customerResults.length === 0 && (
                          <div className="text-sm text-neutral-400 dark:text-neutral-500 py-4 text-center">
                            No customers found for &ldquo;{customerSearch}&rdquo;
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>

                {/* 2. Item Details */}
                <section id="item" className="rounded-sm border shadow-sm scroll-mt-24 bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700">
                  <div className="px-6 pt-5 pb-4 border-b border-neutral-100 dark:border-neutral-700/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 bg-primary/10">
                        <span className="material-symbols-rounded text-[16px] text-primary">inventory_2</span>
                      </div>
                      <h2 className="text-[15px] font-bold text-neutral-800 dark:text-neutral-100">Item Details</h2>
                    </div>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 ml-[38px]">Provide information about the item being appraised.</p>
                  </div>
                  <div className="p-6 space-y-5">
                    <div>
                      <label className="form-label">Category</label>
                      <select value={formData.category} onChange={(e) => handleFormChange('category', e.target.value)} className="form-input w-full">
                        <option value="">Select category...</option>
                        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>

                    {formData.category && (<>
                      {/* Jewelry fields */}
                      {formData.category === 'JEWELRY' && (<>
                        <div>
                          <label className="form-label">Metal Type</label>
                          <div className="grid grid-cols-2 gap-4 mt-2">
                            {[
                              { value: 'GOLD', label: 'Gold', symbol: 'Au', desc: 'Yellow & white gold', bgIdle: 'from-amber-50 to-yellow-50/60 dark:from-amber-900/15 dark:to-yellow-900/10', symbolIdle: 'text-amber-500 dark:text-amber-400', borderIdle: 'border-amber-200/70 dark:border-amber-700/40' },
                              { value: 'SILVER', label: 'Silver', symbol: 'Ag', desc: 'Sterling & fine silver', bgIdle: 'from-slate-50 to-gray-50/60 dark:from-slate-800/20 dark:to-gray-800/10', symbolIdle: 'text-slate-400 dark:text-slate-300', borderIdle: 'border-slate-200/70 dark:border-slate-600/40' },
                            ].map((metal) => {
                              const isActive = formData.metal_type === metal.value
                              return (
                                <button key={metal.value} type="button" onClick={() => handleFormChange('metal_type', isActive ? '' : metal.value)}
                                  className={`group relative flex items-center gap-4 px-5 py-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${isActive ? 'border-primary bg-gradient-to-br from-primary/8 to-primary/3 dark:from-primary/12 dark:to-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary/20' : `${metal.borderIdle} bg-gradient-to-br ${metal.bgIdle} hover:shadow-sm hover:scale-[1.01]`}`}>
                                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl tracking-tight transition-all duration-200 ${isActive ? 'bg-primary/15 text-primary shadow-sm shadow-primary/10' : `bg-white/80 dark:bg-neutral-800/60 ${metal.symbolIdle} group-hover:shadow-sm`}`}>{metal.symbol}</div>
                                  <div className="flex flex-col items-start min-w-0">
                                    <span className={`text-[13px] font-semibold tracking-wide transition-colors ${isActive ? 'text-primary' : 'text-neutral-800 dark:text-neutral-200'}`}>{metal.label}</span>
                                    <span className={`text-[11px] mt-0.5 transition-colors ${isActive ? 'text-primary/60' : 'text-neutral-400 dark:text-neutral-500'}`}>{metal.desc}</span>
                                  </div>
                                  {isActive && <span className="absolute top-2.5 right-2.5 material-symbols-rounded text-primary text-[18px] drop-shadow-sm">check_circle</span>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg border border-neutral-200/60 dark:border-neutral-700/50">
                          <div>
                            <label className="form-label">Weight (grams)</label>
                            <input type="number" value={formData.weight_grams} onChange={(e) => handleFormChange('weight_grams', e.target.value)} className="form-input w-full" placeholder="e.g. 15.5" min="0" step="0.01" />
                          </div>
                          <div>
                            <label className="form-label">Karat</label>
                            <select value={formData.karat} onChange={(e) => handleFormChange('karat', e.target.value)} className="form-input w-full">
                              <option value="">Select karat...</option>
                              {KARATS.map((k) => <option key={k} value={k}>{k}K</option>)}
                            </select>
                          </div>
                        </div>
                      </>)}

                      {/* Gadget fields */}
                      {formData.category === 'GADGET' && (
                        <div className="space-y-4 p-4 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg border border-neutral-200/60 dark:border-neutral-700/50">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div><label className="form-label">Brand</label><input type="text" value={formData.brand} onChange={(e) => handleFormChange('brand', e.target.value)} className="form-input w-full" placeholder="e.g. Apple" /></div>
                            <div><label className="form-label">Model</label><input type="text" value={formData.model} onChange={(e) => handleFormChange('model', e.target.value)} className="form-input w-full" placeholder="e.g. iPhone 15 Pro" /></div>
                            <div><label className="form-label">Serial Number</label><input type="text" value={formData.serial_number} onChange={(e) => handleFormChange('serial_number', e.target.value)} className="form-input w-full" placeholder="e.g. DNQXYZ123" /></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div><label className="form-label">Color</label><input type="text" value={formData.gadget_color} onChange={(e) => handleFormChange('gadget_color', e.target.value)} className="form-input w-full" placeholder="e.g. Space Black" /></div>
                            <div><label className="form-label">Storage Capacity</label><input type="text" value={formData.storage_capacity} onChange={(e) => handleFormChange('storage_capacity', e.target.value)} className="form-input w-full" placeholder="e.g. 256GB" /></div>
                          </div>
                        </div>
                      )}

                      {/* Appliance fields */}
                      {formData.category === 'APPLIANCE' && (
                        <div className="space-y-4 p-4 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg border border-neutral-200/60 dark:border-neutral-700/50">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div><label className="form-label">Brand</label><input type="text" value={formData.appliance_brand} onChange={(e) => handleFormChange('appliance_brand', e.target.value)} className="form-input w-full" placeholder="e.g. Samsung" /></div>
                            <div><label className="form-label">Model</label><input type="text" value={formData.appliance_model} onChange={(e) => handleFormChange('appliance_model', e.target.value)} className="form-input w-full" placeholder="e.g. RT-43K6231BS" /></div>
                            <div><label className="form-label">Serial Number</label><input type="text" value={formData.appliance_serial} onChange={(e) => handleFormChange('appliance_serial', e.target.value)} className="form-input w-full" placeholder="e.g. SN12345678" /></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div><label className="form-label">Size / Capacity</label><input type="text" value={formData.size_capacity} onChange={(e) => handleFormChange('size_capacity', e.target.value)} className="form-input w-full" placeholder="e.g. 32 inches" /></div>
                            <div><label className="form-label">Wattage</label><input type="text" value={formData.wattage} onChange={(e) => handleFormChange('wattage', e.target.value)} className="form-input w-full" placeholder="e.g. 1200W" /></div>
                            <div><label className="form-label">Color</label><input type="text" value={formData.appliance_color} onChange={(e) => handleFormChange('appliance_color', e.target.value)} className="form-input w-full" placeholder="e.g. Silver" /></div>
                          </div>
                        </div>
                      )}

                      {/* Vehicle fields */}
                      {formData.category === 'VEHICLE' && (
                        <div className="space-y-4 p-4 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg border border-neutral-200/60 dark:border-neutral-700/50">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div><label className="form-label">Make</label><input type="text" value={formData.vehicle_make} onChange={(e) => handleFormChange('vehicle_make', e.target.value)} className="form-input w-full" placeholder="e.g. Toyota" /></div>
                            <div><label className="form-label">Model</label><input type="text" value={formData.vehicle_model} onChange={(e) => handleFormChange('vehicle_model', e.target.value)} className="form-input w-full" placeholder="e.g. Vios" /></div>
                            <div><label className="form-label">Year</label><input type="number" value={formData.vehicle_year} onChange={(e) => handleFormChange('vehicle_year', e.target.value)} className="form-input w-full" placeholder="e.g. 2023" min="1900" max={new Date().getFullYear() + 1} /></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div><label className="form-label">Color</label><input type="text" value={formData.vehicle_color} onChange={(e) => handleFormChange('vehicle_color', e.target.value)} className="form-input w-full" placeholder="e.g. Pearl White" /></div>
                            <div><label className="form-label">Plate Number</label><input type="text" value={formData.plate_number} onChange={(e) => handleFormChange('plate_number', e.target.value)} className="form-input w-full" placeholder="e.g. ABC 1234" /></div>
                            <div><label className="form-label">Mileage (km)</label><input type="number" value={formData.mileage} onChange={(e) => handleFormChange('mileage', e.target.value)} className="form-input w-full" placeholder="e.g. 45000" min="0" /></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div><label className="form-label">Engine Number</label><input type="text" value={formData.engine_number} onChange={(e) => handleFormChange('engine_number', e.target.value)} className="form-input w-full" placeholder="e.g. 2NR-FE12345" /></div>
                            <div><label className="form-label">Chassis Number</label><input type="text" value={formData.chassis_number} onChange={(e) => handleFormChange('chassis_number', e.target.value)} className="form-input w-full" placeholder="e.g. MHFAB12G3H4567890" /></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                              <label className="form-label">Transmission</label>
                              <select value={formData.transmission} onChange={(e) => handleFormChange('transmission', e.target.value)} className="form-input w-full">
                                <option value="">Select transmission...</option>
                                <option value="AUTOMATIC">Automatic</option>
                                <option value="MANUAL">Manual</option>
                                <option value="CVT">CVT</option>
                              </select>
                            </div>
                            <div>
                              <label className="form-label">Fuel Type</label>
                              <select value={formData.fuel_type} onChange={(e) => handleFormChange('fuel_type', e.target.value)} className="form-input w-full">
                                <option value="">Select fuel type...</option>
                                <option value="GASOLINE">Gasoline</option>
                                <option value="DIESEL">Diesel</option>
                                <option value="ELECTRIC">Electric</option>
                                <option value="HYBRID">Hybrid</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Condition */}
                      <div>
                        <label className="form-label">Item Condition</label>
                        <select value={formData.item_condition} onChange={(e) => handleFormChange('item_condition', e.target.value)} className="form-input w-full">
                          <option value="">Select condition...</option>
                          {conditions.map((c) => <option key={c.condition_name} value={c.condition_name}>{c.condition_name}</option>)}
                        </select>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="form-label">Description</label>
                        <textarea value={formData.general_desc} onChange={(e) => { if (e.target.value.length <= 100) handleFormChange('general_desc', e.target.value) }} className="form-input w-full min-h-[80px] resize-y" placeholder="Describe the item..." maxLength={100} rows={3} />
                        <p className={`text-[11px] mt-1 text-right ${formData.general_desc.length >= 100 ? 'text-red-500' : 'text-neutral-400 dark:text-neutral-500'}`}>{formData.general_desc.length}/100</p>
                      </div>

                      {/* Accessories */}
                      <div>
                        <label className="form-label">Accessories Included</label>
                        {formData.category === 'OTHER' ? (
                          <div className="space-y-3 mt-2">
                            <div className="flex gap-2">
                              <input type="text" value={customAccessory} onChange={(e) => setCustomAccessory(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const val = customAccessory.trim(); if (val && !formData.accessories.includes(val)) { setFormData((prev) => ({ ...prev, accessories: [...prev.accessories, val] })) } setCustomAccessory('') } }} className="form-input w-full" placeholder="Type an accessory and press Enter..." />
                              <button type="button" onClick={() => { const val = customAccessory.trim(); if (val && !formData.accessories.includes(val)) { setFormData((prev) => ({ ...prev, accessories: [...prev.accessories, val] })) } setCustomAccessory('') }} className="px-4 rounded-lg text-sm font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors whitespace-nowrap">Add</button>
                            </div>
                            {formData.accessories.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {formData.accessories.map((acc) => (
                                  <span key={acc} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 border border-primary/30 text-primary">
                                    {acc}
                                    <button type="button" onClick={() => setFormData((prev) => ({ ...prev, accessories: prev.accessories.filter((a) => a !== acc) }))} className="text-primary/60 hover:text-red-500 transition-colors"><span className="material-symbols-rounded text-[14px]">close</span></button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-3 mt-2">
                            {(ACCESSORIES_BY_CATEGORY[formData.category] || []).map((acc) => (
                              <button key={acc} type="button" onClick={() => handleAccessoryToggle(acc)}
                                className={`inline-flex items-center px-3 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${formData.accessories.includes(acc) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600'}`}>
                                {acc}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>)}
                  </div>
                </section>

                {/* 3. Valuation */}
                <section id="valuation" className="rounded-sm border shadow-sm scroll-mt-24 bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700">
                  <div className="px-6 pt-5 pb-4 border-b border-neutral-100 dark:border-neutral-700/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 bg-primary/10">
                        <span className="material-symbols-rounded text-[16px] text-primary">calculate</span>
                      </div>
                      <h2 className="text-[15px] font-bold text-neutral-800 dark:text-neutral-100">Valuation</h2>
                    </div>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 ml-[38px]">
                      {formData.category === 'JEWELRY' ? 'Calculate the appraised value based on weight and karat, or enter manually.' : 'Enter the appraised value for this item.'}
                    </p>
                  </div>
                  <div className="p-6 space-y-5">
                    {formData.category === 'JEWELRY' && (
                      <div className="space-y-4">
                        <button type="button" onClick={handleCalculate} disabled={!formData.weight_grams || !formData.karat || !formData.item_condition || calcLoading}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                          {calcLoading ? (<><span className="material-symbols-rounded animate-spin text-lg">progress_activity</span>Calculating...</>) : (<><span className="material-symbols-rounded text-lg">calculate</span>Auto-Calculate Value</>)}
                        </button>
                        {calcResult && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-700/30 border border-neutral-200/60 dark:border-neutral-700/50 text-center">
                                <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">Melt Value</p>
                                <p className="text-lg font-bold text-neutral-800 dark:text-white">{formatCurrency(calcResult.melt_value)}</p>
                              </div>
                              <div className="p-4 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/15 dark:border-primary/20 text-center">
                                <p className="text-[11px] font-medium text-primary/70 uppercase tracking-wider mb-1.5">Fair Market Value</p>
                                <p className="text-lg font-bold text-primary">{formatCurrency(calcResult.fair_market_value || calcResult.appraised_value)}</p>
                              </div>
                              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-700/30 border border-neutral-200/60 dark:border-neutral-700/50 text-center">
                                <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">Max Loan (LTV {((calcResult.ltv_ratio || 0.70) * 100).toFixed(0)}%)</p>
                                <p className="text-lg font-bold text-neutral-800 dark:text-white">{formatCurrency(calcResult.max_loan || calcResult.loan_amount)}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                              <span className="flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600"></span>Rate: {'\u20B1'}{calcResult.rate_per_gram || calcResult.gold_rate_used}/g</span>
                              <span className="flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600"></span>Purity: {((calcResult.purity || calcResult.purity_decimal_used || 0) * 100).toFixed(1)}%</span>
                              <span className="flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600"></span>Condition: x{calcResult.condition_mult || calcResult.condition_multiplier}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="form-label">{formData.category === 'JEWELRY' ? 'Appraised Value (override)' : 'Appraised Value'}</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400 dark:text-neutral-500 text-sm font-semibold">{'\u20B1'}</span>
                        <input type="number" value={formData.appraised_value} onChange={(e) => handleFormChange('appraised_value', e.target.value)} className="form-input w-full pl-8 text-lg font-semibold" placeholder="0.00" min="0" step="0.01" />
                      </div>
                    </div>
                  </div>
                </section>

                {/* 4. Review */}
                <section id="review" className="rounded-sm border shadow-sm scroll-mt-24 bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700">
                  <div className="px-6 pt-5 pb-4 border-b border-neutral-100 dark:border-neutral-700/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 bg-primary/10">
                        <span className="material-symbols-rounded text-[16px] text-primary">fact_check</span>
                      </div>
                      <h2 className="text-[15px] font-bold text-neutral-800 dark:text-neutral-100">Review & Submit</h2>
                    </div>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 ml-[38px]">Review the details below before submitting the appraisal.</p>
                  </div>
                  <div className="p-6 space-y-6">
                    {/* Customer review */}
                    <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 overflow-hidden">
                      <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700/20 border-b border-neutral-200/80 dark:border-neutral-700/60">
                        <h3 className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="material-symbols-rounded text-[13px] text-primary">person</span>Customer
                        </h3>
                      </div>
                      <div className="px-4 py-3.5 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-primary font-bold text-xs">{(selectedCustomer?.first_name?.[0] || '').toUpperCase()}{(selectedCustomer?.last_name?.[0] || '').toUpperCase()}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100 truncate">{selectedCustomer?.first_name} {selectedCustomer?.last_name}</p>
                          <p className="text-[11px] text-neutral-400 dark:text-neutral-500">ID: {selectedCustomer?.id?.slice(0, 8)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Item review */}
                    <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 overflow-hidden">
                      <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700/20 border-b border-neutral-200/80 dark:border-neutral-700/60">
                        <h3 className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="material-symbols-rounded text-[13px] text-primary">inventory_2</span>Item Details
                        </h3>
                      </div>
                      <div className="px-4 py-3.5 space-y-2.5">
                        <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                          <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Category</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.category}</span></div>
                          <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Condition</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.item_condition}</span></div>
                        </div>
                        {formData.general_desc && (
                          <div className="pt-1 border-t border-neutral-100 dark:border-neutral-700/40">
                            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-0.5">Description</p>
                            <p className="text-[13px] text-neutral-700 dark:text-neutral-200">{formData.general_desc}</p>
                          </div>
                        )}
                        {formData.category === 'JEWELRY' && (
                          <div className="pt-1 border-t border-neutral-100 dark:border-neutral-700/40 grid grid-cols-2 gap-y-2 gap-x-4">
                            {formData.metal_type && <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Metal</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.metal_type}</span></div>}
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Weight</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.weight_grams}g</span></div>
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Karat</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.karat}K</span></div>
                          </div>
                        )}
                        {formData.category === 'GADGET' && (
                          <div className="pt-1 border-t border-neutral-100 dark:border-neutral-700/40 grid grid-cols-2 gap-y-2 gap-x-4">
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Brand</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.brand}</span></div>
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Model</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.model}</span></div>
                            {formData.serial_number && <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Serial</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.serial_number}</span></div>}
                          </div>
                        )}
                        {formData.category === 'APPLIANCE' && (
                          <div className="pt-1 border-t border-neutral-100 dark:border-neutral-700/40 grid grid-cols-2 gap-y-2 gap-x-4">
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Brand</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.appliance_brand}</span></div>
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Model</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.appliance_model}</span></div>
                          </div>
                        )}
                        {formData.category === 'VEHICLE' && (
                          <div className="pt-1 border-t border-neutral-100 dark:border-neutral-700/40 grid grid-cols-2 gap-y-2 gap-x-4">
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Make</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.vehicle_make}</span></div>
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Model</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.vehicle_model}</span></div>
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Year</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.vehicle_year}</span></div>
                            <div className="flex justify-between items-baseline"><span className="text-[11px] text-neutral-400 dark:text-neutral-500">Plate</span><span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{formData.plate_number}</span></div>
                          </div>
                        )}
                        {formData.accessories.length > 0 && (
                          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700/40">
                            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1.5">Accessories</p>
                            <div className="flex flex-wrap gap-1.5">
                              {formData.accessories.map((acc) => (
                                <span key={acc} className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-medium bg-neutral-100 dark:bg-neutral-700/40 text-neutral-600 dark:text-neutral-300 border border-neutral-200/60 dark:border-neutral-600/30">{acc}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Valuation review */}
                    <div className="rounded-xl border border-primary/15 dark:border-primary/20 bg-gradient-to-r from-primary/5 to-primary/[0.02] dark:from-primary/10 dark:to-primary/[0.03] overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-primary/10 dark:border-primary/15">
                        <h3 className="text-[11px] font-semibold text-primary/70 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="material-symbols-rounded text-[13px] text-primary">payments</span>Appraised Value
                        </h3>
                      </div>
                      <div className="px-4 py-4">
                        <p className="text-2xl font-bold text-primary tracking-tight">{formatCurrency(formData.appraised_value)}</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Bottom Action Bar */}
                <div className="flex items-center justify-between py-3.5 px-5 bg-white dark:bg-neutral-800 rounded-sm border border-neutral-200 dark:border-neutral-700 shadow-sm">
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    {(!selectedCustomer || !formData.category || !formData.general_desc || !formData.item_condition || !formData.appraised_value)
                      ? <span className="flex items-center gap-1"><span className="material-symbols-rounded text-sm text-neutral-400">info</span>Complete all required fields to submit.</span>
                      : <span className="flex items-center gap-1 text-primary font-medium"><span className="material-symbols-rounded text-sm">check_circle</span>Ready to submit</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { setView('list'); resetForm() }} className="px-4 py-2 rounded-sm text-sm font-semibold text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">Cancel</button>
                    <button type="button" onClick={handleSubmitAppraisal} disabled={submitLoading || !selectedCustomer || !formData.category || !formData.general_desc || !formData.item_condition || !formData.appraised_value}
                      className="inline-flex items-center gap-1.5 px-5 py-2 rounded-sm text-sm font-bold bg-primary hover:bg-primary-hover text-white dark:text-neutral-900 shadow-sm shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                      {submitLoading ? (<><span className="material-symbols-rounded text-[18px] animate-spin">progress_activity</span>Submitting...</>) : (<><span className="material-symbols-rounded text-[18px]">send</span>Submit Appraisal</>)}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* List View */}
          {view === 'list' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {statsData.map((stat, index) => <StatsCard key={index} {...stat} />)}
              </div>

              <div className="loans-table-container">
                <div className="overflow-x-auto custom-scrollbar flex-1">
                  {loading ? (
                    <div className="flex items-center justify-center py-16 text-neutral-400 dark:text-neutral-500">
                      <span className="material-symbols-rounded animate-spin text-2xl mr-2">progress_activity</span>
                      Loading appraisals...
                    </div>
                  ) : queue.length === 0 ? (
                    <EmptyState icon="assignment" title="No items awaiting appraisal" description="Items submitted by cashiers will appear here for appraisal." />
                  ) : (
                    <table className="min-w-full text-center text-sm whitespace-nowrap">
                      <thead className="loans-table-header">
                        <tr>
                          <th className="table-th text-center">Item</th>
                          <th className="table-th text-center">Customer</th>
                          <th className="table-th text-center">Category</th>
                          <th className="table-th text-center">Status</th>
                          <th className="table-th text-center">Date</th>
                          <th className="table-th text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {queue.map((item) => {
                          const statusInfo = STATUS_MAP[item.inventory_status] || { label: item.inventory_status, type: 'neutral' }
                          const customerName = item.customers ? `${item.customers.first_name} ${item.customers.last_name}` : 'Unknown'
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
                              <td className="px-4 py-4 text-center"><StatusBadge status={statusInfo.label} type={statusInfo.type} /></td>
                              <td className="px-4 py-4 text-center text-neutral-500 dark:text-neutral-400">{formatDate(item.created_at)}</td>
                              <td className="px-4 py-4 text-center">
                                <button
                                  onClick={() => {
                                    setSelectedItem(item)
                                    const customer = item.customers
                                      ? { id: item.customer_id, first_name: item.customers.first_name, last_name: item.customers.last_name, email: item.customers.email }
                                      : null
                                    setSelectedCustomer(customer)
                                    setFormData(prev => ({
                                      ...prev,
                                      customer_id: item.customer_id,
                                      category: item.category || '',
                                      general_desc: item.general_desc || '',
                                    }))
                                    setActiveStep('item')
                                    setView('submit')
                                  }}
                                  className="px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-sm text-xs font-semibold hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
                                >
                                  Start Appraisal
                                </button>
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
            </>
          )}
        </div>
      </main>
    </div>
  )
}
