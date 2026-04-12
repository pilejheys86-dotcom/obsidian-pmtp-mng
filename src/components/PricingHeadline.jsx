import { useEffect, useRef, useState } from 'react'

const phrase = ['Everything', 'you', 'need,', 'nothing', 'you', "don't."]

const PricingHeadline = () => {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.25, rootMargin: '0px 0px -40px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="px-4 sm:px-6">
      <div
        ref={ref}
        className="max-w-7xl mx-auto border-x border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-20 sm:py-28 flex items-center justify-center"
      >
        <h2 className="landing-h2 font-display font-light text-center leading-[1.1] flex flex-wrap justify-center gap-x-[0.35em] gap-y-2">
          {phrase.map((word, i) => (
            <span
              key={i}
              className="inline-block"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(24px)',
                transition:
                  'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
                transitionDelay: `${i * 110}ms`,
              }}
            >
              {word}
            </span>
          ))}
        </h2>
      </div>
    </section>
  )
}

export default PricingHeadline
