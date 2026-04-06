import { useState, useMemo, useEffect, useCallback } from 'react'
import { Sidebar, Header } from '../../components/layout'
import { superadminNavigation } from '../../config'
import { useAuth } from '../../context'
import { tenantsApi } from '../../lib/api'

const permissionsMatrix = [
  { feature: 'Dashboard',  superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Tenants',    superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Reports',    superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Sales',      superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Audit Logs', superAdmin: 'Read/Write', staff: 'Read' },
  { feature: 'Backup',     superAdmin: 'Read/Write', staff: 'No Access' },
  { feature: 'Settings',   superAdmin: 'Read/Write', staff: 'No Access' },
]

const PermissionPill = ({ value }) => {
  const styles = {
    'Read/Write': 'bg-primary/10 text-primary',
    'Read':       'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    'No Access':  'bg-neutral-100 dark:bg-neutral-800 text-neutral-400',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-[11px] font-bold uppercase tracking-wide ${styles[value] || styles['No Access']}`}>
      {value}
    </span>
  )
}

const SuperAdminSettings = () => {
  const [currentPath] = useState('/superadmin/settings')
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

  const [settings, setSettings] = useState({
    system_title: 'Obsidian',
    logo_url: null,
    max_tenants: 100,
    max_users_per_tenant: 50,
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const fetchSettings = useCallback(async () => {
    try {
      const data = await tenantsApi.platformSettings.get()
      if (data) {
        setSettings(prev => ({
          ...prev,
          system_title:         data.system_title         ?? prev.system_title,
          logo_url:             data.logo_url             ?? prev.logo_url,
          max_tenants:          data.max_tenants          ?? prev.max_tenants,
          max_users_per_tenant: data.max_users_per_tenant ?? prev.max_users_per_tenant,
        }))
      }
    } catch (err) {
      console.error('Failed to load platform settings:', err)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const handleSave = async (section) => {
    setSaving(section)
    setMessage('')
    try {
      await tenantsApi.platformSettings.update(settings)
      setMessage('Settings saved successfully.')
    } catch (err) {
      console.error('Failed to save platform settings:', err)
      setMessage('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setMessage('')
  }

  return (
    <div className="admin-layout">
      <Sidebar navigation={superadminNavigation} currentPath={currentPath} onNavigate={navigateTo} />
      <main className="admin-main">
        <Header user={currentUser} />
        <div className="admin-content custom-scrollbar">

          {/* ── Header ───────────────────────────────────── */}
          <div className="mb-8">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Platform Admin</p>
            <h1 className="text-2xl font-display font-bold text-neutral-900 dark:text-white">Settings</h1>
            <p className="text-sm text-neutral-500 mt-1">Manage platform-wide configuration and access control.</p>
          </div>

          {/* ── 1. System Branding ────────────────────────── */}
          <div className="sa-settings-card">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-primary text-xl">palette</span>
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">System Branding</h2>
            </div>

            <div className="space-y-5">
              {/* System Title */}
              <div>
                <label className="sa-settings-label" htmlFor="system_title">System Title</label>
                <input
                  id="system_title"
                  type="text"
                  className="sa-settings-input"
                  value={settings.system_title}
                  onChange={e => handleChange('system_title', e.target.value)}
                  placeholder="e.g. Obsidian"
                />
                <p className="text-xs text-neutral-400 mt-1.5">Displayed in the browser tab and email notifications.</p>
              </div>

              {/* Logo Upload */}
              <div>
                <label className="sa-settings-label">Platform Logo</label>
                <div className="flex items-center gap-4">
                  {settings.logo_url ? (
                    <img src={settings.logo_url} alt="Logo" className="h-12 w-12 object-contain rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1" />
                  ) : (
                    <div className="h-12 w-12 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-neutral-400 text-2xl">image</span>
                    </div>
                  )}
                  <div
                    className="flex-1 flex flex-col items-center justify-center gap-1.5 h-20 rounded-md border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 cursor-not-allowed opacity-60"
                    title="Logo upload coming soon"
                  >
                    <span className="material-symbols-outlined text-neutral-400 text-2xl">upload_file</span>
                    <p className="text-xs text-neutral-400">Logo upload coming soon</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                className="btn-primary"
                onClick={() => handleSave('branding')}
                disabled={saving === 'branding'}
              >
                {saving === 'branding' ? (
                  <span className="material-symbols-outlined animate-spin text-lg mr-1.5">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-lg mr-1.5">save</span>
                )}
                {saving === 'branding' ? 'Saving…' : 'Save Branding'}
              </button>
              {message && saving === false && (
                <p className={`text-xs font-medium ${message.startsWith('Failed') ? 'text-red-500' : 'text-emerald-500'}`}>
                  {message}
                </p>
              )}
            </div>
          </div>

          {/* ── 2. Tenant Limits ──────────────────────────── */}
          <div className="sa-settings-card">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-primary text-xl">tune</span>
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Tenant Limits</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Max Tenants */}
              <div>
                <label className="sa-settings-label" htmlFor="max_tenants">Max Tenants</label>
                <input
                  id="max_tenants"
                  type="number"
                  min={1}
                  className="sa-settings-input"
                  value={settings.max_tenants}
                  onChange={e => handleChange('max_tenants', Number(e.target.value))}
                />
                <p className="text-xs text-neutral-400 mt-1.5">Maximum number of tenant accounts allowed on this platform.</p>
              </div>

              {/* Max Users per Tenant */}
              <div>
                <label className="sa-settings-label" htmlFor="max_users_per_tenant">Max Users per Tenant</label>
                <input
                  id="max_users_per_tenant"
                  type="number"
                  min={1}
                  className="sa-settings-input"
                  value={settings.max_users_per_tenant}
                  onChange={e => handleChange('max_users_per_tenant', Number(e.target.value))}
                />
                <p className="text-xs text-neutral-400 mt-1.5">Maximum employee accounts each tenant can create.</p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                className="btn-primary"
                onClick={() => handleSave('limits')}
                disabled={saving === 'limits'}
              >
                {saving === 'limits' ? (
                  <span className="material-symbols-outlined animate-spin text-lg mr-1.5">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-lg mr-1.5">save</span>
                )}
                {saving === 'limits' ? 'Saving…' : 'Save Limits'}
              </button>
              {message && saving === false && (
                <p className={`text-xs font-medium ${message.startsWith('Failed') ? 'text-red-500' : 'text-emerald-500'}`}>
                  {message}
                </p>
              )}
            </div>
          </div>

          {/* ── 3. Permissions Matrix ─────────────────────── */}
          <div className="sa-settings-card">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="material-symbols-outlined text-primary text-xl">shield_lock</span>
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Permissions Matrix</h2>
            </div>
            <p className="text-xs text-neutral-400 mb-5">Read-only view of current platform role access levels.</p>

            <div className="overflow-x-auto">
              <table className="sa-permissions-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Super Admin</th>
                    <th>Platform Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionsMatrix.map(row => (
                    <tr key={row.feature}>
                      <td className="font-medium text-neutral-800 dark:text-neutral-200">{row.feature}</td>
                      <td><PermissionPill value={row.superAdmin} /></td>
                      <td><PermissionPill value={row.staff} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-neutral-400 mt-4 italic">
              Role-based access control will be available in a future update.
            </p>
          </div>

        </div>
      </main>
    </div>
  )
}

export default SuperAdminSettings
