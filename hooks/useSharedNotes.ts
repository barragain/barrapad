'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { Note, Tag, SharedAccessRecord } from '@/types'

// "Shared with me": the list from /api/shared-notes, a 10 s poll for removals,
// and the virtual `shared-<token>` notes that open a shared note in the editor.
export function useSharedNotes({ isLoaded, isSignedIn, notes, notesRef, updateNotes, activeNoteId, setActiveNoteId, detectSharedNotesChanges }: {
  isLoaded: boolean
  isSignedIn: boolean | undefined
  notes: Note[]
  notesRef: MutableRefObject<Note[]>
  updateNotes: (updater: (prev: Note[]) => Note[]) => void
  activeNoteId: string | null
  setActiveNoteId: Dispatch<SetStateAction<string | null>>
  detectSharedNotesChanges: (fresh: SharedAccessRecord[]) => void
}) {
  const [sharedNotes, setSharedNotes] = useState<SharedAccessRecord[]>([])
  // Mirror of sharedNotes in a ref so handleNoteDeleted can read it without stale closures
  const sharedNotesRef = useRef<SharedAccessRecord[]>([])
  useEffect(() => { sharedNotesRef.current = sharedNotes }, [sharedNotes])

  /** Apply a fresh shared list: drop virtual notes whose access is gone. */
  const applyShared = (freshShared: SharedAccessRecord[]) => {
    detectSharedNotesChanges(freshShared)
    setSharedNotes(freshShared)
    const fresh = new Map(freshShared.map((r) => [`shared-${r.token}`, r.permission as 'READ' | 'EDIT']))
    // Drop notes whose access is gone, and carry permission changes (a
    // downgraded collaborator's open note turns read-only).
    updateNotes((prev) => prev.some((n) => n.sharedToken && fresh.get(n.id) !== n.sharedPermission)
      ? prev.filter((n) => !n.sharedToken || fresh.has(n.id))
          .map((n) => n.sharedToken && fresh.get(n.id) !== n.sharedPermission ? { ...n, sharedPermission: fresh.get(n.id) } : n)
      : prev)
    setActiveNoteId((active) => {
      if (!active?.startsWith('shared-') || fresh.has(active)) return active
      return notesRef.current.find((n) => !n.sharedToken)?.id ?? null
    })
  }

  const fetchShared = async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch('/api/shared-notes', { cache: 'no-store' })
      if (res.ok) applyShared((await res.json()) as SharedAccessRecord[])
    } catch {}
  }

  // Poll shared notes every 10 seconds to catch deletions that happen while
  // the user is on a different note (the realtime room only reaches the open note's editor).
  useEffect(() => {
    if (!isSignedIn) return
    const interval = setInterval(fetchShared, 10000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

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
        updateNotes((prev) => prev.filter((n) => n.id !== virtualId))
        setActiveNoteId((prev) => {
          if (prev !== virtualId) return prev
          const fallback = notes.find((n) => n.id !== virtualId && !n.sharedToken)
          return fallback?.id ?? null
        })
        return
      }
      const data = await res.json() as {
        noteId: string; title: string; content: string
        tags: Tag[]; permission: string; updatedAt: string
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
      updateNotes((prev) => [...prev.filter((n) => n.id !== virtualId), note])
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

  // Remote rename of a shared note also renames its "Shared with me" entry
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail
      if (!id.startsWith('shared-')) return
      const token = id.slice('shared-'.length)
      setSharedNotes(prev => prev.map(r => r.token === token ? { ...r, noteTitle: title } : r))
    }
    window.addEventListener('barrapad:remote-rename', handler)
    return () => window.removeEventListener('barrapad:remote-rename', handler)
  }, [])

  const handleRenameSharedNote = useCallback(async (token: string, noteId: string, newTitle: string) => {
    const virtualId = `shared-${token}`
    setSharedNotes((prev) => prev.map((r) => r.token === token ? { ...r, noteTitle: newTitle } : r))
    updateNotes((prev) => prev.map((n) => n.id === virtualId ? { ...n, title: newTitle } : n))
    // Broadcast via the realtime room if this note is currently open in the editor
    window.dispatchEvent(new CustomEvent('barrapad:rename', { detail: { id: virtualId, title: newTitle } }))
    try {
      await fetch(`/api/share/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
    } catch {}
  }, [updateNotes])

  /** Drop a shared note from the lists; `request` tells the server. */
  const dropShared = useCallback(async (noteId: string, token: string, request: () => Promise<Response>) => {
    const virtualId = `shared-${token}`
    setSharedNotes((prev) => prev.filter((r) => r.noteId !== noteId))
    updateNotes((prev) => prev.filter((n) => n.id !== virtualId))
    if (activeNoteId === virtualId) {
      setActiveNoteId(notes.filter((n) => n.id !== virtualId)[0]?.id ?? null)
    }
    try { await request() } catch {}
  }, [activeNoteId, notes, updateNotes, setActiveNoteId])

  const handleRemoveSharedNote = useCallback((noteId: string, token: string) =>
    dropShared(noteId, token, () => fetch('/api/shared-notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId }),
    })), [dropShared])

  // Called when a collaborator deletes a shared note (deletes it for everyone)
  const handleDeleteSharedNote = useCallback((noteId: string, token: string) =>
    dropShared(noteId, token, () => fetch(`/api/share/${token}/delete-note`, { method: 'DELETE' })), [dropShared])

  return {
    sharedNotes, setSharedNotes, sharedNotesRef, fetchShared, openSharedNote,
    handleRenameSharedNote, handleRemoveSharedNote, handleDeleteSharedNote,
  }
}
