'use client'

import { useEffect, useRef } from 'react'
import type { Note } from '@/types'

interface InfoPopoverProps {
  note: Note
  wordCount: number
  charCount: number
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return { date, time }
}

export default function InfoPopover({ note, wordCount, charCount, onClose, anchorRef }: InfoPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose, anchorRef])

  return (
    <div
      ref={popoverRef}
      className="rounded-xl shadow-xl w-64 text-sm"
      style={{ background: 'var(--editor-bg)', border: '1px solid var(--border)' }}
    >
      <div className="p-4 space-y-2">
        <div className="flex justify-between">
          <span style={{ color: 'var(--muted)' }}>Words</span>
          <span className="font-medium" style={{ color: 'var(--ink)' }}>{wordCount}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--muted)' }}>Characters</span>
          <span className="font-medium" style={{ color: 'var(--ink)' }}>{charCount}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--muted)' }}>Created</span>
          <span className="font-medium text-right leading-tight" style={{ color: 'var(--ink)' }}>
            <span className="block">{formatDate(note.createdAt).date}</span>
            <span className="block">{formatDate(note.createdAt).time}</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--muted)' }}>Updated</span>
          <span className="font-medium text-right leading-tight" style={{ color: 'var(--ink)' }}>
            <span className="block">{formatDate(note.updatedAt).date}</span>
            <span className="block">{formatDate(note.updatedAt).time}</span>
          </span>
        </div>

      </div>
    </div>
  )
}
