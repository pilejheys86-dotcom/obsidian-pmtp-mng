# Terms and Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Terms and Conditions page accessible at `/terms` (public) and `/admin/terms` (authenticated), add a T&C acceptance checkbox to the registration flow, and wire up the footer link.

**Architecture:** Single `TermsPage.jsx` component in `src/pages/public/` that accepts a `layout` prop. When `"public"`, it renders with Navbar + Footer. When `"admin"`, it renders the content only (sidebar chrome is handled by App.jsx). Routes are added in App.jsx and the pages barrel export.

**Tech Stack:** React 18, TailwindCSS 4, existing design system classes (text-heading, landing-card, reveal-fade-up, etc.)

**Spec:** `docs/superpowers/specs/2026-03-30-terms-and-conditions-design.md`

---

### Task 1: Create TermsPage.jsx

**Files:**
- Create: `src/pages/public/TermsPage.jsx`

This is the main deliverable. The component renders 13 T&C sections with a table of contents, matching the existing public page pattern (AboutPage, ProcessPage).

- [ ] **Step 1: Create the TermsPage component**

Create `src/pages/public/TermsPage.jsx`:

```jsx
import { Navbar, Footer } from '../../components'
import { useScrollReveal } from '../../lib/useScrollReveal'

const sections = [
  { id: 'definitions', number: '1', title: 'Definitions' },
  { id: 'acceptance', number: '2', title: 'Acceptance of Terms' },
  { id: 'registration', number: '3', title: 'Account Registration & Responsibilities' },
  { id: 'subscription', number: '4', title: 'Subscription & Payment Terms' },
  { id: 'acceptable-use', number: '5', title: 'Acceptable Use Policy' },
  { id: 'data-privacy', number: '6', title: 'Data Privacy & Protection' },
  { id: 'intellectual-property', number: '7', title: 'Intellectual Property' },
  { id: 'suspension', number: '8', title: 'Grounds for Suspension' },
  { id: 'deactivation', number: '9', title: 'Grounds for Deactivation' },
  { id: 'dispute', number: '10', title: 'Dispute Resolution' },
  { id: 'liability', number: '11', title: 'Limitation of Liability' },
  { id: 'governing-law', number: '12', title: 'Governing Law' },
  { id: 'amendments', number: '13', title: 'Amendments & Contact' },
]

const SectionHeading = ({ id, number, title }) => (
  <h2 id={id} className="text-xl md:text-2xl font-display font-extrabold mb-4 scroll-mt-24">
    <span className="text-primary mr-2">{number}.</span>{title}
  </h2>
)

const Paragraph = ({ children }) => (
  <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4">{children}</p>
)

const BulletList = ({ items }) => (
  <ul className="space-y-2 mb-4 ml-1">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3 text-neutral-600 dark:text-neutral-400 leading-relaxed">
        <span className="material-symbols-outlined text-primary text-lg mt-0.5 shrink-0">chevron_right</span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
)

const CategoryBlock = ({ label, items }) => (
  <div className="mb-4">
    <p className="text-sm font-bold text-neutral-900 dark:text-white mb-2">{label}</p>
    <BulletList items={items} />
  </div>
)

const EFFECTIVE_DATE = 'March 30, 2026'

const TermsContent = () => {
  const heroRef = useScrollReveal({ threshold: 0.1 })

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-12 px-6">
        <div ref={heroRef} className="max-w-3xl mx-auto text-center reveal-fade-up">
          <div className="inline-block px-4 py-1.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold mb-6">
            Legal
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-extrabold leading-tight mb-4">
            Terms and Conditions
          </h1>
          <p className="text-lg text-neutral-500 dark:text-neutral-400">
            Effective {EFFECTIVE_DATE}
          </p>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="pb-12 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-stone-100 dark:bg-neutral-900 rounded-sm p-6 md:p-8">
            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-4">Table of Contents</h3>
            <nav className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-primary transition-colors"
                >
                  <span className="text-primary font-bold">{s.number}.</span>
                  {s.title}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="pb-24 px-6">
        <div className="max-w-3xl mx-auto space-y-12">

          {/* 1. Definitions */}
          <div>
            <SectionHeading id="definitions" number="1" title="Definitions" />
            <BulletList items={[
              <><strong>"Platform"</strong> refers to the Obsidian Pawnshop Management Information System, including all web applications, APIs, and related services.</>,
              <><strong>"Tenant"</strong> refers to a registered pawnshop business entity using the Platform.</>,
              <><strong>"User"</strong> refers to any individual with login credentials under a Tenant account, including Owners, Managers, Appraisers, Auditors, and Cashiers.</>,
              <><strong>"Services"</strong> refers to all SaaS features provided by the Platform, including but not limited to loan management, appraisals, inventory tracking, reporting, and customer management.</>,
              <><strong>"Subscription"</strong> refers to a paid plan granting access to the Platform and its Services.</>,
              <><strong>"BSP"</strong> refers to the Bangko Sentral ng Pilipinas, the central monetary authority of the Republic of the Philippines.</>,
            ]} />
          </div>

          {/* 2. Acceptance of Terms */}
          <div>
            <SectionHeading id="acceptance" number="2" title="Acceptance of Terms" />
            <Paragraph>
              By creating an account, accessing, or using the Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions. If you do not agree, you must not use the Platform.
            </Paragraph>
            <BulletList items={[
              'You must be at least eighteen (18) years of age to register an account.',
              'You must hold a valid BSP pawnshop license, or be in the process of obtaining one, to operate as a Tenant.',
              'Continued use of the Platform after any amendments to these Terms constitutes acceptance of the revised Terms.',
            ]} />
          </div>

          {/* 3. Account Registration & Responsibilities */}
          <div>
            <SectionHeading id="registration" number="3" title="Account Registration & Responsibilities" />
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

          {/* 4. Subscription & Payment Terms */}
          <div>
            <SectionHeading id="subscription" number="4" title="Subscription & Payment Terms" />
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

          {/* 5. Acceptable Use Policy */}
          <div>
            <SectionHeading id="acceptable-use" number="5" title="Acceptable Use Policy" />
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

          {/* 6. Data Privacy & Protection */}
          <div>
            <SectionHeading id="data-privacy" number="6" title="Data Privacy & Protection" />
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

          {/* 7. Intellectual Property */}
          <div>
            <SectionHeading id="intellectual-property" number="7" title="Intellectual Property" />
            <BulletList items={[
              'The Obsidian name, logo, design system, and all Platform branding are the exclusive property of the Platform and may not be reproduced without written consent.',
              'Tenants retain full ownership of all business data they store on the Platform.',
              'Content uploaded to subdomain showcase pages must not infringe upon any third-party intellectual property rights.',
              'By using the subdomain showcase feature, Tenants grant the Platform a limited, non-exclusive license to display their branding content for the purpose of operating the showcase.',
            ]} />
          </div>

          {/* 8. Grounds for Suspension */}
          <div>
            <SectionHeading id="suspension" number="8" title="Grounds for Suspension" />
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

          {/* 9. Grounds for Deactivation */}
          <div>
            <SectionHeading id="deactivation" number="9" title="Grounds for Deactivation" />
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

          {/* 10. Dispute Resolution */}
          <div>
            <SectionHeading id="dispute" number="10" title="Dispute Resolution" />
            <BulletList items={[
              'Tenants may appeal a suspension or deactivation decision by contacting Platform support in writing within fifteen (15) business days of receiving the notification.',
              'Appeals will be reviewed and a final decision communicated within ten (10) business days of receipt.',
              'The Platform\'s decision following the appeal review is final and binding.',
              'For disputes that cannot be resolved through the appeals process, both parties agree to submit to mediation before pursuing litigation.',
            ]} />
          </div>

          {/* 11. Limitation of Liability */}
          <div>
            <SectionHeading id="liability" number="11" title="Limitation of Liability" />
            <BulletList items={[
              'The Platform is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied, including but not limited to warranties of merchantability or fitness for a particular purpose.',
              'The Platform is not liable for any Tenant\'s regulatory violations, business losses, or operational decisions made using data from the Platform.',
              'While the Platform targets 99.5% uptime, continuous or uninterrupted availability is not guaranteed.',
              'The Platform\'s maximum aggregate liability shall not exceed the total fees paid by the Tenant in the twelve (12) months immediately preceding the claim.',
              'The Platform is not responsible for data loss arising from Tenant negligence, including but not limited to credential compromise or unauthorized access facilitated by the Tenant.',
            ]} />
          </div>

          {/* 12. Governing Law */}
          <div>
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

          {/* 13. Amendments & Contact */}
          <div>
            <SectionHeading id="amendments" number="13" title="Amendments & Contact" />
            <Paragraph>
              The Platform reserves the right to update or modify these Terms and Conditions at any time. All registered Tenants will be notified of material changes via email at least thirty (30) days before the revised Terms take effect. Continued use of the Platform after the effective date of any amendments constitutes acceptance of the revised Terms.
            </Paragraph>
            <Paragraph>
              For questions, concerns, or disputes regarding these Terms, please contact us:
            </Paragraph>
            <div className="bg-stone-100 dark:bg-neutral-900 rounded-sm p-6">
              <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                <span className="material-symbols-outlined text-primary">mail</span>
                <span>support@obsidian-platform.tech</span>
              </div>
            </div>
          </div>

        </div>
      </section>
    </>
  )
}

const TermsPage = ({ layout = 'public' }) => {
  if (layout === 'admin') {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark transition-colors duration-300">
        <TermsContent />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark transition-colors duration-300">
      <Navbar />
      <TermsContent />
      <Footer />
    </div>
  )
}

export default TermsPage
```

- [ ] **Step 2: Verify file was created**

Run: `ls src/pages/public/TermsPage.jsx`
Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add src/pages/public/TermsPage.jsx
git commit -m "feat: create Terms and Conditions page component"
```

---

### Task 2: Register TermsPage in barrel exports and App.jsx routes

**Files:**
- Modify: `src/pages/public/index.js`
- Modify: `src/pages/index.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Add export to public pages barrel**

In `src/pages/public/index.js`, add at the end:

```js
export { default as TermsPage } from './TermsPage'
```

- [ ] **Step 2: Add export to pages barrel**

In `src/pages/index.js`, update the public pages import line:

Change:
```js
export { LandingPage, ProcessPage, PricingPage, AboutPage } from './public'
```
To:
```js
export { LandingPage, ProcessPage, PricingPage, AboutPage, TermsPage } from './public'
```

- [ ] **Step 3: Add routes in App.jsx**

In `src/App.jsx`, add `TermsPage` to the import destructure at line 4:

Change:
```js
import {
  LandingPage, ProcessPage, PricingPage, AboutPage,
```
To:
```js
import {
  LandingPage, ProcessPage, PricingPage, AboutPage, TermsPage,
```

Then add two route cases in the `renderPage()` switch. Under the `// ── Public` section, after the `case '/about':` block:

```js
      case '/terms':
        return <TermsPage />
```

Under the `// ── Owner (pawnshop)` section, after the `case '/admin/kyc':` block:

```js
      case '/admin/terms':
        return <TermsPage layout="admin" />
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/public/index.js src/pages/index.js src/App.jsx
git commit -m "feat: add /terms and /admin/terms routes"
```

---

### Task 3: Add T&C acceptance checkbox to RegisterPage

**Files:**
- Modify: `src/pages/auth/RegisterPage.jsx`

- [ ] **Step 1: Add `agreedToTerms` state**

In `src/pages/auth/RegisterPage.jsx`, add a new state variable after the `showConfirmPassword` state (line 24):

```js
  const [agreedToTerms, setAgreedToTerms] = useState(false)
```

- [ ] **Step 2: Add the checkbox below the confirm password field in Step 2**

In the Step 2 form section, after the closing `/>` of the Confirm Password `<FormInput>` (after line 265) and before the `<div className="flex gap-3">` button row (line 267), add:

```jsx
            {/* Terms and Conditions */}
            <label className="flex items-start gap-3 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="form-checkbox mt-0.5"
              />
              <span className="text-sm text-neutral-600 dark:text-neutral-400 select-none">
                I agree to the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms and Conditions
                </a>
              </span>
            </label>
```

- [ ] **Step 3: Disable the Continue button until checkbox is checked**

In the Step 2 form, find the submit button (line 276):

Change:
```jsx
              <button type="submit" className="btn-primary-full flex-1" disabled={isLoading}>
```
To:
```jsx
              <button type="submit" className="btn-primary-full flex-1" disabled={isLoading || !agreedToTerms}>
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/auth/RegisterPage.jsx
git commit -m "feat: add T&C acceptance checkbox to registration step 2"
```

---

### Task 4: Wire up Footer "Terms of Service" link

**Files:**
- Modify: `src/components/Footer.jsx`

- [ ] **Step 1: Update the placeholder link**

In `src/components/Footer.jsx`, find line 94:

Change:
```jsx
            <a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Terms of Service</a>
```
To:
```jsx
            <a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="/terms">Terms and Conditions</a>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Footer.jsx
git commit -m "feat: wire footer Terms of Service link to /terms"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Verify the public route**

Navigate to `http://localhost:5173/terms` in the browser. Verify:
- Navbar and Footer are visible
- Hero section shows "Terms and Conditions" with effective date
- Table of contents renders 13 links with anchor navigation
- All 13 sections render with correct headings and content
- Dark mode toggle works
- Scroll-reveal animation fires on the hero

- [ ] **Step 2: Verify the admin route**

Log in as an owner, then navigate to `/admin/terms`. Verify:
- Page renders within the sidebar layout (no duplicate Navbar/Footer)
- All content is identical to the public version

- [ ] **Step 3: Verify the registration checkbox**

Navigate to `/register`, fill in Step 1 (personal info), proceed to Step 2. Verify:
- T&C checkbox appears below the Confirm Password field
- "Terms and Conditions" link opens `/terms` in a new tab
- "Continue" button is disabled until the checkbox is checked
- Checking the box enables the button

- [ ] **Step 4: Verify the footer link**

On any public page (landing, about, pricing), scroll to the footer. Verify:
- "Terms and Conditions" link navigates to `/terms`

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address T&C verification issues"
```
