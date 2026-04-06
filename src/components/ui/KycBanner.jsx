const KycBanner = () => {
  const goToKyc = () => {
    window.history.pushState({}, '', '/admin/kyc')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className="w-full bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl shrink-0">warning</span>
        <span className="text-sm text-amber-800 dark:text-amber-200 truncate">
          Your business verification is incomplete. Complete KYC to unlock all features.
        </span>
      </div>
      <button onClick={goToKyc} className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors">
        Complete KYC
      </button>
    </div>
  )
}

export default KycBanner
