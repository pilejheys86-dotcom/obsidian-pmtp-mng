import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sidebar, Header } from '../../components/layout'
import { Pagination, StatusBadge } from '../../components/ui'
import { superadminNavigation } from '../../config'
import { useAuth } from '../../context'
import { tenantsApi } from '../../lib/api'

// ── Admin Row ─────────────────────────────────────────────────────────────────
const AdminRow = ({ admin, isSelf, onToggle }) => {
  const initials = (admin.full_name || '??')
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <tr className="loan-row">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-sm flex-shrink-0 bg-primary/10 flex items-center justify-center">
            <span className="text-[11px] font-bold text-primary">{initials}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-800 dark:text-white">
              {admin.full_name}
              {isSelf && <span className="ml-2 text-[10px] font-bold text-primary uppercase">(You)</span>}
            </p>
            <p className="text-xs text-neutral-400">{admin.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5 text-center">
        <StatusBadge
          status={admin.is_active ? 'Active' : 'Inactive'}
          type={admin.is_active ? 'success' : 'neutral'}
        />
      </td>
      <td className="px-5 py-3.5 text-center text-xs text-neutral-500 dark:text-neutral-400">
        {admin.created_at
          ? new Date(admin.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—'}
      </td>
      <td className="px-5 py-3.5 text-center">
        {!isSelf && (
          <button
            onClick={() => onToggle(admin)}
            className={`text-xs font-bold px-3 py-1.5 rounded-sm transition-colors ${
              admin.is_active
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
            }`}
          >
            {admin.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Add Admin Modal ───────────────────────────────────────────────────────────
const AddAdminModal = ({ open, onClose, onSubmit, loading, error }) => {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ full_name: fullName.trim(), email: email.trim().toLowerCase() })
  }

  const handleClose = () => {
    setFullName('')
    setEmail('')
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="dashboard-card w-full max-w-md mx-4 p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Add Platform Admin</h2>
            <p className="text-xs text-neutral-400 mt-0.5">They will receive an email with login credentials.</p>
          </div>
          <button onClick={handleClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-400">
                <span className="material-symbols-outlined text-[18px]">person</span>
              </span>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Juan Dela Cruz"
                className="loans-search w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-400">
                <span className="material-symbols-outlined text-[18px]">mail</span>
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@company.com"
                className="loans-search w-full"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-sm bg-red-500/10 border border-red-500/20">
              <span className="material-symbols-outlined text-red-500 text-[16px]">error</span>
              <p className="text-xs text-red-500 font-medium">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2 p-3 rounded-sm bg-blue-500/5 border border-blue-500/20">
            <span className="material-symbols-outlined text-blue-500 text-[16px]">info</span>
            <p className="text-xs text-blue-500 dark:text-blue-400">
              A temporary password will be generated and emailed to this address.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !fullName.trim() || !email.trim()}
              className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed justify-center"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                  Creating...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">person_add</span>
                  Add Admin
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Confirm Toggle Modal ──────────────────────────────────────────────────────
const ConfirmToggleModal = ({ admin, onConfirm, onCancel, loading }) => {
  if (!admin) return null

  const action = admin.is_active ? 'deactivate' : 'activate'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="dashboard-card w-full max-w-sm mx-4 p-6">
        <div className="text-center mb-5">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 ${
            admin.is_active ? 'bg-red-500/10' : 'bg-emerald-500/10'
          }`}>
            <span className={`material-symbols-outlined text-2xl ${
              admin.is_active ? 'text-red-500' : 'text-emerald-500'
            }`}>
              {admin.is_active ? 'person_off' : 'person_check'}
            </span>
          </div>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white capitalize">{action} Admin</h3>
          <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
            Are you sure you want to {action} <strong className="text-neutral-800 dark:text-neutral-200">{admin.full_name}</strong>?
            {admin.is_active
              ? ' They will no longer be able to access the admin portal.'
              : ' They will regain access to the admin portal.'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(admin.id)}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              admin.is_active
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-emerald-500 text-white hover:bg-emerald-600'
            }`}
          >
            {loading && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
            {admin.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const SuperAdminAdmins = () => {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [currentPath] = useState('/superadmin/admins')

  // Modal state
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [toggleTarget, setToggleTarget] = useState(null)
  const [toggleLoading, setToggleLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const { profile } = useAuth()
  const itemsPerPage = 10

  const currentUser = useMemo(() => ({
    name: profile?.full_name || 'Super Admin',
    role: 'Super Admin',
    initials: (profile?.full_name || 'SA').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  }), [profile])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCurrentPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchAdmins = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page: currentPage, limit: itemsPerPage, search: debouncedSearch }
      if (statusFilter !== 'all') params.status = statusFilter

      const res = await tenantsApi.admins(params)
      setAdmins(res.data || [])
      setTotalItems(res.total || 0)
    } catch (err) {
      console.error('Admin list fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, debouncedSearch, statusFilter])

  useEffect(() => { fetchAdmins() }, [fetchAdmins])

  const handleAddAdmin = async ({ full_name, email }) => {
    setAddLoading(true)
    setAddError('')
    try {
      await tenantsApi.createAdmin({ full_name, email })
      setAddModalOpen(false)
      setSuccessMsg(`Admin "${full_name}" created. A welcome email has been sent to ${email}.`)
      setTimeout(() => setSuccessMsg(''), 6000)
      fetchAdmins()
    } catch (err) {
      setAddError(err.message || 'Failed to create admin.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleToggle = async (id) => {
    setToggleLoading(true)
    try {
      await tenantsApi.toggleAdmin(id)
      setToggleTarget(null)
      fetchAdmins()
    } catch (err) {
      console.error('Toggle admin error:', err)
    } finally {
      setToggleLoading(false)
    }
  }

  const navigateTo = (path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const totalPages = Math.ceil(totalItems / itemsPerPage)

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

          {/* ── Header ──────────────────────────────────── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Platform Admin</p>
              <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Admin Management</h1>
              <p className="text-sm text-neutral-500 mt-1">Manage platform administrators who can access the SaaS portal.</p>
            </div>
            <button
              onClick={() => { setAddError(''); setAddModalOpen(true) }}
              className="self-start btn-primary"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Add Admin
            </button>
          </div>

          {/* ── Success Banner ──────────────────────────── */}
          {successMsg && (
            <div className="flex items-center gap-3 p-4 mb-6 rounded-sm bg-emerald-500/5 border border-emerald-500/20">
              <span className="material-symbols-outlined text-emerald-500 flex-shrink-0">check_circle</span>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 flex-1">{successMsg}</p>
              <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-emerald-600">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          )}

          {/* ── Summary Cards ──────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {[
              { icon: 'shield_person', iconBg: 'bg-primary', iconColor: 'text-white dark:text-neutral-900', label: 'Total Admins', value: totalItems },
              { icon: 'check_circle', iconBg: 'bg-emerald-500', iconColor: 'text-white', label: 'Active', value: admins.filter(a => a.is_active).length },
              { icon: 'person_off', iconBg: 'bg-neutral-500', iconColor: 'text-white', label: 'Inactive', value: admins.filter(a => !a.is_active).length },
            ].map(s => (
              <div key={s.label} className="dashboard-card p-4 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-sm ${s.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <span className={`material-symbols-outlined text-xl ${s.iconColor}`}>{s.icon}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-900 dark:text-white">{s.value}</p>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Filters ────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-400">
                  <span className="material-symbols-outlined text-[18px]">search</span>
                </span>
                <input
                  type="text"
                  placeholder="Search admins..."
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
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            {/* ── Table ──────────────────────────────────── */}
            <div className="dashboard-card">
              {loading ? (
                <div className="py-14 text-center">
                  <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                  <p className="mt-3 text-sm text-neutral-400">Loading admins...</p>
                </div>
              ) : admins.length === 0 ? (
                <div className="py-14 text-center">
                  <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-700">shield_person</span>
                  <p className="mt-3 text-sm text-neutral-500">No admins found</p>
                  {debouncedSearch && (
                    <p className="mt-1 text-xs text-neutral-400">Try a different search term.</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6 -mb-6">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-100 dark:border-neutral-800">
                        {['Admin', 'Status', 'Added', 'Actions'].map(h => (
                          <th key={h} className="table-th text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {admins.map(admin => (
                        <AdminRow
                          key={admin.id}
                          admin={admin}
                          isSelf={admin.id === profile?.id}
                          onToggle={setToggleTarget}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Pagination ───────────────────────────── */}
            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </div>

        </div>
      </main>

      {/* ── Modals ──────────────────────────────────── */}
      <AddAdminModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddAdmin}
        loading={addLoading}
        error={addError}
      />
      <ConfirmToggleModal
        admin={toggleTarget}
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
        loading={toggleLoading}
      />
    </div>
  )
}

export default SuperAdminAdmins
