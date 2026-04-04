'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { useUser } from '@clerk/nextjs'
import PartySocket from 'partysocket'
import { HelpCircle, Settings } from 'lucide-react'
import TagInput from './TagInput'
import AppearanceModal from './AppearanceModal'
import AboutModal from './AboutModal'
import NoteEditorCore from './NoteEditorCore'
import type { AppearanceSettings, Tag } from '@/types'
import { CollabCursor, setCursors, pickColor } from '@/extensions/collab-cursor'
import type { RemoteCursor } from '@/extensions/collab-cursor'

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'barrapad.barragain.partykit.dev'

const DEFAULT_APPEARANCE: AppearanceSettings = { mode: 'light', font: 'mono', zoom: 16, theme: 'barrapad' }

function loadAppearance(): AppearanceSettings {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = localStorage.getItem('barrapad_appearance')
    if (raw) return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_APPEARANCE
}

function applyAppearance(s: AppearanceSettings) {
  const root = document.documentElement
  root.setAttribute('data-theme', s.theme)
  root.setAttribute('data-font', s.font)
  if (s.mode === 'dark') root.classList.add('dark')
  else if (s.mode === 'light') root.classList.remove('dark')
  else root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.style.setProperty('--editor-size', `${s.zoom}px`)
}

interface Props {
  token: string
  noteId: string
  initialTitle: string
  initialContent: string
  initialTags: Tag[]
  permission: 'READ' | 'EDIT'
  updatedAt: string
}

export default function SharedNoteView({ token, noteId, initialTitle, initialContent, initialTags, permission, updatedAt }: Props) {
  const { isSignedIn, isLoaded, user } = useUser()
  const canEdit = permission === 'EDIT' && !!isSignedIn

  // ── Editor ref (populated by NoteEditorCore) ──────────────────────────────
  const editorRef = useRef<Editor | null>(null)
  const [editorReady, setEditorReady] = useState(false)

  // ── Tags ──────────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<Tag[]>(initialTags)
  const handleTagsChange = useCallback(async (newTags: Tag[]) => {
    setTags(newTags)
    try {
      await fetch(`/api/share/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      })
    } catch {}
  }, [token])

  // ── PartyKit refs ─────────────────────────────────────────────────────────
  const socketRef = useRef<PartySocket | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef(false)
  const lastLocalChangeTimeRef = useRef(0)

  // Passed to NoteEditorCore so the sync guard can be read here in the PartyKit handler
  const isLocallyEditingRef = useRef(false)
  const localEditTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const remoteCursorsRef = useRef<Map<string, RemoteCursor>>(new Map())
  const myColorRef = useRef(pickColor(Math.random().toString()))
  const canEditRef = useRef(canEdit)
  const userNameRef = useRef('Guest')
  const userImageRef = useRef<string | undefined>(undefined)

  useEffect(() => { canEditRef.current = canEdit }, [canEdit])
  useEffect(() => {
    if (user) {
      userNameRef.current =
        user.firstName ||
        user.username ||
        user.primaryEmailAddress?.emailAddress?.split('@')[0] ||
        'Guest'
      userImageRef.current = user.imageUrl || undefined
    }
  }, [user])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastUpdated, setLastUpdated] = useState(updatedAt)
  const [connections, setConnections] = useState(1)
  const [connected, setConnected] = useState(false)
  const [presenceList, setPresenceList] = useState<RemoteCursor[]>([])
  const [showAbout, setShowAbout] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [deleted, setDeleted] = useState(false)
  const aboutAudioRef = useRef<HTMLAudioElement | null>(null)

  // Load & apply appearance on mount
  useEffect(() => {
    const s = loadAppearance()
    setAppearance(s)
    applyAppearance(s)
  }, [])

  const formattedDate = new Date(lastUpdated).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })

  // ── NoteEditorCore callbacks ──────────────────────────────────────────────
  const handleEditorReady = useCallback((ed: Editor) => {
    editorRef.current = ed
    setEditorReady(true)
  }, [])

  const handleUpdate = useCallback((html: string, text: string, _title: string) => {
    const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'

    pendingRef.current = true
    lastLocalChangeTimeRef.current = Date.now()

    if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
    sendTimerRef.current = setTimeout(() => {
      const contentJson = editorRef.current?.getJSON()
      socketRef.current?.send(JSON.stringify({ type: 'update', content: html, contentJson, title, ts: lastLocalChangeTimeRef.current }))
    }, 50)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    saveTimerRef.current = setTimeout(async () => {
      pendingRef.current = false
      try {
        const res = await fetch(`/api/share/${token}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content: html }),
        })
        if (res.ok) {
          const data = await res.json() as { updatedAt: string }
          setLastUpdated(data.updatedAt)
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        }
      } catch {}
    }, 1000)
  }, [token])

  const handleSelectionUpdate = useCallback((from: number, to: number) => {
    if (!canEditRef.current) return
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

  // ── PartyKit ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorReady) return

    const socket = new PartySocket({ host: PARTYKIT_HOST, room: noteId })
    socketRef.current = socket

    socket.addEventListener('open', () => setConnected(true))
    socket.addEventListener('close', () => setConnected(false))

    socket.addEventListener('message', (evt) => {
      type AnyMsg = {
        type: 'sync' | 'update' | 'presence' | 'cursor' | 'cursor-leave' | 'tags' | 'title' | 'delete'
        content?: string; contentJson?: Record<string, unknown>
        title?: string; updatedAt?: string; connections?: number
        tags?: import('@/types').Tag[]
        cursors?: RemoteCursor[]
        id?: string; from?: number; to?: number; name?: string; color?: string; imageUrl?: string
        ts?: number
      }
      const msg = JSON.parse(evt.data as string) as AnyMsg
      const ed = editorRef.current

      if (msg.type === 'presence') {
        setConnections(msg.connections ?? 1)
        return
      }

      if (msg.type === 'sync' || msg.type === 'update') {
        if (msg.connections !== undefined) setConnections(msg.connections)
        if (msg.content && ed) {
          const safeToApply =
            !canEditRef.current ||
            msg.type === 'sync' ||
            !isLocallyEditingRef.current
          if (safeToApply) {
            const { from, to } = ed.state.selection
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ed.commands.setContent((msg.contentJson ?? msg.content) as any, { emitUpdate: false })
            const maxPos = ed.state.doc.content.size
            try {
              ed.commands.setTextSelection({ from: Math.min(from, maxPos), to: Math.min(to, maxPos) })
            } catch { /* position no longer valid */ }
          }
        }
        if (msg.content !== '') setLastUpdated(msg.updatedAt ?? lastUpdated)
        if (msg.type === 'sync' && msg.cursors) {
          remoteCursorsRef.current.clear()
          for (const c of msg.cursors) remoteCursorsRef.current.set(c.id, c)
          setPresenceList([...remoteCursorsRef.current.values()])
          if (ed) setCursors(ed, [...remoteCursorsRef.current.values()])
        }
        return
      }

      if (msg.type === 'tags' && msg.tags) {
        setTags(msg.tags)
        return
      }

      if (msg.type === 'title' && msg.title) {
        document.title = `${msg.title} | barraPAD - A notepad for whatever`
        return
      }

      if (msg.type === 'delete') {
        setDeleted(true)
        return
      }

      if (msg.type === 'cursor' && msg.id && msg.from !== undefined && msg.to !== undefined) {
        const existing = remoteCursorsRef.current.get(msg.id)
        const cursor: RemoteCursor = {
          ...existing,
          id: msg.id, from: msg.from, to: msg.to,
          name: msg.name ?? 'Guest', color: msg.color ?? '#888',
          imageUrl: msg.imageUrl,
        }
        remoteCursorsRef.current.set(msg.id, cursor)
        setPresenceList([...remoteCursorsRef.current.values()])
        if (ed) setCursors(ed, [...remoteCursorsRef.current.values()])
        return
      }

      if (msg.type === 'cursor-leave' && msg.id) {
        remoteCursorsRef.current.delete(msg.id)
        setPresenceList([...remoteCursorsRef.current.values()])
        if (ed) setCursors(ed, [...remoteCursorsRef.current.values()])
      }
    })

    return () => {
      remoteCursorsRef.current.clear()
      socket.close()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, editorReady])

  // ── Render ────────────────────────────────────────────────────────────────
  if (deleted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--editor-bg, #F9F7F4)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 16, color: '#8A8178', marginBottom: 12 }}>This note has been deleted.</p>
          <a href="/" style={{ fontSize: 14, color: '#D4550A', textDecoration: 'none', fontWeight: 600 }}>← Go to barraPAD</a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--editor-bg, #F9F7F4)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: '1px solid #E5E0D8',
        background: '#F9F7F4', position: 'sticky', top: 0, zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo.svg" alt="barraPAD" style={{ height: 28 }} />
          </a>
          {isLoaded && isSignedIn && (
            <a href="/" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, color: '#8A8178', textDecoration: 'none',
              padding: '4px 10px', borderRadius: 8,
              border: '1px solid #E5E0D8', background: '#F5F2ED',
            }}>
              ← My notes
            </a>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Live presence avatars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {presenceList.slice(0, 5).map((p) => (
              <div key={p.id} title={p.name} style={{ position: 'relative', flexShrink: 0 }}>
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} style={{
                    width: 26, height: 26, borderRadius: '50%',
                    border: `2px solid ${p.color}`, objectFit: 'cover',
                  }} />
                ) : (
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: p.color, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, border: '2px solid #F9F7F4',
                  }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: connected ? '#22c55e' : '#C4BFB6',
                transition: 'background 0.3s',
              }} />
              <span style={{ fontSize: 12, color: '#8A8178' }}>
                {connected ? `${connections} online` : 'Connecting…'}
              </span>
            </div>
          </div>

          {canEdit && saveStatus !== 'idle' && (
            <span style={{ fontSize: 12, color: '#8A8178' }}>
              {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
            </span>
          )}

          <span style={{ fontSize: 12, color: '#C4BFB6' }}>Updated {formattedDate}</span>

          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
            background: permission === 'EDIT' ? '#D4550A1A' : '#F5F0E8',
            color: permission === 'EDIT' ? '#D4550A' : '#8A8178',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {permission === 'EDIT' ? 'Can edit' : 'View only'}
          </span>

          {permission === 'EDIT' && isLoaded && !isSignedIn && (
            <a href={`/sign-in?redirect_url=${encodeURIComponent(`/s/${token}`)}`} style={{ textDecoration: 'none' }}>
              <button style={{
                fontSize: 13, fontWeight: 600, padding: '6px 14px',
                borderRadius: 8, background: '#D4550A', color: '#fff',
                border: 'none', cursor: 'pointer',
              }}>
                Sign in to edit
              </button>
            </a>
          )}

          <button
            onClick={() => {
              const audio = new Audio('/about.mp3.mp3')
              audio.volume = 0.5; audio.loop = true
              audio.play().catch(() => {})
              aboutAudioRef.current = audio
              setShowAbout(true)
            }}
            className="p-2 rounded-xl transition-all"
            style={{ color: '#8A8178', opacity: 0.8, cursor: 'pointer', background: 'none', border: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#B8420A' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = '#8A8178' }}
            title="About barraPAD"
          >
            <HelpCircle size={22} />
          </button>

          <button
            onClick={() => setShowAppearance(true)}
            className="p-2 rounded-xl transition-all"
            style={{ color: '#8A8178', opacity: 0.8, cursor: 'pointer', background: 'none', border: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#B8420A' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = '#8A8178' }}
            title="Appearance"
          >
            <Settings size={22} />
          </button>
        </div>
      </div>

      {/* ── Modals ── */}
      {showAbout && (
        <AboutModal onClose={() => {
          aboutAudioRef.current?.pause()
          if (aboutAudioRef.current) aboutAudioRef.current.currentTime = 0
          aboutAudioRef.current = null
          setShowAbout(false)
        }} />
      )}
      {showAppearance && (
        <AppearanceModal
          settings={appearance}
          onChange={(s) => {
            setAppearance(s)
            applyAppearance(s)
            localStorage.setItem('barrapad_appearance', JSON.stringify(s))
          }}
          onClose={() => setShowAppearance(false)}
        />
      )}

      {/* ── Editor (shared core) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <NoteEditorCore
          initialContent={initialContent}
          editable={canEdit}
          onEditorReady={handleEditorReady}
          onUpdate={canEdit ? handleUpdate : undefined}
          onSelectionUpdate={canEdit ? handleSelectionUpdate : undefined}
          isLocallyEditingRef={isLocallyEditingRef}
          localEditTimeoutRef={localEditTimeoutRef}
          infoRows={[
            { label: 'Permission', value: permission === 'EDIT' ? 'Can edit' : 'View only' },
            { label: 'Updated', value: formattedDate },
          ]}
          bottomSlot={
            <TagInput
              tags={tags}
              allTags={tags}
              onChange={canEdit ? handleTagsChange : () => {}}
              readOnly={!canEdit}
            />
          }
          rootStyle={{ flex: 1 }}
        />
      </div>

      {/* ── Floating pill CTA for unauthenticated read-only viewers ── */}
      {permission === 'READ' && isLoaded && !isSignedIn && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, display: 'flex', alignItems: 'center', gap: 12,
          background: '#1A1A1A', color: '#fff',
          padding: '10px 10px 10px 18px', borderRadius: 999,
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)', whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Create your own notes — free, forever</span>
          <a href="/sign-up" style={{ textDecoration: 'none' }}>
            <button style={{
              fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 999,
              background: '#D4550A', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              Get started
            </button>
          </a>
        </div>
      )}
    </div>
  )
}
