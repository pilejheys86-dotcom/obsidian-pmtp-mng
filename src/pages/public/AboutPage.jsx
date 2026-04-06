import { Navbar, Footer } from '../../components'
import { useScrollReveal, useStaggerReveal } from '../../lib/useScrollReveal'

const stats = [
  { value: '99.9%', label: 'Uptime SLA', icon: 'cloud_done' },
  { value: 'RLS', label: 'Row-Level Security', icon: 'lock' },
  { value: 'BSP', label: 'Compliance Ready', icon: 'verified' },
  { value: '∞', label: 'Multi-branch Scale', icon: 'lan' },
]

const values = [
  {
    icon: 'shield',
    title: 'Security First',
    description: 'Bank-grade data isolation with Supabase Row-Level Security. Every tenant\'s data is siloed — no cross-contamination, no shortcuts. JWT authentication and encrypted connections protect every request.',
  },
  {
    icon: 'speed',
    title: 'Operational Efficiency',
    description: 'From appraisal to disbursement in minutes, not hours. Automated overdue detection, one-click renewals, and real-time inventory tracking eliminate manual work and reduce human error.',
  },
  {
    icon: 'gavel',
    title: 'Regulatory Compliance',
    description: 'Built with BSP pawnshop regulations in mind. Proper KYC document management, audit trails for every transaction, and notice logs that satisfy compliance requirements.',
  },
]

const AboutPage = () => {
  const heroRef = useScrollReveal({ threshold: 0.1 })
  const missionRef = useScrollReveal()
  const statsRef = useStaggerReveal({ stagger: 100 })
  const valuesRef = useStaggerReveal({ stagger: 150 })

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark transition-colors duration-300">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div ref={heroRef} className="max-w-3xl mx-auto text-center reveal-fade-up">
          <div className="inline-block px-4 py-1.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold mb-6">
            About
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-light leading-tight mb-6">
            Built for Philippine Pawnbrokers
          </h1>
          <p className="text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
            Obsidian is the management information system that the Philippine pawnshop industry has been waiting for — modern, secure, and purpose-built.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 px-6">
        <div ref={missionRef} className="max-w-3xl mx-auto reveal-fade-up">
          <div className="bg-stone-100 dark:bg-neutral-900 landing-card p-10 md:p-14">
            <h2 className="text-2xl font-display font-light mb-6">Our Mission</h2>
            <div className="space-y-4 text-neutral-600 dark:text-neutral-400 leading-relaxed">
              <p>
                The Philippine pawnshop industry serves millions of Filipinos who rely on asset-backed lending for their daily needs. Yet most shops still run on paper ledgers, spreadsheets, and disconnected processes.
              </p>
              <p>
                Obsidian exists to change that. We provide a single, integrated platform that handles everything — from customer onboarding and gold appraisal to loan management, auctions, and compliance reporting — so pawnshop owners can focus on serving their communities instead of fighting their tools.
              </p>
              <p>
                Every feature is designed with Philippine regulations, workflows, and business realities in mind. Multi-tenant architecture means each shop gets its own secure environment, while our cloud infrastructure ensures your data is always available, always backed up, and always yours.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6">
        <div ref={statsRef} className="max-w-4xl mx-auto reveal-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <div key={i} className="text-center p-6 bg-neutral-900 dark:bg-white landing-card" data-reveal-child>
                <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 text-2xl mb-3 block">{stat.icon}</span>
                <p className="text-3xl font-extrabold text-white dark:text-neutral-900 mb-1">{stat.value}</p>
                <p className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-6 bg-stone-100 dark:bg-neutral-900">
        <div className="max-w-5xl mx-auto">
          <h2 ref={useScrollReveal()} className="text-3xl font-display font-light text-center mb-12 reveal-fade-up">
            What we stand for
          </h2>
          <div ref={valuesRef} className="grid md:grid-cols-3 gap-8 reveal-fade-in">
            {values.map((v, i) => (
              <div key={i} className="bg-white dark:bg-neutral-800 landing-card p-8 border border-neutral-200 dark:border-neutral-700" data-reveal-child>
                <div className="w-12 h-12 rounded-sm bg-neutral-900 dark:bg-white flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-white dark:text-neutral-900">{v.icon}</span>
                </div>
                <h3 className="text-xl font-bold mb-3">{v.title}</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-display font-light mb-4">Ready to transform your pawnshop?</h2>
          <p className="text-neutral-500 dark:text-neutral-400 mb-8">
            Join the next generation of Philippine pawnbrokers running on Obsidian.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/register" className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-10 py-4 rounded-sm font-bold text-lg transition-all transform hover:scale-105">
              Get Started Free
            </a>
            <a href="/pricing" className="bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 px-10 py-4 rounded-sm font-bold text-lg transition-all">
              View Pricing
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default AboutPage
