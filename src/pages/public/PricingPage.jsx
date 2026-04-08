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
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full py-5 flex items-center justify-between text-left group"
      >
        <span className="font-bold text-sm pr-4">{question}</span>
        <span className={`material-symbols-outlined text-neutral-400 transition-transform duration-300 flex-shrink-0 ${open ? 'rotate-45' : ''}`}>
          add
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-40 pb-5' : 'max-h-0'}`}>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">{answer}</p>
      </div>
    </div>
  )
}

const PricingPage = () => {
  const heroRef = useScrollReveal({ threshold: 0.1 })
  const cardRef = useScrollReveal()
  const faqRef = useStaggerReveal({ stagger: 100 })

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark transition-colors duration-300">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-8 px-6">
        <div ref={heroRef} className="max-w-3xl mx-auto text-center reveal-fade-up">
          <div className="inline-block px-4 py-1.5 rounded-sm bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold mb-6">
            Pricing
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-light leading-tight mb-6">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-neutral-500 dark:text-neutral-400 max-w-xl mx-auto">
            One plan, everything included. No hidden fees, no feature gates.
          </p>
        </div>
      </section>

      {/* Pricing Card */}
      <section className="py-16 px-6">
        <div ref={cardRef} className="max-w-lg mx-auto reveal-scale">
          <div className="bg-neutral-900 dark:bg-white landing-card p-10 text-center">
            <p className="text-neutral-400 dark:text-neutral-500 font-bold text-sm mb-2">Professional Plan</p>
            <div className="flex items-baseline justify-center gap-1 mb-2">
              <span className="text-5xl font-extrabold text-white dark:text-neutral-900">₱1,500</span>
              <span className="text-neutral-400 dark:text-neutral-500 font-medium">/mo</span>
            </div>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-8">per tenant &middot; billed monthly</p>

            <ul className="space-y-3 text-left mb-10">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="material-symbols-outlined text-emerald-400 text-base mt-0.5 flex-shrink-0">check_circle</span>
                  <span className="text-neutral-300 dark:text-neutral-600">{f}</span>
                </li>
              ))}
            </ul>

            <a href="/register" className="block w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 py-4 rounded-sm font-bold text-lg transition-all transform hover:scale-[1.02]">
              Start 14-day Free Trial
            </a>
            <p className="text-neutral-500 text-xs mt-4">No credit card required</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 ref={useScrollReveal()} className="text-3xl font-display font-light text-center mb-12 reveal-fade-up">
            Frequently asked questions
          </h2>
          <div ref={faqRef} className="reveal-fade-in">
            {faqs.map((faq, i) => (
              <div key={i} data-reveal-child>
                <FAQItem question={faq.question} answer={faq.answer} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-stone-100 dark:bg-neutral-900">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-display font-light mb-4">Still have questions?</h2>
          <p className="text-neutral-500 dark:text-neutral-400 mb-8">Our team is happy to walk you through Obsidian and answer anything.</p>
          <a href="mailto:support@obsidian.com" className="inline-block bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-10 py-4 rounded-sm font-bold transition-all transform hover:scale-105">
            Talk to Us
          </a>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default PricingPage
