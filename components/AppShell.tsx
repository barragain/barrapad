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
import NotificationBell from './NotificationBell'
import type { Note, Tag, AppearanceSettings, SharedAccessRecord, CollabNotification } from '@/types'

// ── Notification localStorage helpers ─────────────────────────────────────────

// Read notifications auto-expire after 14 days
const NOTIF_EXPIRE_MS = 14 * 24 * 60 * 60 * 1000

type KnownSharedMap = Record<string, { title: string; permission: string; ownerName: string }>

function filterExpired(notifs: CollabNotification[]): CollabNotification[] {
  const now = Date.now()
  return notifs.filter((n) => {
    if (!n.read || !n.readAt) return true
    return now - new Date(n.readAt).getTime() < NOTIF_EXPIRE_MS
  })
}

function loadNotifications(): CollabNotification[] {
  try {
    const raw = localStorage.getItem('barrapad_notifications')
    return raw ? filterExpired(JSON.parse(raw) as CollabNotification[]) : []
  } catch { return [] }
}

function saveNotifications(n: CollabNotification[]) {
  try { localStorage.setItem('barrapad_notifications', JSON.stringify(n)) } catch {}
}

function loadKnownShared(): KnownSharedMap {
  try {
    const raw = localStorage.getItem('barrapad_known_shared')
    return raw ? (JSON.parse(raw) as KnownSharedMap) : {}
  } catch { return {} }
}

function saveKnownShared(records: SharedAccessRecord[]) {
  const map: KnownSharedMap = {}
  for (const r of records) {
    map[r.token] = {
      title: r.noteTitle,
      permission: r.permission,
      ownerName: r.ownerName ?? '',
    }
  }
  try { localStorage.setItem('barrapad_known_shared', JSON.stringify(map)) } catch {}
}

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
  const [notifications, setNotifications] = useState<CollabNotification[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  // true on first sharedNotes fetch — used to set baseline without firing notifications
  const isFirstNotifFetch = useRef(true)
  // Set of "{noteId}:{accessorUserId}" pairs the owner has already been notified about
  const openedNotifiedRef = useRef<Set<string>>(new Set())

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null

  useEffect(() => {
    const settings = loadAppearance()
    setAppearance(settings)
    applyAppearance(settings)
    // Restore persisted notifications and "opened" seen set
    setNotifications(loadNotifications())
    try {
      const raw = localStorage.getItem('barrapad_opened_notified')
      if (raw) openedNotifiedRef.current = new Set(JSON.parse(raw) as string[])
    } catch {}
  }, [])

  // Detect changes in sharedNotes compared to the last-known snapshot in localStorage.
  // First call sets the baseline without firing notifications (avoids flooding on first load).
  const detectSharedNotesChanges = useCallback((freshShared: SharedAccessRecord[]) => {
    const known = loadKnownShared()
    const freshMap = new Map(freshShared.map((r) => [r.token, r]))
    const isFirst = isFirstNotifFetch.current
    isFirstNotifFetch.current = false

    // First run with empty known → silent initialization (existing user first time with feature)
    if (isFirst && Object.keys(known).length === 0) {
      saveKnownShared(freshShared)
      return
    }

    const newNotifs: CollabNotification[] = []

    // New shares
    for (const [token, record] of freshMap) {
      if (!known[token]) {
        const who = record.ownerName || 'Someone'
        newNotifs.push({
          id: `shared-${token}`,
          type: 'shared',
          noteTitle: record.noteTitle,
          message: `${who} shared "${record.noteTitle || 'a note'}" with you`,
          timestamp: new Date().toISOString(),
        })
      }
    }

    // Deleted / access removed
    for (const [token, info] of Object.entries(known)) {
      if (!freshMap.has(token)) {
        const who = info.ownerName || 'Someone'
        newNotifs.push({
          id: `deleted-${token}`,
          type: 'deleted',
          noteTitle: info.title,
          message: `${who} removed access to "${info.title || 'a shared note'}"`,
          timestamp: new Date().toISOString(),
        })
      }
    }

    // Permission changes
    for (const [token, record] of freshMap) {
      const prev = known[token]
      if (prev && prev.permission !== record.permission) {
        const who = record.ownerName || prev.ownerName || 'Someone'
        newNotifs.push({
          id: `perm-${token}-${record.permission}`,
          type: 'permission_changed',
          noteTitle: record.noteTitle,
          message: `${who} changed your access to "${record.noteTitle || 'a note'}" to ${record.permission === 'EDIT' ? 'Can edit' : 'View only'}`,
          timestamp: new Date().toISOString(),
        })
      }
    }

    saveKnownShared(freshShared)

    if (newNotifs.length > 0) {
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((n) => n.id))
        const truly_new = newNotifs.filter((n) => !existingIds.has(n.id))
        if (truly_new.length === 0) return prev
        const next = [...truly_new, ...prev]
        saveNotifications(next)
        return next
      })
    }
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

  // Re-validate shared notes whenever the tab regains focus.
  useEffect(() => {
    const handleVisibility = () => { if (!document.hidden && isSignedIn) fetchNotes() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  // Poll shared notes every 10 seconds to catch deletions that happen while
  // the user is on a different note (PartyKit only reaches the open note's editor).
  useEffect(() => {
    if (!isSignedIn) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/shared-notes')
        if (!res.ok) return
        const freshShared = (await res.json()) as SharedAccessRecord[]
        detectSharedNotesChanges(freshShared)
        const validIds = new Set(freshShared.map((r) => `shared-${r.token}`))
        setSharedNotes(freshShared)
        setNotes((prev) => {
          const staleIds = prev
            .filter((n) => n.sharedToken && !validIds.has(n.id))
            .map((n) => n.id)
          if (staleIds.length === 0) return prev
          const staleSet = new Set(staleIds)
          const next = prev.filter((n) => !staleSet.has(n.id))
          saveCachedNotes(next)
          setActiveNoteId((active) => {
            if (!active || !staleSet.has(active)) return active
            return next.find((n) => !n.sharedToken)?.id ?? null
          })
          return next
        })
      } catch {}
    }, 10000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  // Poll for "opened" events — owner gets notified the first time a collaborator opens their note
  useEffect(() => {
    if (!isSignedIn) return
    const checkOpenedEvents = async () => {
      try {
        const res = await fetch('/api/share/access-events')
        if (!res.ok) return
        const events = (await res.json()) as { id: string; noteTitle: string; accessorName: string; accessedAt: string }[]
        const seen = openedNotifiedRef.current
        const newNotifs: CollabNotification[] = []
        for (const ev of events) {
          if (!seen.has(ev.id)) {
            newNotifs.push({
              id: `opened-${ev.id}`,
              type: 'opened',
              noteTitle: ev.noteTitle,
              message: `${ev.accessorName} opened "${ev.noteTitle || 'your note'}"`,
              timestamp: ev.accessedAt,
            })
            seen.add(ev.id)
          }
        }
        if (newNotifs.length > 0) {
          try { localStorage.setItem('barrapad_opened_notified', JSON.stringify([...seen])) } catch {}
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id))
            const truly_new = newNotifs.filter((n) => !existingIds.has(n.id))
            if (truly_new.length === 0) return prev
            const next = [...truly_new, ...prev]
            saveNotifications(next)
            return next
          })
        }
      } catch {}
    }
    checkOpenedEvents()
    const interval = setInterval(checkOpenedEvents, 30000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  const fetchNotes = async () => {
    try {
      const [notesRes, sharedRes] = await Promise.all([
        fetch('/api/notes'),
        fetch('/api/shared-notes'),
      ])
      let ownedData: Note[] = []
      if (notesRes.ok) {
        const raw = (await notesRes.json()) as Note[]
        ownedData = raw.map(n => ({ ...n, tags: Array.isArray(n.tags) ? n.tags : [] }))
        setNotes(prev => {
          // Preserve open virtual shared-notes alongside the fresh owned notes
          const virtual = prev.filter(n => n.sharedToken)
          const next = [...ownedData, ...virtual]
          saveCachedNotes(next)
          return next
        })
        setActiveNoteId((prev) => {
          if (prev && (prev.startsWith('shared-') || ownedData.some((n) => n.id === prev))) return prev
          return ownedData[0]?.id ?? null
        })
      }
      if (sharedRes.ok) {
        const freshShared = (await sharedRes.json()) as SharedAccessRecord[]
        detectSharedNotesChanges(freshShared)
        setSharedNotes(freshShared)
        // Remove virtual notes for any shared notes no longer in the server list
        const validVirtualIds = new Set(freshShared.map(r => `shared-${r.token}`))
        setNotes(prev => {
          const next = prev.filter(n => !n.sharedToken || validVirtualIds.has(n.id))
          saveCachedNotes(next)
          return next
        })
        setActiveNoteId(prev => {
          if (!prev?.startsWith('shared-')) return prev
          if (validVirtualIds.has(prev)) return prev
          return ownedData[0]?.id ?? null
        })
      }
    } catch {}
  }

  /** Open a shared note in the main editor by token */
  const openSharedNote = useCallback(async (token: string) => {
    const virtualId = `shared-${token}`
    // Show cached content immediately for responsiveness, then re-validate below
    const existing = notes.find((n) => n.id === virtualId)
    if (existing) setActiveNoteId(virtualId)

    try {
      const res = await fetch(`/api/share/${token}`)
      if (!res.ok) {
        // Note is gone — clean up from both lists
        setSharedNotes((prev) => prev.filter((r) => r.token !== token))
        setNotes((prev) => { const next = prev.filter((n) => n.id !== virtualId); saveCachedNotes(next); return next })
        setActiveNoteId((prev) => {
          if (prev !== virtualId) return prev
          const fallback = notes.find((n) => n.id !== virtualId && !n.sharedToken)
          return fallback?.id ?? null
        })
        return
      }
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
      // Replace stale cached version or add fresh
      setNotes((prev) => {
        const without = prev.filter((n) => n.id !== virtualId)
        return [...without, note]
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

  const handleRenameSharedNote = useCallback(async (token: string, noteId: string, newTitle: string) => {
    const virtualId = `shared-${token}`
    setSharedNotes((prev) => prev.map((r) => r.token === token ? { ...r, noteTitle: newTitle } : r))
    updateNotes((prev) => prev.map((n) => n.id === virtualId ? { ...n, title: newTitle } : n))
    // Broadcast via PartyKit if this note is currently open in the editor
    window.dispatchEvent(new CustomEvent('barrapad:rename', { detail: { id: virtualId, title: newTitle } }))
    try {
      await fetch(`/api/share/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
    } catch {}
  }, [updateNotes])

  const handleRemoveSharedNote = useCallback(async (noteId: string, token: string) => {
    const virtualId = `shared-${token}`
    setSharedNotes((prev) => prev.filter((r) => r.noteId !== noteId))
    updateNotes((prev) => prev.filter((n) => n.id !== virtualId))
    if (activeNoteId === virtualId) {
      setActiveNoteId(notes.filter((n) => n.id !== virtualId)[0]?.id ?? null)
    }
    try {
      await fetch('/api/shared-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      })
    } catch {}
  }, [activeNoteId, notes, updateNotes])

  // Called when a collaborator deletes a shared note (deletes it for everyone)
  const handleDeleteSharedNote = useCallback(async (noteId: string, token: string) => {
    const virtualId = `shared-${token}`
    setSharedNotes((prev) => prev.filter((r) => r.noteId !== noteId))
    updateNotes((prev) => prev.filter((n) => n.id !== virtualId))
    if (activeNoteId === virtualId) {
      setActiveNoteId(notes.filter((n) => n.id !== virtualId)[0]?.id ?? null)
    }
    try {
      await fetch(`/api/share/${token}/delete-note`, { method: 'DELETE' })
    } catch {}
  }, [activeNoteId, notes, updateNotes])

  // Called when a note is deleted by someone else via real-time broadcast
  const handleNoteDeleted = useCallback((noteId: string) => {
    if (noteId.startsWith('shared-')) {
      const token = noteId.replace('shared-', '')
      setSharedNotes((prev) => prev.filter((r) => r.token !== token))
    }
    updateNotes((prev) => prev.filter((n) => n.id !== noteId))
    setActiveNoteId((prev) => {
      if (prev !== noteId) return prev
      const remaining = notes.filter((n) => n.id !== noteId && !n.sharedToken)
      return remaining[0]?.id ?? null
    })
  }, [notes, updateNotes])

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
          onRemoveSharedNote={handleRemoveSharedNote}
          onRenameSharedNote={handleRenameSharedNote}
          onDeleteSharedNote={handleDeleteSharedNote}
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
              onRemoveSharedNote={handleRemoveSharedNote}
              onRenameSharedNote={handleRenameSharedNote}
              onDeleteSharedNote={handleDeleteSharedNote}
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

          {isLoaded && isSignedIn && (
            <NotificationBell
              notifications={notifications}
              open={showNotifs}
              onToggle={() => setShowNotifs((v) => !v)}
              onMarkAllRead={() => {
                const now = new Date().toISOString()
                setNotifications((prev) => {
                  const next = prev.map((n) => n.read ? n : { ...n, read: true, readAt: now })
                  saveNotifications(next)
                  return next
                })
              }}
              onDeleteAll={() => {
                setNotifications([])
                saveNotifications([])
              }}
            />
          )}

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

          {activeNote && (!activeNote.sharedToken || activeNote.sharedPermission === 'EDIT') && (
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
              onNoteDeleted={handleNoteDeleted}
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
        <ShareModal
          note={activeNote}
          onClose={() => setShowShare(false)}
          onIsSharedChange={(hasLinks) =>
            updateNotes(prev => prev.map(n => n.id === activeNote.id ? { ...n, isShared: hasLinks } : n))
          }
        />
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
