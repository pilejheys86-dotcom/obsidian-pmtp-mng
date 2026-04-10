import { useState, useEffect } from 'react'
import { Navbar, Footer } from '../../components'
import { useScrollReveal } from '../../lib/useScrollReveal'

const sections = [
  { id: 'introduction', number: '01', title: 'Introduction' },
  { id: 'no-personal-data', number: '02', title: 'No Personal Data Collection' },
  { id: 'what-are-cookies', number: '03', title: 'What Are Cookies' },
  { id: 'cookies-we-use', number: '04', title: 'Cookies We Use' },
  { id: 'cookies-we-dont', number: '05', title: 'Cookies We Do Not Use' },
  { id: 'third-party', number: '06', title: 'Third-Party Services' },
  { id: 'managing-cookies', number: '07', title: 'Managing Your Cookies' },
  { id: 'changes', number: '08', title: 'Changes to This Policy' },
  { id: 'contact', number: '09', title: 'Contact' },
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

const CookiePolicyContent = () => {
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
          <div className="inline-block px-4 py-1.5 rounded-sm border border-neutral-900 dark:border-white text-neutral-900 dark:text-white text-xs font-[family-name:var(--font-mono)] font-bold uppercase tracking-widest mb-6">
            Legal
          </div>
          <h1 className="landing-h1 font-display font-light mb-4">
            Cookie Policy
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
          <div ref={contentRef} className="flex reveal-fade-in">

            {/* Desktop sticky sidebar */}
            <aside
              aria-label="Section navigation"
              className="hidden lg:block w-64 flex-shrink-0 self-start sticky top-24 py-8 px-5 max-h-[calc(100vh-6rem)] overflow-y-auto"
            >
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
            </aside>

            {/* Content */}
            <div className="flex-1 min-w-0 lg:border-l border-neutral-200 dark:border-neutral-800">

              {/* Privacy notice banner */}
              <div className="px-5 sm:px-8 py-6 bg-neutral-900 dark:bg-white">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-sm border border-neutral-700 dark:border-neutral-300 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500" style={{ fontSize: '20px' }}>shield</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white dark:text-neutral-900 mb-1">We do not collect personal information</p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed">
                      Obsidian does not use cookies to collect, store, or process any personally identifiable information (PII) from visitors to this website. The cookies we use are strictly functional and necessary for the Platform to operate.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 01. Introduction */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="introduction" number="01" title="Introduction" />
                <Paragraph>
                  This Cookie Policy explains how Obsidian Pawnshop Management Information System ("Platform", "we", "us") uses cookies and similar technologies when you visit our website or use our services.
                </Paragraph>
                <Paragraph>
                  We are committed to transparency about the technologies we use. This policy provides clear information about what cookies are, which ones we use, and how you can control them.
                </Paragraph>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 02. No Personal Data Collection */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="no-personal-data" number="02" title="No Personal Data Collection" />
                <Paragraph>
                  Obsidian does not use cookies or any other tracking technology to collect personally identifiable information (PII) from visitors to this website. We take your privacy seriously and have designed our cookie usage to be minimal and non-invasive.
                </Paragraph>
                <BulletList items={[
                  'We do not collect your name, email address, phone number, or any other personal details through cookies.',
                  'We do not build user profiles or behavioral models based on cookie data.',
                  'We do not use cookies to track your browsing activity across other websites.',
                  'We do not sell, share, or transfer any cookie data to third parties for advertising or marketing purposes.',
                  'We do not use fingerprinting techniques or any covert methods to identify individual visitors.',
                  'All cookie data remains on your device and is not transmitted to external servers for analytics or profiling.',
                ]} />
                <Paragraph>
                  In compliance with Republic Act No. 10173 (Data Privacy Act of 2012), we ensure that no personal information is processed through our use of cookies without explicit and informed consent.
                </Paragraph>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 03. What Are Cookies */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="what-are-cookies" number="03" title="What Are Cookies" />
                <Paragraph>
                  Cookies are small text files that are stored on your device (computer, tablet, or mobile phone) when you visit a website. They are widely used to make websites work efficiently and provide a better user experience.
                </Paragraph>
                <BulletList items={[
                  <><strong>Session cookies</strong> are temporary and are deleted when you close your browser. They help maintain your state as you navigate between pages.</>,
                  <><strong>Persistent cookies</strong> remain on your device for a set period or until you delete them. They remember your preferences for future visits.</>,
                  <><strong>First-party cookies</strong> are set by the website you are visiting. They are generally used for functional purposes.</>,
                  <><strong>Third-party cookies</strong> are set by a domain other than the one you are visiting. They are often used for tracking and advertising — we do not use these.</>,
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 04. Cookies We Use */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="cookies-we-use" number="04" title="Cookies We Use" />
                <Paragraph>
                  The Platform uses only strictly necessary cookies that are essential for the website and application to function correctly. These cookies do not collect or store any personal information.
                </Paragraph>
                <CategoryBlock label="Authentication Session" items={[
                  'Purpose: Maintains your login session so you remain signed in as you navigate the Platform.',
                  'Duration: Expires when your session ends or after the configured session timeout.',
                  'Data stored: An encrypted session token — no personal details are embedded in or derivable from this token.',
                ]} />
                <CategoryBlock label="Theme Preference" items={[
                  'Purpose: Remembers whether you selected light or dark mode so the setting persists across visits.',
                  'Duration: Persistent until you clear your browser data or change the setting.',
                  'Data stored: A single value ("light" or "dark") — no personal information.',
                ]} />
                <CategoryBlock label="Security Tokens" items={[
                  'Purpose: Provides protection against Cross-Site Request Forgery (CSRF) attacks.',
                  'Duration: Session-based — deleted when you close your browser.',
                  'Data stored: A random cryptographic token — no personal information.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 05. Cookies We Do Not Use */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="cookies-we-dont" number="05" title="Cookies We Do Not Use" />
                <Paragraph>
                  To be fully transparent, the following types of cookies are not used on this Platform:
                </Paragraph>
                <BulletList items={[
                  <><strong>Analytics cookies</strong> — We do not use Google Analytics, Hotjar, Mixpanel, or any other analytics service that tracks user behavior.</>,
                  <><strong>Advertising cookies</strong> — We do not display ads and do not use cookies from ad networks such as Google Ads, Facebook Pixel, or similar services.</>,
                  <><strong>Social media cookies</strong> — We do not embed social media widgets or plugins that set tracking cookies.</>,
                  <><strong>Performance cookies</strong> — We do not use cookies to monitor site performance or collect usage statistics.</>,
                  <><strong>Targeting cookies</strong> — We do not use cookies to build interest profiles or deliver personalized content based on your browsing history.</>,
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 06. Third-Party Services */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="third-party" number="06" title="Third-Party Services" />
                <Paragraph>
                  The Platform integrates with the following third-party services. These services may use their own cookies subject to their respective privacy policies. We have selected these providers specifically because they prioritize data privacy.
                </Paragraph>
                <CategoryBlock label="Supabase (Authentication & Database)" items={[
                  'Supabase manages authentication sessions. Session tokens are stored in your browser\'s local storage, not as traditional cookies.',
                  'Supabase does not set tracking or analytics cookies on our behalf.',
                ]} />
                <CategoryBlock label="PayMongo (Payment Processing)" items={[
                  'PayMongo may set cookies during the payment checkout flow to process transactions securely.',
                  'These cookies are set on PayMongo\'s domain and are governed by their own privacy policy.',
                  'We do not have access to or control over cookies set by PayMongo.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 07. Managing Your Cookies */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="managing-cookies" number="07" title="Managing Your Cookies" />
                <Paragraph>
                  You can control and manage cookies through your browser settings. Most browsers allow you to:
                </Paragraph>
                <BulletList items={[
                  'View which cookies are currently stored on your device.',
                  'Delete all cookies or specific cookies.',
                  'Block all cookies or only third-party cookies.',
                  'Configure alerts when a cookie is being set.',
                ]} />
                <Paragraph>
                  Please note that blocking or deleting essential cookies may prevent the Platform from functioning correctly. Specifically, disabling authentication cookies will require you to sign in again each time you visit, and disabling theme preference cookies will reset your display settings to the default.
                </Paragraph>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 08. Changes to This Policy */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="changes" number="08" title="Changes to This Policy" />
                <Paragraph>
                  We may update this Cookie Policy from time to time to reflect changes in our practices or for operational, legal, or regulatory reasons. When we make changes, we will update the "Effective" date at the top of this page.
                </Paragraph>
                <BulletList items={[
                  'Material changes will be communicated to registered Tenants via email at least fifteen (15) days before taking effect.',
                  'Continued use of the Platform after the revised policy takes effect constitutes acceptance of the updated terms.',
                  'Previous versions of this policy are available upon request by contacting Platform support.',
                ]} />
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800"></div>

              {/* 09. Contact */}
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <SectionHeading id="contact" number="09" title="Contact" />
                <Paragraph>
                  If you have any questions about this Cookie Policy or our privacy practices, please contact us:
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

const CookiePolicyPage = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 transition-colors duration-300">
      <Navbar />
      <CookiePolicyContent />
      <Footer />
    </div>
  )
}

export default CookiePolicyPage
