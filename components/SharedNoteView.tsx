'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { useUser } from '@clerk/nextjs'
import PartySocket from 'partysocket'
import {
  Info, HelpCircle, Settings,
  Clipboard, MousePointer2, Table as TableIconLucide, Type,
  Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon,
  Strikethrough, Link2, Copy, Scissors, ExternalLink, Pencil, Trash2,
  Tag as TagIcon, Wand2,
} from 'lucide-react'
import { isCorrectSync, suggestSync } from '@/utils/spellcheck'
import TagInput from './TagInput'
import AppearanceModal from './AppearanceModal'
import AboutModal from './AboutModal'
import ContextMenu from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
import type { AppearanceSettings, Tag } from '@/types'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { GradientText } from '@/extensions/gradient-text'
import { CollabCursor, setCursors, pickColor } from '@/extensions/collab-cursor'
import type { RemoteCursor } from '@/extensions/collab-cursor'
import Toolbar from './Toolbar'

const lowlight = createLowlight(common)

const EXTENSIONS = [
  StarterKit.configure({ codeBlock: false, dropcursor: { color: '#D4550A', width: 4 } }),
  Underline,
  Link.configure({ openOnClick: true, autolink: true }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  CodeBlockLowlight.configure({ lowlight }),
  GradientText,
  CollabCursor,
]

type ServerMessage =
  | { type: 'sync'; content: string; title: string; updatedAt: string; connections: number }
  | { type: 'update'; content: string; title: string; updatedAt: string }
  | { type: 'presence'; connections: number }
  | { type: 'cursor'; id: string; from: number; to: number; name: string; color: string; imageUrl?: string; mx?: number; my?: number }
  | { type: 'cursor-leave'; id: string }

interface Props {
  token: string
  noteId: string
  initialTitle: string
  initialContent: string
  initialTags: Tag[]
  permission: 'READ' | 'EDIT'
  updatedAt: string
}

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

export default function SharedNoteView({ token, noteId, initialTitle, initialContent, initialTags, permission, updatedAt }: Props) {
  const { isSignedIn, isLoaded, user } = useUser()
  const canEdit = permission === 'EDIT' && !!isSignedIn
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

  const socketRef = useRef<PartySocket | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirrors Editor.tsx sync guards: tracks unsaved local edits and last-edit time
  const pendingRef = useRef(false)
  const lastLocalChangeTimeRef = useRef(0)
  const remoteCursorsRef = useRef<Map<string, RemoteCursor>>(new Map())
  const myColorRef = useRef(pickColor(Math.random().toString()))
  const canEditRef = useRef(canEdit)
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)
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

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastUpdated, setLastUpdated] = useState(updatedAt)
  const [connections, setConnections] = useState(1)
  const [connected, setConnected] = useState(false)
  const [presenceList, setPresenceList] = useState<RemoteCursor[]>([])
  const [showInfo, setShowInfo] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const infoRef = useRef<HTMLButtonElement>(null)
  const aboutAudioRef = useRef<HTMLAudioElement | null>(null)
  const sendPointerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const contextClickRef = useRef<{ x: number; y: number; editorPos?: number }>({ x: 0, y: 0 })

  // Keep a ref of initialTitle for use inside the editor update handler
  const titleRef = useRef(initialTitle)

  // Load & apply appearance on mount
  useEffect(() => {
    const s = loadAppearance()
    setAppearance(s)
    applyAppearance(s)
  }, [])

  // Keep canEdit ref in sync (editor ref synced after useEditor below)
  useEffect(() => { canEditRef.current = canEdit }, [canEdit])

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: initialContent,
    editable: canEdit,
    editorProps: {
      attributes: { style: 'padding: 2rem; min-height: 70vh; outline: none;', spellcheck: 'true' },
    },
    onUpdate: ({ editor }) => {
      if (!canEdit) return
      const html = editor.getHTML()
      const text = editor.getText()
      const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'
      titleRef.current = title

      pendingRef.current = true
      lastLocalChangeTimeRef.current = Date.now()

      // 1. Send to PartyKit immediately for real-time sync
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
      sendTimerRef.current = setTimeout(() => {
        socketRef.current?.send(JSON.stringify({ type: 'update', content: html, title, ts: lastLocalChangeTimeRef.current }))
      }, 50) // tiny debounce to avoid per-keystroke sends

      // 2. Persist to DB with a short debounce
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
    },
    onSelectionUpdate: ({ editor }) => {
      if (!canEditRef.current) return
      const { from, to } = editor.state.selection
      if (sendCursorTimerRef.current) clearTimeout(sendCursorTimerRef.current)
      sendCursorTimerRef.current = setTimeout(() => {
        socketRef.current?.send(JSON.stringify({
          type: 'cursor', from, to,
          name: userNameRef.current,
          color: myColorRef.current,
          imageUrl: userImageRef.current,
        }))
      }, 50)
    },
  })

  // Keep editor ref in sync + update word/char count
  useEffect(() => {
    editorRef.current = editor
    if (!editor) return
    const text = editor.getText()
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
    setCharCount(text.length)
  }, [editor])

  // Mouse pointer tracking — sends position to PartyKit for all viewers
  const sendPointerRef = useCallback((clientX: number, clientY: number) => {
    const ed = editorRef.current
    if (!ed) return
    const pos = ed.view.posAtCoords({ left: clientX, top: clientY })
    const container = editorContainerRef.current
    let mx: number | undefined
    let my: number | undefined
    if (container) {
      const rect = container.getBoundingClientRect()
      mx = (clientX - rect.left) / rect.width
      my = (clientY - rect.top) / rect.height
    }
    if (sendPointerTimerRef.current) clearTimeout(sendPointerTimerRef.current)
    sendPointerTimerRef.current = setTimeout(() => {
      socketRef.current?.send(JSON.stringify({
        type: 'cursor',
        from: pos?.pos ?? 0, to: pos?.pos ?? 0,
        name: userNameRef.current,
        color: myColorRef.current,
        imageUrl: userImageRef.current,
        mx, my,
      }))
    }, 80)
  }, [])

  // Flip editable when sign-in state resolves
  useEffect(() => {
    if (!editor) return
    editor.setEditable(canEdit)
  }, [editor, canEdit])

  // PartyKit connection
  useEffect(() => {
    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: noteId, // same room for all share links on the same note
    })

    socketRef.current = socket

    socket.addEventListener('open', () => setConnected(true))
    socket.addEventListener('close', () => setConnected(false))

    socket.addEventListener('message', (evt) => {
      type AnyMsg = ServerMessage & {
        cursors?: RemoteCursor[]
        id?: string; from?: number; to?: number; name?: string; color?: string; imageUrl?: string
      }
      const msg = JSON.parse(evt.data as string) as AnyMsg
      const ed = editorRef.current

      if (msg.type === 'presence') {
        setConnections(msg.connections)
        return
      }

      if (msg.type === 'sync' || msg.type === 'update') {
        if ('connections' in msg) setConnections(msg.connections)
        if (msg.content !== '' && ed) {
          const msgTs = (msg as ServerMessage & { ts?: number }).ts ?? 0
          // Read-only viewers always apply remote content.
          // Edit-permission viewers: same guards as Editor.tsx — apply only when
          // there are no unsaved local edits and the message is not stale.
          // We do NOT gate on ed.isFocused; that was preventing all updates when
          // the editor was focused during read-only viewing.
          const safeToApply =
            !canEditRef.current ||
            (!pendingRef.current && msgTs >= lastLocalChangeTimeRef.current)
          if (safeToApply) {
            const current = ed.getHTML()
            if (current !== msg.content) {
              const { from, to } = ed.state.selection
              ed.commands.setContent(msg.content, { emitUpdate: false })
              const maxPos = ed.state.doc.content.size
              try {
                ed.commands.setTextSelection({
                  from: Math.min(from, maxPos),
                  to: Math.min(to, maxPos),
                })
              } catch { /* position no longer valid */ }
            }
          }
        }
        if (msg.content !== '') setLastUpdated(msg.updatedAt)
        // Initialise cursors from sync snapshot
        if (msg.type === 'sync' && msg.cursors) {
          remoteCursorsRef.current.clear()
          for (const c of msg.cursors) remoteCursorsRef.current.set(c.id, c)
          setPresenceList([...remoteCursorsRef.current.values()])
          if (ed) setCursors(ed, [...remoteCursorsRef.current.values()])
        }
        return
      }

      if (msg.type === 'cursor' && msg.id && msg.from !== undefined && msg.to !== undefined) {
        const existing = remoteCursorsRef.current.get(msg.id)
        const cursor: RemoteCursor = {
          ...existing,
          id: msg.id, from: msg.from, to: msg.to,
          name: msg.name ?? 'Guest', color: msg.color ?? '#888',
          imageUrl: msg.imageUrl,
          ...(msg.mx !== undefined ? { mx: msg.mx, my: msg.my } : {}),
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
  }, [token, editor])

  const getWordAtPos = useCallback((pos: number): { word: string; from: number; to: number } | null => {
    if (!editor) return null
    try {
      const $pos = editor.state.doc.resolve(pos)
      const parent = $pos.parent
      if (!['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote'].includes(parent.type.name)) return null
      const text = parent.textContent
      const offset = $pos.parentOffset
      let start = offset
      let end = offset
      while (start > 0 && /[\w'-]/.test(text[start - 1])) start--
      while (end < text.length && /[\w'-]/.test(text[end])) end++
      const word = text.slice(start, end)
      if (word.length < 2) return null
      return { word, from: $pos.start() + start, to: $pos.start() + end }
    } catch { return null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!editor || !canEditRef.current) return
    e.preventDefault()

    const x = e.clientX
    const y = e.clientY
    const target = e.target as HTMLElement

    const coords = editor.view.posAtCoords({ left: x, top: y })
    contextClickRef.current = { x, y, editorPos: coords?.inside ?? coords?.pos }

    const addTagItem: ContextMenuItem = {
      type: 'item', label: 'Add tag…', icon: <TagIcon size={13} />, onClick: () => {
        setContextMenu(null)
        window.dispatchEvent(new Event('barrapad:focus-tags'))
      },
    }

    // Link context menu
    const linkEl = (target.tagName === 'A' ? target : target.closest('a')) as HTMLAnchorElement | null
    if (linkEl) {
      const href = linkEl.href
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Open link', icon: <ExternalLink size={13} />, onClick: () => { window.open(href, '_blank'); setContextMenu(null) }},
        { type: 'item', label: 'Copy link URL', icon: <Copy size={13} />, onClick: () => { navigator.clipboard.writeText(href); setContextMenu(null) }},
        { type: 'separator' },
        { type: 'item', label: 'Remove link', icon: <Trash2 size={13} />, danger: true, onClick: () => {
          editor.chain().focus().extendMarkRange('link').unsetLink().run(); setContextMenu(null)
        }},
      ]})
      return
    }

    // Text selection context menu
    if (!editor.state.selection.empty) {
      const { from, to } = editor.state.selection
      const selectedText = editor.state.doc.textBetween(from, to, ' ')
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Bold', icon: <BoldIcon size={13} />, onClick: () => { editor.chain().focus().toggleBold().run(); setContextMenu(null) }},
        { type: 'item', label: 'Italic', icon: <ItalicIcon size={13} />, onClick: () => { editor.chain().focus().toggleItalic().run(); setContextMenu(null) }},
        { type: 'item', label: 'Underline', icon: <UnderlineIcon size={13} />, onClick: () => { editor.chain().focus().toggleUnderline().run(); setContextMenu(null) }},
        { type: 'item', label: 'Strikethrough', icon: <Strikethrough size={13} />, onClick: () => { editor.chain().focus().toggleStrike().run(); setContextMenu(null) }},
        { type: 'separator' },
        { type: 'item', label: 'Copy', icon: <Copy size={13} />, onClick: () => { navigator.clipboard.writeText(selectedText); setContextMenu(null) }},
        { type: 'item', label: 'Cut', icon: <Scissors size={13} />, onClick: () => { navigator.clipboard.writeText(selectedText); editor.chain().focus().deleteSelection().run(); setContextMenu(null) }},
        { type: 'separator' },
        addTagItem,
      ]})
      return
    }

    // Empty cursor — show spell suggestions if word is misspelled
    const wordResult = contextClickRef.current.editorPos !== undefined
      ? getWordAtPos(contextClickRef.current.editorPos)
      : null

    const spellItems: ContextMenuItem[] = []
    if (wordResult) {
      const correct = isCorrectSync(wordResult.word)
      if (correct === false) {
        const suggestions = suggestSync(wordResult.word)
        if (suggestions && suggestions.length > 0) {
          suggestions.forEach((s) => {
            spellItems.push({
              type: 'item',
              label: s,
              icon: <Wand2 size={13} />,
              onClick: () => {
                editor.chain().focus()
                  .setTextSelection({ from: wordResult.from, to: wordResult.to })
                  .insertContent(s)
                  .run()
                setContextMenu(null)
              },
            })
          })
          spellItems.push({ type: 'separator' })
        }
      }
    }

    setContextMenu({ x, y, items: [
      ...spellItems,
      { type: 'item', label: 'Paste', icon: <Clipboard size={13} />, onClick: () => {
        navigator.clipboard.readText().then(text => { if (text) editor.chain().focus().insertContent(text).run() }); setContextMenu(null)
      }},
      { type: 'item', label: 'Select All', icon: <MousePointer2 size={13} />, onClick: () => { editor.commands.selectAll(); setContextMenu(null) }},
      { type: 'separator' },
      { type: 'item', label: 'Insert table', icon: <TableIconLucide size={13} />, onClick: () => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setContextMenu(null) }},
      { type: 'item', label: 'Insert lorem ipsum', icon: <Type size={13} />, onClick: () => {
        editor.chain().focus().insertContent('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.').run(); setContextMenu(null)
      }},
      { type: 'separator' },
      addTagItem,
    ]})
  }, [editor, getWordAtPos])

  const formattedDate = new Date(lastUpdated).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--editor-bg, #F9F7F4)' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: '1px solid #E5E0D8',
        background: '#F9F7F4',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo.svg" alt="barraPAD" style={{ height: 28 }} />
          </a>
          {isLoaded && isSignedIn && (
            <a
              href="/"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, color: '#8A8178', textDecoration: 'none',
                padding: '4px 10px', borderRadius: 8,
                border: '1px solid #E5E0D8', background: '#F5F2ED',
              }}
            >
              ← My notes
            </a>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Live presence */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {presenceList.slice(0, 5).map((p) => (
              <div key={p.id} title={p.name} style={{ position: 'relative', flexShrink: 0 }}>
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    style={{
                      width: 26, height: 26, borderRadius: '50%',
                      border: `2px solid ${p.color}`,
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: p.color, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                    border: '2px solid #F9F7F4',
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

          <span style={{ fontSize: 12, color: '#C4BFB6' }}>
            Updated {formattedDate}
          </span>

          {/* Permission badge */}
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: 6,
            background: permission === 'EDIT' ? '#D4550A1A' : '#F5F0E8',
            color: permission === 'EDIT' ? '#D4550A' : '#8A8178',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {permission === 'EDIT' ? 'Can edit' : 'View only'}
          </span>

          {permission === 'EDIT' && isLoaded && !isSignedIn && (
            <a
              href={`/sign-in?redirect_url=${encodeURIComponent(`/s/${token}`)}`}
              style={{ textDecoration: 'none' }}
            >
              <button style={{
                fontSize: 13, fontWeight: 600, padding: '6px 14px',
                borderRadius: 8, background: '#D4550A', color: '#fff',
                border: 'none', cursor: 'pointer',
              }}>
                Sign in to edit
              </button>
            </a>
          )}

          {/* ? About button */}
          <button
            onClick={() => {
              const audio = new Audio('/about.mp3.mp3')
              audio.volume = 0.5
              audio.loop = true
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

          {/* Settings button */}
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

      {canEdit && editor && <Toolbar editor={editor} />}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1rem 5rem' }}>
        <div className="editor-anim-border" style={{ marginTop: '1.5rem' }}>
          <div
            ref={editorContainerRef}
            style={{ borderRadius: 11, overflow: 'visible', background: 'var(--editor-bg, #F9F7F4)', position: 'relative' }}
            onMouseMove={(e) => sendPointerRef(e.clientX, e.clientY)}
          >
            {/* Remote mouse cursors */}
            {presenceList.some(p => p.mx !== undefined) && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 50 }}>
                {presenceList.map((p) => {
                  if (p.mx === undefined || p.my === undefined) return null
                  return (
                    <div key={p.id} style={{ position: 'absolute', left: `${p.mx * 100}%`, top: `${p.my * 100}%`, pointerEvents: 'none' }}>
                      <svg width="16" height="20" viewBox="0 0 16 20" fill="none" style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}>
                        <path d="M1 1L6.5 17L9.5 10.5L16 8L1 1Z" fill={p.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                      <div style={{
                        position: 'absolute', top: 14, left: 10,
                        background: p.color, color: '#fff',
                        fontSize: 10, fontWeight: 600,
                        padding: '2px 6px', borderRadius: 4,
                        whiteSpace: 'nowrap',
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                        lineHeight: 1.4,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                      }}>
                        {p.name}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {/* ⓘ Info button — top-left of editor, same as main editor */}
            <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 20 }}>
              <button
                ref={infoRef}
                onClick={() => setShowInfo((v) => !v)}
                className="p-2 rounded-xl transition-all"
                style={{ color: showInfo ? '#7A2C06' : '#D4550A', cursor: 'pointer', background: 'none', border: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#7A2C06' }}
                onMouseLeave={(e) => { if (!showInfo) e.currentTarget.style.color = '#D4550A' }}
                title="Note info"
              >
                <Info size={22} />
              </button>
              {showInfo && (
                <div style={{
                  position: 'absolute', top: '110%', left: 0, zIndex: 60,
                  background: 'var(--editor-bg, #fff)', border: '1px solid #E5E0D8',
                  borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                  width: 220, padding: '12px 16px',
                }}>
                  {[
                    { label: 'Words', value: wordCount },
                    { label: 'Characters', value: charCount },
                    { label: 'Permission', value: permission === 'EDIT' ? 'Can edit' : 'View only' },
                    { label: 'Updated', value: new Date(lastUpdated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                      <span style={{ color: '#8A8178' }}>{label}</span>
                      <span style={{ fontWeight: 600, color: '#1A1A1A', textAlign: 'right', maxWidth: 120 }}>{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div onContextMenu={handleContextMenu}>
              <EditorContent editor={editor} style={{ padding: '2rem', minHeight: '70vh' }} />
            </div>
            <div style={{ padding: '0.5rem 2rem 2rem' }}>
              <TagInput
                tags={tags}
                allTags={tags}
                onChange={canEdit ? handleTagsChange : () => {}}
                readOnly={!canEdit}
              />
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Floating pill CTA for unauthenticated read-only viewers */}
      {permission === 'READ' && isLoaded && !isSignedIn && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#1A1A1A',
          color: '#fff',
          padding: '10px 10px 10px 18px',
          borderRadius: 999,
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Create your own notes — free, forever</span>
          <a href="/sign-up" style={{ textDecoration: 'none' }}>
            <button style={{
              fontSize: 13,
              fontWeight: 700,
              padding: '7px 16px',
              borderRadius: 999,
              background: '#D4550A',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}>
              Get started
            </button>
          </a>
        </div>
      )}
    </div>
  )
}
