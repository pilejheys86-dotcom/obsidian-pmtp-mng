import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../context'

const CELL_SIZE = 48
const FILL_PROBABILITY = 0.24

const HOVER_LIFETIME = 1100
const DRAG_LIFETIME = 1600
const HOVER_DEDUPE_MS = 450
const DRAG_DEDUPE_MS = 220
const MAX_INTERACTION_CELLS = 60
const RECENT_KEY_TTL = 2000

// Text safe-zone as a fraction of the container dimensions.
// Ambient and interaction cells both skip this region to keep text legible.
const TEXT_ZONE = { x: 0, y: 0, w: 0.6, h: 1 }
const TEXT_ZONE_MOBILE = { x: 0, y: 0, w: 1, h: 0.55 }

const isInsideTextZone = (gridX, gridY, width, height) => {
  const isMobile = width < 768
  const zone = isMobile ? TEXT_ZONE_MOBILE : TEXT_ZONE
  return gridX < zone.w * width && gridY < zone.h * height
}

const HeroGridBackground = () => {
  const { isDarkMode } = useTheme()
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ width: 0, height: 0 })
  const [interactionCells, setInteractionCells] = useState([])
  const [reducedMotion, setReducedMotion] = useState(false)

  const nextIdRef = useRef(0)
  const isDraggingRef = useRef(false)
  const recentKeysRef = useRef(new Map())
  const rafPendingRef = useRef(false)
  const lastPosRef = useRef(null)

  // Respect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Measure container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const updateDims = () => setDims({ width: el.offsetWidth, height: el.offsetHeight })
    updateDims()
    const ro = new ResizeObserver(updateDims)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Sweep expired interaction cells + stale dedupe keys
  useEffect(() => {
    if (reducedMotion) return
    const interval = setInterval(() => {
      const t = performance.now()
      setInteractionCells((prev) => {
        const next = prev.filter((c) => c.expiresAt > t)
        return next.length === prev.length ? prev : next
      })
      recentKeysRef.current.forEach((seen, key) => {
        if (t - seen > RECENT_KEY_TTL) recentKeysRef.current.delete(key)
      })
    }, 250)
    return () => clearInterval(interval)
  }, [reducedMotion])

  // Mouse interaction — hover + drag
  useEffect(() => {
    if (reducedMotion) return
    const container = containerRef.current
    if (!container) return

    const getLocalCoords = (e) => {
      const rect = container.getBoundingClientRect()
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return null
      }
      return {
        localX: e.clientX - rect.left,
        localY: e.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      }
    }

    const spawnCells = (localX, localY, width, height, isDrag) => {
      const count = isDrag ? 1 + Math.floor(Math.random() * 3) : 1
      const spread = isDrag ? CELL_SIZE * 2.5 : CELL_SIZE * 1.4
      const dedupeMs = isDrag ? DRAG_DEDUPE_MS : HOVER_DEDUPE_MS
      const lifetime = isDrag ? DRAG_LIFETIME : HOVER_LIFETIME
      const now = performance.now()
      const fresh = []

      for (let i = 0; i < count; i++) {
        const offsetX = (Math.random() - 0.5) * spread
        const offsetY = (Math.random() - 0.5) * spread
        const gridX = Math.floor((localX + offsetX) / CELL_SIZE) * CELL_SIZE
        const gridY = Math.floor((localY + offsetY) / CELL_SIZE) * CELL_SIZE

        // Stay fully within the visible grid
        if (gridX < 0 || gridY < 0) continue
        if (gridX + CELL_SIZE > width || gridY + CELL_SIZE > height) continue

        // Interaction cells may spawn anywhere in the hero. The grid sits
        // beneath the text (stacking order) and has pointer-events:none, so
        // text and CTA remain clickable and visually on top. Ambient cells
        // still respect the text safe-zone.

        // Per-cell cooldown so the same square can't re-fire rapidly
        const key = `${gridX},${gridY}`
        const lastSeen = recentKeysRef.current.get(key)
        if (lastSeen && now - lastSeen < dedupeMs) continue
        recentKeysRef.current.set(key, now)

        fresh.push({
          id: nextIdRef.current++,
          x: gridX,
          y: gridY,
          gradIdx: Math.floor(Math.random() * 4),
          maxOpacity: isDrag ? 0.3 + Math.random() * 0.25 : 0.15 + Math.random() * 0.2,
          lifetime,
          expiresAt: now + lifetime,
        })
      }

      if (fresh.length === 0) return

      setInteractionCells((prev) => {
        const combined = [...prev, ...fresh]
        // Hard cap so a runaway session can't grow the DOM indefinitely
        if (combined.length <= MAX_INTERACTION_CELLS) return combined
        return combined.slice(combined.length - MAX_INTERACTION_CELLS)
      })
    }

    const handleMouseDown = (e) => {
      if (e.button !== 0) return
      if (getLocalCoords(e)) isDraggingRef.current = true
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
    }

    const handleMouseMove = (e) => {
      const coords = getLocalCoords(e)
      if (!coords) {
        lastPosRef.current = null
        return
      }
      lastPosRef.current = { ...coords, isDrag: isDraggingRef.current }
      if (rafPendingRef.current) return
      rafPendingRef.current = true
      requestAnimationFrame(() => {
        rafPendingRef.current = false
        const pos = lastPosRef.current
        if (!pos) return
        spawnCells(pos.localX, pos.localY, pos.width, pos.height, pos.isDrag)
      })
    }

    const handleMouseLeave = () => {
      lastPosRef.current = null
      isDraggingRef.current = false
    }

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleMouseLeave)

    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleMouseLeave)
    }
  }, [reducedMotion])

  const cols = Math.ceil(dims.width / CELL_SIZE)
  const rows = Math.ceil(dims.height / CELL_SIZE)

  const ambientCells = useMemo(() => {
    if (cols === 0 || rows === 0) return []
    const result = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL_SIZE
        const y = r * CELL_SIZE
        if (isInsideTextZone(x, y, dims.width, dims.height)) continue
        if (Math.random() < FILL_PROBABILITY) {
          result.push({
            x,
            y,
            gradIdx: Math.floor(Math.random() * 4),
            maxOpacity: 0.15 + Math.random() * 0.3,
            delay: Math.random() * 6,
            duration: 2 + Math.random() * 4,
          })
        }
      }
    }
    return result
  }, [cols, rows, dims.width, dims.height])

  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
  const fillColor = isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.3)'

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <svg className="absolute inset-0 w-full h-full" style={{ display: 'block' }}>
        <defs>
          <pattern
            id="hero-grid-pattern"
            width={CELL_SIZE}
            height={CELL_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${CELL_SIZE} 0 L 0 0 0 ${CELL_SIZE}`}
              fill="none"
              stroke={gridColor}
              strokeWidth="1"
            />
          </pattern>
          {[0, 90, 180, 270].map((angle, i) => (
            <linearGradient
              key={i}
              id={`hero-grid-grad-${i}`}
              gradientTransform={`rotate(${angle} 0.5 0.5)`}
            >
              <stop offset="0%" stopColor={fillColor} stopOpacity="1" />
              <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Base grid lines — always visible */}
        <rect width="100%" height="100%" fill="url(#hero-grid-pattern)" />

        {/* Ambient strobing cells (disabled when reduced-motion) */}
        {!reducedMotion &&
          ambientCells.map((cell, i) => (
            <rect
              key={`ambient-${isDarkMode}-${cell.x}-${cell.y}-${i}`}
              x={cell.x}
              y={cell.y}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill={`url(#hero-grid-grad-${cell.gradIdx})`}
              style={{
                opacity: 0,
                animation: `hero-grid-strobe ${cell.duration}s ease-in-out ${cell.delay}s infinite`,
                ['--strobe-max']: cell.maxOpacity,
              }}
            />
          ))}

        {/* Hover + drag interaction cells */}
        {interactionCells.map((cell) => (
          <rect
            key={cell.id}
            x={cell.x}
            y={cell.y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={`url(#hero-grid-grad-${cell.gradIdx})`}
            style={{
              opacity: 0,
              animation: `hero-grid-burst ${cell.lifetime}ms ease-out forwards`,
              ['--burst-max']: cell.maxOpacity,
            }}
          />
        ))}
      </svg>
    </div>
  )
}

export default HeroGridBackground
