import { useScrollReveal, useStaggerReveal } from '../lib/useScrollReveal'

const HowItWorks = () => {
  const steps = [
    {
      number: 1,
      title: "Onboarding & Setup",
      description: "Quick and secure registration. Connect your existing accounts and customize your interest rates and lending policies."
    },
    {
      number: 2,
      title: "Asset Valuation",
      description: "Use our integrated appraisal tools to determine accurate market values for jewelry, electronics, and luxury goods."
    },
    {
      number: 3,
      title: "Daily Operations",
      description: "Manage transactions, track payments, and generate compliance reports effortlessly from any device, anywhere."
    }
  ]

  const mockupRef = useScrollReveal()
  const stepsRef = useStaggerReveal({ stagger: 200 })

  return (
    <section className="px-4 sm:px-6 bg-white dark:bg-neutral-950" id="how-it-works">
      <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div ref={mockupRef} className="relative order-2 lg:order-1 reveal-slide-left">
            <div className="bg-neutral-900 dark:bg-neutral-800 landing-card-lg p-5 sm:p-8 shadow-2xl">
              <div className="space-y-8">
                <div className="flex items-center justify-between border-b border-white/10 pb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-white">smartphone</span>
                    </div>
                    <div>
                      <p className="text-white font-bold">Mobile App</p>
                      <p className="text-neutral-500 text-xs">Live Sync Enabled</p>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full landing-label">
                    Secure
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="bg-white/5 p-4 rounded-sm">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs text-neutral-400 font-bold uppercase">Asset Scan</span>
                      <span className="material-symbols-outlined text-neutral-400 text-sm">qr_code_scanner</span>
                    </div>
                    <div className="h-32 bg-neutral-800 dark:bg-neutral-700 rounded-sm flex items-center justify-center border-2 border-dashed border-white/10">
                      <div className="text-center">
                        <span className="material-symbols-outlined text-neutral-400 text-3xl mb-2">center_focus_weak</span>
                        <p className="landing-label text-neutral-500">Scan Item QR Code</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button className="bg-white/10 hover:bg-white/20 p-4 rounded-sm transition-all flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-neutral-300">history</span>
                      <span className="landing-label text-neutral-300">History</span>
                    </button>
                    <button className="bg-white dark:bg-neutral-100 p-4 rounded-sm transition-all flex flex-col items-center gap-2 text-neutral-900">
                      <span className="material-symbols-outlined">add_circle</span>
                      <span className="landing-label">New Loan</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -z-10 top-4 left-4 sm:top-8 sm:left-8 w-full h-full border-2 border-neutral-300 dark:border-neutral-700 landing-card-lg"></div>
          </div>
          <div ref={stepsRef} className="order-1 lg:order-2 space-y-10 reveal-slide-right">
            <div>
              <h2 className="landing-h2 font-display font-light text-neutral-900 dark:text-white mb-6">
                Start Managing Your Shop in 3 Easy Steps
              </h2>
            </div>
            <div className="space-y-8">
              {steps.map((step) => (
                <div key={step.number} className="flex gap-6 group" data-reveal-child>
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-extrabold text-xl shadow-lg">
                    {step.number}
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">{step.title}</h4>
                    <p className="text-neutral-600 dark:text-neutral-400 font-medium">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
