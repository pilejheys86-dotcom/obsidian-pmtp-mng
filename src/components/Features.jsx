import { useScrollReveal, useStaggerReveal } from '../lib/useScrollReveal'

const features = [
  {
    icon: "speed",
    title: "Automated Loan Processing",
    description: "Complete loan documentation in seconds with auto-filling forms and digital signature integration."
  },
  {
    icon: "inventory_2",
    title: "Real-time Inventory Tracking",
    description: "Track every asset from appraisal to sale with integrated RFID and barcode scanning capabilities."
  },
  {
    icon: "verified_user",
    title: "Secure Vault Management",
    description: "Enterprise-grade security for your physical assets and digital records with multi-factor authentication."
  },
  {
    icon: "insights",
    title: "Advanced Financial Reporting",
    description: "Get instant insights into your revenue, profit margins, and loan performance with custom dashboards."
  }
]

const Features = () => {
  const headingRef = useScrollReveal()
  const gridRef = useStaggerReveal({ stagger: 150 })

  return (
    <section className="px-4 sm:px-6" id="features">
      <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-10 sm:py-16">
        <div ref={headingRef} className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12 sm:mb-16 reveal-fade-up">
          <div className="max-w-2xl">
            <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-neutral-500 dark:text-neutral-400 mb-6 uppercase tracking-widest">Features</p>
            <h2 className="landing-h2 font-display font-light">
              Simplify and secure your management.
            </h2>
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 font-medium">Everything you need, nothing you don&apos;t.</p>
        </div>

        {/* 2x2 Grid */}
        <div ref={gridRef} className="border border-neutral-200 dark:border-neutral-800 rounded-[0.75rem] overflow-hidden reveal-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {features.map((feature, i) => (
              <div
                key={i}
                data-reveal-child
                className={[
                  'p-6 sm:p-8 lg:p-10 group hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors duration-200',
                  i < 2 ? 'border-b border-neutral-200 dark:border-neutral-800' : '',
                  i === 2 ? 'border-b md:border-b-0 border-neutral-200 dark:border-neutral-800' : '',
                  i % 2 === 0 ? 'md:border-r border-neutral-200 dark:border-neutral-800' : '',
                ].join(' ')}
              >
                <div className="w-10 h-10 rounded-sm border border-neutral-200 dark:border-neutral-800 flex items-center justify-center mb-5">
                  <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400 text-xl">{feature.icon}</span>
                </div>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default Features
