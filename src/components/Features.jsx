import { useScrollReveal, useStaggerReveal } from '../lib/useScrollReveal'

const FeatureCard = ({ icon, title, description, highlighted = false }) => {
  if (highlighted) {
    return (
      <div className="group p-5 sm:p-8 landing-card bg-neutral-900 dark:bg-white feature-card-hover shadow-xl">
        <div className="w-12 h-12 rounded-sm bg-white dark:bg-neutral-900 flex items-center justify-center mb-6 sm:mb-12">
          <span className="material-symbols-outlined text-neutral-900 dark:text-white">{icon}</span>
        </div>
        <h3 className="text-xl font-bold mb-4 text-white dark:text-neutral-900">{title}</h3>
        <p className="text-neutral-400 dark:text-neutral-500 text-sm leading-relaxed">{description}</p>
      </div>
    )
  }

  return (
    <div className="group p-5 sm:p-8 landing-card bg-neutral-100 dark:bg-neutral-900 border border-transparent dark:border-neutral-800/60 hover:bg-neutral-900 dark:hover:bg-white hover:border-neutral-900 dark:hover:border-white feature-card-hover transition-colors duration-300">
      <div className="w-12 h-12 rounded-sm bg-neutral-900 dark:bg-white group-hover:bg-white dark:group-hover:bg-neutral-900 flex items-center justify-center mb-6 sm:mb-12 shadow-lg shadow-neutral-900/10 dark:shadow-white/10 transition-colors duration-300">
        <span className="material-symbols-outlined text-white dark:text-neutral-900 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors duration-300">{icon}</span>
      </div>
      <h3 className="text-xl font-bold mb-4 group-hover:text-white dark:group-hover:text-neutral-900 transition-colors duration-300">{title}</h3>
      <p className="text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-400 dark:group-hover:text-neutral-500 text-sm leading-relaxed transition-colors duration-300">{description}</p>
    </div>
  )
}

const Features = () => {
  const features = [
    {
      icon: "speed",
      title: "Automated Loan Processing",
      description: "Complete loan documentation in seconds with auto-filling forms and digital signature integration.",
      highlighted: false
    },
    {
      icon: "inventory_2",
      title: "Real-time Inventory Tracking",
      description: "Track every asset from appraisal to sale with integrated RFID and barcode scanning capabilities.",
      highlighted: true
    },
    {
      icon: "verified_user",
      title: "Secure Vault Management",
      description: "Enterprise-grade security for your physical assets and digital records with multi-factor authentication.",
      highlighted: false
    },
    {
      icon: "insights",
      title: "Advanced Financial Reporting",
      description: "Get instant insights into your revenue, profit margins, and loan performance with custom dashboards.",
      highlighted: false
    }
  ]

  const headingRef = useScrollReveal()
  const cardsRef = useStaggerReveal({ stagger: 150 })

  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6" id="features">
      <div className="max-w-7xl mx-auto">
        <div ref={headingRef} className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16 reveal-fade-up">
          <div className="max-w-2xl">
            <div className="inline-block px-4 py-1.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold mb-6">
              Features
            </div>
            <h2 className="landing-h2 font-display font-light">
              Achieve <span className="underline decoration-2 underline-offset-4 decoration-neutral-300 dark:decoration-neutral-600">operational clarity</span> with tools designed to simplify and secure your management.
            </h2>
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 font-medium">Everything you need, nothing you don&apos;t.</p>
        </div>
        <div ref={cardsRef} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 reveal-fade-in">
          {features.map((feature, index) => (
            <div key={index} data-reveal-child>
              <FeatureCard
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                highlighted={feature.highlighted}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Features
