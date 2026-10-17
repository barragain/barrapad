'use client'

import { useEffect, useState } from 'react'
import type { Awareness } from 'y-protocols/awareness'

type Presence = { id: number; name: string; color: string; imageUrl?: string }

/** Avatars of everyone else in the note's room. Clicking one scrolls to their
 *  caret, which CollaborationCaret draws as `.bpad-caret[data-client]`. */
export default function PresenceAvatars({ awareness, max = 5 }: { awareness: Awareness; max?: number }) {
  const [others, setOthers] = useState<Presence[]>([])
  useEffect(() => {
    const update = () => {
      const list: Presence[] = []
      awareness.getStates().forEach((s, id) => {
        const u = (s as { user?: Omit<Presence, 'id'> }).user
        if (id !== awareness.clientID && u) list.push({ id, name: u.name, color: u.color, imageUrl: u.imageUrl })
      })
      setOthers(list)
    }
    update()
    awareness.on('change', update)
    return () => awareness.off('change', update)
  }, [awareness])

  const jump = (id: number) => {
    const caret = document.querySelector<HTMLElement>(`.bpad-caret[data-client="${id}"]`)
    if (!caret) return
    caret.scrollIntoView({ block: 'center', behavior: 'smooth' })
    caret.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 600, delay: 250 })
  }

  if (!others.length) return null
  return (
    <div data-presence className="flex items-center" style={{ gap: 4 }}>
      {others.slice(0, max).map((p) => (
        <button
          key={p.id}
          onClick={() => jump(p.id)}
          title={`${p.name}: go to their cursor`}
          aria-label={`Go to ${p.name}'s cursor`}
          className="flex flex-shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110"
          style={{ width: 26, height: 26, padding: 0, border: `2px solid ${p.color}`, background: p.color, overflow: 'hidden', cursor: 'pointer' }}
        >
          {p.imageUrl
            ? <img src={p.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{p.name.charAt(0).toUpperCase()}</span>}
        </button>
      ))}
      {others.length > max && (
        <span style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 2 }}>+{others.length - max}</span>
      )}
    </div>
  )
}
