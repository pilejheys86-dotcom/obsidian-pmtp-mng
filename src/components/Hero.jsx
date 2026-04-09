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
  const cardRef = useRef(null)
  const [lift, setLift] = useState(0)
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

  // Scroll-driven lift for mobile, hover for desktop
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setLift(Math.min(entry.intersectionRatio * 1.5, 1)),
      { threshold: Array.from({ length: 20 }, (_, i) => i / 19) }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="pt-8 sm:pt-12 pb-0 px-4 sm:px-6 overflow-hidden">
      {/* Text content — left-aligned, same container as dashboard */}
      <div className="max-w-7xl mx-auto">
        <div ref={textRef} className="space-y-5 max-w-2xl reveal-fade-up">
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
            <a className="px-5 py-2.5 rounded-sm bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors flex items-center gap-1.5" href="/register">
              Get Started <span className="material-symbols-outlined text-base">north_east</span>
            </a>
          </div>
        </div>
      </div>

      {/* Dashboard screenshot — top half, lift on hover/scroll */}
      <div ref={mockupRef} className="relative max-w-7xl mx-auto mt-12 sm:mt-16 reveal-scale">
        {/* Scroll-driven lift wrapper */}
        <div
          ref={cardRef}
          className="transition-transform duration-700 ease-out"
          style={{ transform: `translateY(${(1 - lift) * 24}px)` }}
        >
          {/* Hover lift + shadow */}
          <div
            className="relative z-10 rounded-t-lg overflow-hidden max-h-[280px] sm:max-h-[380px] lg:max-h-[480px] transition-all duration-500 ease-out hover:-translate-y-3"
            style={{
              boxShadow: `0 ${4 + lift * 20}px ${30 + lift * 40}px ${lift * 8}px rgba(0,0,0,${0.08 + lift * 0.12}), 0 0 80px 20px rgba(0,0,0,0.06)`,
            }}
          >
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
        </div>
        {/* Bottom fade — blends into page background */}
        <div className="absolute bottom-0 left-0 right-0 h-24 sm:h-32 bg-gradient-to-t from-background-light dark:from-background-dark via-background-light/80 dark:via-background-dark/80 to-transparent z-20 pointer-events-none" />
      </div>
    </section>
  )
}

export default Hero
