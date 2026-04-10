import { useState, useEffect } from 'react'

import {
  LandingPage, ProcessPage, PricingPage, AboutPage, TermsPage, CookiePolicyPage, PrivacyPolicyPage, RequestAccessPage,
  LoginPage, RegisterPage, RecoverAcc, SetupPasswordPage,
  // Owner pages
  AdminDash, ProfilePage, SettingsPage, ActiveLoans, Inventory,
  Appraisals, AppraisalDetail, AuctionItems, Customers, Employee, InventoryAudit, OverdueItems, Reports,
  SubscriptionPage, KycPage, AdminPricingPage, PricingHistoryPage,
  BrandingSetupPage, BrandingPage, CustomerRequestDetail, AuditLogPage,
  // Super Admin pages
  SuperAdminDash, SuperAdminTenants, SuperAdminReports, SuperAdminSalesReport, SuperAdminAuditLogs, SuperAdminBackup, SuperAdminSettings, SuperAdminAdmins,
} from './pages'

import { useAuth } from './context'

const WARNING_DURATION = 60 // seconds

const IdleWarningModal = ({ onStay, onLogout }) => {
  const [seconds, setSeconds] = useState(WARNING_DURATION)

  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  const radius = 28
  const circumference = 2 * Math.PI * radius
  const progress = circumference - (seconds / WARNING_DURATION) * circumference

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-sm shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-sm mx-4 p-8 flex flex-col items-center text-center">
        {/* Countdown ring */}
        <div className="relative w-20 h-20 mb-6">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-neutral-100 dark:text-neutral-800" />
            <circle
              cx="32" cy="32" r={radius} fill="none" strokeWidth="4"
              stroke="#A3E635"
              strokeDasharray={circumference}
              strokeDashoffset={progress}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear', ...(seconds <= 10 ? { stroke: '#ef4444' } : {}) }}
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums ${seconds <= 10 ? 'text-red-500' : 'text-neutral-800 dark:text-neutral-100'}`}>
            {seconds}
          </span>
        </div>

        <span className="material-symbols-outlined text-amber-500 text-4xl mb-3">timer</span>
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">Still there?</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 leading-relaxed">
          You've been inactive for a while. You'll be automatically signed out in{' '}
          <span className={`font-semibold ${seconds <= 10 ? 'text-red-500' : 'text-neutral-800 dark:text-white'}`}>
            {seconds} second{seconds !== 1 ? 's' : ''}
          </span>{' '}
          to protect your account.
        </p>

        <div className="flex flex-col gap-2 w-full">
          <button onClick={onStay} className="btn-primary w-full">
            Stay signed in
          </button>
          <button onClick={onLogout} className="btn-secondary w-full">
            Sign out now
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  const [minLoadDone, setMinLoadDone] = useState(false)
  const { user, profile, loading, subscriptionActive, logout, showIdleWarning, dismissIdleWarning } = useAuth()

  useEffect(() => {
    const t = setTimeout(() => setMinLoadDone(true), 2000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname)
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }

    window.addEventListener('popstate', handlePopState)

    const handleClick = (e) => {
      const link = e.target.closest('a')
      if (link && link.href.startsWith(window.location.origin)) {
        // Skip hash-only navigation (anchor links on the same page)
        if (link.pathname === window.location.pathname && link.hash) return
        e.preventDefault()
        const path = link.pathname
        window.history.pushState({}, '', path + link.search)
        setCurrentPath(path)
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      }
    }

    document.addEventListener('click', handleClick)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      document.removeEventListener('click', handleClick)
    }
  }, [])

  const navigate = (path) => {
    window.history.pushState({}, '', path)
    setCurrentPath(path)
  }

  const isOwnerRoute = currentPath.startsWith('/admin')
  const isSuperAdminRoute = currentPath.startsWith('/superadmin')
  const isProtectedRoute = isOwnerRoute || isSuperAdminRoute

  // Show logo loader while auth resolves (and for a minimum display time).
  // If user is authenticated, also wait for profile to load before routing.
  if (!minLoadDone || loading || (user && !profile)) {
    const pulse = (delay) => ({
      animation: 'obsidian-block-pulse 1.6s ease-in-out infinite',
      animationDelay: delay,
    })
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-stone-100 dark:bg-neutral-900">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1333.33 1333.33" className="w-14 h-14 text-neutral-900 dark:text-white" fill="currentColor">
          <rect y="333.17" width="333.17" height="1000" style={pulse('0s')} />
          <rect x="666.67" y="666.67" width="332.49" height="666.5" style={pulse('0.2s')} />
          <rect x="666.42" y="1000.58" width="333.17" height="999" transform="translate(-1000.42 1999.75) rotate(-90)" style={pulse('0.4s')} />
          <rect x="500.5" y="500.5" width="333.5" height="665.51" transform="translate(-499.33 1167.17) rotate(-90)" style={pulse('0.6s')} />
          <rect x="1000" width="333.33" height="333.33" style={pulse('0.8s')} />
        </svg>
        <span className="font-display font-light text-xl tracking-tight text-neutral-900 dark:text-white">
          Obsidian
        </span>
      </div>
    )
  }

  // Customer / unauthorized account — no staff profile found
  if (user && profile?._noAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-100 dark:bg-neutral-900">
        <div className="max-w-md w-full mx-4 bg-white dark:bg-neutral-800 rounded-sm border border-neutral-200 dark:border-neutral-700 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-sm bg-red-500/10 flex items-center justify-center mx-auto mb-5">
            <span className="material-symbols-outlined text-red-500 text-3xl">block</span>
          </div>
          <h1 className="text-xl font-display font-bold text-neutral-900 dark:text-white mb-2">Access Denied</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 leading-relaxed">
            This account is not authorized to access the management portal. If you are a customer, please use the mobile app to manage your account.
          </p>
          <button
            onClick={async () => { await logout(); navigate('/login'); }}
            className="px-6 py-2.5 rounded-sm text-sm font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  // Unauthenticated → redirect protected routes to login
  if (isProtectedRoute && !user) {
    navigate('/login')
    return null
  }

  // Authenticated → redirect away from auth pages based on role
  if ((currentPath === '/login' || currentPath === '/register') && user) {
    navigate(profile?.role === 'superadmin' ? '/superadmin' : '/admin')
    return null
  }

  // Superadmin trying to access owner routes → redirect to superadmin
  if (isOwnerRoute && user && profile?.role === 'superadmin') {
    navigate('/superadmin')
    return null
  }

  // Non-superadmin trying to access superadmin routes → redirect to owner area
  if (isSuperAdminRoute && user && profile?.role !== 'superadmin') {
    navigate('/admin')
    return null
  }

  // First-login password change gate: employees with must_change_password see setup screen
  if (isProtectedRoute && user && profile?.role !== 'superadmin' && profile?.must_change_password) {
    return <SetupPasswordPage />
  }

  // Employee KYC gate: non-owner employees with unverified KYC see a waiting screen
  if (isOwnerRoute && user && profile && profile.role !== 'OWNER' && profile.role !== 'superadmin' && profile.kyc_status !== 'VERIFIED') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-100 dark:bg-neutral-900">
        <div className="max-w-md w-full mx-4 bg-white dark:bg-neutral-800 rounded-sm border border-neutral-200 dark:border-neutral-700 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-sm bg-amber-500/10 flex items-center justify-center mx-auto mb-5">
            <span className="material-symbols-outlined text-amber-500 text-3xl">hourglass_top</span>
          </div>
          <h1 className="text-xl font-display font-bold text-neutral-900 dark:text-white mb-2">Account Pending Verification</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 leading-relaxed">
            Your account is awaiting verification by your admin or manager. You'll be able to access the system once your identity has been approved.
          </p>
          <div className="flex items-center justify-center gap-2 p-3 rounded-sm bg-neutral-50 dark:bg-neutral-700/50 border border-neutral-200 dark:border-neutral-700">
            <span className="material-symbols-outlined text-neutral-400 text-lg">badge</span>
            <span className="text-sm text-neutral-600 dark:text-neutral-300">
              KYC Status: <strong className="text-amber-500">{profile.kyc_status || 'PENDING'}</strong>
            </span>
          </div>
          <button
            onClick={logout}
            className="mt-6 px-5 py-2 rounded-sm text-sm font-semibold text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // Owner KYC gate: lock to KYC page until approved/verified
  const kycPending = profile?.role === 'OWNER' && profile?.kyc_status && profile.kyc_status !== 'VERIFIED' && profile.kyc_status !== 'APPROVED'
  const kycExempt = ['/admin/kyc', '/admin/profile']
  if (isOwnerRoute && user && kycPending && !kycExempt.includes(currentPath)) {
    navigate('/admin/kyc')
    return null
  }

  // Paywall: only OWNER sees subscription gate — employees skip this
  const paywallExempt = ['/admin/subscription', '/admin/profile', '/admin/kyc']
  if (isOwnerRoute && user && profile?.role === 'OWNER' && !kycPending && subscriptionActive === false && !paywallExempt.includes(currentPath)) {
    navigate('/admin/subscription')
    return null
  }

  const renderPage = () => {
    // Dynamic route: public request access form
    if (currentPath.startsWith('/request-access/')) {
      const tenantId = currentPath.split('/').pop();
      if (tenantId) return <RequestAccessPage tenantId={tenantId} />;
    }

    // Dynamic route: customer request detail
    if (currentPath.startsWith('/admin/customers/requests/')) {
      const requestId = currentPath.split('/').pop();
      if (requestId) return <CustomerRequestDetail requestId={requestId} />;
    }

    // Dynamic route: appraisal detail
    if (currentPath.startsWith('/admin/appraisals/')) {
      const itemId = currentPath.split('/').pop();
      if (itemId) return <AppraisalDetail itemId={itemId} />;
    }

    switch (currentPath) {
      // ── Public ─────────────────────────────────────────
      case '/process':
        return <ProcessPage />
      case '/pricing':
        return <PricingPage />
      case '/about':
        return <AboutPage />
      case '/terms':
        return <TermsPage />
      case '/cookies':
        return <CookiePolicyPage />
      case '/privacy':
        return <PrivacyPolicyPage />

      // ── Auth ──────────────────────────────────────────
      case '/login':
        return <LoginPage />
      case '/register':
        return <RegisterPage />
      case '/recover':
        return <RecoverAcc />

      // ── Owner (pawnshop) ──────────────────────────────
      case '/admin':
        return <AdminDash />
      case '/admin/profile':
        return <ProfilePage />
      case '/admin/audit-log':
        return <AuditLogPage />
      case '/admin/settings':
        return <SettingsPage />
      case '/admin/loans':
        return <ActiveLoans />
      case '/admin/inventory/audit':
        return <InventoryAudit />
      case '/admin/inventory':
        return <Inventory />
      case '/admin/appraisals':
        return <Appraisals />
      case '/admin/overdue':
        return <OverdueItems />
      case '/admin/auction':
        return <AuctionItems />
      case '/admin/customers':
        return <Customers />
      case '/admin/employees':
        return <Employee />
      case '/admin/reports':
        return <Reports />
      case '/admin/subscription':
        return <SubscriptionPage />
      case '/admin/kyc':
        return <KycPage />
      case '/admin/pricing/history':
        return <PricingHistoryPage />
      case '/admin/pricing':
        return <AdminPricingPage />
      case '/admin/branding/setup':
        return <BrandingSetupPage />
      case '/admin/branding':
        return <BrandingPage />
      case '/admin/terms':
        return <TermsPage layout="admin" />

      // ── Super Admin ───────────────────────────────────
      case '/superadmin':
        return <SuperAdminDash />
      case '/superadmin/tenants':
        return <SuperAdminTenants />
      case '/superadmin/reports':
        return <SuperAdminReports />
      case '/superadmin/sales':
        return <SuperAdminSalesReport />
      case '/superadmin/audit-logs':
        return <SuperAdminAuditLogs />
      case '/superadmin/backup':
        return <SuperAdminBackup />
      case '/superadmin/settings':
        return <SuperAdminSettings />
      case '/superadmin/admins':
        return <SuperAdminAdmins />

      default:
        return <LandingPage />
    }
  }

  return (
    <>
      {renderPage()}
      {showIdleWarning && (
        <IdleWarningModal
          onStay={dismissIdleWarning}
          onLogout={logout}
        />
      )}
    </>
  )
}

export default App
