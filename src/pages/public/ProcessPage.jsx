import { Navbar, Footer } from '../../components'
import { useScrollReveal, useStaggerReveal } from '../../lib/useScrollReveal'

const steps = [
  {
    number: 1,
    icon: 'app_registration',
    title: 'Register Your Business',
    description: 'Create your Obsidian account and set up your pawnshop tenant in minutes.',
    details: [
      'BSP registration number verification',
      'Business profile and branding setup',
      'Primary branch configuration',
    ],
  },
  {
    number: 2,
    icon: 'tune',
    title: 'Configure Your Shop',
    description: 'Customize every aspect of your lending operations to match your policies.',
    details: [
      'Set interest rates and penalty terms',
      'Define grace periods and loan-to-value ratios',
      'Configure gold karat rates by effective date',
    ],
  },
  {
    number: 3,
    icon: 'group_add',
    title: 'Add Your Team',
    description: 'Invite employees with role-based access so everyone sees only what they need.',
    details: [
      'Roles: Manager, Appraiser, Cashier, Auditor',
      'Branch-level access control',
      'Email invitations with secure onboarding',
    ],
  },
  {
    number: 4,
    icon: 'person_add',
    title: 'Onboard Customers',
    description: 'Build complete customer profiles with integrated KYC verification.',
    details: [
      'Multi-step customer registration',
      'Government ID capture and validation',
      'Automated risk rating assessment',
    ],
  },
  {
    number: 5,
    icon: 'receipt_long',
    title: 'Process Loans',
    description: 'From appraisal to disbursement in a single streamlined workflow.',
    details: [
      'Gold and item appraisal calculator',
      'Automated pawn ticket generation',
      'Renewal, redemption, and partial payments',
    ],
  },
  {
    number: 6,
    icon: 'monitoring',
    title: 'Track & Report',
    description: 'Real-time visibility into every aspect of your operations.',
    details: [
      'Dashboard KPIs and loan activity charts',
      'Overdue detection and automated notices',
      'Auction management and disposition tracking',
    ],
  },
]

const ProcessPage = () => {
  const heroRef = useScrollReveal({ threshold: 0.1 })
  const timelineRef = useStaggerReveal({ stagger: 150 })

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark transition-colors duration-300">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div ref={heroRef} className="max-w-3xl mx-auto text-center reveal-fade-up">
          <div className="inline-block px-4 py-1.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold mb-6">
            How It Works
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-light leading-tight mb-6">
            From signup to operations in one afternoon
          </h1>
          <p className="text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
            Obsidian is designed to get your pawnshop digitized fast. Six steps, no consultants, no waiting.
          </p>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 px-6">
        <div ref={timelineRef} className="max-w-4xl mx-auto reveal-fade-in">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-neutral-200 dark:bg-neutral-800 -translate-x-1/2 hidden md:block" />
            <div className="absolute left-6 top-0 bottom-0 w-px bg-neutral-200 dark:bg-neutral-800 md:hidden" />

            <div className="space-y-12 md:space-y-16">
              {steps.map((step, i) => {
                const isLeft = i % 2 === 0
                return (
                  <div key={step.number} className="relative" data-reveal-child>
                    {/* Desktop: alternating layout */}
                    <div className={`hidden md:grid md:grid-cols-2 md:gap-12 items-start ${isLeft ? '' : 'direction-rtl'}`}>
                      <div className={`${isLeft ? 'text-right pr-12' : 'text-left pl-12 col-start-2'}`}>
                        <div className={`flex items-center gap-3 mb-3 ${isLeft ? 'justify-end' : 'justify-start'}`}>
                          <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500">{step.icon}</span>
                          <span className="landing-label text-neutral-400">Step {step.number}</span>
                        </div>
                        <h3 className="text-2xl font-display font-light mb-3">{step.title}</h3>
                        <p className="text-neutral-500 dark:text-neutral-400 mb-4">{step.description}</p>
                        <ul className="space-y-2">
                          {step.details.map((d, j) => (
                            <li key={j} className={`text-sm text-neutral-500 dark:text-neutral-400 flex items-center gap-2 ${isLeft ? 'justify-end' : ''}`}>
                              {isLeft && <span>{d}</span>}
                              <span className="material-symbols-outlined text-neutral-900 dark:text-white text-sm">check</span>
                              {!isLeft && <span>{d}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {isLeft && <div />}
                    </div>

                    {/* Mobile: single column */}
                    <div className="md:hidden pl-14">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500">{step.icon}</span>
                        <span className="landing-label text-neutral-400">Step {step.number}</span>
                      </div>
                      <h3 className="text-xl font-display font-light mb-2">{step.title}</h3>
                      <p className="text-neutral-500 dark:text-neutral-400 mb-3">{step.description}</p>
                      <ul className="space-y-2">
                        {step.details.map((d, j) => (
                          <li key={j} className="text-sm text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                            <span className="material-symbols-outlined text-neutral-900 dark:text-white text-sm">check</span>
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Step number circle */}
                    <div className="absolute left-6 md:left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-extrabold text-lg shadow-lg z-10">
                      {step.number}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-display font-light mb-4">Ready to get started?</h2>
          <p className="text-neutral-500 dark:text-neutral-400 mb-8">Set up your pawnshop on Obsidian today. No credit card required for the 14-day trial.</p>
          <a href="/register" className="inline-block bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-10 py-4 rounded-sm font-bold text-lg transition-all transform hover:scale-105">
            Start Free Trial
          </a>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default ProcessPage
