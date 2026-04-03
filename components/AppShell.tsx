'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Save, Share2, X, Info } from 'lucide-react'
import Sidebar from './Sidebar'
import EditorWrapper from './EditorWrapper'
import ShareModal from './ShareModal'
import AppearanceModal from './AppearanceModal'
import InfoPopover from './InfoPopover'
import type { Note, AppearanceSettings } from '@/types'

const DEFAULT_APPEARANCE: AppearanceSettings = {
  mode: 'light',
  font: 'mono',
  zoom: 16,
  theme: 'barrapad',
}

function loadAppearance(): AppearanceSettings {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = localStorage.getItem('barrapad_appearance')
    if (raw) return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_APPEARANCE
}

function applyAppearance(settings: AppearanceSettings) {
  const root = document.documentElement
  root.setAttribute('data-theme', settings.theme)
  root.setAttribute('data-font', settings.font)
  if (settings.mode === 'dark') {
    root.classList.add('dark')
  } else if (settings.mode === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
  root.style.setProperty('--editor-size', `${settings.zoom}px`)
}

export default function AppShell() {
  const [notes, setNotes] = useState<Note[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [notesLoading, setNotesLoading] = useState(true)
  const [showShare, setShowShare] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const infoButtonRef = useRef<HTMLButtonElement>(null)

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null

  useEffect(() => {
    const settings = loadAppearance()
    setAppearance(settings)
    applyAppearance(settings)
  }, [])

  useEffect(() => {
    fetchNotes()
  }, [])

  const fetchNotes = async () => {
    try {
      const res = await fetch('/api/notes')
      if (!res.ok) return
      const data = (await res.json()) as Note[]
      setNotes(data)
      if (data.length > 0) {
        setActiveNoteId((prev) => prev ?? data[0].id)
      }
    } catch {}
    setNotesLoading(false)
  }

  // Optimistic new note — add placeholder immediately, replace on API response
  const handleNewNote = async () => {
    const tempId = `temp-${Date.now()}`
    const tempNote: Note = {
      id: tempId,
      userId: '',
      title: 'Untitled',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setNotes((prev) => [tempNote, ...prev])
    setActiveNoteId(tempId)

    try {
      const res = await fetch('/api/notes', { method: 'POST' })
      if (!res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== tempId))
        return
      }
      const note = (await res.json()) as Note
      setNotes((prev) => prev.map((n) => (n.id === tempId ? note : n)))
      setActiveNoteId(note.id)
    } catch {
      setNotes((prev) => prev.filter((n) => n.id !== tempId))
    }
  }

  // Optimistic save — update local state immediately, sync in background
  const handleSave = useCallback(async (title: string, content: string) => {
    if (!activeNoteId || activeNoteId.startsWith('temp-')) return

    // Update local state immediately
    setNotes((prev) =>
      prev.map((n) =>
        n.id === activeNoteId
          ? { ...n, title, content, updatedAt: new Date().toISOString() }
          : n
      )
    )
    setSaving(true)

    try {
      await fetch(`/api/notes/${activeNoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
    } catch {}

    setSaving(false)
  }, [activeNoteId])

  // Optimistic delete — remove immediately
  const handleDeleteNote = async (id: string) => {
    const prev = notes
    setNotes((n) => n.filter((note) => note.id !== id))
    if (activeNoteId === id) {
      const remaining = prev.filter((n) => n.id !== id)
      setActiveNoteId(remaining[0]?.id ?? null)
    }
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    } catch {
      setNotes(prev) // rollback on error
    }
  }

  const handleManualSave = () => {
    window.dispatchEvent(new Event('barrapad:save'))
  }

  const handleAppearanceChange = (settings: AppearanceSettings) => {
    setAppearance(settings)
    applyAppearance(settings)
    localStorage.setItem('barrapad_appearance', JSON.stringify(settings))
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--editor-bg)' }}>
      <Sidebar
        notes={notes}
        activeNoteId={activeNoteId}
        onSelectNote={setActiveNoteId}
        onNewNote={handleNewNote}
        onDeleteNote={handleDeleteNote}
        onOpenSettings={() => setShowAppearance(true)}
      />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top action bar */}
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-b" style={{ background: 'var(--editor-bg)', borderColor: 'var(--border)' }}>
          {activeNote && (
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[#E5E0D8] rounded-lg hover:bg-[#F5F2ED] transition-colors text-[#1A1A1A]"
            >
              <Share2 size={13} />
              Share
            </button>
          )}
          <button
            onClick={handleManualSave}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1A1A1A] text-white rounded-lg hover:bg-black/80 transition-colors"
          >
            <Save size={13} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {activeNote ? (
            <EditorWrapper
              key={activeNote.id}
              note={activeNote}
              onSave={handleSave}
              onWordCountChange={(w, c) => { setWordCount(w); setCharCount(c) }}
            />
          ) : notesLoading ? (
            <div className="flex h-full items-center justify-center">
              <div style={{ color: 'var(--muted)' }} className="text-sm animate-pulse">Loading…</div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>No note selected</p>
                <button
                  onClick={handleNewNote}
                  className="px-4 py-2 bg-[#D4550A] text-white rounded-lg text-sm hover:bg-[#c04009] transition-colors"
                >
                  Create a note
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom strip — Info above X */}
        <div className="flex items-center justify-end px-4 py-1 gap-1 border-t" style={{ background: 'var(--editor-bg)', borderColor: 'var(--border)' }}>
          <div className="relative">
            <button
              ref={infoButtonRef}
              onClick={() => setShowInfo((v) => !v)}
              className="p-1.5 rounded hover:bg-black/5 transition-colors"
              style={{ color: 'var(--muted)' }}
              title="Note info"
            >
              <Info size={15} />
            </button>
            {showInfo && activeNote && (
              <div className="absolute bottom-full right-0 mb-1">
                <InfoPopover
                  note={activeNote}
                  wordCount={wordCount}
                  charCount={charCount}
                  onClose={() => setShowInfo(false)}
                  anchorRef={infoButtonRef}
                />
              </div>
            )}
          </div>
          <button
            className="p-1.5 rounded hover:bg-black/5 transition-colors"
            style={{ color: 'var(--muted)' }}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Modals */}
      {showShare && activeNote && (
        <ShareModal note={activeNote} onClose={() => setShowShare(false)} />
      )}
      {showAppearance && (
        <AppearanceModal
          settings={appearance}
          onChange={handleAppearanceChange}
          onClose={() => setShowAppearance(false)}
        />
      )}
    </div>
  )
}
