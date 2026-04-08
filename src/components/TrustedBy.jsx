import { useScrollReveal } from '../lib/useScrollReveal'

const brands = [
  { icon: 'security', name: 'SHIELD' },
  { icon: 'savings', name: 'VAULT' },
  { icon: 'account_balance', name: 'RESERVE' },
  { icon: 'bolt', name: 'FLASH' },
  { icon: 'hub', name: 'MERIDIAN' },
  { icon: 'trending_up', name: 'APEX' },
  { icon: 'shield', name: 'CREST' },
  { icon: 'diamond', name: 'PINNACLE' },
]

const TrustedBy = () => {
  const headingRef = useScrollReveal()

  return (
    <section className="px-4 sm:px-6 bg-white dark:bg-neutral-950">
      <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800">
        <div className="grid grid-cols-1 lg:grid-cols-2">

          {/* Left — single-column scrolling brand ticker */}
          <div className="px-4 sm:px-6 py-8 sm:py-10 flex items-center justify-center">
            <div className="trusted-single-ticker">
              {[...brands, ...brands].map((b, i) => (
                <div key={i} className="trusted-single-item flex items-center justify-center gap-4">
                  <span className="material-symbols-outlined text-neutral-500 dark:text-neutral-600" style={{ fontSize: '36px' }}>{b.icon}</span>
                  <span className="text-3xl sm:text-4xl font-bold font-display text-neutral-600 dark:text-neutral-400 uppercase tracking-widest">{b.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — heading */}
          <div ref={headingRef} className="border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-8 sm:py-10 flex items-center reveal-fade-up">
            <h2 className="landing-h2 font-display font-light">
              Powering the next generation of pawnshop management.
            </h2>
          </div>

        </div>
      </div>
    </section>
  )
}

export default TrustedBy
