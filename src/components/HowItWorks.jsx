import { useScrollReveal, useStaggerReveal } from '../lib/useScrollReveal'

const steps = [
  {
    number: "01",
    title: "Onboarding & Setup",
    description: "Quick and secure registration. Connect your existing accounts and customize your interest rates and lending policies."
  },
  {
    number: "02",
    title: "Asset Valuation",
    description: "Use our integrated appraisal tools to determine accurate market values for jewelry, electronics, and luxury goods."
  },
  {
    number: "03",
    title: "Daily Operations",
    description: "Manage transactions, track payments, and generate compliance reports effortlessly from any device, anywhere."
  }
]

const HowItWorks = () => {
  const headingRef = useScrollReveal()
  const stepsRef = useStaggerReveal({ stagger: 150 })

  return (
    <section className="px-4 sm:px-6 bg-white dark:bg-neutral-950" id="how-it-works">
      <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800">

        {/* Header row */}
        <div ref={headingRef} className="grid grid-cols-1 lg:grid-cols-2 reveal-fade-up">
          <div className="px-4 sm:px-6 py-8 sm:py-10">
            <h2 className="landing-h2 font-display font-light">
              Start managing your shop in 3 easy steps.
            </h2>
          </div>
          <div className="border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-8 sm:py-10 flex items-start lg:items-end">
            <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">How It Works</p>
          </div>
        </div>

        {/* Divider */}
        <div className="relative border-t border-neutral-200 dark:border-neutral-800">
          <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          <div className="hidden lg:block absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
        </div>

        {/* Steps grid */}
        <div ref={stepsRef} className="grid grid-cols-1 md:grid-cols-3 reveal-fade-in">
          {steps.map((step, i) => (
            <div
              key={step.number}
              data-reveal-child
              className={[
                'px-4 sm:px-6 py-10 sm:py-14 space-y-4',
                i > 0 ? 'border-t md:border-t-0 md:border-l border-neutral-200 dark:border-neutral-800' : ''
              ].join(' ')}
            >
              <p className="font-[family-name:var(--font-mono)] text-3xl font-bold text-neutral-200 dark:text-neutral-700">{step.number}</p>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{step.title}</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}

export default HowItWorks
