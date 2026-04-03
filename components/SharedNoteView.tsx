'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { useUser } from '@clerk/nextjs'
import PartySocket from 'partysocket'
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
import Toolbar from './Toolbar'

const lowlight = createLowlight(common)

const EXTENSIONS = [
  StarterKit.configure({ codeBlock: false }),
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
]

type ServerMessage =
  | { type: 'sync'; content: string; title: string; updatedAt: string; connections: number }
  | { type: 'update'; content: string; title: string; updatedAt: string }
  | { type: 'presence'; connections: number }

interface Props {
  token: string
  noteId: string
  initialTitle: string
  initialContent: string
  permission: 'READ' | 'EDIT'
  updatedAt: string
}

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? '127.0.0.1:1999'

export default function SharedNoteView({ token, noteId, initialTitle, initialContent, permission, updatedAt }: Props) {
  const { isSignedIn, isLoaded } = useUser()
  const canEdit = permission === 'EDIT' && !!isSignedIn

  const socketRef = useRef<PartySocket | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastUpdated, setLastUpdated] = useState(updatedAt)
  const [connections, setConnections] = useState(1)
  const [connected, setConnected] = useState(false)

  // Keep a ref of initialTitle for use inside the editor update handler
  const titleRef = useRef(initialTitle)

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: initialContent,
    editable: canEdit,
    editorProps: {
      attributes: { style: 'padding: 2rem; min-height: 70vh; outline: none;' },
    },
    onUpdate: ({ editor }) => {
      if (!canEdit) return
      const html = editor.getHTML()
      const text = editor.getText()
      const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'
      titleRef.current = title

      // 1. Send to PartyKit immediately for real-time sync
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
      sendTimerRef.current = setTimeout(() => {
        socketRef.current?.send(JSON.stringify({ type: 'update', content: html, title }))
      }, 50) // tiny debounce to avoid per-keystroke sends

      // 2. Persist to DB with a longer debounce
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
            setLastUpdated(data.updatedAt)
            setSaveStatus('saved')
            setTimeout(() => setSaveStatus('idle'), 2000)
          }
        } catch {}
      }, 2000)
    },
  })

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
      const msg = JSON.parse(evt.data as string) as ServerMessage

      if (msg.type === 'presence') {
        setConnections(msg.connections)
        return
      }

      if (msg.type === 'sync' || msg.type === 'update') {
        if ('connections' in msg) setConnections(msg.connections)
        // Only update the editor if someone else changed the content and
        // the local editor is not actively focused (to avoid cursor jumps).
        // Guard against an empty sync from a fresh PartyKit room overwriting
        // the DB content that was loaded server-side.
        // For READ viewers always apply updates; for EDIT viewers skip if focused to avoid cursor jumps
        if (msg.content !== '' && editor && (!canEdit || !editor.isFocused)) {
          const current = editor.getHTML()
          if (current !== msg.content) {
            editor.commands.setContent(msg.content, { emitUpdate: false })
          }
        }
        if (msg.content !== '') setLastUpdated(msg.updatedAt)
      }
    })

    return () => {
      socket.close()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, editor])

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
        <a href="/" style={{ textDecoration: 'none' }}>
          <img src="/logo.svg" alt="barraPAD" style={{ height: 22 }} />
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Live connection dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: connected ? '#22c55e' : '#C4BFB6',
              transition: 'background 0.3s',
            }} />
            <span style={{ fontSize: 12, color: '#8A8178' }}>
              {connected ? `${connections} online` : 'Connecting…'}
            </span>
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
                fontSize: 13,
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: 8,
                background: '#D4550A',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}>
                Sign in to edit
              </button>
            </a>
          )}
        </div>
      </div>

      {canEdit && editor && <Toolbar editor={editor} />}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1rem 4rem' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
