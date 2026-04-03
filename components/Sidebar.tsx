'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useUser, UserButton } from '@clerk/nextjs'
import {
  PenSquare,
  Search,
  Filter,
  HelpCircle,
  Settings,
  Trash2,
} from 'lucide-react'
import type { Note } from '@/types'

interface SidebarProps {
  notes: Note[]
  activeNoteId: string | null
  onSelectNote: (id: string) => void
  onNewNote: () => void
  onDeleteNote: (id: string) => void
  onOpenSettings: () => void
}

export default function Sidebar({
  notes,
  activeNoteId,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onOpenSettings,
}: SidebarProps) {
  const { user, isSignedIn } = useUser()
  const [search, setSearch] = useState('')
  const [hoveredNote, setHoveredNote] = useState<string | null>(null)

  const filtered = notes.filter((n) => {
    const q = search.toLowerCase()
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  })

  const stripHtml = (html: string) => {
    if (typeof window === 'undefined') return html
    const div = document.createElement('div')
    div.innerHTML = html
    return div.textContent ?? ''
  }

  return (
    <div className="sidebar flex flex-col h-full w-[200px] flex-shrink-0 relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <span className="font-bold text-sm tracking-tight text-[#D4550A]">barraPAD</span>
        <button
          onClick={onNewNote}
          className="p-1.5 rounded hover:bg-black/5 transition-colors text-[#C4BFB6]"
          title="New note"
        >
          <PenSquare size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-1.5 bg-white/60 border border-[#E5E0D8] rounded-lg px-2 py-1.5">
          <Search size={12} className="text-[#C4BFB6] flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 text-xs bg-transparent outline-none text-[#1A1A1A] placeholder-[#C4BFB6] min-w-0"
          />
          <Filter size={12} className="text-[#C4BFB6] flex-shrink-0" />
        </div>
      </div>

      {/* Notes section label */}
      <div className="px-3 py-1">
        <span className="text-[10px] font-semibold text-[#C4BFB6] uppercase tracking-widest">Notes</span>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-xs text-[#C4BFB6] text-center mt-4 px-2">
            {search ? 'No results' : 'No notes yet'}
          </p>
        )}
        {filtered.map((note) => (
          <div
            key={note.id}
            onMouseEnter={() => setHoveredNote(note.id)}
            onMouseLeave={() => setHoveredNote(null)}
            className={`note-item group relative flex items-start gap-1 ${
              note.id === activeNoteId ? 'active' : ''
            }`}
            onClick={() => onSelectNote(note.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#1A1A1A] truncate leading-tight">
                {note.title || 'Untitled'}
              </p>
              <p className="text-[10px] text-[#C4BFB6] truncate leading-tight mt-0.5">
                {stripHtml(note.content).slice(0, 50) || 'No content'}
              </p>
            </div>
            {hoveredNote === note.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteNote(note.id)
                }}
                className="flex-shrink-0 p-0.5 rounded hover:bg-red-100 text-[#C4BFB6] hover:text-red-500 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#E5E0D8] px-3 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-black/5 transition-colors text-[#C4BFB6]" title="Help">
            <HelpCircle size={16} />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded hover:bg-black/5 transition-colors text-[#C4BFB6]"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>

        {isSignedIn && user ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'w-5 h-5',
                },
              }}
            />
            <span className="text-[10px] text-[#1A1A1A] truncate font-medium">
              {user.fullName ?? user.username ?? 'User'}
            </span>
          </div>
        ) : (
          <Link
            href="/sign-in"
            className="text-xs text-[#D4550A] font-medium hover:underline"
          >
            Sign In
          </Link>
        )}
      </div>
    </div>
  )
}
