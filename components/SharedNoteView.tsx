'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { useUser } from '@clerk/nextjs'
import { HelpCircle, Settings } from 'lucide-react'
import TagInput from './TagInput'
import AppearanceModal from './AppearanceModal'
import AboutModal from './AboutModal'
import NoteEditorCore from './NoteEditorCore'
import type { AppearanceSettings, Tag } from '@/types'
import { pickColor } from '@/extensions/collab-cursor'

import { REALTIME_HOST, roomQuery } from '@/lib/realtime'
import { claimSeed, onRoomMessage, sendRoomMessage } from '@/lib/noteRoom'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import YProvider from 'y-partyserver/provider'

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

type Presence = { id: number; name: string; color: string; imageUrl?: string }

export default function SharedNoteView({ token, noteId, initialContent, initialTags, permission, updatedAt }: Props) {
  const { isSignedIn, isLoaded, user } = useUser()
  const canEdit = permission === 'EDIT' && !!isSignedIn

  // ── Tags ──────────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<Tag[]>(initialTags)

  const myColorRef = useRef(pickColor(Math.random().toString()))
  const userNameRef = useRef('Guest')
  const userImageRef = useRef<string | undefined>(undefined)
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
  const lastUpdatedRef = useRef(updatedAt)
  useEffect(() => { lastUpdatedRef.current = lastUpdated }, [lastUpdated])
  const [connected, setConnected] = useState(false)
  const [presenceList, setPresenceList] = useState<Presence[]>([])
  const [connections, setConnections] = useState(1)
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

  // ── Yjs room ──────────────────────────────────────────────────────────────
  // Same room as the app's editor. Until the doc arrives the page shows the
  // server-rendered copy read-only. A viewer cannot fill an empty room, so it
  // keeps that copy until an editor has opened the note.
  type Collab = { doc: Y.Doc; awareness: Awareness; provider: YProvider }
  const [collab, setCollab] = useState<Collab | null>(null)
  const [synced, setSynced] = useState(false)
  const [hasContent, setHasContent] = useState(false)
  useEffect(() => {
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    const provider = new YProvider(REALTIME_HOST, noteId, doc, { party: 'note-y', params: roomQuery(noteId, token), awareness })
    provider.on('synced', (s: boolean) => { if (s) setSynced(true) })
    provider.on('status', ({ status }: { status: string }) => setConnected(status === 'connected'))
    const fragment = doc.getXmlFragment('default')
    const onDoc = () => setHasContent(fragment.length > 0)
    doc.on('update', onDoc)
    const onAwareness = () => {
      const others: Presence[] = []
      awareness.getStates().forEach((s, id) => {
        const u = (s as { user?: { name: string; color: string; imageUrl?: string } }).user
        if (id !== doc.clientID && u) others.push({ id, ...u })
      })
      setPresenceList(others)
      setConnections(awareness.getStates().size || 1)
    }
    awareness.on('change', onAwareness)
    const offRoom = onRoomMessage(provider, (msg) => {
      if (msg.type === 'tags' && msg.tags) setTags(msg.tags)
      if (msg.type === 'title' && msg.title) document.title = `${msg.title} | bpad - A notepad for whatever`
      if (msg.type === 'delete') setDeleted(true)
    })
    setCollab({ doc, awareness, provider })
    return () => { offRoom(); provider.destroy(); awareness.destroy(); doc.destroy() }
  }, [noteId, token])

  // ── Editing ───────────────────────────────────────────────────────────────
  const [yEditor, setYEditor] = useState<Editor | null>(null)
  const [seedDone, setSeedDone] = useState(false)
  const seedDoneRef = useRef(false)
  seedDoneRef.current = seedDone
  const lastSavedHtmlRef = useRef(initialContent)
  const editedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!collab || !yEditor || !canEdit) return
    return claimSeed(collab.provider, yEditor,
      () => ({ html: initialContent, updatedAt: lastUpdatedRef.current }),
      () => setSeedDone(true))
  }, [collab, yEditor, canEdit, initialContent])

  const handleUpdate = useCallback((html: string, text: string, _title: string, remote?: boolean) => {
    // Skip Yjs's first render, unseeded docs, and merges this tab did not
    // take part in (the editing tab saves those).
    if (!seedDoneRef.current || html === lastSavedHtmlRef.current) return
    if (remote && !editedRef.current) return
    if (!remote) editedRef.current = true
    const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/share/${token}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content: html }),
        })
        if (res.ok) {
          const data = await res.json() as { updatedAt: string }
          lastSavedHtmlRef.current = html
          setLastUpdated(data.updatedAt)
          sendRoomMessage(collab?.provider, { type: 'saved', dbUpdatedAt: data.updatedAt })
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        }
      } catch {}
    }, 1000)
  }, [token, collab])

  const handleTagsChange = useCallback(async (newTags: Tag[]) => {
    setTags(newTags)
    sendRoomMessage(collab?.provider, { type: 'tags', tags: newTags })
    try {
      await fetch(`/api/share/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      })
    } catch {}
  }, [token, collab])

  // ── Render ────────────────────────────────────────────────────────────────
  if (deleted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--editor-bg, #F9F7F4)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 16, color: '#8A8178', marginBottom: 12 }}>This note has been deleted.</p>
          <a href="/" style={{ fontSize: 14, color: '#D4550A', textDecoration: 'none', fontWeight: 600 }}>← Go to bpad</a>
        </div>
      </div>
    )
  }

  const live = !!collab && synced && (canEdit || hasContent)

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
            <img src="/logo.svg" alt="bpad" style={{ height: 28 }} />
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
            title="About bpad"
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
          key={live ? 'live' : 'preview'}
          collab={live ? { doc: collab!.doc, awareness: collab!.awareness, user: { name: userNameRef.current, color: myColorRef.current, imageUrl: userImageRef.current } } : undefined}
          initialContent={initialContent}
          editable={live && canEdit && seedDone}
          onEditorReady={live ? setYEditor : undefined}
          onUpdate={live && canEdit ? handleUpdate : undefined}
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
