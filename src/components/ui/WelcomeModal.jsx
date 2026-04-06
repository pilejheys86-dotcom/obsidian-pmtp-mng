import { useState, useEffect } from 'react'

const STORAGE_KEY = 'obsidian_welcome_shown'

const WelcomeModal = ({ kycStatus }) => {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (kycStatus === 'PENDING' && !localStorage.getItem(STORAGE_KEY)) {
      setShow(true)
    }
  }, [kycStatus])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setShow(false)
  }

  const goToKyc = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setShow(false)
    window.history.pushState({}, '', '/admin/kyc')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-8">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-3xl">verified</span>
          </div>
        </div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 text-center mb-2">
          Welcome to Obsidian!
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-8">
          Complete your business verification to unlock pawn operations, customer management, and more.
        </p>
        <div className="flex flex-col gap-3">
          <button onClick={goToKyc} className="btn-primary-full">
            <span className="material-symbols-outlined mr-2 text-xl">verified_user</span>
            Complete Now
          </button>
          <button onClick={dismiss} className="w-full py-2.5 text-sm font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
            I'll do this later
          </button>
        </div>
      </div>
    </div>
  )
}

export default WelcomeModal
