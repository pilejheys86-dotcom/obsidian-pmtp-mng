import { useState, useEffect } from 'react'
import { Navbar, Footer } from '../../components'
import { useScrollReveal } from '../../lib/useScrollReveal'

const sections = [
  { id: 'definitions', number: '01', title: 'Definitions' },
  { id: 'acceptance', number: '02', title: 'Acceptance of Terms' },
  { id: 'registration', number: '03', title: 'Account Registration & Responsibilities' },
  { id: 'subscription', number: '04', title: 'Subscription & Payment Terms' },
  { id: 'acceptable-use', number: '05', title: 'Acceptable Use Policy' },
  { id: 'data-privacy', number: '06', title: 'Data Privacy & Protection' },
  { id: 'intellectual-property', number: '07', title: 'Intellectual Property' },
  { id: 'suspension', number: '08', title: 'Grounds for Suspension' },
  { id: 'deactivation', number: '09', title: 'Grounds for Deactivation' },
  { id: 'dispute', number: '10', title: 'Dispute Resolution' },
  { id: 'liability', number: '11', title: 'Limitation of Liability' },
  { id: 'governing-law', number: '12', title: 'Governing Law' },
  { id: 'amendments', number: '13', title: 'Amendments & Contact' },
]

const SectionHeading = ({ id, number, title }) => (
  <div className="mb-6" id={id}>
    <p className="font-[family-name:var(--font-mono)] text-2xl sm:text-3xl font-bold text-neutral-200 dark:text-neutral-800 mb-2 scroll-mt-6">{number}</p>
    <h2 className="text-lg font-bold">{title}</h2>
  </div>
)

const Paragraph = ({ children }) => (
  <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4">{children}</p>
)

const BulletList = ({ items }) => (
  <ul className="space-y-2.5 mb-5">
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-3 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
        <span className="w-1 h-1 rounded-full bg-neutral-400 dark:bg-neutral-600 mt-2 shrink-0"></span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
)

const CategoryBlock = ({ label, items }) => (
  <div className="mb-5 pl-4 border-l-2 border-neutral-200 dark:border-neutral-800">
    <p className="text-xs font-bold uppercase tracking-widest text-neutral-900 dark:text-white mb-2">{label}</p>
    <BulletList items={items} />
  </div>
)

const EFFECTIVE_DATE = 'March 30, 2026'

const TermsContent = () => {
  const headingRef = useScrollReveal({ threshold: 0.1 })
  const contentRef = useScrollReveal({ threshold: 0.05 })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const [activeSection, setActiveSection] = useState(sections[0].id)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-10% 0px -80% 0px' }
    )
    const headings = document.querySelectorAll('[id]')
    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {/* Hero — no side borders */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
        <div ref={headingRef} className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center reveal-fade-up">
          <div className="inline-block px-4 py-1.5 rounded-sm bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-[family-name:var(--font-mono)] font-bold uppercase tracking-widest mb-6">
            Legal
          </div>
          <h1 className="landing-h1 font-display font-light mb-4">
            Terms and Conditions
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Effective {EFFECTIVE_DATE}
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-6">
        <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800">

          {/* Top divider */}
          <div className="relative border-t border-neutral-200 dark:border-neutral-800 landing-border-extend">
            <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          </div>

          {/* Sidebar + Content */}
          <div ref={contentRef} className="flex reveal-fade-up">

            {/* Desktop sticky sidebar */}
            <aside aria-label="Section navigation" className="hidden lg:block w-64 flex-shrink-0">
              <div className="sticky top-0 py-8 px-5">
                <p className="font-[family-name:var(--font-mono)] text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-5">
                  On this page
                </p>
                <nav className="space-y-0.5">
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className={`flex items-center gap-2.5 text-sm py-1.5 pl-3 border-l-2 transition-colors ${
                        activeSection === s.id
                          ? 'border-neutral-900 dark:border-white font-bold text-neutral-900 dark:text-white'
                          : 'border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                      }`}
                    >
                      <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-neutral-300 dark:text-neutral-700">{s.number}</span>
                      <span className="truncate">{s.title}</span>
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Content */}
            <div className="flex-1 min-w-0 lg:border-l border-neutral-200 dark:border-neutral-800">

              {/* 1. Definitions */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="definitions" number="01" title="Definitions" />
                <BulletList items={[
                  <><strong>"Platform"</strong> refers to the Obsidian Pawnshop Management Information System, including all web applications, APIs, and related services.</>,
                  <><strong>"Tenant"</strong> refers to a registered pawnshop business entity using the Platform.</>,
                  <><strong>"User"</strong> refers to any individual with login credentials under a Tenant account, including Owners, Managers, Appraisers, Auditors, and Cashiers.</>,
                  <><strong>"Services"</strong> refers to all SaaS features provided by the Platform, including but not limited to loan management, appraisals, inventory tracking, reporting, and customer management.</>,
                  <><strong>"Subscription"</strong> refers to a paid plan granting access to the Platform and its Services.</>,
                  <><strong>"BSP"</strong> refers to the Bangko Sentral ng Pilipinas, the central monetary authority of the Republic of the Philippines.</>,
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 2. Acceptance of Terms */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="acceptance" number="02" title="Acceptance of Terms" />
                <Paragraph>
                  By creating an account, accessing, or using the Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions. If you do not agree, you must not use the Platform.
                </Paragraph>
                <BulletList items={[
                  'You must be at least eighteen (18) years of age to register an account.',
                  'You must hold a valid BSP pawnshop license, or be in the process of obtaining one, to operate as a Tenant.',
                  'Continued use of the Platform after any amendments to these Terms constitutes acceptance of the revised Terms.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 3. Account Registration & Responsibilities */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="registration" number="03" title="Account Registration & Responsibilities" />
                <Paragraph>
                  As a registered Tenant, you are responsible for the accuracy and security of your account.
                </Paragraph>
                <BulletList items={[
                  'You must provide accurate, complete, and current business and personal information during registration.',
                  'You are responsible for maintaining the confidentiality of all login credentials, passwords, and API keys associated with your account.',
                  'You must comply with all KYC (Know Your Customer) verification requirements as prompted by the Platform.',
                  'Only one Tenant account is permitted per business entity. Duplicate registrations are prohibited.',
                  'You must keep your BSP registration number and TIN (Tax Identification Number) up to date in your account settings.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 4. Subscription & Payment Terms */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="subscription" number="04" title="Subscription & Payment Terms" />
                <Paragraph>
                  Access to the Platform requires an active Subscription. The following terms govern billing and payments.
                </Paragraph>
                <BulletList items={[
                  'Three Subscription plans are available: Starter (PHP 1,499/month), Professional (PHP 2,999/month), and Enterprise (PHP 4,999/month). Yearly billing is available at a discounted rate.',
                  'Payments are processed through PayMongo. Accepted payment methods include GCash, GrabPay, PayMaya, and credit/debit cards.',
                  'Subscriptions auto-renew at the end of each billing cycle unless cancelled before the renewal date.',
                  'A seven (7) day grace period is provided for overdue payments. After this period, Platform access may be restricted.',
                  'No refunds are issued for partial billing periods or unused time on a cancelled Subscription.',
                  'The Platform reserves the right to modify pricing with thirty (30) days advance written notice to all Tenants.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 5. Acceptable Use Policy */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="acceptable-use" number="05" title="Acceptable Use Policy" />
                <Paragraph>
                  Tenants and their Users shall not engage in any of the following prohibited activities:
                </Paragraph>
                <BulletList items={[
                  'Using the Platform for any unlawful purpose or in violation of any applicable local, national, or international law.',
                  'Attempting to access, modify, or interfere with other Tenants\' data or bypassing the Platform\'s data isolation mechanisms.',
                  'Scraping, crawling, or programmatically extracting data from the Platform without express written authorization.',
                  'Reverse engineering, decompiling, disassembling, or otherwise attempting to derive the source code of the Platform.',
                  'Using the subdomain showcase feature to publish inappropriate, misleading, defamatory, or offensive content.',
                  'Exceeding reasonable usage limits or engaging in activities that degrade Platform performance for other Tenants.',
                  'Reselling, sublicensing, or sharing Platform access with unauthorized third parties.',
                  'Uploading malicious files, scripts, or content that could compromise Platform security or integrity.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 6. Data Privacy & Protection */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="data-privacy" number="06" title="Data Privacy & Protection" />
                <Paragraph>
                  The Platform is committed to protecting your data in compliance with Philippine data privacy laws.
                </Paragraph>
                <BulletList items={[
                  'The Platform complies with Republic Act No. 10173 (Data Privacy Act of 2012) and its Implementing Rules and Regulations.',
                  'All Tenant data is isolated using Row-Level Security (RLS). No cross-tenant data access is possible through the Platform.',
                  'All data is transmitted over 256-bit SSL/TLS encryption.',
                  'Tenants are responsible for their own National Privacy Commission (NPC) registration obligations as personal information controllers.',
                  'The Platform retains Tenant data for the duration of the active Subscription plus ninety (90) days following deactivation.',
                  'Tenants may request a full data export at any time prior to account closure by contacting Platform support.',
                  'The Platform will not sell, share, or disclose Tenant data to third parties except as required by Philippine law or lawful court order.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 7. Intellectual Property */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="intellectual-property" number="07" title="Intellectual Property" />
                <BulletList items={[
                  'The Obsidian name, logo, design system, and all Platform branding are the exclusive property of the Platform and may not be reproduced without written consent.',
                  'Tenants retain full ownership of all business data they store on the Platform.',
                  'Content uploaded to subdomain showcase pages must not infringe upon any third-party intellectual property rights.',
                  'By using the subdomain showcase feature, Tenants grant the Platform a limited, non-exclusive license to display their branding content for the purpose of operating the showcase.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 8. Grounds for Suspension */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="suspension" number="08" title="Grounds for Suspension" />
                <Paragraph>
                  The Platform may temporarily suspend ("SUSPENDED" status) a Tenant account for any of the following reasons. Suspended Tenants will receive an email notification specifying the reason. Access will be restored upon resolution of the violation at the sole discretion of Platform administration.
                </Paragraph>
                <CategoryBlock label="Financial Violations" items={[
                  'Non-payment or Subscription overdue beyond the seven (7) day grace period.',
                ]} />
                <CategoryBlock label="Regulatory Violations" items={[
                  'Failed KYC verification or submission of fraudulent identity documents.',
                  'Reported regulatory non-compliance pending investigation by the Platform or relevant authorities.',
                ]} />
                <CategoryBlock label="Platform Abuse" items={[
                  'Scraping, reverse engineering, or automated data extraction.',
                  'Excessive API usage that degrades Platform performance.',
                  'Misuse of the subdomain showcase feature (inappropriate or misleading content).',
                ]} />
                <CategoryBlock label="Data Violations" items={[
                  'Unauthorized sharing of account credentials with non-authorized personnel.',
                  'Suspected data breach originating from Tenant negligence.',
                  'Unauthorized export or transfer of customer personally identifiable information (PII).',
                ]} />
                <CategoryBlock label="Other" items={[
                  'Any other activity that, in the Platform\'s reasonable judgment, poses a risk to Platform integrity, security, or other Tenants.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 9. Grounds for Deactivation */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="deactivation" number="09" title="Grounds for Deactivation" />
                <Paragraph>
                  The Platform may permanently deactivate ("DEACTIVATED" status) a Tenant account for any of the following reasons. Deactivated Tenants will receive an email notification specifying the reason. Tenant data will be retained for ninety (90) days following deactivation for legal and regulatory compliance purposes, after which it will be permanently deleted.
                </Paragraph>
                <CategoryBlock label="Regulatory Violations" items={[
                  'Operating without a valid BSP pawnshop license.',
                  'Confirmed violations of Anti-Money Laundering (AML) regulations.',
                ]} />
                <CategoryBlock label="Repeated Offenses" items={[
                  'Accumulation of three (3) or more suspension incidents.',
                ]} />
                <CategoryBlock label="Data Violations" items={[
                  'Confirmed exporting of customer PII for unauthorized purposes.',
                  'Confirmed breach of the Platform\'s tenant data isolation mechanisms.',
                ]} />
                <CategoryBlock label="Financial Fraud" items={[
                  'Subscription fraud, payment chargebacks, or deliberate payment manipulation.',
                ]} />
                <CategoryBlock label="Facilitation of Crime" items={[
                  'Using the Platform to facilitate money laundering, fraud, or any other criminal activity.',
                ]} />
                <CategoryBlock label="Severe Platform Abuse" items={[
                  'Deliberate attempts to compromise Platform security or gain unauthorized access to other Tenants\' data.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 10. Dispute Resolution */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="dispute" number="10" title="Dispute Resolution" />
                <BulletList items={[
                  'Tenants may appeal a suspension or deactivation decision by contacting Platform support in writing within fifteen (15) business days of receiving the notification.',
                  'Appeals will be reviewed and a final decision communicated within ten (10) business days of receipt.',
                  'The Platform\'s decision following the appeal review is final and binding.',
                  'For disputes that cannot be resolved through the appeals process, both parties agree to submit to mediation before pursuing litigation.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 11. Limitation of Liability */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="liability" number="11" title="Limitation of Liability" />
                <BulletList items={[
                  'The Platform is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied, including but not limited to warranties of merchantability or fitness for a particular purpose.',
                  'The Platform is not liable for any Tenant\'s regulatory violations, business losses, or operational decisions made using data from the Platform.',
                  'While the Platform targets 99.5% uptime, continuous or uninterrupted availability is not guaranteed.',
                  'The Platform\'s maximum aggregate liability shall not exceed the total fees paid by the Tenant in the twelve (12) months immediately preceding the claim.',
                  'The Platform is not responsible for data loss arising from Tenant negligence, including but not limited to credential compromise or unauthorized access facilitated by the Tenant.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 12. Governing Law */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="governing-law" number="12" title="Governing Law" />
                <Paragraph>
                  These Terms and Conditions shall be governed by and construed in accordance with the laws of the Republic of the Philippines.
                </Paragraph>
                <BulletList items={[
                  'Republic Act No. 11127 — Pawnshop Regulation Act of 2018',
                  'Republic Act No. 10173 — Data Privacy Act of 2012',
                  'Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts of Quezon City, Metro Manila, Philippines.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 13. Amendments & Contact */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="amendments" number="13" title="Amendments & Contact" />
                <Paragraph>
                  The Platform reserves the right to update or modify these Terms and Conditions at any time. All registered Tenants will be notified of material changes via email at least thirty (30) days before the revised Terms take effect. Continued use of the Platform after the effective date of any amendments constitutes acceptance of the revised Terms.
                </Paragraph>
                <Paragraph>
                  For questions, concerns, or disputes regarding these Terms, please contact us:
                </Paragraph>
                <div className="inline-flex items-center gap-3 px-5 py-3.5 border border-neutral-200 dark:border-neutral-800 rounded-sm text-sm text-neutral-600 dark:text-neutral-400">
                  <span className="material-symbols-outlined text-neutral-900 dark:text-white" style={{ fontSize: '18px' }}>mail</span>
                  <span>support@obsidian-platform.tech</span>
                </div>
              </div>

            </div>
          </div>

          {/* Bottom border */}
          <div className="relative border-t border-neutral-200 dark:border-neutral-800 landing-border-extend">
            <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
          </div>

        </div>
      </div>

      {/* Mobile: floating Sections button + drawer */}
      <div className="lg:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          className="fixed bottom-6 right-5 z-40 flex items-center gap-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold px-4 py-2.5 rounded-sm shadow-lg"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
          Sections
        </button>

        <div
          className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ease-in-out ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            aria-label="Section navigation"
            className={`absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-white dark:bg-neutral-950 shadow-2xl overflow-y-auto transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800">
              <p className="font-[family-name:var(--font-mono)] text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                On this page
              </p>
            </div>
            <nav className="py-3">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-2.5 text-sm py-2.5 pl-5 border-l-2 transition-colors ${
                    activeSection === s.id
                      ? 'border-neutral-900 dark:border-white font-bold text-neutral-900 dark:text-white'
                      : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                  }`}
                >
                  <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-neutral-300 dark:text-neutral-700">{s.number}</span>
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>
        </div>
      </div>
    </>
  )
}

const TermsPage = ({ layout = 'public' }) => {
  if (layout === 'admin') {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 transition-colors duration-300 landing-wrapper">
        <TermsContent />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 transition-colors duration-300 landing-wrapper">
      <Navbar />
      <TermsContent />
      <Footer />
    </div>
  )
}

export default TermsPage
