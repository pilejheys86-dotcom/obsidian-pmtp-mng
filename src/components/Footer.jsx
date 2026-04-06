import { Logo } from './ui'
import { useScrollReveal } from '../lib/useScrollReveal'

const Footer = () => {
  const pricingRef = useScrollReveal()
  const linksRef = useScrollReveal()

  return (
    <footer className="pt-16 sm:pt-24 pb-12 px-4 sm:px-6" id="pricing">
      <div className="max-w-7xl mx-auto">
        {/* Pricing Section */}
        <div ref={pricingRef} className="grid lg:grid-cols-2 gap-16 mb-24 reveal-fade-up">
          <div className="space-y-6">
            <div className="inline-block px-4 py-1.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold">
              Pricing
            </div>
            <h2 className="text-2xl sm:text-4xl font-display font-light">
              The future of pawnshop management starts here.
            </h2>
            <p className="text-neutral-500 dark:text-neutral-400">
              Flexible plans that grow with your business. No hidden fees, just pure efficiency.
            </p>
            <div className="flex items-center gap-4 text-sm font-bold text-neutral-500">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-neutral-900 dark:text-white text-lg">check_circle</span> 14-day free trial
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-neutral-900 dark:text-white text-lg">check_circle</span> Upgrade anytime
              </span>
            </div>
          </div>
          <div className="bg-neutral-100 dark:bg-neutral-900 p-6 sm:p-8 landing-card border border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row justify-between items-center gap-6 sm:gap-8">
            <div>
              <p className="text-neutral-500 dark:text-neutral-400 font-bold mb-2">Professional Plan</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-extrabold">₱1,500</span>
                <span className="text-neutral-500">/mo</span>
              </div>
            </div>
            <button className="w-full sm:w-auto bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-8 sm:px-10 py-4 rounded-sm font-bold transition-all transform hover:scale-105 min-h-[44px]">
              Get Started Now
            </button>
          </div>
        </div>

        {/* Footer Links */}
        <div ref={linksRef} className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12 pt-12 sm:pt-16 border-t border-neutral-200 dark:border-neutral-800 reveal-fade-up">
          <div className="col-span-2 md:col-span-1">
            <div className="mb-6">
              <Logo size="sm" />
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Leading provider of digital solutions for the modern pawnbroking industry. Secure, reliable, and efficient.
            </p>
          </div>
          <div>
            <h5 className="font-bold mb-6 uppercase text-xs tracking-widest text-neutral-400">Product</h5>
            <ul className="space-y-4 text-sm font-semibold">
              <li><a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Features</a></li>
              <li><a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Dashboard</a></li>
              <li><a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Appraisal Engine</a></li>
              <li><a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Mobile App</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold mb-6 uppercase text-xs tracking-widest text-neutral-400">Company</h5>
            <ul className="space-y-4 text-sm font-semibold">
              <li><a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">About Us</a></li>
              <li><a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Careers</a></li>
              <li><a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Security</a></li>
              <li><a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Privacy Policy</a></li>
              <li><a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="/terms">Terms and Conditions</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold mb-6 uppercase text-xs tracking-widest text-neutral-400">Contact</h5>
            <ul className="space-y-4 text-sm font-semibold">
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-neutral-500 text-sm">email</span> support@obsidian.com
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-neutral-500 text-sm">phone</span> +1 (555) 000-0000
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-neutral-500 text-sm">location_on</span> Silicon Valley, CA
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-16 pt-8 border-t border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-bold text-neutral-400">
          <p>&copy; 2026 Obsidian MIS Platform. All rights reserved.</p>
          <div className="flex gap-8">
            <a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="/terms">Terms and Conditions</a>
            <a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
