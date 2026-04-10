import { useState, useEffect, useRef, lazy, Suspense } from 'react'

// HeroGridBackground is decorative. Defer its code split so it never blocks LCP.
const HeroGridBackground = lazy(() => import('./HeroGridBackground'))

const VERBS = ['Revolutionize', 'Streamline', 'Transform', 'Modernize', 'Elevate']
const TYPE_SPEED = 150
const DELETE_SPEED = 70
const HOLD_DURATION = 3000
const NEXT_DELAY = 500

const Hero = () => {
  // Seed the typewriter with the first verb so the h1 paints with real text
  // on the first frame — no empty headline flicker, no layout shift.
  const [displayed, setDisplayed] = useState(VERBS[0])
  const [showGrid, setShowGrid] = useState(false)
  const verbIdx = useRef(0)
  const deleting = useRef(false)
  const typedRef = useRef(VERBS[0])

  // Start the typewriter after a delay so it doesn't compete with LCP.
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

    // First tick begins deleting the seeded verb, matching the loop.
    deleting.current = true
    timeout = setTimeout(tick, HOLD_DURATION)
    return () => clearTimeout(timeout)
  }, [])

  // Mount the decorative grid background only after the browser is idle,
  // so its SVG rendering never competes with the LCP paint.
  useEffect(() => {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200))
    const handle = idle(() => setShowGrid(true))
    return () => {
      if (window.cancelIdleCallback && typeof handle === 'number') {
        window.cancelIdleCallback(handle)
      } else {
        clearTimeout(handle)
      }
    }
  }, [])

  return (
    <section className="relative pt-8 sm:pt-12 pb-0 px-4 sm:px-6 overflow-hidden">
      {showGrid && (
        <Suspense fallback={null}>
          <HeroGridBackground />
        </Suspense>
      )}
      {/* Text content — left-aligned, same container as dashboard */}
      <div className="relative max-w-7xl mx-auto">
        <div className="space-y-5 max-w-2xl">
          <h1 className="landing-h1 font-display font-light">
            <span className="inline-block align-bottom">
              {displayed}<span className="hero-cursor">|</span>
            </span>
            <br />
            Your Pawnshop Management
          </h1>
          <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Streamline loans, track inventory in real-time, and scale your operations.
            <br />
            One platform for appraisals, payments, compliance, and reporting.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a className="group px-5 py-2.5 rounded-sm bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors flex items-center gap-2" href="/register">
              Get Started
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <line x1="6" y1="18" x2="18" y2="6" pathLength="1" className="trace-arrow-path" />
                <polyline points="9,6 18,6 18,15" pathLength="1" className="trace-arrow-path" style={{ animationDelay: '0.2s' }} />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Dashboard screenshot — LCP element, must paint immediately */}
      <div className="relative z-10 max-w-7xl mx-auto mt-12 sm:mt-16">
        <div className="relative z-10 rounded-t-lg overflow-hidden max-h-[280px] sm:max-h-[380px] lg:max-h-[480px] transition-transform duration-500 ease-out hover:-translate-y-3 shadow-2xl">
          <img
            src="/obsidiandash.png"
            alt="Obsidian Dashboard"
            width="2880"
            height="2160"
            fetchpriority="high"
            decoding="async"
            className="w-full h-auto block"
          />
        </div>
        {/* Bottom fade — blends into page background */}
        <div className="absolute bottom-0 left-0 right-0 h-24 sm:h-32 bg-gradient-to-t from-background-light dark:from-background-dark via-background-light/80 dark:via-background-dark/80 to-transparent z-20 pointer-events-none" />
      </div>
    </section>
  )
}

export default Hero
