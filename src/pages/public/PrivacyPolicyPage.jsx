import { useState, useEffect } from 'react'
import { Navbar, Footer } from '../../components'
import { useScrollReveal } from '../../lib/useScrollReveal'

const sections = [
  { id: 'introduction', number: '01', title: 'Introduction' },
  { id: 'information-collected', number: '02', title: 'Information We Collect' },
  { id: 'how-we-use', number: '03', title: 'How We Use Information' },
  { id: 'data-sharing', number: '04', title: 'Data Sharing & Disclosure' },
  { id: 'data-security', number: '05', title: 'Data Security' },
  { id: 'data-retention', number: '06', title: 'Data Retention' },
  { id: 'your-rights', number: '07', title: 'Your Rights' },
  { id: 'international-transfers', number: '08', title: 'International Transfers' },
  { id: 'childrens-privacy', number: '09', title: 'Children\'s Privacy' },
  { id: 'third-party-services', number: '10', title: 'Third-Party Services' },
  { id: 'changes', number: '11', title: 'Changes to This Policy' },
  { id: 'contact', number: '12', title: 'Contact' },
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

const PrivacyPolicyContent = () => {
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
            Privacy Policy
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

          {/* Commitment banner */}
          <div className="px-5 sm:px-8 py-6 bg-neutral-900 dark:bg-white">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-sm border border-neutral-700 dark:border-neutral-300 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500" style={{ fontSize: '20px' }}>privacy_tip</span>
              </div>
              <div>
                <p className="text-sm font-bold text-white dark:text-neutral-900 mb-1">Your privacy matters to us</p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed">
                  Obsidian is committed to protecting your personal data in full compliance with Republic Act No. 10173 (Data Privacy Act of 2012) and its Implementing Rules and Regulations. We follow a minimum-data principle and never sell your information to third parties.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

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

              {/* 01. Introduction */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="introduction" number="01" title="Introduction" />
                <Paragraph>
                  This Privacy Policy explains how Obsidian Pawnshop Management Information System ("Platform", "we", "us", "our") collects, uses, stores, and protects personal information when you use our services.
                </Paragraph>
                <Paragraph>
                  We are committed to safeguarding the privacy of pawnshop operators ("Tenants"), their employees ("Users"), and the customers they serve through the Platform. This policy applies to all data processed through our web application, APIs, mobile application, and subdomain showcase pages.
                </Paragraph>
                <Paragraph>
                  By using the Platform, you acknowledge that you have read, understood, and agree to the practices described in this Privacy Policy.
                </Paragraph>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 02. Information We Collect */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="information-collected" number="02" title="Information We Collect" />
                <Paragraph>
                  We collect only the information necessary to provide our services and comply with regulatory requirements. The information we collect falls into the following categories:
                </Paragraph>
                <CategoryBlock label="Tenant Business Information" items={[
                  'Business name, type, and registration details',
                  'BSP (Bangko Sentral ng Pilipinas) pawnshop license number',
                  'TIN (Tax Identification Number)',
                  'Business address, branch locations, and contact information',
                  'Authorized representative details',
                ]} />
                <CategoryBlock label="User Account Information" items={[
                  'Full name, email address, and phone number',
                  'Role within the Tenant organization (Owner, Manager, Appraiser, Auditor, Cashier)',
                  'Government-issued ID for KYC verification',
                  'Profile photo (optional)',
                  'Encrypted authentication credentials',
                ]} />
                <CategoryBlock label="Pawnshop Customer Information" items={[
                  'Full name, birthdate, and contact details',
                  'Government-issued identification (BSP-compliant KYC)',
                  'Address and occupation',
                  'Transaction and loan history with the Tenant',
                  'Risk rating (computed by the Tenant based on business policies)',
                ]} />
                <CategoryBlock label="Technical Information" items={[
                  'IP address and browser type for security logging',
                  'Device information used during authentication',
                  'Platform usage events (sign-in times, actions performed) for audit trails',
                  'Error logs for debugging and service improvement',
                ]} />
                <CategoryBlock label="Payment Information" items={[
                  'Subscription billing handled by PayMongo (credit card and digital wallet details are processed directly by PayMongo, not stored by us)',
                  'Invoice history and subscription plan details',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 03. How We Use Information */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="how-we-use" number="03" title="How We Use Information" />
                <Paragraph>
                  We use the information we collect for the following specific purposes:
                </Paragraph>
                <BulletList items={[
                  'To provide, operate, and maintain the Platform and its features.',
                  'To authenticate users, enforce role-based permissions, and protect account security.',
                  'To verify Tenant and User identities through KYC processes required by BSP regulations.',
                  'To process subscription payments and manage billing cycles.',
                  'To send transactional notifications (account activity, overdue loans, password resets).',
                  'To generate compliance reports, audit trails, and regulatory submissions required by law.',
                  'To provide customer support and respond to inquiries.',
                  'To detect, prevent, and investigate fraud, security breaches, and unauthorized access.',
                  'To improve Platform performance, fix bugs, and develop new features.',
                ]} />
                <Paragraph>
                  We do not use your personal information for advertising, marketing to third parties, or behavioral profiling.
                </Paragraph>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 04. Data Sharing & Disclosure */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="data-sharing" number="04" title="Data Sharing & Disclosure" />
                <Paragraph>
                  We do not sell, rent, or trade your personal information. We only share data in the limited circumstances described below:
                </Paragraph>
                <CategoryBlock label="With Service Providers" items={[
                  'Supabase — for database hosting, authentication, and data storage (ISO 27001 certified).',
                  'PayMongo — for payment processing (PCI DSS compliant).',
                  'SMTP email providers — for transactional email delivery.',
                  'All providers are contractually bound to protect your data and use it only for the services they provide.',
                ]} />
                <CategoryBlock label="For Legal Compliance" items={[
                  'When required by Philippine law, subpoena, or lawful court order.',
                  'To comply with BSP regulatory reporting and Anti-Money Laundering (AML) obligations.',
                  'To cooperate with the National Privacy Commission (NPC) in data privacy investigations.',
                  'To respond to law enforcement requests supported by valid legal process.',
                ]} />
                <CategoryBlock label="Between Tenants" items={[
                  'Never. Each Tenant\'s data is fully isolated using Row-Level Security (RLS).',
                  'No Tenant can access another Tenant\'s customers, transactions, or business data.',
                ]} />
                <CategoryBlock label="Business Transfers" items={[
                  'In the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity.',
                  'You will be notified via email at least 30 days before any such transfer takes effect.',
                  'The successor entity will be bound by the same privacy commitments outlined in this policy.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 05. Data Security */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="data-security" number="05" title="Data Security" />
                <Paragraph>
                  We implement industry-standard technical and organizational measures to protect your data against unauthorized access, alteration, disclosure, or destruction.
                </Paragraph>
                <CategoryBlock label="Encryption" items={[
                  'All data transmitted between your browser and our servers is encrypted using 256-bit SSL/TLS.',
                  'Passwords are hashed using bcrypt with a minimum of 10 rounds.',
                  'Sensitive database fields are encrypted at rest.',
                ]} />
                <CategoryBlock label="Access Controls" items={[
                  'Row-Level Security (RLS) enforces tenant data isolation at the database level.',
                  'Role-based access control (RBAC) restricts actions based on user role.',
                  'JWT-based authentication with configurable session timeouts.',
                  'Multi-layered middleware validates every API request.',
                ]} />
                <CategoryBlock label="Monitoring & Auditing" items={[
                  'All sensitive actions are logged in immutable audit trails.',
                  'Automated alerts for suspicious access patterns.',
                  'Regular security reviews and dependency updates.',
                ]} />
                <CategoryBlock label="Infrastructure" items={[
                  'Hosted on Supabase (backed by AWS infrastructure with SOC 2 Type II compliance).',
                  'Automated daily backups with point-in-time recovery.',
                  'Geographic redundancy across multiple data centers.',
                ]} />
                <Paragraph>
                  Despite our best efforts, no system is perfectly secure. If we become aware of a security breach affecting your personal data, we will notify you and the National Privacy Commission within 72 hours as required by Philippine law.
                </Paragraph>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 06. Data Retention */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="data-retention" number="06" title="Data Retention" />
                <Paragraph>
                  We retain personal information only for as long as necessary to fulfill the purposes outlined in this policy, comply with legal obligations, resolve disputes, and enforce our agreements.
                </Paragraph>
                <BulletList items={[
                  <><strong>Active accounts:</strong> Data is retained for the duration of the active Subscription.</>,
                  <><strong>Deactivated accounts:</strong> Data is retained for ninety (90) days following deactivation to allow for account recovery and regulatory compliance, after which it is permanently deleted.</>,
                  <><strong>Transaction records:</strong> Financial transaction records are retained for ten (10) years as required by BSP regulations and the Bureau of Internal Revenue.</>,
                  <><strong>Audit logs:</strong> Security and compliance audit logs are retained for five (5) years.</>,
                  <><strong>Backups:</strong> Database backups are retained for 30 days on a rolling basis.</>,
                  <><strong>Marketing data:</strong> We do not collect or retain data for marketing purposes.</>,
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 07. Your Rights */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="your-rights" number="07" title="Your Rights" />
                <Paragraph>
                  Under the Philippine Data Privacy Act of 2012 (RA 10173), you have the following rights regarding your personal information:
                </Paragraph>
                <CategoryBlock label="Right to be Informed" items={[
                  'You have the right to know what personal data we collect and how we process it.',
                  'This Privacy Policy fulfills that requirement.',
                ]} />
                <CategoryBlock label="Right to Access" items={[
                  'You may request a copy of the personal data we hold about you.',
                  'Tenants can export their data at any time through the account settings.',
                ]} />
                <CategoryBlock label="Right to Rectification" items={[
                  'You may correct inaccurate or incomplete personal information.',
                  'Most fields can be updated directly from your profile settings.',
                ]} />
                <CategoryBlock label="Right to Erasure" items={[
                  'You may request deletion of your personal data, subject to legal retention requirements.',
                  'Note that financial records mandated by BSP cannot be deleted until the retention period expires.',
                ]} />
                <CategoryBlock label="Right to Object" items={[
                  'You may object to specific processing activities that are not legally required.',
                ]} />
                <CategoryBlock label="Right to Data Portability" items={[
                  'You may request your data in a structured, commonly used, machine-readable format.',
                ]} />
                <CategoryBlock label="Right to File a Complaint" items={[
                  'You may file a complaint with the National Privacy Commission if you believe your rights have been violated.',
                  'NPC website: privacy.gov.ph',
                ]} />
                <Paragraph>
                  To exercise any of these rights, contact us at the email address listed in Section 12. We will respond within fifteen (15) business days.
                </Paragraph>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 08. International Transfers */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="international-transfers" number="08" title="International Transfers" />
                <Paragraph>
                  Your data is primarily stored and processed within Supabase's infrastructure. Supabase operates data centers across multiple regions including Singapore (ap-southeast-1), which serves Southeast Asian customers.
                </Paragraph>
                <BulletList items={[
                  'We select the data center closest to the Philippines to minimize latency and ensure fast data access.',
                  'Any cross-border data transfer is performed under contractual safeguards equivalent to those required by Philippine data privacy law.',
                  'Service providers (Supabase, PayMongo) are bound by data processing agreements that uphold your privacy rights regardless of processing location.',
                  'We do not transfer data to jurisdictions that lack adequate data protection standards.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 09. Children's Privacy */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="childrens-privacy" number="09" title="Children's Privacy" />
                <Paragraph>
                  The Platform is not intended for use by individuals under the age of eighteen (18). We do not knowingly collect personal information from minors.
                </Paragraph>
                <BulletList items={[
                  'All Tenant account registrations require the account holder to be at least eighteen (18) years old.',
                  'Pawnshop customers must be at least eighteen (18) years old to engage in pawn transactions under Philippine law.',
                  'If we become aware that we have inadvertently collected personal information from a minor, we will delete it immediately upon verification.',
                  'Parents or guardians who believe their child has provided personal information to the Platform should contact us immediately.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 10. Third-Party Services */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="third-party-services" number="10" title="Third-Party Services" />
                <Paragraph>
                  The Platform integrates with the following third-party services. These providers have their own privacy policies that govern their handling of your data.
                </Paragraph>
                <CategoryBlock label="Supabase" items={[
                  'Purpose: Database hosting, authentication, and file storage.',
                  'Data shared: All Platform data, encrypted at rest and in transit.',
                  'Privacy policy: supabase.com/privacy',
                ]} />
                <CategoryBlock label="PayMongo" items={[
                  'Purpose: Subscription payment processing.',
                  'Data shared: Billing contact info, subscription amount, payment method tokens (actual card details are handled directly by PayMongo).',
                  'Privacy policy: paymongo.com/privacy',
                ]} />
                <CategoryBlock label="Email Service Providers" items={[
                  'Purpose: Transactional email delivery (account notifications, password resets, invoices).',
                  'Data shared: Recipient email address, message content.',
                  'We do not use email services for marketing or newsletters.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 11. Changes to This Policy */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="changes" number="11" title="Changes to This Policy" />
                <Paragraph>
                  We may update this Privacy Policy from time to time to reflect changes in our practices, legal requirements, or Platform features. When we make changes, we will update the "Effective" date at the top of this page.
                </Paragraph>
                <BulletList items={[
                  'Material changes will be communicated to registered Tenants via email at least thirty (30) days before taking effect.',
                  'Non-material changes (clarifications, grammatical corrections) may be published without prior notice.',
                  'We encourage you to review this policy periodically to stay informed about how we protect your information.',
                  'Previous versions of this policy are available upon request by contacting Platform support.',
                  'Continued use of the Platform after changes take effect constitutes acceptance of the updated policy.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 12. Contact */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="contact" number="12" title="Contact" />
                <Paragraph>
                  If you have questions, concerns, or wish to exercise any of your rights under this Privacy Policy, please contact our Data Protection Officer:
                </Paragraph>
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-3 px-5 py-3.5 border border-neutral-200 dark:border-neutral-800 rounded-sm text-sm text-neutral-600 dark:text-neutral-400">
                    <span className="material-symbols-outlined text-neutral-900 dark:text-white" style={{ fontSize: '18px' }}>mail</span>
                    <span>privacy@obsidian-platform.tech</span>
                  </div>
                  <div className="inline-flex items-center gap-3 px-5 py-3.5 border border-neutral-200 dark:border-neutral-800 rounded-sm text-sm text-neutral-600 dark:text-neutral-400 ml-0 sm:ml-3">
                    <span className="material-symbols-outlined text-neutral-900 dark:text-white" style={{ fontSize: '18px' }}>location_on</span>
                    <span>Baliuag, Bulacan, Philippines</span>
                  </div>
                </div>
                <Paragraph>
                  For complaints regarding data privacy violations, you may also contact the National Privacy Commission of the Philippines at <strong>privacy.gov.ph</strong> or <strong>complaints@privacy.gov.ph</strong>.
                </Paragraph>
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

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 transition-colors duration-300 landing-wrapper">
      <Navbar />
      <PrivacyPolicyContent />
      <Footer />
    </div>
  )
}

export default PrivacyPolicyPage
