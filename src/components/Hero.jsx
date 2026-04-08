import { useState, useEffect, useRef } from 'react'
import { useScrollReveal } from '../lib/useScrollReveal'

const VERBS = ['Revolutionize', 'Streamline', 'Transform', 'Modernize', 'Elevate']
const TYPE_SPEED = 150
const DELETE_SPEED = 70
const HOLD_DURATION = 3000
const NEXT_DELAY = 500

const Hero = () => {
  const textRef = useScrollReveal({ threshold: 0.1 })
  const mockupRef = useScrollReveal({ threshold: 0.1 })
  const [displayed, setDisplayed] = useState('')
  const verbIdx = useRef(0)
  const deleting = useRef(false)
  const typedRef = useRef('')

  useEffect(() => {
    let timeout

    const tick = () => {
      const current = VERBS[verbIdx.current]

      if (!deleting.current) {
        const next = current.slice(0, typedRef.current.length + 1)
        typedRef.current = next
        setDisplayed(next)

        if (next === current) {
          deleting.current = true
          timeout = setTimeout(tick, HOLD_DURATION)
        } else {
          timeout = setTimeout(tick, TYPE_SPEED)
        }
      } else {
        const next = typedRef.current.slice(0, -1)
        typedRef.current = next
        setDisplayed(next)

        if (next === '') {
          verbIdx.current = (verbIdx.current + 1) % VERBS.length
          deleting.current = false
          timeout = setTimeout(tick, NEXT_DELAY)
        } else {
          timeout = setTimeout(tick, DELETE_SPEED)
        }
      }
    }

    timeout = setTimeout(tick, NEXT_DELAY)
    return () => clearTimeout(timeout)
  }, [])

  return (
    <section className="pt-8 sm:pt-12 pb-12 sm:pb-20 px-4 sm:px-6 hero-gradient overflow-hidden">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div ref={textRef} className="space-y-8 reveal-fade-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-neutral-900/10 dark:bg-white/10 border border-neutral-900/20 dark:border-white/20 text-neutral-900 dark:text-white font-bold text-xs uppercase tracking-widest">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neutral-900 dark:bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-900 dark:bg-white"></span>
            </span>
            The Next-Gen MIS is Here
          </div>
          <h1 className="landing-h1 font-display font-light">
            <span className="inline-block align-bottom">
              {displayed}<span className="hero-cursor">|</span>
            </span>
            <br />
            Your Pawnshop <br />
            Management
          </h1>
          <p className="text-base sm:text-lg text-neutral-600 dark:text-neutral-400 max-w-lg leading-relaxed">
            Efficiency meets security. Streamline loans, track inventory in real-time, and scale your operations with the most advanced management information system for pawnbrokers.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <a className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 px-8 py-4 rounded-sm font-bold text-lg flex items-center justify-center gap-2 transition-all" href="/register">
              Get Started <span className="material-symbols-outlined">arrow_forward</span>
            </a>
          </div>
        </div>
        <div ref={mockupRef} className="relative hero-demo reveal-scale">
          <div className="relative z-10 bg-white dark:bg-neutral-900 landing-card p-3 sm:p-4 shadow-2xl border border-neutral-200 dark:border-white/10">
            <div className="bg-neutral-50 dark:bg-neutral-800 landing-card-inner overflow-hidden">
              {/* Title bar */}
              <div className="p-4 sm:p-6 border-b border-neutral-200 dark:border-white/5 flex justify-between items-center bg-neutral-100 dark:bg-neutral-900">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-sm bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-neutral-600 dark:text-neutral-300 text-sm">dashboard</span>
                  </div>
                  <span className="font-bold text-sm text-neutral-900 dark:text-white">Dashboard Overview</span>
                </div>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500/50"></div>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 gap-2 sm:gap-4">
                  {/* Loans card — animated glow */}
                  <div className="hero-demo-loans p-4 rounded-sm bg-neutral-100 dark:bg-neutral-900/50 border border-neutral-200 dark:border-white/5 transition-shadow">
                    <p className="landing-label text-neutral-400 dark:text-neutral-500">Total Active Loans</p>
                    {/* Value crossfade */}
                    <div className="relative mt-1">
                      <p className="hero-demo-value-old text-lg sm:text-2xl font-extrabold text-neutral-900 dark:text-white">₱458,920.00</p>
                      <p className="hero-demo-value-new text-lg sm:text-2xl font-extrabold text-neutral-900 dark:text-white">₱461,420.00</p>
                    </div>
                    <div className="mt-2 landing-label text-emerald-500 dark:text-emerald-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">trending_up</span> +12.5% vs last month
                    </div>
                  </div>
                  {/* Inventory card — dark inverse for emphasis */}
                  <div className="hero-demo-inventory p-4 rounded-sm bg-neutral-900 dark:bg-white border border-neutral-900 dark:border-white transition-shadow">
                    <p className="landing-label text-neutral-400 dark:text-neutral-500">Inventory Value</p>
                    <p className="text-lg sm:text-2xl font-extrabold mt-1 text-white dark:text-neutral-900">₱1.2M</p>
                    <div className="mt-2 landing-label text-neutral-400 dark:text-neutral-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">inventory_2</span> 1,245 Active Items
                    </div>
                  </div>
                </div>

                {/* Activity section */}
                <div className="p-4 rounded-sm bg-neutral-100 dark:bg-neutral-900/50 border border-neutral-200 dark:border-white/5 space-y-3">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white flex items-center justify-between">
                    Recent Appraisal Activity
                    <span className="hero-demo-viewall landing-label text-neutral-900 dark:text-white inline-block">View All</span>
                  </p>
                  <div className="space-y-2">
                    {/* Diamond Ring row — animated highlight + approved badge */}
                    <div className="hero-demo-row flex items-center justify-between p-2 rounded-sm bg-neutral-200/50 dark:bg-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-sm bg-amber-500/20 flex items-center justify-center text-amber-500">
                          <span className="material-symbols-outlined text-sm">diamond</span>
                        </div>
                        <div>
                          <p className="landing-item-title text-neutral-900 dark:text-white">Diamond Ring (2ct)</p>
                          <p className="landing-caption text-neutral-400 dark:text-neutral-500">Appraised by Marcus K.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Approved badge — fades in on cursor click */}
                        <span className="hero-demo-approved landing-label text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-sm">Approved</span>
                        <p className="text-xs font-bold text-neutral-900 dark:text-white">₱4,500</p>
                      </div>
                    </div>
                    {/* Rolex row */}
                    <div className="flex items-center justify-between p-2 rounded-sm bg-neutral-200/50 dark:bg-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-sm bg-blue-500/20 flex items-center justify-center text-blue-500">
                          <span className="material-symbols-outlined text-sm">watch</span>
                        </div>
                        <div>
                          <p className="landing-item-title text-neutral-900 dark:text-white">Rolex Submariner</p>
                          <p className="landing-caption text-neutral-400 dark:text-neutral-500">Appraised by Sarah J.</p>
                        </div>
                      </div>
                      <p className="text-xs font-bold text-neutral-900 dark:text-white">₱12,200</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Animated cursor — hidden on mobile */}
          <div className="hero-demo-cursor hidden sm:block" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z" fill="#fff" stroke="#000" strokeWidth="1.5"/>
            </svg>
          </div>

          {/* Background blobs */}
          <div className="absolute -top-12 -right-12 w-32 sm:w-64 h-32 sm:h-64 bg-neutral-300/30 dark:bg-neutral-600/20 rounded-full blur-3xl -z-0"></div>
          <div className="absolute -bottom-12 -left-12 w-24 sm:w-48 h-24 sm:h-48 bg-neutral-200/40 dark:bg-neutral-700/20 rounded-full blur-2xl -z-0"></div>
        </div>
      </div>
    </section>
  )
}

export default Hero
