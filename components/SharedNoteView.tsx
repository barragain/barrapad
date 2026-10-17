'use client'

import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { HelpCircle, Info, Settings } from 'lucide-react'
import TagInput from './TagInput'
import AppearanceModal from './AppearanceModal'
import AboutModal from './AboutModal'
import NoteEditorCore from './NoteEditorCore'
import PresenceAvatars from './PresenceAvatars'
import type { AppearanceSettings, Tag } from '@/types'
import { DEFAULT_APPEARANCE, loadAppearance, applyAppearance } from '@/lib/appearance'
import { pickColor } from '@/extensions/collab-cursor'

import { REALTIME_HOST, roomQuery } from '@/lib/realtime'
import { onRoomMessage } from '@/lib/noteRoom'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import YProvider from 'y-partyserver/provider'

interface Props {
  token: string
  noteId: string
  initialTitle: string
  initialContent: string
  initialTags: Tag[]
  permission: 'READ' | 'EDIT'
  updatedAt: string
}

export default function SharedNoteView({ token, noteId, initialContent, initialTags, permission, updatedAt }: Props) {
  // Signed-in visitors and every edit link are redirected into the app
  // (app/s/[token]/page.tsx), so this page is always view-only.
  const { isSignedIn, isLoaded } = useUser()

  // ── Tags ──────────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<Tag[]>(initialTags)
  const myColorRef = useRef(pickColor(Math.random().toString()))

  // ── UI state ──────────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false)
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

  const formattedDate = new Date(updatedAt).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })

  // ── Yjs room ──────────────────────────────────────────────────────────────
  // Same room as the app's editor. Until the doc arrives the page shows the
  // server-rendered copy. A viewer cannot fill an empty room, so it keeps
  // that copy until someone with edit access has opened the note.
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

  const live = !!collab && synced && hasContent

  return (
    <div style={{ minHeight: '100vh', background: 'var(--editor-bg, #F9F7F4)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--editor-bg)', position: 'sticky', top: 0, zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo.svg" alt="bpad" style={{ height: 28 }} />
          </a>
          {isLoaded && isSignedIn && (
            <a href="/" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, color: 'var(--muted)', textDecoration: 'none',
              padding: '4px 10px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--hover)',
            }}>
              ← My notes
            </a>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Live presence avatars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {collab && <PresenceAvatars awareness={collab.awareness} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: connected ? '#22c55e' : 'var(--muted)',
                transition: 'background 0.3s',
              }} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {connected ? `${connections} online` : 'Connecting…'}
              </span>
            </div>
          </div>

          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Updated {formattedDate}</span>

          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
            background: permission === 'EDIT' ? 'var(--accent-soft)' : 'var(--hover)',
            color: permission === 'EDIT' ? 'var(--accent-ink)' : 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {permission === 'EDIT' ? 'Can edit' : 'View only'}
          </span>

          <button
            data-info-toggle
            onClick={() => window.dispatchEvent(new Event('barrapad:toggle-info'))}
            className="p-2 rounded-xl transition-all"
            style={{ color: 'var(--muted)', opacity: 0.8, cursor: 'pointer', background: 'none', border: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent-ink)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = 'var(--muted)' }}
            title="Note info"
          >
            <Info size={22} />
          </button>

          <button
            onClick={() => {
              const audio = new Audio('/about.mp3.mp3')
              audio.volume = 0.5; audio.loop = true
              audio.play().catch(() => {})
              aboutAudioRef.current = audio
              setShowAbout(true)
            }}
            className="p-2 rounded-xl transition-all"
            style={{ color: 'var(--muted)', opacity: 0.8, cursor: 'pointer', background: 'none', border: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent-ink)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = 'var(--muted)' }}
            title="About bpad"
          >
            <HelpCircle size={22} />
          </button>

          <button
            onClick={() => setShowAppearance(true)}
            className="p-2 rounded-xl transition-all"
            style={{ color: 'var(--muted)', opacity: 0.8, cursor: 'pointer', background: 'none', border: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent-ink)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = 'var(--muted)' }}
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
          collab={live ? { doc: collab!.doc, awareness: collab!.awareness, user: { name: 'Guest', color: myColorRef.current, clientId: collab!.doc.clientID } } : undefined}
          initialContent={initialContent}
          editable={false}
          infoRows={[
            { label: 'Permission', value: permission === 'EDIT' ? 'Can edit' : 'View only' },
            { label: 'Updated', value: formattedDate },
          ]}
          bottomSlot={
            <TagInput
              tags={tags}
              allTags={tags}
              onChange={() => {}}
              readOnly
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
