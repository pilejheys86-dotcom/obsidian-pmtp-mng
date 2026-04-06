import { useEffect, useRef } from 'react'

/**
 * Lightweight scroll reveal hook using IntersectionObserver.
 * Adds 'revealed' class to the ref element when it enters viewport.
 *
 * @param {Object} options
 * @param {number} options.threshold - Visibility threshold (0-1), default 0.15
 * @param {string} options.rootMargin - Observer margin, default '0px 0px -60px 0px'
 * @returns {React.RefObject}
 */
export function useScrollReveal({ threshold = 0.15, rootMargin = '0px 0px -60px 0px' } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('revealed')
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed')
          observer.unobserve(el)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  return ref
}

/**
 * Reveal with staggered children. Each child with [data-reveal-child]
 * gets a sequential animation delay.
 *
 * @param {Object} options
 * @param {number} options.stagger - Delay between children in ms, default 100
 * @param {number} options.threshold - Visibility threshold, default 0.1
 * @returns {React.RefObject}
 */
export function useStaggerReveal({ stagger = 100, threshold = 0.1 } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('revealed')
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed')
          const children = el.querySelectorAll('[data-reveal-child]')
          children.forEach((child, i) => {
            child.style.transitionDelay = `${i * stagger}ms`
          })
          observer.unobserve(el)
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [stagger, threshold])

  return ref
}
