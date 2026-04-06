import { useState, useRef, useEffect } from 'react'
import { Logo, ThemeToggle, FormInput } from '../../components/ui'
import { authApi } from '../../lib/api'

const STEP = { EMAIL: 'email', OTP: 'otp', NEW_PASSWORD: 'new_password', DONE: 'done' }

const RecoverAcc = () => {
  const [step, setStep] = useState(STEP.EMAIL)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpRefs = useRef([])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // Auto-focus first OTP input when entering OTP step
  useEffect(() => {
    if (step === STEP.OTP) {
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }
  }, [step])

  // ── Step 1: Send recovery email ──
  const handleSendEmail = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await authApi.recover(email)
      setStep(STEP.OTP)
      setResendCooldown(60)
    } catch (err) {
      setError(err.message || 'Failed to send reset code.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Resend OTP ──
  const handleResend = async () => {
    if (resendCooldown > 0) return
    setError('')
    setIsLoading(true)
    try {
      await authApi.recover(email)
      setOtp(['', '', '', '', '', ''])
      setResendCooldown(60)
    } catch (err) {
      setError(err.message || 'Failed to resend code.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── OTP input handlers ──
  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return
    const updated = [...otp]
    updated[index] = value.slice(-1)
    setOtp(updated)
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const updated = [...otp]
    for (let i = 0; i < 6; i++) {
      updated[i] = pasted[i] || ''
    }
    setOtp(updated)
    const focusIdx = Math.min(pasted.length, 5)
    otpRefs.current[focusIdx]?.focus()
  }

  // ── Step 2: Verify OTP ──
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code.')
      return
    }
    setError('')
    setIsLoading(true)
    try {
      const data = await authApi.verifyOtp(email, code)
      setResetToken(data.resetToken)
      setStep(STEP.NEW_PASSWORD)
    } catch (err) {
      setError(err.message || 'Invalid or expired code.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 3: Set new password ──
  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError('Please meet all password requirements.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setIsLoading(true)
    try {
      await authApi.resetPassword(resetToken, newPassword)
      setStep(STEP.DONE)
    } catch (err) {
      setError(err.message || 'Failed to reset password.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step indicator ──
  const steps = [
    { key: STEP.EMAIL, label: 'Email', icon: 'mail' },
    { key: STEP.OTP, label: 'Verify', icon: 'pin' },
    { key: STEP.NEW_PASSWORD, label: 'Reset', icon: 'lock_reset' },
  ]
  const stepOrder = [STEP.EMAIL, STEP.OTP, STEP.NEW_PASSWORD, STEP.DONE]
  const currentIdx = stepOrder.indexOf(step)

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

      {/* Recovery Card */}
      <div className="card-auth relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        {/* Step indicator (hidden on done) */}
        {step !== STEP.DONE && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {steps.map((s, i) => {
              const sIdx = stepOrder.indexOf(s.key)
              const isActive = sIdx === currentIdx
              const isCompleted = sIdx < currentIdx
              return (
                <div key={s.key} className="flex items-center gap-2">
                  {i > 0 && (
                    <div className={`w-8 h-px ${isCompleted || isActive ? 'bg-primary' : 'bg-neutral-300 dark:bg-neutral-700'}`} />
                  )}
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200
                    ${isActive ? 'bg-primary text-white dark:text-neutral-900 ring-4 ring-primary/20' : ''}
                    ${isCompleted ? 'bg-primary/20 text-primary' : ''}
                    ${!isActive && !isCompleted ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600' : ''}
                  `}>
                    {isCompleted ? (
                      <span className="material-symbols-outlined text-base">check</span>
                    ) : (
                      <span className="material-symbols-outlined text-base">{s.icon}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm mb-5">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* ── STEP: Email ── */}
        {step === STEP.EMAIL && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-heading mb-2">Forgot Password?</h1>
              <p className="text-subheading">
                No worries! Enter your email and we'll send you a verification code.
              </p>
            </div>

            <form onSubmit={handleSendEmail} className="space-y-5">
              <FormInput
                label="Email Address"
                type="email"
                icon="mail"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary-full" disabled={isLoading}>
                <span className="material-symbols-outlined mr-2 text-xl">
                  {isLoading ? 'progress_activity' : 'send'}
                </span>
                {isLoading ? 'Sending...' : 'Send Verification Code'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <a href="/login" className="link-muted inline-flex items-center text-sm">
                <span className="material-symbols-outlined mr-1 text-lg">arrow_back</span>
                Back to Sign In
              </a>
            </div>
          </>
        )}

        {/* ── STEP: OTP ── */}
        {step === STEP.OTP && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-heading mb-2">Enter Verification Code</h1>
              <p className="text-subheading">
                We sent a 6-digit code to <strong className="text-neutral-900 dark:text-white">{email.replace(/^(.{2})(.*)(@.+)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c)}</strong>
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-6">
              {/* OTP Inputs */}
              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => otpRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-text"
                    autoComplete="one-time-code"
                  />
                ))}
              </div>

              <button type="submit" className="btn-primary-full" disabled={isLoading}>
                <span className="material-symbols-outlined mr-2 text-xl">
                  {isLoading ? 'progress_activity' : 'verified'}
                </span>
                {isLoading ? 'Verifying...' : 'Verify Code'}
              </button>

              {/* Change email — ghost button */}
              <button
                type="button"
                onClick={() => { setStep(STEP.EMAIL); setError(''); setOtp(['', '', '', '', '', '']) }}
                className="btn-outline w-full"
              >
                <span className="material-symbols-outlined mr-2 text-xl">mail</span>
                Change Email
              </button>
            </form>

            {/* Resend */}
            <div className="mt-6 text-center">
              <p className="text-subheading">
                Didn't receive the code?{' '}
                {resendCooldown > 0 ? (
                  <span className="text-neutral-400 dark:text-neutral-600">
                    Resend in {resendCooldown}s
                  </span>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={isLoading}
                    className="link-primary text-sm font-semibold cursor-pointer bg-transparent border-none"
                  >
                    Resend Code
                  </button>
                )}
              </p>
            </div>
          </>
        )}

        {/* ── STEP: New Password ── */}
        {step === STEP.NEW_PASSWORD && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-heading mb-2">Set New Password</h1>
              <p className="text-subheading">
                Choose a strong password for your account.
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-5">
              <FormInput
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                icon="lock"
                placeholder="Min. 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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

              <FormInput
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                icon="lock_reset"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              {/* Password Requirements */}
              {newPassword && (
                <div className="space-y-1.5 px-1">
                  {[
                    { label: 'At least 8 characters', met: newPassword.length >= 8 },
                    { label: 'Contains an uppercase letter', met: /[A-Z]/.test(newPassword) },
                    { label: 'Contains a lowercase letter', met: /[a-z]/.test(newPassword) },
                    { label: 'Contains a number', met: /\d/.test(newPassword) },
                    { label: 'Contains a special character', met: /[^A-Za-z0-9]/.test(newPassword) },
                    { label: 'Passwords match', met: confirmPassword && newPassword === confirmPassword },
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

              <button type="submit" className="btn-primary-full" disabled={isLoading}>
                <span className="material-symbols-outlined mr-2 text-xl">
                  {isLoading ? 'progress_activity' : 'lock_reset'}
                </span>
                {isLoading ? 'Updating...' : 'Reset Password'}
              </button>
            </form>
          </>
        )}

        {/* ── STEP: Done ── */}
        {step === STEP.DONE && (
          <div className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-primary text-3xl">check_circle</span>
            </div>
            <h1 className="text-heading mb-2">Password Reset!</h1>
            <p className="text-subheading mb-6">
              Your password has been updated successfully. You can now sign in with your new password.
            </p>
            <a href="/login" className="btn-primary-full inline-flex justify-center">
              <span className="material-symbols-outlined mr-2 text-xl">login</span>
              Sign In
            </a>
          </div>
        )}

        {/* Security Badge */}
        <div className="mt-8 flex justify-center">
          <div className="security-badge">
            <span className="material-symbols-outlined">verified_user</span>
            256-bit SSL Encrypted
          </div>
        </div>
      </div>
    </div>
  )
}

export default RecoverAcc
