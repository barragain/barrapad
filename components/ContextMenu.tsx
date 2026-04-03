'use client'

import { useEffect, useRef, useState } from 'react'

export type ContextMenuItem =
  | { type: 'item'; label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { type: 'separator' }

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [visible, setVisible] = useState(false)

  // Auto-adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const clampedX = Math.min(x, vw - rect.width - 8)
    const clampedY = Math.min(y, vh - rect.height - 8)
    setPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY) })
    // Trigger entrance animation after position is set
    requestAnimationFrame(() => setVisible(true))
  }, [x, y])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Close on mousedown outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="z-[100]"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        minWidth: 180,
        background: 'var(--editor-bg)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        padding: 4,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.97)',
        transition: 'opacity 0.13s ease, transform 0.13s ease',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return (
            <div
              key={i}
              style={{
                height: 1,
                background: 'var(--border)',
                margin: '4px 0',
              }}
            />
          )
        }

        const isDisabled = item.disabled === true

        return (
          <div
            key={i}
            onClick={() => {
              if (!isDisabled) item.onClick()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 13,
              cursor: isDisabled ? 'default' : 'pointer',
              color: item.danger ? '#ef4444' : 'var(--ink)',
              opacity: isDisabled ? 0.4 : 1,
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              if (!isDisabled) {
                (e.currentTarget as HTMLDivElement).style.background = 'var(--border)'
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent'
            }}
          >
            {item.icon && <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{item.icon}</span>}
            {item.label}
          </div>
        )
      })}
    </div>
  )
}
