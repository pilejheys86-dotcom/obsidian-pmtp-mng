import { Navbar, Hero, TrustedBy, Features, HowItWorks, MobileApp, Footer } from '../../components'

const SectionDivider = () => (
  <div className="relative h-4">
    {/* Full-width horizontal line */}
    <div className="absolute inset-x-0 top-1/2 border-t border-neutral-200 dark:border-neutral-800"></div>
    {/* Vertical borders that bridge adjacent sections + intersection squares */}
    <div className="absolute inset-y-0 left-4 right-4 sm:left-6 sm:right-6">
      <div className="max-w-7xl mx-auto h-full border-x border-neutral-200 dark:border-neutral-800 relative">
        <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
        <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
      </div>
    </div>
  </div>
)

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 transition-colors duration-300 landing-wrapper">
      <Navbar />
      <Hero />
      <SectionDivider />
      <TrustedBy />
      <SectionDivider />
      <Features />
      <SectionDivider />
      <HowItWorks />
      <SectionDivider />
      <MobileApp />
      <SectionDivider />
      <Footer showPricing />
    </div>
  )
}

export default LandingPage
