'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Save, Share2, X, CloudUpload, Download, ChevronDown, Menu } from 'lucide-react'
import { useAuth, useUser } from '@clerk/nextjs'
import { AnimatePresence, motion } from 'framer-motion'
import { downloadTxt, downloadMd, downloadPdf, downloadDocx } from '@/lib/export'
import Sidebar from './Sidebar'
import EditorWrapper from './EditorWrapper'
import ShareModal from './ShareModal'
import AppearanceModal from './AppearanceModal'
import OnboardingModal from './OnboardingModal'
import type { Note, Tag, AppearanceSettings, SharedAccessRecord } from '@/types'

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
    if (raw) {
      const notes = JSON.parse(raw) as Note[]
      // Ensure tags is always an array (old cached notes won't have it)
      return notes.map(n => ({ ...n, tags: Array.isArray(n.tags) ? n.tags : [] }))
    }
  } catch {}
  return []
}

function saveCachedNotes(notes: Note[]) {
  try {
    // Don't cache temp notes or shared notes (they're not the user's own)
    const real = notes.filter((n) => !n.id.startsWith('temp-') && !n.sharedToken)
    localStorage.setItem('barrapad_notes', JSON.stringify(real))
  } catch {}
}

export default function AppShell() {
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const needsOnboarding = isLoaded && isSignedIn && user && !user.firstName
  // Lazy init from cache — renders instantly, no loading state needed
  const [notes, setNotes] = useState<Note[]>(() => loadCachedNotes())
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => loadCachedNotes()[0]?.id ?? null)
  const [sharedNotes, setSharedNotes] = useState<SharedAccessRecord[]>([])
  const [showShare, setShowShare] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [manualSaving, setManualSaving] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null

  useEffect(() => {
    const settings = loadAppearance()
    setAppearance(settings)
    applyAppearance(settings)
  }, [])

  // Update document title whenever the active note changes
  useEffect(() => {
    const noteName = activeNote?.title
    document.title = noteName
      ? `${noteName} | barraPAD - A notepad for whatever`
      : 'barraPAD - A notepad for whatever'
  }, [activeNote?.title])

  // Background sync — re-runs when Clerk finishes loading or auth state changes
  // This fixes the case where the session isn't ready on first mount (e.g. just after login)
  useEffect(() => {
    if (isLoaded) fetchNotes()
  }, [isLoaded, isSignedIn])

  const fetchNotes = async () => {
    try {
      const [notesRes, sharedRes] = await Promise.all([
        fetch('/api/notes'),
        fetch('/api/shared-notes'),
      ])
      if (notesRes.ok) {
        const raw = (await notesRes.json()) as Note[]
        const data = raw.map(n => ({ ...n, tags: Array.isArray(n.tags) ? n.tags : [] }))
        setNotes(data)
        saveCachedNotes(data)
        setActiveNoteId((prev) => {
          if (prev && (prev.startsWith('shared-') || data.some((n) => n.id === prev))) return prev
          return data[0]?.id ?? null
        })
      }
      if (sharedRes.ok) {
        setSharedNotes((await sharedRes.json()) as SharedAccessRecord[])
      }
    } catch {}
  }

  /** Open a shared note in the main editor by token */
  const openSharedNote = useCallback(async (token: string) => {
    const virtualId = `shared-${token}`
    // Already loaded — just switch to it
    setNotes((prev) => {
      if (prev.some((n) => n.id === virtualId)) return prev
      return prev // will be populated after fetch below
    })
    const existing = notes.find((n) => n.id === virtualId)
    if (existing) { setActiveNoteId(virtualId); return }

    try {
      const res = await fetch(`/api/share/${token}`)
      if (!res.ok) return
      const data = await res.json() as {
        noteId: string; title: string; content: string
        tags: import('@/types').Tag[]; permission: string; updatedAt: string
      }
      const note: Note = {
        id: virtualId,
        userId: '',
        title: data.title,
        content: data.content,
        tags: data.tags ?? [],
        createdAt: data.updatedAt,
        updatedAt: data.updatedAt,
        sharedToken: token,
        sharedPermission: data.permission as 'READ' | 'EDIT',
        sharedNoteId: data.noteId,
      }
      setNotes((prev) => {
        if (prev.some((n) => n.id === virtualId)) return prev
        return [...prev, note]
      })
      setActiveNoteId(virtualId)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  // Open a shared note from ?shared=<token> URL param on first load
  useEffect(() => {
    if (!isLoaded) return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('shared')
    if (token) {
      window.history.replaceState({}, '', '/')
      openSharedNote(token)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded])

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
      prev.map((n) => {
        if (n.id !== activeNoteId) return n
        // Only auto-update title from content if the note hasn't been manually
        // renamed (i.e. title is still the default 'Untitled' or blank).
        const useTitle = !n.title || n.title === 'Untitled' ? title : n.title
        return { ...n, title: useTitle, content, updatedAt: new Date().toISOString() }
      })
    )
  }, [activeNoteId, updateNotes])

  /** Background sync to API — triggered by blur / tab switch / 30s idle */
  const handleAutoSave = useCallback(async (contentTitle: string, content: string) => {
    if (!activeNoteId || activeNoteId.startsWith('temp-')) return
    const activeNote = notes.find(n => n.id === activeNoteId)
    if (!activeNote) return

    const storedTitle = activeNote.title
    const title = storedTitle && storedTitle !== 'Untitled' ? storedTitle : contentTitle

    // Shared note — save via share API
    if (activeNote.sharedToken) {
      if (activeNote.sharedPermission !== 'EDIT') return
      try {
        await fetch(`/api/share/${activeNote.sharedToken}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content }),
        })
      } catch {}
      return
    }

    setAutoSaving(true)
    try {
      await fetch(`/api/notes/${activeNoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
    } catch {}
    setAutoSaving(false)
  }, [activeNoteId, notes])

  /** Deduplicated list of all tags across all notes — passed to TagInput for suggestions */
  const allTags = useMemo<Tag[]>(() => {
    const seen = new Map<string, Tag>()
    for (const note of notes) {
      for (const tag of (note.tags ?? [])) {
        if (!seen.has(tag.label.toLowerCase())) seen.set(tag.label.toLowerCase(), tag)
      }
    }
    return [...seen.values()]
  }, [notes])

  /** Save tags for the active note — fires immediately (no debounce, discrete operation) */
  const handleTagsChange = useCallback(async (tags: Tag[]) => {
    if (!activeNoteId || activeNoteId.startsWith('temp-')) return
    const activeNote = notes.find(n => n.id === activeNoteId)
    updateNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, tags } : n))
    if (activeNote?.sharedToken) {
      if (activeNote.sharedPermission !== 'EDIT') return
      try {
        await fetch(`/api/share/${activeNote.sharedToken}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags }),
        })
      } catch {}
      return
    }
    try {
      await fetch(`/api/notes/${activeNoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })
    } catch {}
  }, [activeNoteId, notes, updateNotes])

  /** Manual save — triggered by the Save button */
  const handleManualSaveContent = useCallback(async (title: string, content: string) => {
    if (!activeNoteId || activeNoteId.startsWith('temp-')) return
    const activeNote = notes.find(n => n.id === activeNoteId)
    if (activeNote?.sharedToken) {
      if (activeNote.sharedPermission !== 'EDIT') return
      try {
        await fetch(`/api/share/${activeNote.sharedToken}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content }),
        })
      } catch {}
      return
    }
    setManualSaving(true)
    try {
      await fetch(`/api/notes/${activeNoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
    } catch {}
    setManualSaving(false)
  }, [activeNoteId, notes])

  const handleNewNote = async () => {
    const tempId = `temp-${Date.now()}`
    const tempNote: Note = {
      id: tempId,
      userId: '',
      title: 'Untitled',
      content: '',
      tags: [],
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
      // Preserve any content/title typed while the API request was in flight
      updateNotes((prev) => {
        const temp = prev.find((n) => n.id === tempId)
        const merged = { ...note, title: temp?.title ?? note.title, content: temp?.content ?? note.content }
        return prev.map((n) => (n.id === tempId ? merged : n))
      })
      setActiveNoteId(note.id)
    } catch {
      updateNotes((prev) => prev.filter((n) => n.id !== tempId))
    }
  }

  // Remote rename — bypasses the content-derived title guard in handleLocalChange
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail
      updateNotes(prev => prev.map(n => n.id === id ? { ...n, title } : n))
      // Also update the "Shared with me" sidebar entry if this is a shared note
      if (id.startsWith('shared-')) {
        const token = id.slice('shared-'.length)
        setSharedNotes(prev => prev.map(r => r.token === token ? { ...r, noteTitle: title } : r))
      }
    }
    window.addEventListener('barrapad:remote-rename', handler)
    return () => window.removeEventListener('barrapad:remote-rename', handler)
  }, [updateNotes])

  const handleRenameNote = useCallback(async (id: string, newTitle: string) => {
    updateNotes((prev) => prev.map((n) => n.id === id ? { ...n, title: newTitle, updatedAt: new Date().toISOString() } : n))
    window.dispatchEvent(new CustomEvent('barrapad:rename', { detail: { id, title: newTitle } }))
    try {
      await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
    } catch {}
  }, [updateNotes])

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

  const handleExport = async (fmt: 'txt' | 'md' | 'pdf' | 'docx') => {
    if (!activeNote) return
    setShowExport(false)
    const title = activeNote.title || 'note'
    const html = activeNote.content || ''
    if (fmt === 'txt') downloadTxt(title, html)
    else if (fmt === 'md') await downloadMd(title, html)
    else if (fmt === 'pdf') {
      const editorEl = document.getElementById('barrapad-editor-content')
      await downloadPdf(title, html, editorEl)
    }
    else if (fmt === 'docx') await downloadDocx(title, html)
  }

  // Close export dropdown when clicking outside
  useEffect(() => {
    if (!showExport) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExport])

  const handleAppearanceChange = (settings: AppearanceSettings) => {
    setAppearance(settings)
    applyAppearance(settings)
    localStorage.setItem('barrapad_appearance', JSON.stringify(settings))
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--editor-bg)' }}>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="sidebar-backdrop"
            className="fixed inset-0 z-[60] md:hidden"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar — fixed overlay on mobile, normal flex child on desktop */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar
          notes={notes}
          sharedNotes={sharedNotes}
          activeNoteId={activeNoteId}
          onSelectNote={setActiveNoteId}
          onNewNote={handleNewNote}
          onDeleteNote={handleDeleteNote}
          onOpenSettings={() => setShowAppearance(true)}
          onRenameNote={handleRenameNote}
          onOpenSharedNote={openSharedNote}
        />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="mobile-sidebar"
            className="fixed inset-y-0 left-0 z-[61] md:hidden"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.8 }}
          >
            <Sidebar
              notes={notes}
              sharedNotes={sharedNotes}
              activeNoteId={activeNoteId}
              onSelectNote={(id) => { setActiveNoteId(id); setSidebarOpen(false) }}
              onNewNote={() => { handleNewNote(); setSidebarOpen(false) }}
              onDeleteNote={handleDeleteNote}
              onOpenSettings={() => { setShowAppearance(true); setSidebarOpen(false) }}
              onRenameNote={handleRenameNote}
              onOpenSharedNote={(token) => { openSharedNote(token); setSidebarOpen(false) }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top action bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ background: 'var(--editor-bg)', borderColor: 'var(--border)' }}>
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-1.5 rounded-lg hover:bg-black/5 transition-colors flex-shrink-0"
            style={{ color: 'var(--ink)' }}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          {/* Push everything else to the right */}
          <div className="flex-1" />

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
            <div ref={exportRef} className="relative">
              <button
                onClick={() => setShowExport((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-black/5 transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                <Download size={13} />
                Export
                <ChevronDown size={11} className={`transition-transform duration-150 ${showExport ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {showExport && (
                  <motion.div
                    key="export-dropdown"
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full right-0 mt-1 z-[55] rounded-xl shadow-xl p-1.5"
                    style={{ background: 'var(--editor-bg)', border: '1px solid var(--border)', minWidth: 190 }}
                  >
                    {([
                      { fmt: 'pdf',  label: '.pdf'  },
                      { fmt: 'md',   label: '.md'   },
                      { fmt: 'txt',  label: '.txt'  },
                      { fmt: 'docx', label: '.docx' },
                    ] as const).map(({ fmt, label }) => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                        style={{ color: 'var(--ink)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span className="text-sm font-semibold">{label}</span>
                      </button>
                    ))}
                    <div
                      className="mx-1 mt-1 mb-0.5 px-3 py-2 rounded-xl text-center text-[11px] font-medium leading-snug"
                      style={{ background: '#D4550A1A', color: '#D4550A' }}
                    >
                      PDF preserves your design.<br />Others export basic or no styles.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {activeNote && !activeNote.sharedToken && (
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
              note={activeNote}
              allTags={allTags}
              onLocalChange={handleLocalChange}
              onAutoSave={handleAutoSave}
              onManualSave={handleManualSaveContent}
              onTagsChange={handleTagsChange}
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

      {/* Onboarding — collect name on first sign-up */}
      {needsOnboarding && <OnboardingModal />}

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
