'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { useUser } from '@clerk/nextjs'
import { pickColor } from '@/extensions/collab-cursor'
import TagInput from './TagInput'
import NoteEditorCore from './NoteEditorCore'
import PresenceAvatars from './PresenceAvatars'
import type { Note, Tag } from '@/types'

import { REALTIME_HOST, roomQuery } from '@/lib/realtime'
import { claimSeed, onRoomMessage, sendRoomMessage } from '@/lib/noteRoom'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import YProvider from 'y-partyserver/provider'
import { persistDoc, loadOfflineDirty, clearOfflineDirty, syncOfflineNote } from '@/lib/offlineNotes'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date}\n${time}`
}

interface EditorProps {
  note: Note
  allTags: Tag[]
  /** False until the first /api/notes fetch of the session lands. Editing is
   *  blocked until then so a stale cached copy can never be saved over fresher
   *  server content. */
  serverReady: boolean
  /** Called immediately on every change — updates localStorage only, no API.
   *  noteId is captured at the moment the change happened so the parent never
   *  trusts a stale closure of `activeNoteId`. */
  onLocalChange: (noteId: string, title: string, content: string) => void
  /** Content merged in from another tab. Does not mark the note dirty. */
  onRemoteContent: (noteId: string, title: string | undefined, content: string, updatedAt?: string) => void
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
  /** Rename a tag globally (propagates through registry + every note using it) */
  onRenameTag?: (oldLabel: string, newLabel: string, newColor: string) => void
  /** Delete a tag globally (registry + every note using it) */
  onDeleteTag?: (label: string) => void
}

export default function EditorComponent({
  note,
  allTags,
  serverReady,
  onLocalChange,
  onRemoteContent,
  onAutoSave,
  onManualSave,
  onTagsChange,
  onNoteDeleted,
  onNoteMentionClick,
  onRenameTag,
  onDeleteTag,
}: EditorProps) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const editorRef = useRef<Editor | null>(null)
  const [deleted, setDeleted] = useState(false)

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // pendingRef carries the noteId the edit was made against so a stale save
  // can be detected and dropped instead of overwriting a different note.
  const pendingRef = useRef<{ title: string; html: string; noteId: string } | null>(null)

  // Keep latest callback refs so long-lived listeners never have a stale closure
  const onNoteDeletedRef = useRef(onNoteDeleted)
  useEffect(() => { onNoteDeletedRef.current = onNoteDeleted }, [onNoteDeleted])

  const onLocalChangeRef = useRef(onLocalChange)
  const onRemoteContentRef = useRef(onRemoteContent)
  const onTagsChangeRef = useRef(onTagsChange)
  const onAutoSaveRef = useRef(onAutoSave)
  useEffect(() => { onLocalChangeRef.current = onLocalChange }, [onLocalChange])
  useEffect(() => { onRemoteContentRef.current = onRemoteContent }, [onRemoteContent])
  useEffect(() => { onTagsChangeRef.current = onTagsChange }, [onTagsChange])
  useEffect(() => { onAutoSaveRef.current = onAutoSave }, [onAutoSave])

  // The note's "real" title from state, so saves use it instead of the
  // content-derived title (which ignores manual renames).
  const noteTitleRef = useRef(note.title)
  useEffect(() => { noteTitleRef.current = note.title }, [note.title])
  // Server-issued timestamp of the database copy we hold, for the seed claim.
  const noteUpdatedAtRef = useRef(note.updatedAt)
  useEffect(() => { noteUpdatedAtRef.current = note.updatedAt }, [note.updatedAt])

  const lastLocalChangeTimeRef = useRef(0)
  const prevNoteIdRef = useRef<string>(note.id)
  // Track previous note info so we can flush auto-save to the correct endpoint on note switch
  const prevNoteRef = useRef<{ id: string; sharedToken?: string; sharedPermission?: string }>({
    id: note.id, sharedToken: note.sharedToken, sharedPermission: note.sharedPermission,
  })
  const myColorRef = useRef(pickColor(Math.random().toString()))
  const userNameRef = useRef('Me')

  const { user } = useUser()
  // The top bar's slot for presence avatars (AppShell).
  const [presenceSlot, setPresenceSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setPresenceSlot(document.getElementById('bpad-presence')), [])
  useEffect(() => {
    if (user) {
      userNameRef.current =
        user.firstName ||
        user.username ||
        user.primaryEmailAddress?.emailAddress?.split('@')[0] ||
        'Me'
    }
  }, [user])

  // ── Yjs ───────────────────────────────────────────────────────────────────
  // Content syncs through a Y doc in the note's room, which also carries tags,
  // titles, deletes and comment signals as custom messages.
  // A temp- note gets its doc at once and goes online when its real id
  // arrives, on the same doc and editor, so nothing remounts while typing.
  // Guest (local-) notes have no room and use a plain editor.
  const yMode = !note.id.startsWith('local-')
  const yModeRef = useRef(yMode)
  yModeRef.current = yMode
  const room = note.sharedNoteId ?? note.id
  // A note opened through a share link is reached with its token: the user
  // may be neither owner nor collaborator.
  const shareTokenRef = useRef(note.sharedToken)
  shareTokenRef.current = note.sharedToken
  // The doc is also kept in IndexedDB (idb), so a note opened here before can
  // be edited offline (offlineLive) and merges into the room on reconnect.
  type Collab = { key: string; room: string; doc: Y.Doc; awareness: Awareness; provider: YProvider | null; idb: ReturnType<typeof persistDoc> | null; local: boolean }
  const [collab, setCollab] = useState<Collab | null>(null)
  const collabRef = useRef<Collab | null>(null)
  const [ySynced, setYSynced] = useState(false)
  // Bumped on every sync with the room, including reconnects.
  const [syncTick, setSyncTick] = useState(0)
  const [offlineLive, setOfflineLive] = useState(false)
  const [yEditor, setYEditor] = useState<Editor | null>(null)
  const [seedDone, setSeedDone] = useState(false)
  const seedDoneRef = useRef(false)
  seedDoneRef.current = seedDone
  const noteContentRef = useRef(note.content)
  useEffect(() => { noteContentRef.current = note.content }, [note.content])
  // The temp- id this render's note was promoted from, if any. Only a real
  // promotion counts (useNotes announces it): switching away from an unsaved
  // temp- note to another note must never carry its doc along.
  const promotionsRef = useRef(new Map<string, string>())
  useEffect(() => {
    const handler = (e: Event) => {
      const { tempId, id } = (e as CustomEvent<{ tempId: string; id: string }>).detail
      promotionsRef.current.set(tempId, id)
    }
    window.addEventListener('barrapad:promoted', handler)
    return () => window.removeEventListener('barrapad:promoted', handler)
  }, [])
  const prevIdRef = useRef(note.id)
  const promotedFromRef = useRef<string | null>(null)
  if (prevIdRef.current !== note.id) {
    const prev = prevIdRef.current
    promotedFromRef.current = promotionsRef.current.get(prev) === note.id ? prev : null
    prevIdRef.current = note.id
  }

  useEffect(() => {
    const connect = (c: Collab, r: string) => {
      const p = new YProvider(REALTIME_HOST, r, c.doc, { party: 'note-y', params: roomQuery(r, shareTokenRef.current), awareness: c.awareness })
      p.on('synced', (s: boolean) => {
        if (s && collabRef.current?.provider === p) { setYSynced(true); setSyncTick((t) => t + 1) }
      })
      return p
    }
    // Offline, a doc kept from an earlier visit is good enough to edit.
    const keep = (c: Collab) => {
      c.idb = persistDoc(c.room, c.doc)
      c.idb.whenSynced.then(() => {
        if (collabRef.current !== c || navigator.onLine || c.doc.getXmlFragment('default').length === 0) return
        setOfflineLive(true)
        setSeedDone(true)
      })
    }
    const destroy = (c: Collab) => { c.provider?.destroy(); c.idb?.destroy(); c.awareness.destroy(); c.doc.destroy() }
    const cur = collabRef.current
    const isTemp = room.startsWith('temp-')
    if (yMode && cur?.local && cur.room === promotedFromRef.current && !isTemp) {
      const next = { ...cur, room }
      next.provider = connect(next, room)
      keep(next)
      collabRef.current = next
      setCollab(next)
      return
    }
    if (cur) destroy(cur)
    collabRef.current = null
    setYSynced(false); setYEditor(null); setSeedDone(isTemp); setOfflineLive(false)
    if (!yMode) { setCollab(null); return }
    const doc = new Y.Doc()
    const c: Collab = { key: doc.guid, room, doc, awareness: new Awareness(doc), provider: null, idb: null, local: isTemp }
    collabRef.current = c
    if (!isTemp) { c.provider = connect(c, room); keep(c) }
    setCollab(c)
  }, [yMode, room])
  useEffect(() => () => {
    const c = collabRef.current
    if (c) { c.provider?.destroy(); c.idb?.destroy(); c.awareness.destroy(); c.doc.destroy() }
  }, [])

  // Once the doc and the database copy are both known, ask the room whether
  // this tab should load the database HTML. A doc born in this tab (temp-
  // note) already holds the content.
  useEffect(() => {
    if (!collab?.provider || collab.local || !yEditor || !serverReady) return
    return claimSeed(collab.provider, yEditor,
      () => ({ html: noteContentRef.current, updatedAt: noteUpdatedAtRef.current }),
      () => setSeedDone(true),
      () => loadOfflineDirty().includes(liveNoteIdRef.current))
  }, [collab, yEditor, serverReady])

  // Tags, renames, deletes and comment signals from the room.
  useEffect(() => {
    if (!collab?.provider) return
    return onRoomMessage(collab.provider, (msg) => {
      const id = liveNoteIdRef.current
      if (msg.type === 'tags' && msg.tags) onTagsChangeRef.current(msg.tags)
      if (msg.type === 'title' && msg.title) {
        window.dispatchEvent(new CustomEvent('barrapad:remote-rename', { detail: { id, title: msg.title } }))
      }
      if (msg.type === 'comment-update') {
        window.dispatchEvent(new CustomEvent('barrapad:comment-update', { detail: { noteId: msg.noteId ?? id } }))
      }
      if (msg.type === 'delete') {
        onNoteDeletedRef.current?.(id)
        setDeleted(true)
      }
    })
  }, [collab])
  const sendToRoom = useCallback((msg: Record<string, unknown>) => sendRoomMessage(collabRef.current?.provider, msg), [])

  // Tell the room which database version the doc now matches.
  useEffect(() => {
    if (!collab) return
    const handler = (e: Event) => {
      const { noteId, updatedAt } = (e as CustomEvent<{ noteId: string; updatedAt?: string }>).detail
      if (noteId !== liveNoteIdRef.current || !updatedAt) return
      sendRoomMessage(collab.provider, { type: 'saved', dbUpdatedAt: updatedAt })
    }
    window.addEventListener('barrapad:saved', handler)
    return () => window.removeEventListener('barrapad:saved', handler)
  }, [collab])

  // Someone who clicked into the read-only preview expects to keep typing once
  // the live editor replaces it, so hand the focus over.
  const wantFocusRef = useRef(false)
  useEffect(() => {
    if (!yMode || ySynced) return
    wantFocusRef.current = false
    // A read-only editor cannot take focus, so watch for the click instead.
    const onDown = (e: PointerEvent) => { if ((e.target as HTMLElement).closest?.('.ProseMirror')) wantFocusRef.current = true }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [yMode, ySynced, room])
  useEffect(() => {
    if (!seedDone || !yEditor || !wantFocusRef.current) return
    wantFocusRef.current = false
    yEditor.commands.focus('end')
  }, [seedDone, yEditor])

  const handleYEditorReady = useCallback((ed: Editor) => {
    editorRef.current = ed
    setYEditor(ed)
    // A brand new note: type straight away.
    if (collabRef.current?.local) requestAnimationFrame(() => ed.commands.focus())
  }, [])

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
    // Read the title now, not when the save was queued: the ref follows note
    // state one render behind, so the queued title misses the last keystroke.
    onAutoSaveRef.current(noteId, noteTitleRef.current || title, html)
  }, [])

  // ── NoteEditorCore callbacks ──────────────────────────────────────────────
  const plainEditorRef = useRef<Editor | null>(null)
  const handleEditorReady = useCallback((ed: Editor) => {
    editorRef.current = ed
    plainEditorRef.current = ed
  }, [])

  const handleUpdate = useCallback((html: string, _text: string, title: string, remote?: boolean) => {
    // Bind every save to the note id at the moment of the edit.
    const editNoteId = liveNoteIdRef.current
    // Yjs fires updates for its own first render and for remote edits; only a
    // real content change should mark the note dirty and save.
    // Before the seed claim resolves the doc may still be empty: saving that
    // would wipe the note.
    if (yModeRef.current && (!seedDoneRef.current || html === noteContentRef.current)) return
    // Another tab's edit, merged through Yjs: show it in the list, but that tab
    // saves it. Saving here too also saved half-merged states (an empty doc
    // while a seed was still arriving).
    if (remote) {
      onRemoteContentRef.current(editNoteId, undefined, html)
      // A tab that edited this note also saves the merge: two authors saving
      // at the same moment can each miss the other's last keystrokes.
      if (lastLocalChangeTimeRef.current > 0) {
        pendingRef.current = { title: noteTitleRef.current || title, html, noteId: editNoteId }
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(() => { flushAutoSave() }, 1_000)
      }
      return
    }
    onLocalChangeRef.current(editNoteId, title, html)
    lastLocalChangeTimeRef.current = Date.now()

    pendingRef.current = { title: noteTitleRef.current || title, html, noteId: editNoteId }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => { flushAutoSave() }, 1_000)
  }, [flushAutoSave])

  // Reset deleted state whenever we switch to a different note
  useEffect(() => { setDeleted(false) }, [note.id])

  // Polling fallback: if the room's delete signal was missed, detect deletion
  // via a periodic API check. Requires 3 consecutive 404s before declaring deleted
  // to avoid false positives from transient network issues or cold starts.
  const consecutive404Ref = useRef(0)
  useEffect(() => {
    if (/^(temp|local)-/.test(note.id)) return
    consecutive404Ref.current = 0

    const check = async () => {
      try {
        const url = note.sharedToken
          ? `/api/share/${note.sharedToken}`
          : `/api/notes/${note.id}`
        const res = await fetch(url, { method: 'GET' })
        if (res.status === 404) {
          consecutive404Ref.current++
          if (consecutive404Ref.current >= 3) setDeleted(true)
        } else {
          consecutive404Ref.current = 0
        }
      } catch {
        // Network error — don't count as 404
      }
    }

    const interval = setInterval(check, 5_000)
    return () => clearInterval(interval)
  }, [note.id, note.sharedToken])

  // ── Note-switching ────────────────────────────────────────────────────────
  useEffect(() => {
    // In Yjs mode the editor remounts per note and the doc supplies content,
    // so only the previous note's save is flushed here.
    const ed = editorRef.current
    if (!ed) return
    // Only a real promotion counts. Switching from an unsaved new note to
    // another note used to queue that note's content under the fallback
    // title, renaming it to Untitled.
    const promoted = promotedFromRef.current !== null && promotedFromRef.current === prevNoteIdRef.current

    // ── Flush pending save for the PREVIOUS note before switching ──────────
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
    // Only the long-lived plain editor (guest notes) is reused across notes. A
    // Yjs editor is bound to the previous note's doc and is being unmounted:
    // never write to it.
    const reused = ed === plainEditorRef.current && !ed.isDestroyed
    // ── Temp → real promotion ─────────────────────────────────────────────
    // The doc already holds the content typed during the temp phase. Queue it
    // for the database under the new real id, otherwise it only exists in
    // localStorage and is wiped the next time fetchNotes runs.
    if (promoted) {
      const html = note.content
      if (html && html !== '<p></p>') {
        const title = noteTitleRef.current || 'Untitled'
        pendingRef.current = { title, html, noteId: note.id }
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(() => { flushAutoSave() }, 1_000)
      } else {
        pendingRef.current = null
      }
      return
    }
    // ── Normal note switch ────────────────────────────────────────────────
    if (reused && !yMode && ed.getHTML() !== note.content) {
      ed.commands.setContent(note.content || '', { emitUpdate: false })
    }
    // Auto-focus when switching to a brand new empty note so the user can type immediately
    if (reused && !yMode && (!note.content || note.content === '<p></p>')) {
      requestAnimationFrame(() => ed.commands.focus())
    }
    pendingRef.current = null
    lastLocalChangeTimeRef.current = 0
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  // ── Persistence helpers ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => { if (document.hidden) flushAutoSave() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [flushAutoSave])

  useEffect(() => {
    const handler = () => {
      if (!pendingRef.current || /^(temp|local)-/.test(note.id)) return
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
      sendToRoom({ type: 'title', title })
    }
    window.addEventListener('barrapad:rename', handler)
    return () => window.removeEventListener('barrapad:rename', handler)
  }, [note.id, sendToRoom])

  // ── Mention notification ─────────────────────────────────────────────────
  const handleMentionInserted = useCallback((mentionedUserId: string, _displayName: string) => {
    const realNoteId = note.sharedNoteId ?? note.id
    if (/^(temp|local)-/.test(realNoteId)) return
    fetch('/api/notifications/mention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mentionedUserId, noteId: realNoteId }),
    }).catch(() => {})
  }, [note.id, note.sharedNoteId])

  // ── Comment sync through the room ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ noteId: string }>).detail
      sendToRoom({ type: 'comment-update', noteId: detail.noteId })
    }
    window.addEventListener('barrapad:comment-broadcast', handler)
    return () => window.removeEventListener('barrapad:comment-broadcast', handler)
  }, [sendToRoom])

  // ── Tags sync ─────────────────────────────────────────────────────────────
  const handleTagsChangeWithSync = useCallback((tags: Tag[]) => {
    onTagsChange(tags)
    sendToRoom({ type: 'tags', tags })
  }, [onTagsChange, sendToRoom])

  // ── Offline edits ─────────────────────────────────────────────────────────
  // Notes edited offline (lib/offlineNotes) owe the database a save. Once the
  // room is reachable, save this note from the editor and merge the others
  // in the background, then save them too.
  const offlineSyncingRef = useRef(false)
  // A socket that never dropped syncs nothing on reconnect, so the network
  // coming back is a reason to look too.
  useEffect(() => {
    const onOnline = () => setTimeout(() => setSyncTick((t) => t + 1), 1_000)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  useEffect(() => {
    if (!yEditor || !ySynced || !navigator.onLine || offlineSyncingRef.current) return
    const ids = loadOfflineDirty()
    if (!ids.length) return
    offlineSyncingRef.current = true
    const schema = yEditor.schema
    ;(async () => {
      for (const id of ids) {
        if (id === liveNoteIdRef.current) {
          if (!seedDoneRef.current || yEditor.isDestroyed) continue
          pendingRef.current = { title: noteTitleRef.current || 'Untitled', html: yEditor.getHTML(), noteId: id }
          flushAutoSave()
          continue
        }
        try {
          const res = await syncOfflineNote(id, schema)
          if (!res) { clearOfflineDirty(id); continue }
          onRemoteContentRef.current(id, undefined, res.html)
          onAutoSaveRef.current(id, res.title, res.html)
        } catch { /* room unreachable: the next sync retries */ }
      }
    })().finally(() => { offlineSyncingRef.current = false })
  }, [syncTick, seedDone, yEditor, ySynced, flushAutoSave])

  // ── Render ────────────────────────────────────────────────────────────────
  const editable = (!note.sharedToken || note.sharedPermission === 'EDIT') && (serverReady || offlineLive)

  if (deleted) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--editor-bg)', gap: 8, textAlign: 'center', padding: '0 2rem',
      }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          {note.sharedToken ? 'You can no longer open this note' : 'This note has been deleted'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          {note.sharedToken ? 'It was deleted, or the owner stopped sharing it with you.' : 'Someone removed this note.'}
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

  // Until the doc arrives, show the cached copy read-only so the note never
  // flashes blank, then mount an editor bound to this note's doc.
  // A promoted temp- note keeps its doc: the effect re-labels it after render.
  const ownDoc = !!collab && (collab.room === room || (collab.local && collab.room === promotedFromRef.current))
  const yLive = yMode && ownDoc && (collab!.local || ySynced || offlineLive)
  const yPreview = yMode && !yLive
  return (
    <>
    {yLive && presenceSlot && createPortal(<PresenceAvatars awareness={collab!.awareness} />, presenceSlot)}
    <NoteEditorCore
      key={yLive ? `y-${collab!.key}` : yPreview ? `preview-${room}` : 'plain'}
      collab={yLive ? { doc: collab!.doc, awareness: collab!.awareness, user: { name: userNameRef.current, color: myColorRef.current, imageUrl: user?.imageUrl, clientId: collab!.doc.clientID } } : undefined}
      initialContent={note.content || ''}
      editable={yLive ? editable && seedDone : editable && !yPreview}
      reserveToolbar
      onEditorReady={yLive ? handleYEditorReady : yPreview ? undefined : handleEditorReady}
      onUpdate={yPreview ? undefined : handleUpdate}
      onBlur={flushAutoSave}
      noteId={note.sharedNoteId ?? note.id}
      onMentionInserted={handleMentionInserted}
      onNoteMentionClick={onNoteMentionClick}
      infoRows={[
        { label: 'Created', value: formatDate(note.createdAt) },
        { label: 'Updated', value: formatDate(note.updatedAt) },
      ]}
      bottomSlot={
        <TagInput
          tags={note.tags ?? []}
          allTags={allTags}
          onChange={handleTagsChangeWithSync}
          onRenameTag={onRenameTag}
          onDeleteTag={onDeleteTag}
          readOnly={!editable}
        />
      }
    />
    </>
  )
}
