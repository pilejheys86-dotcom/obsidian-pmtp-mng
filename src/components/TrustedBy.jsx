import { useStaggerReveal } from '../lib/useScrollReveal'

const TrustedBy = () => {
  const ref = useStaggerReveal({ stagger: 120 })

  return (
    <section className="py-10 sm:py-16 border-y border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <p className="text-center text-xs font-bold text-neutral-500 uppercase tracking-widest mb-8 sm:mb-10">
          Trusted by modern lending institutions
        </p>
        <div ref={ref} className="flex flex-wrap justify-center items-center gap-8 sm:gap-12 md:gap-20 opacity-60 dark:opacity-40 grayscale hover:grayscale-0 transition-all reveal-fade-in">
          <div className="flex items-center gap-2 text-xl sm:text-2xl font-bold font-display" data-reveal-child>
            <span className="material-symbols-outlined text-neutral-700 dark:text-neutral-300">security</span> SHIELD
          </div>
          <div className="flex items-center gap-2 text-xl sm:text-2xl font-bold font-display" data-reveal-child>
            <span className="material-symbols-outlined text-neutral-700 dark:text-neutral-300">savings</span> VAULT
          </div>
          <div className="flex items-center gap-2 text-xl sm:text-2xl font-bold font-display" data-reveal-child>
            <span className="material-symbols-outlined text-neutral-700 dark:text-neutral-300">account_balance</span> RESERVE
          </div>
          <div className="flex items-center gap-2 text-xl sm:text-2xl font-bold font-display" data-reveal-child>
            <span className="material-symbols-outlined text-neutral-700 dark:text-neutral-300">bolt</span> FLASH
          </div>
        </div>
      </div>
    </section>
  )
}

export default TrustedBy
