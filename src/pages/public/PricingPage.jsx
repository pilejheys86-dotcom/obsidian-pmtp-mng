import { Navbar, Footer } from '../../components'
import { useScrollReveal, useStaggerReveal } from '../../lib/useScrollReveal'
import { useState } from 'react'

const features = [
  'Unlimited users and employees',
  'All modules included (Loans, Inventory, Appraisals, Auctions)',
  'Multi-branch management',
  'Customer KYC and risk profiling',
  'Automated overdue detection and notices',
  'Dashboard analytics and reports',
  'Email notifications via SMTP',
  'Gold rate and loan settings configuration',
  'Role-based access control (6 roles)',
  'Priority support',
]

const faqs = [
  {
    question: 'What happens after the 14-day trial?',
    answer: 'Your account continues with full access. We\'ll send a reminder before the trial ends. If you choose not to subscribe, your data is preserved for 30 days so you can pick up where you left off.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes. There are no long-term contracts. Cancel from your account settings at any time and your subscription stops at the end of the current billing period.',
  },
  {
    question: 'Do you offer custom enterprise plans?',
    answer: 'For pawnshop networks with 10+ branches, we offer volume pricing and dedicated onboarding. Contact us at support@obsidian.com to discuss your needs.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Obsidian runs on Supabase with PostgreSQL and Row-Level Security. Every tenant\'s data is completely isolated. All connections are encrypted via TLS, and we never share your data with third parties.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept GCash, PayMaya, bank transfer, and all major credit/debit cards. Invoices are generated automatically each billing cycle.',
  },
]

const FAQItem = ({ question, answer }) => {
  const [open, setOpen] = useState(false)

  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left"
    >
      <div className="py-5 flex items-center justify-between">
        <span className="font-bold text-sm pr-4">{question}</span>
        <span className={`material-symbols-outlined text-neutral-400 transition-transform duration-300 flex-shrink-0 ${open ? 'rotate-45' : ''}`}>
          add
        </span>
      </div>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-40 pb-5' : 'max-h-0'}`}>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">{answer}</p>
      </div>
    </button>
  )
}

const PricingPage = () => {
  const headingRef = useScrollReveal({ threshold: 0.1 })
  const cardRef = useScrollReveal()
  const faqRef = useStaggerReveal({ stagger: 100 })

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 transition-colors duration-300 landing-wrapper">
      <Navbar />

      {/* Header — no side borders */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
        <div ref={headingRef} className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center reveal-fade-up">
          <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-6">Pricing</p>
          <h1 className="landing-h2 font-display font-light">
            Simple, transparent pricing.
          </h1>
        </div>
      </div>

      <div className="px-4 sm:px-6">
        <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800">

          {/* Divider */}
          <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

          {/* Plan row — split */}
          <div ref={cardRef} className="grid grid-cols-1 lg:grid-cols-2 reveal-scale">
            {/* Left — plan + price + CTA */}
            <div className="px-4 sm:px-6 py-8 sm:py-10 flex flex-col items-center justify-center text-center space-y-6">
              <div className="inline-block px-4 py-1.5 rounded-sm border border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 text-xs font-bold uppercase tracking-widest">
                Professional Plan
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl sm:text-6xl font-extrabold">&#8369;1,500</span>
                <span className="text-lg text-neutral-500">/mo</span>
              </div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Per tenant. Everything included. No feature gates.</p>
              <a className="inline-block bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-8 py-4 rounded-sm font-bold transition-colors" href="/register">
                Get Started Now
              </a>
            </div>

            {/* Right — feature list */}
            <div className="border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-8 sm:py-10">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-6">What's included</p>
              <ul className="space-y-3">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="material-symbols-outlined text-neutral-900 dark:text-white text-base mt-0.5 flex-shrink-0">check</span>
                    <span className="text-neutral-600 dark:text-neutral-400">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className="relative border-t border-neutral-200 dark:border-neutral-800">
            <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="hidden lg:block absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          </div>

          {/* FAQ */}
          <div ref={faqRef} className="grid grid-cols-1 lg:grid-cols-2 reveal-fade-in">
            <div className="px-4 sm:px-6 py-8 sm:py-10 flex flex-col items-center justify-center text-center">
              <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">FAQ</p>
              <h2 className="landing-h2 font-display font-light">
                Common questions.
              </h2>
            </div>
            <div className="border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-4 sm:py-6 divide-y divide-neutral-200 dark:divide-neutral-800">
              {faqs.map((faq, i) => (
                <div key={i} data-reveal-child>
                  <FAQItem question={faq.question} answer={faq.answer} />
                </div>
              ))}
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

export default PricingPage
