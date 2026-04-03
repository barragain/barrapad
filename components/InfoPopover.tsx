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
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
      className="absolute bottom-0 right-0 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl w-72 text-sm"
    >
      <div className="p-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-[#C4BFB6]">Words</span>
          <span className="font-medium text-[#1A1A1A]">{wordCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#C4BFB6]">Characters</span>
          <span className="font-medium text-[#1A1A1A]">{charCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#C4BFB6]">Created</span>
          <span className="font-medium text-[#1A1A1A] text-right">{formatDate(note.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#C4BFB6]">Updated</span>
          <span className="font-medium text-[#1A1A1A] text-right">{formatDate(note.updatedAt)}</span>
        </div>

        <hr className="border-[#E5E0D8]" />

        <p className="text-xs text-[#C4BFB6]">
          Use the following key to edit the note on other devices.
        </p>

        <button className="w-full py-2 px-3 text-sm border-2 border-amber-500 text-amber-600 rounded-lg hover:bg-amber-50 transition-colors font-medium">
          🔑 Save note to view Edit Key
        </button>
      </div>
    </div>
  )
}
