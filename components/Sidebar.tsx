'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
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
import { Users, Link2 } from 'lucide-react'
import type { Note, Tag, SharedAccessRecord } from '@/types'
import ContextMenu from './ContextMenu'

const AboutModal = dynamic(() => import('./AboutModal'), { ssr: false })

interface SidebarProps {
  notes: Note[]
  sharedNotes: SharedAccessRecord[]
  activeNoteId: string | null
  onSelectNote: (id: string) => void
  onNewNote: () => void
  onDeleteNote: (id: string) => void
  onOpenSettings: () => void
  onRenameNote: (id: string, newTitle: string) => void
  onOpenSharedNote: (token: string) => void
  onRemoveSharedNote: (noteId: string, token: string) => void
  onRenameSharedNote: (token: string, noteId: string, newTitle: string) => void
  onDeleteSharedNote: (noteId: string, token: string) => void
}

export default function Sidebar({
  notes,
  sharedNotes,
  activeNoteId,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onOpenSettings,
  onRenameNote,
  onOpenSharedNote,
  onRemoveSharedNote,
  onRenameSharedNote,
  onDeleteSharedNote,
}: SidebarProps) {
  const { user, isSignedIn } = useUser()
  const [search, setSearch] = useState('')
  const [activeTagLabels, setActiveTagLabels] = useState<string[]>([])
  const [showAbout, setShowAbout] = useState(false)
  const aboutAudioRef = useRef<HTMLAudioElement | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null)
  const [sharedContextMenu, setSharedContextMenu] = useState<{ x: number; y: number; noteId: string; token: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renamingSharedToken, setRenamingSharedToken] = useState<string | null>(null)
  const [renameSharedValue, setRenameSharedValue] = useState('')

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

  const allSidebarTags = useMemo<Tag[]>(() => {
    const seen = new Map<string, Tag>()
    for (const note of notes) {
      for (const tag of (note.tags ?? [])) {
        if (!seen.has(tag.label.toLowerCase())) seen.set(tag.label.toLowerCase(), tag)
      }
    }
    return [...seen.values()]
  }, [notes])

  const toggleTagFilter = (label: string) => {
    setActiveTagLabels(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  const searchFiltered = notes.filter((n) => {
    if (!search) return true
    const q = search.toLowerCase()
    const plainContent = stripHtml(n.content).toLowerCase()
    return n.title.toLowerCase().includes(q) || plainContent.includes(q)
  })

  const filtered = (activeTagLabels.length === 0
    ? searchFiltered
    : searchFiltered.filter(n =>
        activeTagLabels.some(label =>
          (n.tags ?? []).some(t => t.label.toLowerCase() === label.toLowerCase())
        )
      )
  ).filter(n => !n.sharedToken)  // shared notes live only in the "Shared with me" section

  const getContentPreview = (note: Note): React.ReactNode => {
    const plain = stripHtml(note.content)
    // Skip the first line (title) so the preview doesn't repeat the sidebar title
    const firstNewline = plain.indexOf('\n')
    const body = firstNewline !== -1 ? plain.slice(firstNewline + 1).trim() : ''
    if (!search) return body.slice(0, 50) || 'No additional content'

    const q = search.toLowerCase()
    const lowerPlain = plain.toLowerCase()
    const idx = lowerPlain.indexOf(q)

    if (idx === -1) return body.slice(0, 50) || 'No additional content'

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
        <img src="/logo.svg" alt="barraPAD" className="h-9 w-auto" />
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

      {/* Tag filter */}
      {allSidebarTags.length > 0 && (
        <div className="px-2 pb-1">
          <div className="flex flex-wrap gap-1">
            {allSidebarTags.map(tag => {
              const isActive = activeTagLabels.includes(tag.label)
              return (
                <button
                  key={tag.label}
                  onClick={() => toggleTagFilter(tag.label)}
                  style={{
                    fontSize: 10, fontWeight: 500,
                    padding: '2px 7px', borderRadius: 12,
                    border: `1px solid ${tag.color}`,
                    background: isActive ? tag.color : 'transparent',
                    color: isActive ? '#fff' : tag.color,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                    lineHeight: '1.5',
                  }}
                >
                  {tag.label}
                </button>
              )
            })}
            {activeTagLabels.length > 0 && (
              <button
                onClick={() => setActiveTagLabels([])}
                style={{ fontSize: 10, color: '#8A8178', cursor: 'pointer', background: 'none', border: 'none', padding: '2px 4px' }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Notes section label */}
      <div className="px-3 py-1">
        <span className="text-[10px] font-semibold text-[#8A8178] uppercase tracking-widest">My Notes</span>
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
                <div className="flex items-center gap-1 min-w-0">
                  {note.isShared && (
                    <Link2 size={9} className="flex-shrink-0" style={{ color: '#D4550A' }} />
                  )}
                  <p className="text-xs font-medium text-[#1A1A1A] truncate leading-tight">
                    {note.title || 'Untitled'}
                  </p>
                </div>
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

      {/* Shared with me section */}
      <div className="mx-2 mb-2 rounded-xl overflow-hidden" style={{ background: '#D4550A0D', border: '1px solid #D4550A22' }}>
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5">
          <Users size={10} style={{ color: '#D4550A' }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#D4550A' }}>Shared with me</span>
        </div>
        <div className="px-1 pb-1.5 space-y-0.5">
          {sharedNotes.length === 0 ? (
            <p className="text-[11px] px-2 pb-1" style={{ color: '#D4550A66' }}>You don&apos;t have shared notes yet</p>
          ) : (
            sharedNotes.map((record) => {
              const isActive = activeNoteId === `shared-${record.token}`
              return (
                <button
                  key={record.id}
                  onClick={() => onOpenSharedNote(record.token)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setSharedContextMenu({ x: e.clientX, y: e.clientY, noteId: record.noteId, token: record.token })
                  }}
                  className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
                  style={{
                    background: isActive ? '#D4550A1F' : 'transparent',
                    border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#D4550A14' }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <div className="min-w-0 flex-1">
                    {renamingSharedToken === record.token ? (
                      <input
                        autoFocus
                        value={renameSharedValue}
                        onChange={(e) => setRenameSharedValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onRenameSharedNote(record.token, record.noteId, renameSharedValue.trim() || 'Untitled')
                            setRenamingSharedToken(null)
                          } else if (e.key === 'Escape') {
                            setRenamingSharedToken(null)
                          }
                        }}
                        onBlur={() => {
                          onRenameSharedNote(record.token, record.noteId, renameSharedValue.trim() || 'Untitled')
                          setRenamingSharedToken(null)
                        }}
                        style={{
                          fontSize: 12, fontWeight: 500,
                          color: 'var(--ink)', border: 'none',
                          background: 'transparent', outline: 'none',
                          width: '100%', padding: 0,
                        }}
                      />
                    ) : (
                      <p className="text-xs font-medium truncate leading-tight" style={{ color: 'var(--ink)' }}>
                        {record.noteTitle || 'Untitled'}
                      </p>
                    )}
                    <p className="text-[10px] leading-tight" style={{ color: '#D4550A99' }}>
                      {record.permission === 'EDIT' ? 'Can edit' : 'View only'}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {sharedContextMenu && (() => {
        const record = sharedNotes.find(r => r.token === sharedContextMenu.token)
        return (
          <ContextMenu
            x={sharedContextMenu.x}
            y={sharedContextMenu.y}
            items={[
              {
                type: 'item',
                label: 'Rename',
                onClick: () => {
                  setRenameSharedValue(record?.noteTitle || 'Untitled')
                  setRenamingSharedToken(sharedContextMenu.token)
                  setSharedContextMenu(null)
                },
              },
              { type: 'separator' },
              ...(record?.permission === 'EDIT' ? [{
                type: 'item' as const,
                label: 'Delete note for everyone',
                danger: true,
                onClick: () => {
                  onDeleteSharedNote(sharedContextMenu.noteId, sharedContextMenu.token)
                  setSharedContextMenu(null)
                },
              }, { type: 'separator' as const }] : []),
              {
                type: 'item',
                label: 'Remove from my list',
                danger: true,
                onClick: () => {
                  onRemoveSharedNote(sharedContextMenu.noteId, sharedContextMenu.token)
                  setSharedContextMenu(null)
                },
              },
            ]}
            onClose={() => setSharedContextMenu(null)}
          />
        )
      })()}

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
            {
              type: 'item',
              label: 'Add tag…',
              onClick: () => {
                onSelectNote(contextMenu.noteId)
                setContextMenu(null)
                setTimeout(() => window.dispatchEvent(new Event('barrapad:focus-tags')), 120)
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
