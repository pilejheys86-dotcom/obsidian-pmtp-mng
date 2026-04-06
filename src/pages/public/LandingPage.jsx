import { Navbar, Hero, TrustedBy, Features, HowItWorks, MobileApp, Footer } from '../../components'

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark transition-colors duration-300">
      <Navbar />
      <Hero />
      <TrustedBy />
      <Features />
      <HowItWorks />
      <MobileApp />
      <Footer />
    </div>
  )
}

export default LandingPage
