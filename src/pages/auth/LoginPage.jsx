import { useState, useEffect } from 'react'
import { Logo, ThemeToggle, FormInput } from '../../components/ui'
import { useAuth } from '../../context'

const LoginPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login, user, profile } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
      // AuthContext handles profile fetching via onAuthStateChange
      // Navigation happens in useEffect below once profile loads
    } catch (err) {
      setError(err.message || 'Invalid email or password.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!user || !profile) return

    const dest = profile.role === 'superadmin' ? '/superadmin' : '/admin'
    window.history.pushState({}, '', dest)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [user, profile])

  return (
    <div className="auth-layout">
      {/* Background Effects */}
      <div className="auth-background">
        <div className="auth-background-blob-1" />
        <div className="auth-background-blob-2" />
      </div>

      {/* Theme Toggle */}
      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      {/* Back Button */}
      <a 
        href="/"
        className="absolute top-6 left-6 z-10 flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-xl">arrow_back</span>
        <span className="text-sm font-semibold">Back to Home</span>
      </a>

      {/* Login Card */}
      <div className="card-auth relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <Logo />
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-heading mb-1">Welcome back</h1>
          <p className="text-subheading">Sign in to access your dashboard</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}
          <FormInput
            label="Email Address"
            type="email"
            icon="mail"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <FormInput
            label="Password"
            type={showPassword ? 'text' : 'password'}
            icon="lock"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined text-xl">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            }
          />

          {/* Remember & Forgot */}
          <div className="flex items-center justify-between">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="form-checkbox"
              />
              <span className="form-checkbox-label">Remember me</span>
            </label>
            <a href="/recover" className="link-primary text-sm">
              Forgot password?
            </a>
          </div>

          {/* Submit Button */}
          <div className="pt-1">
            <button type="submit" className="btn-primary-full" disabled={isLoading}>
              <span className="material-symbols-outlined mr-2 text-xl">
                {isLoading ? 'progress_activity' : 'login'}
              </span>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className="divider-text my-5">
          <div className="divider-text-line" />
          <div className="divider-text-content">
            <span>New to Obsidian?</span>
          </div>
        </div>

        {/* Register Link */}
        <div className="text-center">
          <p className="text-subheading">
            Don't have an account?{' '}
            <a href="/register" className="link-dark">
              Create one now
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
