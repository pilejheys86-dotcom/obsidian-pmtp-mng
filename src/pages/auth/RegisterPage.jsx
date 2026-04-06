import { useState, useEffect } from 'react'
import { Logo, ThemeToggle, FormInput } from '../../components/ui'
import { authApi } from '../../lib/api'

const STEPS = [
  { number: 1, label: 'Personal' },
  { number: 2, label: 'Credentials' },
  { number: 3, label: 'Verify' },
]

const PHONE_PREFIX = '+639'

const RegisterPage = () => {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: PHONE_PREFIX,
    password: '',
    confirmPassword: '',
  })
  const [otp, setOtp] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return
    const id = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(id); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [resendTimer])

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }))
  }

  // Phone handler: enforce +639 prefix, max 9 digits after prefix
  const handlePhoneChange = (e) => {
    let val = e.target.value
    if (!val.startsWith(PHONE_PREFIX)) {
      val = PHONE_PREFIX
    }
    const after = val.slice(PHONE_PREFIX.length).replace(/\D/g, '').slice(0, 9)
    setFormData((prev) => ({ ...prev, phone: PHONE_PREFIX + after }))
  }

  // Step 1 → Step 2: validate personal info + check email availability
  const handleStep1Next = async (e) => {
    e.preventDefault()
    setError('')
    if (!formData.fullName.trim()) { setError('Full name is required.'); return }
    if (!formData.email.trim()) { setError('Email address is required.'); return }
    if (formData.phone.length < PHONE_PREFIX.length + 9) {
      setError('Phone must be a complete Philippine mobile number (+639XXXXXXXXX).'); return
    }
    setIsLoading(true)
    try {
      await authApi.checkEmail(formData.email)
      setStep(2)
    } catch (err) {
      setError(err.message || 'This email is already registered.')
    } finally {
      setIsLoading(false)
    }
  }

  // Step 2 → call signupInit → Step 3
  const handleStep2Next = async (e) => {
    e.preventDefault()
    setError('')
    const pw = formData.password
    if (pw.length < 8 || !/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
      setError('Please meet all password requirements before continuing.')
      return
    }
    if (pw !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setIsLoading(true)
    try {
      await authApi.signupInit({
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      })
      setStep(3)
      setResendTimer(60)
    } catch (err) {
      setError(err.message || 'Failed to send verification code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Step 3: verify OTP
  const handleVerify = async (e) => {
    e.preventDefault()
    setError('')
    if (otp.trim().length !== 6) {
      setError('Please enter the 6-digit code sent to your email.')
      return
    }
    setIsLoading(true)
    try {
      await authApi.verifySignupOtp(formData.email, otp.trim())
      setSuccess('Account created! Redirecting to login...')
      setTimeout(() => {
        window.history.pushState({}, '', '/login')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, 2000)
    } catch (err) {
      setError(err.message || 'Invalid or expired code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Resend OTP
  const handleResend = async () => {
    if (resendTimer > 0) return
    setError('')
    setIsLoading(true)
    try {
      await authApi.signupInit({
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      })
      setResendTimer(60)
    } catch (err) {
      setError(err.message || 'Failed to resend code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

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

      {/* Register Card */}
      <div className="card-auth relative z-10 w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Logo />
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-heading mb-2">Create Account</h1>
          <p className="text-subheading">Join Obsidian to manage your pawnshop</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.number} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${step === s.number ? 'text-primary' : step > s.number ? 'text-primary' : 'text-neutral-400 dark:text-neutral-500'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step > s.number ? 'bg-primary text-white dark:text-neutral-900' :
                  step === s.number ? 'bg-primary text-white dark:text-neutral-900' :
                  'bg-neutral-200 dark:bg-neutral-700 text-neutral-500'
                }`}>
                  {step > s.number
                    ? <span className="material-symbols-outlined text-xs">check</span>
                    : s.number}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-10 transition-colors ${step > s.number ? 'bg-primary' : 'bg-neutral-200 dark:bg-neutral-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-sm">
            <span className="material-symbols-outlined text-base">check_circle</span>
            {success}
          </div>
        )}

        {/* Step 1: Personal Info */}
        {step === 1 && (
          <form onSubmit={handleStep1Next} className="space-y-5">
            <FormInput
              label="Full Name" type="text" icon="person"
              placeholder="Juan Dela Cruz"
              value={formData.fullName} onChange={handleChange('fullName')} required
            />
            <FormInput
              label="Email Address" type="email" icon="mail"
              placeholder="you@example.com"
              value={formData.email} onChange={handleChange('email')} required
            />
            <FormInput
              label="Phone Number" type="tel" icon="phone"
              placeholder="+639171234567"
              value={formData.phone}
              onChange={handlePhoneChange}
              required
            />
            <button type="submit" className="btn-primary-full">
              Continue
              <span className="material-symbols-outlined ml-2 text-xl">arrow_forward</span>
            </button>
          </form>
        )}

        {/* Step 2: Credentials */}
        {step === 2 && (
          <form onSubmit={handleStep2Next} className="space-y-5">
            <FormInput
              label="Password" type={showPassword ? 'text' : 'password'} icon="lock"
              placeholder="Create a strong password (min. 8 characters)"
              value={formData.password} onChange={handleChange('password')} required
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
            <FormInput
              label="Confirm Password" type={showConfirmPassword ? 'text' : 'password'} icon="lock"
              placeholder="Confirm your password"
              value={formData.confirmPassword} onChange={handleChange('confirmPassword')} required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined text-xl">
                    {showConfirmPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              }
            />
            {/* Password Requirements */}
            {formData.password && (
              <div className="space-y-1.5 px-1">
                {[
                  { label: 'At least 8 characters', met: formData.password.length >= 8 },
                  { label: 'Contains an uppercase letter', met: /[A-Z]/.test(formData.password) },
                  { label: 'Contains a lowercase letter', met: /[a-z]/.test(formData.password) },
                  { label: 'Contains a number', met: /\d/.test(formData.password) },
                  { label: 'Contains a special character', met: /[^A-Za-z0-9]/.test(formData.password) },
                  { label: 'Passwords match', met: formData.confirmPassword && formData.password === formData.confirmPassword },
                ].map((req) => (
                  <div key={req.label} className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-base ${req.met ? 'text-emerald-500' : 'text-neutral-400 dark:text-neutral-600'}`}>
                      {req.met ? 'check_circle' : 'circle'}
                    </span>
                    <span className={`text-xs ${req.met ? 'text-emerald-500' : 'text-neutral-400 dark:text-neutral-600'}`}>
                      {req.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Terms and Conditions */}
            <label className="flex items-start gap-3 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="form-checkbox mt-0.5"
              />
              <span className="text-sm text-neutral-600 dark:text-neutral-400 select-none">
                I agree to the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms and Conditions
                </a>
              </span>
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep(1); setError('') }}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-sm border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-bold text-sm transition-all"
              >
                <span className="material-symbols-outlined text-xl">arrow_back</span>
                Back
              </button>
              <button type="submit" className="btn-primary-full flex-1" disabled={isLoading || !agreedToTerms}>
                <span className="material-symbols-outlined mr-2 text-xl">
                  {isLoading ? 'progress_activity' : 'arrow_forward'}
                </span>
                {isLoading ? 'Sending...' : 'Continue'}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: OTP Verification */}
        {step === 3 && (
          <form onSubmit={handleVerify} className="space-y-5">
            {/* Email hint */}
            <div className="text-center py-2">
              <span className="material-symbols-outlined text-4xl text-primary mb-2 block">mark_email_read</span>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                We sent a code to
              </p>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm mt-0.5 break-all">
                {formData.email}
              </p>
            </div>

            {/* OTP Input */}
            <div>
              <label className="form-label">Verification Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="form-input text-center tracking-[0.5em] text-2xl font-mono"
                required
                autoComplete="one-time-code"
              />
            </div>

            {/* Resend */}
            <div className="text-center">
              {resendTimer > 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Resend code in{' '}
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">{resendTimer}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isLoading}
                  className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Resend Code
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep(2); setError(''); setOtp('') }}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-sm border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-bold text-sm transition-all"
              >
                <span className="material-symbols-outlined text-xl">arrow_back</span>
                Back
              </button>
              <button type="submit" className="btn-primary-full flex-1" disabled={isLoading}>
                <span className="material-symbols-outlined mr-2 text-xl">
                  {isLoading ? 'progress_activity' : 'verified'}
                </span>
                {isLoading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </form>
        )}

        {/* Login Link */}
        <div className="text-center mt-6">
          <p className="text-subheading">
            Have an account?{' '}
            <a href="/login" className="link-dark">Sign in instead</a>
          </p>
        </div>

        {/* Security Badge */}
        <div className="mt-6 flex justify-center">
          <div className="security-badge">
            <span className="material-symbols-outlined">verified_user</span>
            256-bit SSL Encrypted
          </div>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
