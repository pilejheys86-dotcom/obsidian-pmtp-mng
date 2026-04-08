import { Navbar, Footer } from '../../components'
import { useScrollReveal, useStaggerReveal } from '../../lib/useScrollReveal'

const stats = [
  { value: '99.9%', label: 'Uptime SLA' },
  { value: 'RLS', label: 'Row-Level Security' },
  { value: 'BSP', label: 'Compliance Ready' },
  { value: '∞', label: 'Multi-branch Scale' },
]

const values = [
  {
    icon: 'shield',
    title: 'Security First',
    description: 'Bank-grade data isolation with Supabase Row-Level Security. Every tenant\'s data is siloed — no cross-contamination, no shortcuts.',
  },
  {
    icon: 'speed',
    title: 'Operational Efficiency',
    description: 'From appraisal to disbursement in minutes, not hours. Automated overdue detection, one-click renewals, and real-time tracking.',
  },
  {
    icon: 'gavel',
    title: 'Regulatory Compliance',
    description: 'Built with BSP pawnshop regulations in mind. Proper KYC management, audit trails, and notice logs that satisfy compliance.',
  },
]

const AboutPage = () => {
  const headingRef = useScrollReveal({ threshold: 0.1 })
  const missionRef = useScrollReveal()
  const statsRef = useStaggerReveal({ stagger: 100 })
  const valuesRef = useStaggerReveal({ stagger: 150 })

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 transition-colors duration-300 landing-wrapper">
      <Navbar />

      <div className="pt-4 sm:pt-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800">

          {/* Header */}
          <div ref={headingRef} className="px-4 sm:px-6 py-12 sm:py-16 text-center reveal-fade-up">
            <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-6">About</p>
            <h1 className="landing-h2 font-display font-light">
              Built for Philippine Pawnbrokers.
            </h1>
          </div>

          {/* Divider */}
          <div className="relative border-t border-neutral-200 dark:border-neutral-800">
            <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          </div>

          {/* Mission row — split */}
          <div ref={missionRef} className="grid grid-cols-1 lg:grid-cols-2 reveal-fade-up">
            <div className="px-4 sm:px-6 py-8 sm:py-10 flex flex-col justify-center">
              <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">Our Mission</p>
              <h2 className="landing-h2 font-display font-light">
                Modernizing an industry that serves millions.
              </h2>
            </div>
            <div className="border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-8 sm:py-10 flex items-center">
              <div className="space-y-4 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                <p>
                  The Philippine pawnshop industry serves millions of Filipinos who rely on asset-backed lending for their daily needs. Yet most shops still run on paper ledgers, spreadsheets, and disconnected processes.
                </p>
                <p>
                  Obsidian provides a single, integrated platform that handles everything — from customer onboarding and gold appraisal to loan management, auctions, and compliance reporting.
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="relative border-t border-neutral-200 dark:border-neutral-800">
            <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="hidden lg:block absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          </div>

          {/* Stats row */}
          <div ref={statsRef} className="grid grid-cols-2 md:grid-cols-4 reveal-fade-in">
            {stats.map((stat, i) => (
              <div
                key={i}
                data-reveal-child
                className={[
                  'px-4 sm:px-6 py-8 sm:py-10 text-center',
                  i > 0 ? 'border-l border-neutral-200 dark:border-neutral-800' : '',
                  i === 2 ? 'border-t md:border-t-0 border-neutral-200 dark:border-neutral-800' : '',
                  i === 3 ? 'border-t md:border-t-0 border-neutral-200 dark:border-neutral-800' : '',
                ].join(' ')}
              >
                <p className="text-3xl sm:text-4xl font-extrabold mb-2">{stat.value}</p>
                <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="relative border-t border-neutral-200 dark:border-neutral-800">
            <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          </div>

          {/* Values row */}
          <div ref={valuesRef} className="grid grid-cols-1 md:grid-cols-3 reveal-fade-in">
            {values.map((v, i) => (
              <div
                key={i}
                data-reveal-child
                className={[
                  'px-4 sm:px-6 py-8 sm:py-10 space-y-4',
                  i > 0 ? 'border-t md:border-t-0 md:border-l border-neutral-200 dark:border-neutral-800' : '',
                ].join(' ')}
              >
                <div className="w-10 h-10 rounded-sm border border-neutral-200 dark:border-neutral-800 flex items-center justify-center">
                  <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-400" style={{ fontSize: '20px' }}>{v.icon}</span>
                </div>
                <h3 className="text-sm font-bold">{v.title}</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="relative border-t border-neutral-200 dark:border-neutral-800">
            <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          </div>

          {/* CTA row */}
          <div className="px-4 sm:px-6 py-10 sm:py-14 text-center space-y-6">
            <h2 className="landing-h2 font-display font-light">Ready to transform your pawnshop?</h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/register" className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-8 py-4 rounded-sm font-bold transition-colors">
                Get Started
              </a>
              <a href="/pricing" className="border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 px-8 py-4 rounded-sm font-bold transition-colors">
                View Pricing
              </a>
            </div>
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

export default AboutPage
