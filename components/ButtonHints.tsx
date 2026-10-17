'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Small "click here" labels with an arrow, next to the buttons people miss.
// They show for a few seconds on the first few visits, then stop for good.
// A label also stops once its button has been clicked. They never take
// clicks, so nothing under them is blocked.
type Hint = { name: string; text: string; touchText?: string; side: 'right' | 'below' }

const HINTS: Hint[] = [
  { name: 'new-note', text: 'Click here to start a new note', side: 'right' },
  { name: 'menu', text: 'Click here for your notes', touchText: 'Tap here for your notes', side: 'right' },
  { name: 'focus', text: 'Click here to focus on writing', touchText: 'Tap here to focus on writing', side: 'below' },
  { name: 'settings', text: 'Click here for dark mode and themes', side: 'right' },
]

const MAX_VISITS = 3
const SHOW_MS = 9000
const VISITS_KEY = 'bpad_hint_visits'
const doneKey = (name: string) => `bpad_hint_done_${name}`

type Placed = Hint & { rect: DOMRect }

function visible(name: string): DOMRect | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-hint="${name}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return r
  }
  return null
}

export default function ButtonHints() {
  const [placed, setPlaced] = useState<Placed[]>([])
  const [touch, setTouch] = useState(false)

  useEffect(() => {
    let visits = 0
    try {
      visits = Number(localStorage.getItem(VISITS_KEY) ?? 0)
      // One visit per browser tab, not per reload or note switch.
      if (!sessionStorage.getItem(VISITS_KEY)) {
        sessionStorage.setItem(VISITS_KEY, '1')
        localStorage.setItem(VISITS_KEY, String(++visits))
      }
    } catch { return }
    if (visits > MAX_VISITS) return
    setTouch(window.matchMedia('(pointer: coarse)').matches)

    const place = () => {
      const shown = HINTS.flatMap((h) => {
        try { if (localStorage.getItem(doneKey(h.name))) return [] } catch {}
        const rect = visible(h.name)
        return rect ? [{ ...h, rect }] : []
      })
      // Phones have one short top bar, so labels would overlap there: show one
      // per visit, taking turns.
      setPlaced(window.innerWidth < 640 && shown.length ? [shown[(visits - 1) % shown.length]] : shown)
    }
    // Wait for the top bar and sidebar to lay out.
    const start = setTimeout(place, 600)
    const stop = setTimeout(() => setPlaced([]), 600 + SHOW_MS)
    const onClick = (e: MouseEvent) => {
      const name = (e.target as HTMLElement).closest<HTMLElement>('[data-hint]')?.dataset.hint
      if (!name) return
      try { localStorage.setItem(doneKey(name), '1') } catch {}
      setPlaced((p) => p.filter((h) => h.name !== name))
    }
    window.addEventListener('resize', place)
    document.addEventListener('click', onClick, true)
    return () => {
      clearTimeout(start)
      clearTimeout(stop)
      window.removeEventListener('resize', place)
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  return (
    <AnimatePresence>
      {placed.map((h) => {
        const { rect } = h
        const right = h.side === 'right'
        // A label under a button hangs toward the middle of the screen.
        const leftHalf = rect.left + rect.width / 2 < window.innerWidth / 2
        const style: React.CSSProperties = right
          ? { left: rect.right + 6, top: rect.top + rect.height / 2 - 12 }
          : leftHalf
            ? { left: Math.max(8, rect.left - 4), top: rect.bottom + 4 }
            : { right: window.innerWidth - rect.right - 4, top: rect.bottom + 4 }
        const arrowOffset = rect.width / 2 - 11 + (!right && leftHalf ? Math.min(4, rect.left - 8) : 0)
        return (
          <motion.div
            key={h.name}
            data-button-hint={h.name}
            data-chrome
            aria-hidden
            className={`fixed z-[70] pointer-events-none flex ${right ? 'flex-row items-center' : leftHalf ? 'flex-col items-start' : 'flex-col items-end'}`}
            style={style}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.svg
              width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D4550A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
              style={{ rotate: right ? 0 : 90, [leftHalf ? 'marginLeft' : 'marginRight']: right ? 0 : arrowOffset }}
              animate={right ? { x: [0, -4, 0] } : { y: [0, -4, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </motion.svg>
            <span
              className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ background: '#D4550A', fontFamily: 'var(--font-family-mono)', boxShadow: '0 4px 14px rgba(212,85,10,0.3)' }}
            >
              {touch && h.touchText ? h.touchText : h.text}
            </span>
          </motion.div>
        )
      })}
    </AnimatePresence>
  )
}
