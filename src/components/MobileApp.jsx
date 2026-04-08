import { useScrollReveal, useStaggerReveal } from '../lib/useScrollReveal'

const MobileApp = () => {
  const headingRef = useScrollReveal()
  const phoneRef = useScrollReveal({ threshold: 0.1 })
  const featuresRef = useStaggerReveal({ stagger: 150 })

  const appFeatures = [
    {
      icon: 'notifications_active',
      title: 'Loan Reminders',
      description: 'Get notified before due dates so you never miss a payment or renewal window.'
    },
    {
      icon: 'receipt_long',
      title: 'Transaction History',
      description: 'View all your pawn tickets, payments, and receipts in one place.'
    },
    {
      icon: 'qr_code_scanner',
      title: 'Digital Tickets',
      description: 'Access your pawn tickets digitally — no more lost paper slips.'
    },
    {
      icon: 'storefront',
      title: 'Browse Auctions',
      description: 'Discover and bid on auction items directly from your phone.'
    }
  ]

  return (
    <section className="px-4 sm:px-6 bg-white dark:bg-neutral-950 overflow-hidden" id="mobile-app">
      <div className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Phone Mockup — always dark themed */}
          <div ref={phoneRef} className="relative flex justify-center lg:justify-start order-2 lg:order-1 reveal-scale">
            <div className="relative w-[280px] sm:w-[300px]">
              <div className="relative bg-neutral-800 rounded-[2.5rem] p-3 shadow-2xl border border-neutral-700">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-neutral-800 rounded-b-2xl z-20"></div>
                <div className="bg-neutral-950 rounded-[2rem] overflow-hidden">
                  <div className="flex justify-between items-center px-6 pt-8 pb-2">
                    <span className="text-[10px] font-bold text-white">9:41</span>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-white" style={{ fontSize: '12px' }}>signal_cellular_alt</span>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: '12px' }}>battery_full</span>
                    </div>
                  </div>

                  <div className="px-5 pt-4 pb-3">
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Obsidian</p>
                    <h3 className="text-lg font-extrabold text-white mt-1">My Loans</h3>
                  </div>

                  <div className="px-5 pb-3">
                    <div className="bg-white/10 rounded-sm p-4 border border-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-sm bg-amber-500/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '16px' }}>diamond</span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">Gold Necklace 18K</p>
                            <p className="text-[10px] text-neutral-500">PT-20260315-00042</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-sm">Active</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <div>
                          <p className="text-neutral-500">Loan Amount</p>
                          <p className="text-sm font-extrabold text-white mt-0.5">₱12,500</p>
                        </div>
                        <div className="text-right">
                          <p className="text-neutral-500">Due Date</p>
                          <p className="text-sm font-bold text-white mt-0.5">Apr 15, 2026</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-[9px] text-neutral-500 mb-1">
                          <span>Loan term</span>
                          <span>22 of 30 days</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full w-[73%] bg-white rounded-full"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 pb-3">
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Quick Actions</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white/10 rounded-sm p-3 flex flex-col items-center gap-1.5 border border-white/5">
                        <span className="material-symbols-outlined text-white" style={{ fontSize: '18px' }}>payments</span>
                        <span className="text-[9px] font-bold text-neutral-400">Pay Now</span>
                      </div>
                      <div className="bg-white/10 rounded-sm p-3 flex flex-col items-center gap-1.5 border border-white/5">
                        <span className="material-symbols-outlined text-white" style={{ fontSize: '18px' }}>autorenew</span>
                        <span className="text-[9px] font-bold text-neutral-400">Renew</span>
                      </div>
                      <div className="bg-white rounded-sm p-3 flex flex-col items-center gap-1.5">
                        <span className="material-symbols-outlined text-neutral-900" style={{ fontSize: '18px' }}>gavel</span>
                        <span className="text-[9px] font-bold text-neutral-500">Auctions</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-around items-center py-3 mt-2 border-t border-white/10">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="material-symbols-outlined text-white" style={{ fontSize: '18px' }}>home</span>
                      <span className="text-[8px] font-bold text-white">Home</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="material-symbols-outlined text-neutral-600" style={{ fontSize: '18px' }}>receipt_long</span>
                      <span className="text-[8px] font-bold text-neutral-600">Tickets</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="material-symbols-outlined text-neutral-600" style={{ fontSize: '18px' }}>notifications</span>
                      <span className="text-[8px] font-bold text-neutral-600">Alerts</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="material-symbols-outlined text-neutral-600" style={{ fontSize: '18px' }}>person</span>
                      <span className="text-[8px] font-bold text-neutral-600">Profile</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-gradient-radial from-neutral-900/5 dark:from-white/5 to-transparent rounded-full blur-3xl"></div>
            </div>
          </div>

          {/* Content */}
          <div className="order-1 lg:order-2 space-y-8">
            <div ref={headingRef} className="space-y-6 reveal-fade-up">
              <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">Mobile App</p>
              <h2 className="landing-h2 font-display font-light">
                Your pawnshop, <br />
                <span>right in your pocket.</span>
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400 text-base sm:text-lg leading-relaxed max-w-lg">
                Track your loans, get payment reminders, view digital tickets, and browse auction items — all from the Obsidian customer app.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <a
                  href="#"
                  className="inline-flex items-center justify-center gap-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-8 py-4 rounded-sm font-bold text-lg transition-all transform hover:scale-105"
                >
                  <span className="material-symbols-outlined text-2xl">download</span>
                  Download Now
                </a>
              </div>
              <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">android</span> Available for Android
              </p>
            </div>

            <div ref={featuresRef} className="grid sm:grid-cols-2 gap-4 pt-4 reveal-fade-in">
              {appFeatures.map((feature, index) => (
                <div
                  key={index}
                  data-reveal-child
                  className="flex items-start gap-3 p-4 rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-sm bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                    <span className="material-symbols-outlined text-neutral-700 dark:text-neutral-300" style={{ fontSize: '20px' }}>{feature.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-1">{feature.title}</h4>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default MobileApp
