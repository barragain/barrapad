'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useUser } from '@clerk/nextjs'
import PartySocket from 'partysocket'
import { setCursors, pickColor } from '@/extensions/collab-cursor'
import type { RemoteCursor } from '@/extensions/collab-cursor'
import TagInput from './TagInput'
import NoteEditorCore from './NoteEditorCore'
import type { Note, Tag } from '@/types'

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'barrapad.barragain.partykit.dev'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date}\n${time}`
}

interface EditorProps {
  note: Note
  allTags: Tag[]
  /** Incremented when fetchNotes returns newer content from the server */
  serverFetchVersion: number
  /** Called immediately on every change — updates localStorage only, no API.
   *  noteId is captured at the moment the change happened so the parent never
   *  trusts a stale closure of `activeNoteId`. */
  onLocalChange: (noteId: string, title: string, content: string) => void
  /** Called after 1s idle, blur, or tab switch — syncs to API. noteId is the
   *  note this save was scheduled for; the parent must save to THIS id, not
   *  whatever its current activeNoteId happens to be. */
  onAutoSave: (noteId: string, title: string, content: string) => void
  /** Called when the user explicitly presses Save */
  onManualSave: (noteId: string, title: string, content: string) => void
  onTagsChange: (tags: Tag[]) => void
  /** Called when the note is deleted by any collaborator — remove it from state */
  onNoteDeleted?: (noteId: string) => void
  /** Called when a #note mention is clicked */
  onNoteMentionClick?: (noteId: string) => void
}

export default function EditorComponent({
  note,
  allTags,
  serverFetchVersion,
  onLocalChange,
  onAutoSave,
  onManualSave,
  onTagsChange,
  onNoteDeleted,
  onNoteMentionClick,
}: EditorProps) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const editorRef = useRef<Editor | null>(null)
  const [editorReady, setEditorReady] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // pendingRef carries the noteId the edit was made against so a stale save
  // can be detected and dropped instead of overwriting a different note.
  const pendingRef = useRef<{ title: string; html: string; noteId: string } | null>(null)

  const socketRef = useRef<PartySocket | null>(null)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True between a note-switch and the first sync from the server — blocks stale broadcasts
  const pendingSyncRef = useRef(false)

  // Passed to NoteEditorCore so the sync guard can be read here in the PartyKit handler
  const isLocallyEditingRef = useRef(false)
  const localEditTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep latest callback refs so the long-lived PartyKit effect never has a stale closure
  const onNoteDeletedRef = useRef(onNoteDeleted)
  useEffect(() => { onNoteDeletedRef.current = onNoteDeleted }, [onNoteDeleted])

  const onLocalChangeRef = useRef(onLocalChange)
  const onTagsChangeRef = useRef(onTagsChange)
  const onAutoSaveRef = useRef(onAutoSave)
  useEffect(() => { onLocalChangeRef.current = onLocalChange }, [onLocalChange])
  useEffect(() => { onTagsChangeRef.current = onTagsChange }, [onTagsChange])
  useEffect(() => { onAutoSaveRef.current = onAutoSave }, [onAutoSave])

  // Track the note's "real" title from state so the PartyKit broadcast uses it
  // instead of the content-derived title (which ignores manual renames).
  const noteTitleRef = useRef(note.title)
  useEffect(() => { noteTitleRef.current = note.title }, [note.title])

  const lastLocalChangeTimeRef = useRef(0)
  const prevNoteIdRef = useRef<string>(note.id)
  // Track previous note info so we can flush auto-save to the correct endpoint on note switch
  const prevNoteRef = useRef<{ id: string; sharedToken?: string; sharedPermission?: string }>({
    id: note.id, sharedToken: note.sharedToken, sharedPermission: note.sharedPermission,
  })
  const remoteCursorsRef = useRef<Map<string, RemoteCursor>>(new Map())
  const myColorRef = useRef(pickColor(Math.random().toString()))
  const userNameRef = useRef('Me')
  const userImageRef = useRef<string | undefined>(undefined)

  const { user } = useUser()
  useEffect(() => {
    if (user) {
      userNameRef.current =
        user.firstName ||
        user.username ||
        user.primaryEmailAddress?.emailAddress?.split('@')[0] ||
        'Me'
      userImageRef.current = user.imageUrl || undefined
    }
  }, [user])

  // ── Auto-save flush ───────────────────────────────────────────────────────
  // Always uses the LIVE note.id from the ref + a callback ref for onAutoSave.
  // Both layers are intentional: the ref guarantees "this save is for THIS note
  // right now, not whatever closure was captured when the timer was scheduled."
  const liveNoteIdRef = useRef(note.id)
  useEffect(() => { liveNoteIdRef.current = note.id }, [note.id])

  const flushAutoSave = useCallback(() => {
    if (!pendingRef.current) return
    const { title, html, noteId } = pendingRef.current
    pendingRef.current = null
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    // Critical safety check: only save if the current note hasn't changed since
    // this save was queued. Otherwise we'd save the OLD note's content under
    // the NEW note's ID (cross-note contamination — the data-loss bug).
    if (noteId !== liveNoteIdRef.current) return
    onAutoSaveRef.current(noteId, title, html)
  }, [])

  // ── NoteEditorCore callbacks ──────────────────────────────────────────────
  const handleEditorReady = useCallback((ed: Editor) => {
    editorRef.current = ed
    setEditorReady(true)
  }, [])

  const handleUpdate = useCallback((html: string, _text: string, title: string) => {
    // Capture the live note id at the moment of the edit. NoteEditorCore now
    // routes onUpdate through a ref so we always see the LATEST handleUpdate,
    // but we still bind every save to a specific noteId for defense in depth.
    const editNoteId = liveNoteIdRef.current
    onLocalChangeRef.current(editNoteId, title, html)

    lastLocalChangeTimeRef.current = Date.now()

    // PartyKit broadcast — skip while waiting for the initial sync after a
    // note-switch to prevent stale content from overwriting the room's state.
    // IMPORTANT: this guard must NOT block the auto-save pipeline below —
    // edits must always be persisted to the database regardless of PartyKit.
    if (!pendingSyncRef.current) {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
      sendTimerRef.current = setTimeout(() => {
        // Bail if the user has switched notes since this broadcast was queued —
        // we'd otherwise leak the old note's content into the new note's room.
        if (editNoteId !== liveNoteIdRef.current) return
        const broadcastTitle = noteTitleRef.current || title
        const contentJson = editorRef.current?.getJSON()
        socketRef.current?.send(JSON.stringify({ type: 'update', content: html, contentJson, title: broadcastTitle, ts: lastLocalChangeTimeRef.current }))
      }, 50)
    }

    // Auto-save pipeline — ALWAYS runs, even while waiting for PartyKit sync.
    // This ensures edits are persisted to the database regardless of whether
    // the WebSocket connection is up. Without this, a slow or failed PartyKit
    // connection would strand all edits in localStorage, causing cross-device
    // data loss.
    const effectiveTitle = noteTitleRef.current || title
    pendingRef.current = { title: effectiveTitle, html, noteId: editNoteId }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => { flushAutoSave() }, 1_000)
  }, [flushAutoSave])

  const handleSelectionUpdate = useCallback((from: number, to: number) => {
    if (sendCursorTimerRef.current) clearTimeout(sendCursorTimerRef.current)
    sendCursorTimerRef.current = setTimeout(() => {
      socketRef.current?.send(JSON.stringify({
        type: 'cursor', from, to,
        name: userNameRef.current,
        color: myColorRef.current,
        imageUrl: userImageRef.current,
      }))
    }, 50)
  }, [])

  // Reset deleted state whenever we switch to a different note
  useEffect(() => { setDeleted(false) }, [note.id])

  // Polling fallback: if the PartyKit delete broadcast was missed, detect deletion
  // via a periodic API check. Covers race conditions where the socket wasn't
  // connected when the broadcast fired.
  useEffect(() => {
    if (note.id.startsWith('temp-')) return

    const check = async () => {
      try {
        const url = note.sharedToken
          ? `/api/share/${note.sharedToken}`
          : `/api/notes/${note.id}`
        const res = await fetch(url, { method: 'GET' })
        if (res.status === 404) setDeleted(true)
      } catch {}
    }

    const interval = setInterval(check, 5_000)
    return () => clearInterval(interval)
  }, [note.id, note.sharedToken])

  // ── Note-switching ────────────────────────────────────────────────────────
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    const wasTemp = prevNoteIdRef.current.startsWith('temp-')

    // ── Flush pending save for the PREVIOUS note before switching ──────────
    // PartyKit flush is handled in the PartyKit effect's cleanup (runs before
    // this setup), but we still need to persist to the database.
    // Route through onAutoSave so AppShell's dirty-version tracking gets
    // cleared on success — otherwise the note stays "dirty" forever and
    // fetchNotes would keep clinging to the local copy, hiding remote edits.
    // CRITICAL: only flush if pendingRef belongs to the previous note. If for
    // any reason it carries a different noteId (e.g. an in-flight edit raced
    // with the switch), we MUST NOT save it under the wrong URL.
    const prev = prevNoteRef.current
    if (pendingRef.current && prev.id && !prev.id.startsWith('temp-') && pendingRef.current.noteId === prev.id) {
      const { title, html } = pendingRef.current
      if (!prev.sharedToken || prev.sharedPermission === 'EDIT') {
        onAutoSaveRef.current(prev.id, title, html)
      }
    }

    prevNoteIdRef.current = note.id
    prevNoteRef.current = { id: note.id, sharedToken: note.sharedToken, sharedPermission: note.sharedPermission }
    const currentHtml = ed.getHTML()
    // ── Temp → real promotion ─────────────────────────────────────────────
    // When a temp note is promoted to a real ID, the editor already has the
    // correct content from the temp phase. We must queue it for database
    // persistence under the new real ID — otherwise it only exists in
    // localStorage and will be wiped the next time fetchNotes runs.
    if (wasTemp && !note.id.startsWith('temp-')) {
      const text = ed.getText()
      const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'
      const html = currentHtml
      if (html && html !== '<p></p>') {
        pendingRef.current = { title, html, noteId: note.id }
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(() => { flushAutoSave() }, 1_000)
      } else {
        pendingRef.current = null
      }
      isLocallyEditingRef.current = false
      pendingSyncRef.current = true
      if (localEditTimeoutRef.current) clearTimeout(localEditTimeoutRef.current)
      if (sendTimerRef.current) { clearTimeout(sendTimerRef.current); sendTimerRef.current = null }
      if (sendCursorTimerRef.current) { clearTimeout(sendCursorTimerRef.current); sendCursorTimerRef.current = null }
      return
    }
    // ── Normal note switch ────────────────────────────────────────────────
    if (currentHtml !== note.content) {
      ed.commands.setContent(note.content || '', { emitUpdate: false })
    }
    // Auto-focus when switching to a brand new empty note so the user can type immediately
    if (!note.content || note.content === '<p></p>') {
      requestAnimationFrame(() => ed.commands.focus())
    }
    pendingRef.current = null
    lastLocalChangeTimeRef.current = 0
    isLocallyEditingRef.current = false
    pendingSyncRef.current = true  // block broadcasts until the server sync arrives
    if (localEditTimeoutRef.current) clearTimeout(localEditTimeoutRef.current)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    if (sendTimerRef.current) { clearTimeout(sendTimerRef.current); sendTimerRef.current = null }
    if (sendCursorTimerRef.current) { clearTimeout(sendCursorTimerRef.current); sendCursorTimerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  // ── Server content refresh ───────────────────────────────────────────────
  // When fetchNotes returns newer content from the database, the notes state
  // updates but the Editor keeps showing stale content (the note-switching
  // effect above only fires on note.id changes). This effect bridges that
  // gap: when serverFetchVersion increments, re-check the editor content
  // against the authoritative note.content and update if they diverge.
  useEffect(() => {
    if (serverFetchVersion === 0) return  // skip initial render
    const ed = editorRef.current
    if (!ed || !editorReady) return
    // If the user has been typing since the note was opened, their local
    // edits take priority — the auto-save will push them to the server.
    if (lastLocalChangeTimeRef.current > 0) return
    // If we're waiting for the initial PartyKit sync, don't interfere
    if (pendingSyncRef.current) return
    const currentHtml = ed.getHTML()
    if (note.content && currentHtml !== note.content) {
      const { from, to } = ed.state.selection
      ed.commands.setContent(note.content, { emitUpdate: false })
      const maxPos = ed.state.doc.content.size
      try {
        ed.commands.setTextSelection({ from: Math.min(from, maxPos), to: Math.min(to, maxPos) })
      } catch { /* position no longer valid */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverFetchVersion, editorReady])

  // ── PartyKit ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady || note.id.startsWith('temp-')) return

    const room = note.sharedNoteId ?? note.id
    const socket = new PartySocket({ host: PARTYKIT_HOST, room })
    socketRef.current = socket

    // Safety timeout: if PartyKit doesn't send a sync within 5 seconds,
    // unblock the auto-save pipeline anyway. Without this, a failed or
    // slow WebSocket connection would leave pendingSyncRef true forever,
    // preventing ALL PartyKit broadcasts for the lifetime of this view.
    const syncSafetyTimeout = setTimeout(() => {
      pendingSyncRef.current = false
    }, 5_000)

    socket.addEventListener('message', (evt) => {
      type Msg = {
        type: 'sync' | 'update' | 'presence' | 'cursor' | 'cursor-leave' | 'tags' | 'title' | 'delete' | 'comment-update'
        content?: string
        contentJson?: Record<string, unknown>
        title?: string
        updatedAt?: string
        tags?: Tag[]
        cursors?: RemoteCursor[]
        id?: string; from?: number; to?: number; name?: string; color?: string; ts?: number
      }
      const msg = JSON.parse(evt.data as string) as Msg
      const ed = editorRef.current

      if (msg.type === 'sync' || msg.type === 'update') {
        if (msg.type === 'sync') {
          pendingSyncRef.current = false  // server state received — safe to broadcast again
          clearTimeout(syncSafetyTimeout)
        }
        if (msg.content && msg.content !== '') {
          const safeToApply = ed && (msg.type === 'sync' || !isLocallyEditingRef.current)
          if (safeToApply) {
            const { from, to } = ed!.state.selection
            // Prefer JSON over HTML — JSON preserves trailing spaces that HTML parsing strips
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ed!.commands.setContent((msg.contentJson ?? msg.content) as any, { emitUpdate: false })
            const maxPos = ed!.state.doc.content.size
            try {
              ed!.commands.setTextSelection({ from: Math.min(from, maxPos), to: Math.min(to, maxPos) })
            } catch { /* position no longer valid */ }
            // Update local state with remote content, but preserve the local title
            // to prevent the remote user's auto-derived title from overwriting the
            // owner's title. Title sync only happens via explicit 'title' messages
            // or the initial 'sync' (which is authoritative).
            if (msg.type === 'sync') {
              if (msg.title) {
                onLocalChangeRef.current(liveNoteIdRef.current, msg.title, msg.content!)
                window.dispatchEvent(new CustomEvent('barrapad:remote-rename', {
                  detail: { id: note.id, title: msg.title },
                }))
              }
              // Persist PartyKit room content to the database — covers edge cases
              // where the room has content that was never saved (e.g. failed
              // beforeunload XHR, or content received from another client after
              // the database was last saved). Uses onAutoSaveRef to avoid stale
              // closures since this runs inside the long-lived PartyKit effect.
              const syncTitle = msg.title || noteTitleRef.current || ''
              const syncNoteId = liveNoteIdRef.current
              pendingRef.current = { title: syncTitle, html: msg.content!, noteId: syncNoteId }
              if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
              autoSaveTimerRef.current = setTimeout(() => {
                if (!pendingRef.current) return
                // Drop the save if the user navigated away or if the pending
                // entry is for a different note than this timer was scheduled for.
                if (pendingRef.current.noteId !== syncNoteId) return
                if (syncNoteId !== liveNoteIdRef.current) return
                const { title: t, html: h, noteId: nid } = pendingRef.current
                pendingRef.current = null
                onAutoSaveRef.current(nid, t, h)
              }, 2_000)
            } else {
              // For regular updates: only sync the content, keep local title
              const localTitle = noteTitleRef.current || ''
              onLocalChangeRef.current(liveNoteIdRef.current, localTitle, msg.content!)
            }
          }
        }
        if (msg.type === 'sync' && msg.cursors) {
          remoteCursorsRef.current.clear()
          for (const c of msg.cursors) remoteCursorsRef.current.set(c.id, c)
          if (ed) setCursors(ed, [...remoteCursorsRef.current.values()])
        }
      }

      // Tags sync — use ref so we always call the latest AppShell callback
      if (msg.type === 'tags' && msg.tags) {
        onTagsChangeRef.current(msg.tags)
      }

      // Title-only sync (rename) — bypass the content-derived title guard in AppShell
      if (msg.type === 'title' && msg.title) {
        window.dispatchEvent(new CustomEvent('barrapad:remote-rename', {
          detail: { id: note.id, title: msg.title },
        }))
      }

      if (msg.type === 'cursor' && msg.id && msg.from !== undefined && msg.to !== undefined) {
        remoteCursorsRef.current.set(msg.id, {
          id: msg.id, from: msg.from, to: msg.to,
          name: msg.name ?? 'Guest', color: msg.color ?? '#888',
        })
        if (ed) setCursors(ed, [...remoteCursorsRef.current.values()])
      }

      if (msg.type === 'cursor-leave' && msg.id) {
        remoteCursorsRef.current.delete(msg.id)
        if (ed) setCursors(ed, [...remoteCursorsRef.current.values()])
      }

      if (msg.type === 'comment-update') {
        // Another client changed comments — tell the sidebar to refresh
        window.dispatchEvent(new CustomEvent('barrapad:comment-update', {
          detail: { noteId: (msg as Record<string, unknown>).noteId ?? note.id },
        }))
      }

      if (msg.type === 'delete') {
        // Auto-remove immediately — no overlay, no button click required
        onNoteDeletedRef.current?.(note.id)
        setDeleted(true)
      }
    })

    return () => {
      clearTimeout(syncSafetyTimeout)
      // Flush any pending content to the PartyKit room BEFORE closing the socket,
      // so other clients (and the room's stored state) have the latest content.
      // Only flush if pendingRef belongs to THIS note — otherwise we'd leak
      // content from one note into another note's room.
      if (
        pendingRef.current &&
        pendingRef.current.noteId === note.id &&
        socket.readyState === WebSocket.OPEN
      ) {
        const { title, html } = pendingRef.current
        const contentJson = editorRef.current?.getJSON()
        socket.send(JSON.stringify({ type: 'update', content: html, contentJson, title, ts: Date.now() }))
      }
      remoteCursorsRef.current.clear()
      socket.close()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, editorReady])

  // ── Persistence helpers ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => { if (document.hidden) flushAutoSave() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [flushAutoSave])

  useEffect(() => {
    const handler = () => {
      if (!pendingRef.current || note.id.startsWith('temp-')) return
      if (note.sharedToken && note.sharedPermission === 'READ') return
      // Don't save a stale pending entry to the wrong note.
      if (pendingRef.current.noteId !== note.id) return
      const { title, html } = pendingRef.current
      try {
        const xhr = new XMLHttpRequest()
        const url = note.sharedToken
          ? `/api/share/${note.sharedToken}`
          : `/api/notes/${note.id}`
        xhr.open('PATCH', url, false)
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.send(JSON.stringify({ title, content: html }))
      } catch { /* best-effort */ }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  const handleManualSave = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const html = ed.getHTML()
    const text = ed.getText()
    const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    pendingRef.current = null
    onManualSave(liveNoteIdRef.current, title, html)
  }, [onManualSave])

  useEffect(() => {
    const handler = () => handleManualSave()
    window.addEventListener('barrapad:save', handler)
    return () => window.removeEventListener('barrapad:save', handler)
  }, [handleManualSave])

  useEffect(() => {
    const handler = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail
      if (id !== note.id) return
      socketRef.current?.send(JSON.stringify({ type: 'title', title }))
    }
    window.addEventListener('barrapad:rename', handler)
    return () => window.removeEventListener('barrapad:rename', handler)
  }, [note.id])

  // ── Mention notification ─────────────────────────────────────────────────
  const handleMentionInserted = useCallback((mentionedUserId: string, _displayName: string) => {
    const realNoteId = note.sharedNoteId ?? note.id
    if (realNoteId.startsWith('temp-')) return
    const text = editorRef.current?.getText() ?? ''
    const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'
    fetch('/api/notifications/mention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mentionedUserId, noteId: realNoteId, noteTitle: title }),
    }).catch(() => {})
  }, [note.id, note.sharedNoteId])

  // ── Comment sync via PartyKit ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ noteId: string }>).detail
      socketRef.current?.send(JSON.stringify({ type: 'comment-update', noteId: detail.noteId }))
    }
    window.addEventListener('barrapad:comment-broadcast', handler)
    return () => window.removeEventListener('barrapad:comment-broadcast', handler)
  }, [])

  // ── Tags sync ─────────────────────────────────────────────────────────────
  const handleTagsChangeWithSync = useCallback((tags: Tag[]) => {
    onTagsChange(tags)
    socketRef.current?.send(JSON.stringify({ type: 'tags', tags }))
  }, [onTagsChange])

  // ── Render ────────────────────────────────────────────────────────────────
  const editable = !note.sharedToken || note.sharedPermission === 'EDIT'

  if (deleted) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--editor-bg)', gap: 8, textAlign: 'center', padding: '0 2rem',
      }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          This note has been deleted
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Someone removed this note.
        </p>
        <button
          onClick={() => onNoteDeleted?.(note.id)}
          style={{
            marginTop: 12, fontSize: 13, fontWeight: 600,
            padding: '8px 20px', borderRadius: 10,
            background: '#D4550A', color: '#fff',
            border: 'none', cursor: 'pointer',
          }}
        >
          Remove from my view
        </button>
      </div>
    )
  }

  return (
    <NoteEditorCore
      initialContent={note.content || ''}
      editable={editable}
      onEditorReady={handleEditorReady}
      onUpdate={handleUpdate}
      onBlur={flushAutoSave}
      onSelectionUpdate={handleSelectionUpdate}
      isLocallyEditingRef={isLocallyEditingRef}
      localEditTimeoutRef={localEditTimeoutRef}
      noteId={note.sharedNoteId ?? note.id}
      onMentionInserted={handleMentionInserted}
      onNoteMentionClick={onNoteMentionClick}
      infoRows={[
        { label: 'Created', value: formatDate(note.createdAt) },
        { label: 'Updated', value: formatDate(note.updatedAt) },
      ]}
      bottomSlot={
        <TagInput tags={note.tags ?? []} allTags={allTags} onChange={handleTagsChangeWithSync} />
      }
    />
  )
}
