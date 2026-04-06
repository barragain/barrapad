'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { MentionableUser } from '@/types'

const POPOVER_WIDTH = 240

export default function MentionProfilePopover() {
  const [user, setUser] = useState<MentionableUser | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const activeElRef = useRef<HTMLElement | null>(null)

  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window

  const showPopover = useCallback(async (el: HTMLElement) => {
    const userId = el.getAttribute('data-id')
    if (!userId) return

    const rect = el.getBoundingClientRect()
    // Clamp position to viewport boundaries
    let x = rect.left
    let y = rect.bottom + 4
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (x + POPOVER_WIDTH > vw - 8) x = vw - POPOVER_WIDTH - 8
    if (x < 8) x = 8
    if (y + 120 > vh) y = rect.top - 120 // flip above if too low
    setPos({ x, y })

    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(el.textContent?.replace('@', '') || '')}`)
      if (!res.ok) return
      const users = (await res.json()) as MentionableUser[]
      const found = users.find((u) => u.id === userId)
      if (found) {
        setUser(found)
        setVisible(true)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (isTouchDevice) {
      // Touch: tap to show, tap elsewhere to dismiss
      const handleTap = (e: TouchEvent) => {
        const target = (e.target as HTMLElement).closest('.user-mention') as HTMLElement | null
        if (target) {
          e.preventDefault()
          if (activeElRef.current === target && visible) {
            setVisible(false)
            activeElRef.current = null
          } else {
            activeElRef.current = target
            showPopover(target)
          }
          return
        }
        // Tap outside — dismiss
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          setVisible(false)
          activeElRef.current = null
        }
      }
      document.addEventListener('touchstart', handleTap, { passive: false })
      return () => document.removeEventListener('touchstart', handleTap)
    } else {
      // Desktop: hover to show
      const handleMouseEnter = (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest('.user-mention') as HTMLElement | null
        if (!target) return
        activeElRef.current = target
        timeoutRef.current = setTimeout(() => showPopover(target), 300)
      }

      const handleMouseLeave = (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest('.user-mention')
        if (!target) return
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setTimeout(() => {
          if (!popoverRef.current?.matches(':hover')) {
            setVisible(false)
            activeElRef.current = null
          }
        }, 200)
      }

      document.addEventListener('mouseenter', handleMouseEnter, true)
      document.addEventListener('mouseleave', handleMouseLeave, true)
      return () => {
        document.removeEventListener('mouseenter', handleMouseEnter, true)
        document.removeEventListener('mouseleave', handleMouseLeave, true)
      }
    }
  }, [showPopover, isTouchDevice, visible])

  return (
    <AnimatePresence>
      {visible && user && pos && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, scale: 0.85, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: -4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }}
          onMouseLeave={() => { if (!isTouchDevice) setVisible(false) }}
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            zIndex: 100,
            transformOrigin: 'top left',
            maxWidth: `calc(100vw - 16px)`,
          }}
        >
          <div style={{
            background: 'var(--editor-bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '14px 16px',
            width: POPOVER_WIDTH,
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {user.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt=""
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: '#D4550A',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, flexShrink: 0,
                }}>
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.displayName}
                </div>
                {user.username && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{user.username}
                  </div>
                )}
              </div>
            </div>
            {user.email && (
              <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
