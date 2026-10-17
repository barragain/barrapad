'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Note } from '@/types'

// Notes list, local cache, guest store and the save pipeline. See
// docs/architecture.md for how local edits, autosave and fetches fit together.

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

// Guests (no account) keep their notes only in this browser, under their own key
// and with `local-` ids, so they never mix with an account's cache. On sign-in
// they are moved into the account (see importGuestNotes).
const GUEST_KEY = 'bpad_guest_notes'
export const isLocalId = (id: string | null | undefined) => !!id && id.startsWith('local-')
// ponytail: module-level flag, fine while AppShell is mounted once per page
let guestMode = false

function loadGuestNotes(): Note[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    if (raw) return (JSON.parse(raw) as Note[]).map(n => ({ ...n, tags: Array.isArray(n.tags) ? n.tags : [] }))
  } catch {}
  return []
}

export function saveCachedNotes(notes: Note[]) {
  try {
    if (guestMode) {
      // The browser is a guest's only copy, so a full localStorage (big images,
      // ~5 MB) means lost edits. Tell AppShell so it can warn the user.
      // Deferred: this runs inside setNotes updaters, where setState must not happen.
      const report = (full: boolean) => queueMicrotask(() =>
        window.dispatchEvent(new CustomEvent('bpad:guest-storage', { detail: { full } })))
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(notes.filter((n) => isLocalId(n.id))))
        report(false)
      } catch {
        report(true)
      }
      return
    }
    // Don't cache temp notes or shared notes (they're not the user's own)
    const real = notes.filter((n) => !n.id.startsWith('temp-') && !n.sharedToken && !isLocalId(n.id))
    localStorage.setItem('barrapad_notes', JSON.stringify(real))
  } catch {}
}

export function useNotes({ initialNotes, guest, isGuest, isSignedIn }: {
  initialNotes?: Note[]
  /** Server-side auth state, used before Clerk boots */
  guest: boolean
  isGuest: boolean
  isSignedIn: boolean | undefined
}) {
  guestMode = isGuest
  // Server-rendered notes win (fresh, no lock); otherwise the localStorage
  // cache renders instantly and the editor waits for the first fetch.
  // Guests start empty on server and client alike (localStorage on the first
  // render breaks hydration) and load their notes right after mount.
  const [notes, setNotes] = useState<Note[]>(() => guest ? [] : initialNotes ?? loadCachedNotes())
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => (guest ? [] : initialNotes ?? loadCachedNotes())[0]?.id ?? null)
  // Incremented every time fetchNotes applies newer server content — lets the
  // Editor know it should re-check its content against the latest note.content.
  // False until the first /api/notes answer this session. While false the editor
  // is read-only: typing on top of a stale localStorage copy and auto-saving it
  // is how another device's edits got overwritten.
  const [notesLoaded, setNotesLoaded] = useState(!!initialNotes)
  const [manualSaving, setManualSaving] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  // Tracks note IDs the current user is actively deleting themselves (to suppress self-delete notifications)
  const selfDeleteRef = useRef<Set<string>>(new Set())
  // Tracks note IDs where the user has explicitly set a title — auto-title updates are suppressed for these
  const manualTitlesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem('barrapad_manual_titles')
      if (raw) manualTitlesRef.current = new Set(JSON.parse(raw) as string[])
    } catch {}
  }, [])

  const updateNotes = useCallback((updater: (prev: Note[]) => Note[]) => {
    setNotes((prev) => {
      const next = updater(prev)
      saveCachedNotes(next)
      return next
    })
  }, [])

  // Notes ref so save callbacks can read the current notes array without being
  // recreated on every notes change (which would also recreate the Editor's
  // memoized handlers and risk stale captures inside long-lived effects).
  const notesRef = useRef<Note[]>(notes)
  useEffect(() => { notesRef.current = notes }, [notes])

  // Dirty version counter per note — replaces the old clock-based smart merge.
  // Every handleLocalChange bumps the version; a save "clears" the dirty flag
  // only when the version at the moment the save started still matches the
  // current version (i.e. nothing was typed while the save was in flight).
  // This sidesteps two problems the updatedAt comparison had:
  //   (a) client clock skew permanently pinning local over server
  //   (b) a save's success response clearing dirty even though the user has
  //       already typed more since the save started, causing fetchNotes to
  //       then overwrite the new unsaved content with stale server data.
  const dirtyVersionsRef = useRef<Map<string, number>>(new Map())

  // Move notes written as a guest into the account, one at a time. Each note
  // leaves guest storage only after the server has it, so a failure retries
  // on the next fetch instead of losing text. The Web Lock keeps two tabs from
  // importing the same notes; the second one finds the store already empty.
  // The guest id goes along, so a reload mid-POST retries into the same row.
  const importingRef = useRef(false)
  const importGuestNotes = async () => {
    if (importingRef.current) return
    importingRef.current = true
    const run = async () => {
      for (const n of loadGuestNotes()) {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: n.title, content: n.content, tags: n.tags, guestId: n.id }),
        })
        if (!res.ok) return
        try { localStorage.setItem(GUEST_KEY, JSON.stringify(loadGuestNotes().filter(g => g.id !== n.id))) } catch {}
      }
    }
    try {
      await (navigator.locks ? navigator.locks.request('bpad-guest-import', run) : run())
    } catch {} finally {
      importingRef.current = false
    }
  }

  /** Owned notes from the server (or the guest store). Shared notes are fetched by useSharedNotes. */
  const fetchNotes = async () => {
    if (!isSignedIn) {
      // Guest: the browser is the only store. First visit opens a blank note.
      const local = loadGuestNotes()
      if (!local.length) {
        const now = new Date().toISOString()
        local.push({ id: `local-${Date.now()}`, userId: '', title: 'Untitled', content: '', tags: [], createdAt: now, updatedAt: now })
        try { localStorage.setItem(GUEST_KEY, JSON.stringify(local)) } catch {}
      }
      setNotes(prev => [...local, ...prev.filter(n => n.sharedToken)])
      setActiveNoteId(prev => (prev && (prev.startsWith('shared-') || local.some(n => n.id === prev))) ? prev : local[0]?.id ?? null)
      setNotesLoaded(true)
      return
    }
    if (loadGuestNotes().length) await importGuestNotes()
    try {
      const notesRes = await fetch('/api/notes', { cache: 'no-store' })
      if (!notesRes.ok) return
      const raw = (await notesRes.json()) as Note[]
      const ownedData = raw.map(n => ({ ...n, tags: Array.isArray(n.tags) ? n.tags : [] }))
      setNotes(prev => {
        // Preserve open virtual shared-notes and notes still being created
        // (temp- ids). Dropping a temp note here is what left "No note
        // selected" when a refetch landed while POST /api/notes was in flight.
        const virtual = prev.filter(n => n.sharedToken || n.id.startsWith('temp-'))
        // Smart merge: keep the local copy only when it has unsaved edits
        // (tracked in dirtyVersionsRef), independent of any client clock.
        const dirty = dirtyVersionsRef.current
        const merged = ownedData.map(serverNote => {
          const localNote = prev.find(n => n.id === serverNote.id)
          if (!localNote || localNote.sharedToken) return serverNote
          if (dirty.has(serverNote.id)) return localNote
          // Local updatedAt is always server-issued now (DB response or realtime
          // room), so a plain ISO comparison picks the fresher copy: the room
          // can be ahead of the DB by one autosave interval.
          if (localNote.updatedAt > serverNote.updatedAt) return localNote
          return serverNote
        })
        const next = [...merged, ...virtual]
        saveCachedNotes(next)
        return next
      })
      setNotesLoaded(true)
      setActiveNoteId((prev) => {
        if (prev && (prev.startsWith('shared-') || prev.startsWith('temp-') || ownedData.some((n) => n.id === prev))) return prev
        return ownedData[0]?.id ?? null
      })
    } catch {
      // Server unreachable: unlock so offline typing still works. Same risk as
      // before this guard existed, but only while the network is down.
      setNotesLoaded(true)
    }
  }

  /** Immediate: update localStorage only, no API call.
   *  noteId comes from the Editor (live ref at edit time) — we MUST NOT trust
   *  closure-captured activeNoteId, which can lag behind during note switches. */
  const handleLocalChange = useCallback((noteId: string, title: string, content: string) => {
    if (!noteId) return
    // Bump the dirty version so any in-flight save can detect that new edits
    // happened while it was running and refuse to clear the dirty flag.
    const cur = dirtyVersionsRef.current.get(noteId) ?? 0
    dirtyVersionsRef.current.set(noteId, cur + 1)
    updateNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteId) return n
        // updatedAt is deliberately left alone: it must stay server-issued so
        // fetchNotes can compare it against the DB. The save response sets it.
        // Never auto-derive title for shared notes — only the owner's explicit
        // rename (via PartyKit 'title' message) should change it.
        if (n.sharedToken) return { ...n, content }
        // For owned notes, auto-update title from first line unless manually renamed
        const useTitle = manualTitlesRef.current.has(n.id) ? n.title : title
        return { ...n, title: useTitle, content }
      })
    )
  }, [updateNotes])

  /** Content that arrived from the realtime room (initial sync or a live update).
   *  Not a local edit: no dirty bump, and updatedAt comes from the server. */
  const handleRemoteContent = useCallback((noteId: string, title: string | undefined, content: string, updatedAt?: string) => {
    updateNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteId) return n
        const next = { ...n, content }
        if (title) next.title = title
        if (updatedAt && updatedAt > n.updatedAt) next.updatedAt = updatedAt
        return next
      })
    )
  }, [updateNotes])

  /** After a successful save, adopt the server's updatedAt without touching content
   *  (the user may have typed more while the request was in flight). */
  const applyServerUpdatedAt = useCallback((noteId: string, updatedAt?: string) => {
    if (!updatedAt) return
    updateNotes((prev) => prev.map((n) => n.id === noteId && updatedAt > n.updatedAt ? { ...n, updatedAt } : n))
  }, [updateNotes])

  /** PATCH a note's content. Shared notes go through the share API; the dirty
   *  flag clears only if nothing was typed while the request was in flight.
   *  The noteId is supplied by the caller — do NOT fall back to activeNoteId,
   *  that's how content from one note ends up saved against a different note's
   *  id during rapid switches. */
  const saveNote = useCallback(async (noteId: string, contentTitle: string, content: string, setSaving: (v: boolean) => void, deriveTitle: boolean) => {
    if (!noteId || noteId.startsWith('temp-') || isLocalId(noteId)) return
    const targetNote = notesRef.current.find(n => n.id === noteId)
    if (!targetNote) return

    // Autosave: for shared notes, always use the note's existing title — never
    // the content-derived one; for owned notes, respect manualTitlesRef.
    const title = !deriveTitle ? contentTitle : targetNote.sharedToken
      ? targetNote.title
      : (manualTitlesRef.current.has(noteId) ? targetNote.title : contentTitle)

    const versionAtSaveStart = dirtyVersionsRef.current.get(noteId) ?? 0
    const patch = async (url: string) => {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
      if (!res.ok) return
      if (dirtyVersionsRef.current.get(noteId) === versionAtSaveStart) dirtyVersionsRef.current.delete(noteId)
      const { updatedAt } = (await res.json()) as { updatedAt?: string }
      applyServerUpdatedAt(noteId, updatedAt)
      // The Yjs room records which database version its doc matches (Editor).
      window.dispatchEvent(new CustomEvent('barrapad:saved', { detail: { noteId, updatedAt } }))
    }

    if (targetNote.sharedToken) {
      if (targetNote.sharedPermission !== 'EDIT') return
      try { await patch(`/api/share/${targetNote.sharedToken}`) } catch {}
      return
    }
    setSaving(true)
    try { await patch(`/api/notes/${noteId}`) } catch {}
    setSaving(false)
  }, [applyServerUpdatedAt])

  /** Background sync to API. */
  const handleAutoSave = useCallback((noteId: string, contentTitle: string, content: string) =>
    saveNote(noteId, contentTitle, content, setAutoSaving, true), [saveNote])

  /** Manual save — triggered by the Save button. Same noteId discipline as autosave. */
  const handleManualSaveContent = useCallback((noteId: string, title: string, content: string) =>
    saveNote(noteId, title, content, setManualSaving, false), [saveNote])

  const handleNewNote = async () => {
    if (isGuest) {
      const now = new Date().toISOString()
      const note: Note = { id: `local-${Date.now()}`, userId: '', title: 'Untitled', content: '', tags: [], createdAt: now, updatedAt: now }
      updateNotes((prev) => [note, ...prev])
      setActiveNoteId(note.id)
      return
    }
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
      // Capture temp note content BEFORE replacing it — we need to persist
      // content typed during the temp phase to the database under the real ID.
      const tempNote = notesRef.current.find(n => n.id === tempId)
      const tempContent = tempNote?.content
      const tempTitle = tempNote?.title || 'Untitled'
      // The Editor moves the temp note's Yjs doc online under the real id.
      window.dispatchEvent(new CustomEvent('barrapad:promoted', { detail: { tempId, id: note.id } }))
      // Preserve any content/title typed while the API request was in flight
      updateNotes((prev) => {
        const temp = prev.find((n) => n.id === tempId)
        const merged = { ...note, title: temp?.title ?? note.title, content: temp?.content ?? note.content }
        return prev.map((n) => (n.id === tempId ? merged : n))
      })
      // Only follow the promotion if the user is still on the temp note.
      setActiveNoteId((prev) => (prev === tempId ? note.id : prev))
      // Transfer the dirty flag from temp → real so fetchNotes won't overwrite
      // local content with the server's empty content before auto-save fires.
      const tempDirty = dirtyVersionsRef.current.get(tempId)
      if (tempDirty !== undefined) {
        dirtyVersionsRef.current.delete(tempId)
        dirtyVersionsRef.current.set(note.id, tempDirty)
      }
      // Immediately persist content typed during temp phase to the database.
      // The Editor's auto-save may also fire, but this guarantees content reaches
      // the server even if the user closes the tab or switches devices immediately.
      if (tempContent && tempContent !== '' && tempContent !== '<p></p>') {
        const versionAtSave = dirtyVersionsRef.current.get(note.id) ?? 0
        fetch(`/api/notes/${note.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: tempTitle, content: tempContent }),
        }).then(r => {
          if (r.ok && dirtyVersionsRef.current.get(note.id) === versionAtSave) {
            dirtyVersionsRef.current.delete(note.id)
          }
        }).catch(() => {})
      }
    } catch {
      updateNotes((prev) => prev.filter((n) => n.id !== tempId))
    }
  }

  // Remote rename — bypasses the content-derived title guard in handleLocalChange
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail
      updateNotes(prev => prev.map(n => n.id === id ? { ...n, title } : n))
    }
    window.addEventListener('barrapad:remote-rename', handler)
    return () => window.removeEventListener('barrapad:remote-rename', handler)
  }, [updateNotes])

  const handleRenameNote = useCallback(async (id: string, newTitle: string) => {
    manualTitlesRef.current.add(id)
    try { localStorage.setItem('barrapad_manual_titles', JSON.stringify([...manualTitlesRef.current])) } catch {}
    updateNotes((prev) => prev.map((n) => n.id === id ? { ...n, title: newTitle } : n))
    window.dispatchEvent(new CustomEvent('barrapad:rename', { detail: { id, title: newTitle } }))
    if (isLocalId(id)) return
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
      if (res.ok) applyServerUpdatedAt(id, ((await res.json()) as { updatedAt?: string }).updatedAt)
    } catch {}
  }, [updateNotes, applyServerUpdatedAt])

  const handleDeleteNote = async (id: string) => {
    const prev = notes
    selfDeleteRef.current.add(id)
    updateNotes((n) => n.filter((note) => note.id !== id))
    if (activeNoteId === id) {
      const remaining = prev.filter((n) => n.id !== id)
      setActiveNoteId(remaining[0]?.id ?? null)
    }
    if (isLocalId(id)) return
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    } catch {
      selfDeleteRef.current.delete(id)
      setNotes(prev)
      saveCachedNotes(prev)
    }
  }

  return {
    notes, setNotes, notesRef, updateNotes, activeNoteId, setActiveNoteId,
    notesLoaded, setNotesLoaded, manualSaving, autoSaving, selfDeleteRef,
    fetchNotes, handleLocalChange, handleRemoteContent, handleAutoSave, handleManualSaveContent,
    handleNewNote, handleRenameNote, handleDeleteNote,
  }
}
