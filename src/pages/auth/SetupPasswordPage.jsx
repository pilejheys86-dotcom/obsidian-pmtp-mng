import { useState } from 'react'
import { Logo, ThemeToggle } from '../../components/ui'
import { authApi } from '../../lib/api'
import { useAuth } from '../../context'

const SetupPasswordPage = () => {
  const { profile, fetchProfile, logout } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsLoading(true)
    try {
      await authApi.forceChangePassword(newPassword)
      await fetchProfile()
    } catch (err) {
      setError(err.message || 'Failed to update password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-background">
        <div className="auth-background-blob-1" />
        <div className="auth-background-blob-2" />
      </div>

      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="card-auth relative z-10 w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        {/* Welcome header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-sm bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-primary text-3xl">lock_reset</span>
          </div>
          <h1 className="text-xl font-display font-bold text-neutral-900 dark:text-white mb-1">
            Set Your Password
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}! Please create a secure password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* New Password */}
          <div>
            <label className="form-label">New Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 text-lg">lock</span>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="form-input w-full pl-10 pr-10"
                placeholder="Min. 8 characters"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="form-label">Confirm Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 text-lg">lock_check</span>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`form-input w-full pl-10 ${confirmPassword && confirmPassword !== newPassword ? 'border-red-400 dark:border-red-500' : ''}`}
                placeholder="Re-enter your password"
                required
              />
              {confirmPassword && confirmPassword === newPassword && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                </div>
              )}
            </div>
          </div>

          {/* Password strength hints */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border ${newPassword.length >= 8 ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-neutral-50 dark:bg-neutral-700/30 border-neutral-200 dark:border-neutral-700 text-neutral-400'}`}>
              <span className="material-symbols-outlined text-[12px]">{newPassword.length >= 8 ? 'check' : 'close'}</span>
              8+ characters
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border ${/[A-Z]/.test(newPassword) ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-neutral-50 dark:bg-neutral-700/30 border-neutral-200 dark:border-neutral-700 text-neutral-400'}`}>
              <span className="material-symbols-outlined text-[12px]">{/[A-Z]/.test(newPassword) ? 'check' : 'close'}</span>
              Uppercase
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border ${/[0-9]/.test(newPassword) ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-neutral-50 dark:bg-neutral-700/30 border-neutral-200 dark:border-neutral-700 text-neutral-400'}`}>
              <span className="material-symbols-outlined text-[12px]">{/[0-9]/.test(newPassword) ? 'check' : 'close'}</span>
              Number
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border ${/[^A-Za-z0-9]/.test(newPassword) ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-neutral-50 dark:bg-neutral-700/30 border-neutral-200 dark:border-neutral-700 text-neutral-400'}`}>
              <span className="material-symbols-outlined text-[12px]">{/[^A-Za-z0-9]/.test(newPassword) ? 'check' : 'close'}</span>
              Special char
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || newPassword.length < 8 || newPassword !== confirmPassword}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-sm text-sm font-bold bg-primary hover:bg-primary-hover text-white dark:text-neutral-900 shadow-sm shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                Setting up...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">shield</span>
                Set Password & Continue
              </>
            )}
          </button>
        </form>

        {/* Sign out link */}
        <div className="mt-6 text-center">
          <button
            onClick={logout}
            className="text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  )
}

export default SetupPasswordPage
