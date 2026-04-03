'use client'

import React, { useState, useRef, useEffect } from 'react'
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
import dynamic from 'next/dynamic'
import type { Note } from '@/types'
import ContextMenu from './ContextMenu'

const AboutModal = dynamic(() => import('./AboutModal'), { ssr: false })

interface SidebarProps {
  notes: Note[]
  activeNoteId: string | null
  onSelectNote: (id: string) => void
  onNewNote: () => void
  onDeleteNote: (id: string) => void
  onOpenSettings: () => void
  onRenameNote: (id: string, newTitle: string) => void
}

export default function Sidebar({
  notes,
  activeNoteId,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onOpenSettings,
  onRenameNote,
}: SidebarProps) {
  const { user, isSignedIn } = useUser()
  const [search, setSearch] = useState('')
  const [showAbout, setShowAbout] = useState(false)
  const aboutAudioRef = useRef<HTMLAudioElement | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Preload the about GIF as soon as the sidebar mounts so it's cached by the time the user clicks ?
  useEffect(() => {
    const img = new window.Image()
    img.src = '/about-gif.gif'
  }, [])

  const stripHtml = (html: string) => {
    if (typeof window === 'undefined') return html
    const div = document.createElement('div')
    div.innerHTML = html
    return div.textContent ?? ''
  }

  const filtered = notes.filter((n) => {
    if (!search) return true
    const q = search.toLowerCase()
    const plainContent = stripHtml(n.content).toLowerCase()
    return n.title.toLowerCase().includes(q) || plainContent.includes(q)
  })

  const getContentPreview = (note: Note): React.ReactNode => {
    const plain = stripHtml(note.content)
    if (!search) return plain.slice(0, 50) || 'No content'

    const q = search.toLowerCase()
    const lowerPlain = plain.toLowerCase()
    const idx = lowerPlain.indexOf(q)

    if (idx === -1) return plain.slice(0, 50) || 'No content'

    const start = Math.max(0, idx - 20)
    const end = Math.min(plain.length, idx + q.length + 30)
    const prefix = start > 0 ? '…' : ''
    const suffix = end < plain.length ? '…' : ''

    return (
      <>
        {prefix}{plain.slice(start, idx)}
        <mark style={{ background: 'rgba(212, 85, 10, 0.2)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
          {plain.slice(idx, idx + q.length)}
        </mark>
        {plain.slice(idx + q.length, end)}{suffix}
      </>
    )
  }

  return (
    <div className="sidebar flex flex-col h-full w-[230px] flex-shrink-0 relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <img src="/logo.svg" alt="barraPAD" className="h-7 w-auto" />
        <button
          onClick={onNewNote}
          className="p-1.5 rounded hover:bg-black/5 transition-colors text-[#8A8178]"
          title="New note"
        >
          <PenSquare size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-1.5 bg-white/60 border border-[#E5E0D8] rounded-lg px-2 py-1.5">
          <Search size={12} className="text-[#8A8178] flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 text-xs bg-transparent outline-none text-[#1A1A1A] placeholder-[#C4BFB6] min-w-0"
          />
          <Filter size={12} className="text-[#8A8178] flex-shrink-0" />
        </div>
      </div>

      {/* Notes section label */}
      <div className="px-3 py-1">
        <span className="text-[10px] font-semibold text-[#8A8178] uppercase tracking-widest">Notes</span>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-xs text-[#8A8178] text-center mt-4 px-2">
            {search ? 'No results' : 'No notes yet'}
          </p>
        )}
        {filtered.map((note) => (
          <div
            key={note.id}
            className={`note-item group relative flex items-start gap-1 ${
              note.id === activeNoteId ? 'active' : ''
            }`}
            onClick={() => onSelectNote(note.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id })
              setRenameValue(note.title || 'Untitled')
            }}
          >
            <div className="flex-1 min-w-0">
              {renamingId === note.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRenameNote(note.id, renameValue.trim() || 'Untitled')
                      setRenamingId(null)
                    } else if (e.key === 'Escape') {
                      setRenamingId(null)
                    }
                  }}
                  onBlur={() => {
                    onRenameNote(note.id, renameValue.trim() || 'Untitled')
                    setRenamingId(null)
                  }}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--ink)',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    width: '100%',
                    padding: 0,
                  }}
                />
              ) : (
                <p className="text-xs font-medium text-[#1A1A1A] truncate leading-tight">
                  {note.title || 'Untitled'}
                </p>
              )}
              <p className="text-[10px] text-[#8A8178] leading-tight mt-0.5 line-clamp-2">
                {getContentPreview(note)}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDeleteNote(note.id)
              }}
              className="flex-shrink-0 p-1 rounded hover:bg-red-100 text-[#C4BFB6] hover:text-red-500 transition-colors"
              title="Delete note"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              type: 'item',
              label: 'Rename',
              onClick: () => {
                setRenamingId(contextMenu.noteId)
                setContextMenu(null)
              },
            },
            { type: 'separator' },
            {
              type: 'item',
              label: 'Delete',
              danger: true,
              onClick: () => {
                onDeleteNote(contextMenu.noteId)
                setContextMenu(null)
              },
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Bottom bar */}
      <div className="border-t border-[#E5E0D8] px-3 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              // Play audio synchronously inside the user gesture — browser allows this
              const audio = new Audio('/about.mp3.mp3')
              audio.volume = 0.5
              audio.loop = true
              audio.play().catch(() => {})
              aboutAudioRef.current = audio
              setShowAbout(true)
            }}
            className="p-1.5 rounded hover:bg-black/5 transition-colors text-[#8A8178]"
            title="About"
          >
            <HelpCircle size={16} />
          </button>
          {showAbout && (
            <AboutModal
              onClose={() => {
                aboutAudioRef.current?.pause()
                if (aboutAudioRef.current) aboutAudioRef.current.currentTime = 0
                aboutAudioRef.current = null
                setShowAbout(false)
              }}
            />
          )}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded hover:bg-black/5 transition-colors text-[#8A8178]"
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
