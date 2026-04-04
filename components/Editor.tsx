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
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface EditorProps {
  note: Note
  allTags: Tag[]
  /** Called immediately on every change — updates localStorage only, no API */
  onLocalChange: (title: string, content: string) => void
  /** Called after 1s idle, blur, or tab switch — syncs to API */
  onAutoSave: (title: string, content: string) => void
  /** Called when the user explicitly presses Save */
  onManualSave: (title: string, content: string) => void
  onTagsChange: (tags: Tag[]) => void
}

export default function EditorComponent({
  note,
  allTags,
  onLocalChange,
  onAutoSave,
  onManualSave,
  onTagsChange,
}: EditorProps) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const editorRef = useRef<Editor | null>(null)
  const [editorReady, setEditorReady] = useState(false)

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ title: string; html: string } | null>(null)

  const socketRef = useRef<PartySocket | null>(null)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Passed to NoteEditorCore so the sync guard can be read here in the PartyKit handler
  const isLocallyEditingRef = useRef(false)
  const localEditTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep latest callback refs so the long-lived PartyKit effect never has a stale closure
  const onLocalChangeRef = useRef(onLocalChange)
  const onTagsChangeRef = useRef(onTagsChange)
  useEffect(() => { onLocalChangeRef.current = onLocalChange }, [onLocalChange])
  useEffect(() => { onTagsChangeRef.current = onTagsChange }, [onTagsChange])

  const lastLocalChangeTimeRef = useRef(0)
  const prevNoteIdRef = useRef<string>(note.id)
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
  const flushAutoSave = useCallback(() => {
    if (!pendingRef.current) return
    const { title, html } = pendingRef.current
    pendingRef.current = null
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    onAutoSave(title, html)
  }, [onAutoSave])

  // ── NoteEditorCore callbacks ──────────────────────────────────────────────
  const handleEditorReady = useCallback((ed: Editor) => {
    editorRef.current = ed
    setEditorReady(true)
  }, [])

  const handleUpdate = useCallback((html: string, _text: string, title: string) => {
    onLocalChange(title, html)

    lastLocalChangeTimeRef.current = Date.now()

    if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
    sendTimerRef.current = setTimeout(() => {
      // Send JSON alongside HTML — JSON preserves all whitespace (spaces, trailing spaces)
      // which the HTML serializer/parser would otherwise silently strip.
      const contentJson = editorRef.current?.getJSON()
      socketRef.current?.send(JSON.stringify({ type: 'update', content: html, contentJson, title, ts: lastLocalChangeTimeRef.current }))
    }, 50)

    pendingRef.current = { title, html }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => { flushAutoSave() }, 1_000)
  }, [onLocalChange, flushAutoSave])

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

  // ── Note-switching ────────────────────────────────────────────────────────
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    const wasTemp = prevNoteIdRef.current.startsWith('temp-')
    prevNoteIdRef.current = note.id
    const currentHtml = ed.getHTML()
    // Keep content when a temp note is promoted — user may have typed while the API was in flight
    if (wasTemp && !note.id.startsWith('temp-') && (!note.content || note.content === '<p></p>')) {
      const text = ed.getText()
      const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'
      pendingRef.current = { title, html: currentHtml }
      return
    }
    if (currentHtml !== note.content) {
      ed.commands.setContent(note.content || '')
    }
    pendingRef.current = null
    lastLocalChangeTimeRef.current = 0
    isLocallyEditingRef.current = false
    if (localEditTimeoutRef.current) clearTimeout(localEditTimeoutRef.current)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  // ── PartyKit ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady || note.id.startsWith('temp-')) return

    const room = note.sharedNoteId ?? note.id
    const socket = new PartySocket({ host: PARTYKIT_HOST, room })
    socketRef.current = socket

    socket.addEventListener('message', (evt) => {
      type Msg = {
        type: 'sync' | 'update' | 'presence' | 'cursor' | 'cursor-leave' | 'tags' | 'title'
        content?: string
        contentJson?: Record<string, unknown>
        title?: string
        tags?: Tag[]
        cursors?: RemoteCursor[]
        id?: string; from?: number; to?: number; name?: string; color?: string; ts?: number
      }
      const msg = JSON.parse(evt.data as string) as Msg
      const ed = editorRef.current

      if (msg.type === 'sync' || msg.type === 'update') {
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
            if (msg.title) onLocalChangeRef.current(msg.title, msg.content!)
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
    })

    return () => {
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
    onManualSave(title, html)
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

  // ── Tags sync ─────────────────────────────────────────────────────────────
  const handleTagsChangeWithSync = useCallback((tags: Tag[]) => {
    onTagsChange(tags)
    socketRef.current?.send(JSON.stringify({ type: 'tags', tags }))
  }, [onTagsChange])

  // ── Render ────────────────────────────────────────────────────────────────
  const editable = !note.sharedToken || note.sharedPermission === 'EDIT'

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
