import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { authApi } from '../lib/api'

const AuthContext = createContext(undefined)

const DEFAULT_INACTIVITY_MINUTES = 5
const WARNING_BEFORE = 60 * 1000          // show warning 60 seconds before logout

function readInactivityMinutes() {
  try {
    const stored = localStorage.getItem('inactivity_timeout')
    if (stored !== null) return parseInt(stored, 10)
  } catch {}
  return DEFAULT_INACTIVITY_MINUTES
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subscriptionActive, setSubscriptionActive] = useState(null) // null = unknown, true/false = resolved
  const [showIdleWarning, setShowIdleWarning] = useState(false)
  const [inactivityMinutes, setInactivityMinutesState] = useState(readInactivityMinutes)
  const inactivityTimer = useRef(null)
  const logoutTimer = useRef(null)
  const fetchedUserIdRef = useRef(null)
  const fetchInFlightRef = useRef(null)
  const profileFailCountRef = useRef(0)

  const fetchSubscriptionStatus = useCallback(async (token) => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'
      const res = await fetch(`${API_BASE}/subscriptions/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setSubscriptionActive(data.active === true)
        return data.active === true
      }
      // Don't set false on 401 — token may be stale during transition
      if (res.status !== 401) setSubscriptionActive(false)
      return false
    } catch {
      // Network error — don't lock users out
      return false
    }
  }, [])

  const refreshSubscription = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (s?.access_token) return fetchSubscriptionStatus(s.access_token)
    return false
  }, [fetchSubscriptionStatus])

  const fetchProfile = useCallback(async (userId) => {
    // Skip if already fetched for this user
    if (fetchedUserIdRef.current === userId) return
    // Deduplicate concurrent calls for the same user
    if (fetchInFlightRef.current === userId) return
    fetchInFlightRef.current = userId

    try {
      // Try tenant_users first (covers OWNER + all employee roles)
      const { data: tuUser, error: tuErr } = await supabase
        .from('tenant_users')
        .select('*, tenants(*), branches(*)')
        .eq('id', userId)
        .is('deleted_at', null)
        .maybeSingle()

      if (tuUser) {
        console.log('[PROFILE] Tenant user loaded', { role: tuUser.role, kyc: tuUser.kyc_status })
        setProfile(tuUser)
        fetchedUserIdRef.current = userId
        profileFailCountRef.current = 0
        // Only fetch subscription if tenant exists (post-KYC)
        if (tuUser.tenant_id) {
          const { data: { session: s } } = await supabase.auth.getSession()
          if (s?.access_token) fetchSubscriptionStatus(s.access_token)
        }
        return
      }
      if (tuErr) console.warn('[PROFILE] tenant_users query error:', tuErr.message)

      // Fallback: check super_admins
      const { data: admin, error: adminErr } = await supabase
        .from('super_admins')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (admin) {
        console.log('[PROFILE] Super Admin loaded', { name: admin.full_name })
        setProfile({
          id: admin.id,
          full_name: admin.full_name,
          role: 'superadmin',
          is_active: admin.is_active,
          tenant_id: null,
          branch_id: null,
        })
        fetchedUserIdRef.current = userId
        profileFailCountRef.current = 0
        return
      }
      if (adminErr) console.warn('[PROFILE] super_admins query error:', adminErr.message)

      console.warn('[PROFILE] No profile found for user:', userId)
      // If queries had errors (e.g. transient failure during external redirect), retry up to 3 times
      if (tuErr || adminErr) {
        profileFailCountRef.current += 1
        console.warn('[PROFILE] Query errors present — attempt', profileFailCountRef.current)
        if (profileFailCountRef.current >= 3) {
          console.warn('[PROFILE] Max retries reached — signing out')
          setProfile({ _noAccess: true })
          fetchedUserIdRef.current = userId
          await supabase.auth.signOut().catch(() => {})
        }
        return
      }
      // Both queries succeeded but returned no rows
      // On first attempt, retry after a short delay (session may still be restoring after redirect)
      profileFailCountRef.current += 1
      if (profileFailCountRef.current < 3) {
        console.warn('[PROFILE] No profile found — retrying (attempt', profileFailCountRef.current, ')')
        fetchInFlightRef.current = null
        fetchedUserIdRef.current = null
        setTimeout(() => fetchProfile(userId), 1000)
        return
      }
      // After retries, mark as no access (likely a customer account)
      console.warn('[PROFILE] No staff/admin profile — marking as no access')
      setProfile({ _noAccess: true })
      fetchedUserIdRef.current = userId
    } finally {
      fetchInFlightRef.current = null
    }
  }, [fetchSubscriptionStatus])

  useEffect(() => {
    let mounted = true

    // Get the current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    // Listen for auth state changes — only act on meaningful events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      console.log('[AUTH] State change:', event, session?.user?.email ?? 'no user')
      setSession(session)
      setUser(session?.user ?? null)

      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setSubscriptionActive(null)
        fetchedUserIdRef.current = null
      } else if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        fetchProfile(session.user.id)
      }
      // TOKEN_REFRESHED: session/user already updated above, no need to re-fetch profile
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const login = async (email, password) => {
    // Resolve personal email to work email if needed
    let loginEmail = email
    try {
      const { loginEmail: resolved } = await authApi.resolveEmail(email)
      if (resolved) loginEmail = resolved
    } catch {
      // If resolution fails, proceed with original email
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
    if (error) throw error
    return data
  }

  const logout = async () => {
    // Call backend logout endpoint to log the event before clearing session
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'
      const token = session?.access_token
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
      }
    } catch (e) {
      // Don't block logout if audit call fails
    }

    fetchedUserIdRef.current = null
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const setInactivityTimeout = useCallback((minutes) => {
    const val = parseInt(minutes, 10)
    setInactivityMinutesState(val)
    try { localStorage.setItem('inactivity_timeout', String(val)) } catch {}
  }, [])

  // Inactivity auto-logout
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (logoutTimer.current) clearTimeout(logoutTimer.current)
    setShowIdleWarning(false)
    // 0 = never timeout
    if (session && inactivityMinutes > 0) {
      const totalMs = inactivityMinutes * 60 * 1000
      // Show warning 60 seconds before logout (or immediately for very short timeouts)
      const warningDelay = Math.max(totalMs - WARNING_BEFORE, 0)
      inactivityTimer.current = setTimeout(() => {
        setShowIdleWarning(true)
        logoutTimer.current = setTimeout(async () => {
          console.log('[AUTH] Auto-logout: inactivity timeout')
          fetchedUserIdRef.current = null
          await supabase.auth.signOut().catch(() => {})
        }, Math.min(WARNING_BEFORE, totalMs))
      }, warningDelay)
    }
  }, [session, inactivityMinutes])

  const dismissIdleWarning = useCallback(() => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current)
    setShowIdleWarning(false)
    resetInactivityTimer()
  }, [resetInactivityTimer])

  useEffect(() => {
    if (!session) {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
      if (logoutTimer.current) clearTimeout(logoutTimer.current)
      setShowIdleWarning(false)
      return
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove']
    const handler = () => resetInactivityTimer()

    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    resetInactivityTimer() // start the timer

    return () => {
      events.forEach(e => window.removeEventListener(e, handler))
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
      if (logoutTimer.current) clearTimeout(logoutTimer.current)
    }
  }, [session, resetInactivityTimer])

  const value = {
    user,
    profile,
    session,
    loading,
    subscriptionActive,
    showIdleWarning,
    dismissIdleWarning,
    kycStatus: profile?.kyc_status || null,
    inactivityMinutes,
    setInactivityTimeout,
    login,
    logout,
    refreshSubscription,
    fetchProfile: () => {
      if (!user) return
      // Clear cache so fetchProfile actually re-fetches
      fetchedUserIdRef.current = null
      return fetchProfile(user.id)
    },
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
