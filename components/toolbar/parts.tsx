'use client'

import { useRef, useCallback } from 'react'
import { useKeyboardInset } from './helpers'

export function MobileSheet({
  onClose,
  title,
  children,
}: {
  onClose: () => void
  title?: string
  children: React.ReactNode
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const dragYRef = useRef(0)
  const draggingRef = useRef(false)
  // Sit above the on-screen keyboard, which stays open while the editor has focus.
  const keyboardInset = useKeyboardInset()

  const onPillTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation()
    startYRef.current = e.touches[0].clientY
    dragYRef.current = 0
    draggingRef.current = true
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }, [])

  const onPillTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingRef.current) return
    e.stopPropagation()
    const dy = Math.max(0, e.touches[0].clientY - startYRef.current)
    dragYRef.current = dy
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`
  }, [])

  const onPillTouchEnd = useCallback(() => {
    draggingRef.current = false
    if (dragYRef.current > 80) {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.22s ease'
        sheetRef.current.style.transform = 'translateY(100%)'
      }
      setTimeout(onClose, 220)
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        sheetRef.current.style.transform = 'translateY(0)'
      }
      dragYRef.current = 0
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ bottom: keyboardInset }} onClick={onClose}>
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--editor-bg)',
          borderTop: '1px solid var(--border)',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: '0 -8px 32px rgba(0,0,0,0.14)',
          maxHeight: '82vh',
          overflowY: 'auto',
          animation: 'slideUp 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Pill handle — drag down to dismiss */}
        <div
          onTouchStart={onPillTouchStart}
          onTouchMove={onPillTouchMove}
          onTouchEnd={onPillTouchEnd}
          onClick={onClose}
          aria-label="Close"
          style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            padding: '12px 0 4px',
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--muted)' }} />
        </div>
        {title && (
          <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--ink)', padding: '4px 0 4px' }}>
            {title}
          </p>
        )}
        <div style={{ padding: '8px 16px 32px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function TBtn({
  onClick,
  active,
  disabled,
  label,
  shortcut,
  children,
  className = '',
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label?: string
  shortcut?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="tbtn-wrapper" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          relative flex items-center justify-center p-2 md:p-1.5 rounded-lg
          disabled:opacity-25 disabled:cursor-not-allowed
          ${active
            ? 'bg-[var(--accent)]/10 text-[var(--accent)] shadow-inner'
            : 'text-[var(--ink-soft)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'
          }
          ${className}
        `}
        style={{ transition: 'background 120ms ease, color 120ms ease, transform 130ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 120ms ease' }}
        onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'scale(1.12)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
        onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.92)' }}
        onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.12)' }}
      >
        {children}
        {active && (
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent)]" />
        )}
      </button>

      {label && (
        <div className="tbtn-tooltip">
          {label}
          {shortcut && (
            <>
              <span style={{ opacity: 0.45, margin: '0 4px' }}>·</span>
              <span className="tbtn-tooltip-key">{shortcut}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
