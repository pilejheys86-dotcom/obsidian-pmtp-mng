import { Logo } from './ui'
import { useScrollReveal } from '../lib/useScrollReveal'

const Footer = ({ showPricing = false }) => {
  const pricingRef = useScrollReveal()
  const linksRef = useScrollReveal()

  return (
    <footer className="px-4 sm:px-6" id="pricing">
      <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800 pt-16 sm:pt-24 pb-12">
        {showPricing && (
          <>
            {/* Pricing Section — enclosed grid, no container padding so borders connect */}
            <div className="relative border-t border-neutral-200 dark:border-neutral-800 landing-border-extend">
              <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
              <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            </div>
            <div ref={pricingRef} className="grid grid-cols-1 lg:grid-cols-2 reveal-fade-up">
              {/* Left — pricing text */}
              <div className="space-y-6 py-10 sm:py-14 px-4 sm:px-6 flex flex-col items-center justify-center text-center">
                <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">Pricing</p>
                <h2 className="landing-h2 font-display font-light">
                  The future of pawnshop management starts here.
                </h2>
                <p className="text-neutral-500 dark:text-neutral-400">
                  Flexible plans that grow with your business. No hidden fees, just pure efficiency.
                </p>
                <div className="flex items-center gap-4 text-sm font-bold text-neutral-500">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-neutral-900 dark:text-white text-lg">check_circle</span> Cancel anytime
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-neutral-900 dark:text-white text-lg">check_circle</span> Upgrade anytime
                  </span>
                </div>
              </div>
              {/* Right — plan details */}
              <div className="border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 py-10 sm:py-14 px-4 sm:px-6 flex flex-col items-center justify-center text-center space-y-6">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Professional Plan</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl sm:text-5xl font-extrabold">₱1,500</span>
                  <span className="text-neutral-500">/mo</span>
                </div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Everything you need to run your pawnshop.</p>
                <a className="w-full sm:w-auto bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-8 py-4 rounded-sm font-bold transition-all text-center min-h-[44px]" href="/register">
                  Get Started Now
                </a>
              </div>
            </div>
            <div className="relative border-t border-neutral-200 dark:border-neutral-800 landing-border-extend">
              <div className="absolute top-0 left-0 -translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
              <div className="absolute top-0 right-0 translate-x-[calc(50%+1px)] -translate-y-1/2 w-[7px] h-[7px] bg-neutral-200 dark:bg-neutral-800"></div>
            </div>
          </>
        )}

        {/* Footer */}
        <div ref={linksRef} className="px-4 sm:px-6 pt-10 sm:pt-12 space-y-8 reveal-fade-up">
          {/* Brand + Contact row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <Logo size="sm" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400 hidden sm:block">
                Digital solutions for modern pawnbroking.
              </p>
            </div>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-500 dark:text-neutral-400">
              <li className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">email</span> support@obsidian.tech
              </li>
              <li className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">phone</span> 0906-708-0332
              </li>
              <li className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">location_on</span> Baliuag, Bulacan, Philippines
              </li>
            </ul>
          </div>
          {/* Copyright */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-6 border-t border-neutral-200/60 dark:border-neutral-800/60 text-xs font-bold text-neutral-400">
            <p>&copy; 2026 Obsidian MIS Platform. All rights reserved.</p>
            <div className="flex gap-6">
              <a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="/terms">Terms and Conditions</a>
              <a className="hover:text-neutral-900 dark:hover:text-white transition-colors" href="#">Cookie Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
