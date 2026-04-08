import { Navbar, Footer } from '../../components'
import { useScrollReveal, useStaggerReveal } from '../../lib/useScrollReveal'

const steps = [
  {
    number: '01',
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
    number: '02',
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
    number: '03',
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
    number: '04',
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
    number: '05',
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
    number: '06',
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
  const headingRef = useScrollReveal({ threshold: 0.1 })
  const stepsRef = useStaggerReveal({ stagger: 150 })

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 transition-colors duration-300 landing-wrapper">
      <Navbar />

      {/* Header — no side borders */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
        <div ref={headingRef} className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center reveal-fade-up">
          <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-6">How It Works</p>
          <h1 className="landing-h2 font-display font-light">
            From signup to operations in one afternoon.
          </h1>
        </div>
      </div>

      <div className="px-4 sm:px-6">
        <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800">

          {/* Divider */}
          <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

          {/* Steps — 2-column pairs */}
          <div ref={stepsRef} className="reveal-fade-in">
            {steps.map((step, i) => (
              <div key={step.number}>
                <div
                  data-reveal-child
                  className={[
                    'grid grid-cols-1 lg:grid-cols-2',
                    i > 0 ? 'border-t border-neutral-200 dark:border-neutral-800' : '',
                  ].join(' ')}
                >
                  {/* Left — number + title */}
                  <div className="px-4 sm:px-6 py-8 sm:py-10 space-y-4">
                    <p className="font-[family-name:var(--font-mono)] text-3xl font-bold text-neutral-200 dark:text-neutral-700">{step.number}</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-sm border border-neutral-200 dark:border-neutral-800 flex items-center justify-center">
                        <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400" style={{ fontSize: '20px' }}>{step.icon}</span>
                      </div>
                      <h3 className="text-lg font-bold">{step.title}</h3>
                    </div>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">{step.description}</p>
                  </div>

                  {/* Right — details checklist */}
                  <div className="border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-8 sm:py-10 flex items-center">
                    <ul className="space-y-3">
                      {step.details.map((d, j) => (
                        <li key={j} className="flex items-start gap-3 text-sm">
                          <span className="material-symbols-outlined text-neutral-900 dark:text-white text-base mt-0.5 flex-shrink-0">check</span>
                          <span className="text-neutral-600 dark:text-neutral-400">{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="relative border-t border-neutral-200 dark:border-neutral-800">
            <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          </div>

          {/* CTA */}
          <div className="px-4 sm:px-6 py-10 sm:py-14 text-center space-y-6">
            <h2 className="landing-h2 font-display font-light">Ready to get started?</h2>
            <a href="/register" className="inline-block bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-8 py-4 rounded-sm font-bold transition-colors">
              Get Started
            </a>
          </div>

          {/* Bottom border */}
          <div className="relative border-t border-neutral-200 dark:border-neutral-800 landing-border-extend">
            <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          </div>

        </div>
      </div>

      <Footer />
    </div>
  )
}

export default ProcessPage
