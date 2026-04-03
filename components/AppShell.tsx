'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Share2, X, CloudUpload } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './Sidebar'
import EditorWrapper from './EditorWrapper'
import ShareModal from './ShareModal'
import AppearanceModal from './AppearanceModal'
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

// Cache helpers — used as the primary data source, API is secondary
function loadCachedNotes(): Note[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('barrapad_notes')
    if (raw) return JSON.parse(raw) as Note[]
  } catch {}
  return []
}

function saveCachedNotes(notes: Note[]) {
  try {
    // Don't cache temp notes
    const real = notes.filter((n) => !n.id.startsWith('temp-'))
    localStorage.setItem('barrapad_notes', JSON.stringify(real))
  } catch {}
}

export default function AppShell() {
  // Lazy init from cache — renders instantly, no loading state needed
  const [notes, setNotes] = useState<Note[]>(() => loadCachedNotes())
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => loadCachedNotes()[0]?.id ?? null)
  const [showShare, setShowShare] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [manualSaving, setManualSaving] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null

  useEffect(() => {
    const settings = loadAppearance()
    setAppearance(settings)
    applyAppearance(settings)
  }, [])

  // Background sync — reconcile with server without blocking UI
  useEffect(() => {
    fetchNotes()
  }, [])

  const fetchNotes = async () => {
    try {
      const res = await fetch('/api/notes')
      if (!res.ok) return
      const data = (await res.json()) as Note[]
      setNotes(data)
      saveCachedNotes(data)
      setActiveNoteId((prev) => {
        // Keep current selection if it still exists, otherwise pick first
        if (prev && data.some((n) => n.id === prev)) return prev
        return data[0]?.id ?? null
      })
    } catch {}
  }

  const updateNotes = useCallback((updater: (prev: Note[]) => Note[]) => {
    setNotes((prev) => {
      const next = updater(prev)
      saveCachedNotes(next)
      return next
    })
  }, [])

  /** Immediate: update localStorage only, no API call */
  const handleLocalChange = useCallback((title: string, content: string) => {
    if (!activeNoteId || activeNoteId.startsWith('temp-')) return
    updateNotes((prev) =>
      prev.map((n) =>
        n.id === activeNoteId
          ? { ...n, title, content, updatedAt: new Date().toISOString() }
          : n
      )
    )
  }, [activeNoteId, updateNotes])

  /** Background sync to API — triggered by blur / tab switch / 30s idle */
  const handleAutoSave = useCallback(async (title: string, content: string) => {
    if (!activeNoteId || activeNoteId.startsWith('temp-')) return
    setAutoSaving(true)
    try {
      await fetch(`/api/notes/${activeNoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
    } catch {}
    setAutoSaving(false)
  }, [activeNoteId])

  /** Manual save — triggered by the Save button */
  const handleManualSaveContent = useCallback(async (title: string, content: string) => {
    if (!activeNoteId || activeNoteId.startsWith('temp-')) return
    setManualSaving(true)
    try {
      await fetch(`/api/notes/${activeNoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
    } catch {}
    setManualSaving(false)
  }, [activeNoteId])

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
        updateNotes((prev) => prev.filter((n) => n.id !== tempId))
        return
      }
      const note = (await res.json()) as Note
      updateNotes((prev) => prev.map((n) => (n.id === tempId ? note : n)))
      setActiveNoteId(note.id)
    } catch {
      updateNotes((prev) => prev.filter((n) => n.id !== tempId))
    }
  }

  const handleDeleteNote = async (id: string) => {
    const prev = notes
    updateNotes((n) => n.filter((note) => note.id !== id))
    if (activeNoteId === id) {
      const remaining = prev.filter((n) => n.id !== id)
      setActiveNoteId(remaining[0]?.id ?? null)
    }
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    } catch {
      setNotes(prev)
      saveCachedNotes(prev)
    }
  }

  const triggerManualSave = () => {
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
          {/* Auto-save indicator — appears only during background sync */}
          <AnimatePresence>
            {autoSaving && (
              <motion.span
                key="autosave-indicator"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-1"
                style={{ color: 'var(--muted)' }}
                title="Syncing to server…"
              >
                <CloudUpload size={13} className="animate-pulse" />
              </motion.span>
            )}
          </AnimatePresence>

          {activeNote && (
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-black/5 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <Share2 size={13} />
              Share
            </button>
          )}
          <button
            onClick={triggerManualSave}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:opacity-80 transition-opacity"
            style={{ background: 'var(--ink)', color: 'var(--editor-bg)' }}
          >
            <Save size={13} />
            {manualSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {activeNote ? (
            <EditorWrapper
              key={activeNote.id}
              note={activeNote}
              onLocalChange={handleLocalChange}
              onAutoSave={handleAutoSave}
              onManualSave={handleManualSaveContent}
            />
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

        {/* Bottom strip */}
        <div className="flex items-center justify-end px-4 py-1 border-t" style={{ background: 'var(--editor-bg)', borderColor: 'var(--border)' }}>
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
