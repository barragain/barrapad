'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { useUser, SignInButton } from '@clerk/nextjs'
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

interface Props {
  token: string
  initialTitle: string
  initialContent: string
  permission: 'READ' | 'EDIT'
  updatedAt: string
}

export default function SharedNoteView({ token, initialTitle, initialContent, permission, updatedAt }: Props) {
  const { isSignedIn, isLoaded } = useUser()
  const canEdit = permission === 'EDIT' && isSignedIn
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastUpdated, setLastUpdated] = useState(updatedAt)

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: initialContent,
    editable: canEdit,
    editorProps: {
      attributes: {
        style: 'padding: 2rem; min-height: 70vh; outline: none;',
      },
    },
    onUpdate: ({ editor }) => {
      if (!canEdit) return
      const html = editor.getHTML()
      const text = editor.getText()
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
            setLastUpdated(data.updatedAt)
            setSaveStatus('saved')
            setTimeout(() => setSaveStatus('idle'), 2000)
          }
        } catch {}
      }, 2000)
    },
  })

  // Make editor editable/read-only when sign-in state changes
  useEffect(() => {
    if (!editor) return
    editor.setEditable(canEdit)
  }, [editor, canEdit])

  // Polling: if read-only, poll every 5s to pick up owner's changes
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${token}`)
      if (!res.ok) return
      const data = await res.json() as { content: string; updatedAt: string }
      if (data.updatedAt !== lastUpdated && editor && !editor.isFocused) {
        editor.commands.setContent(data.content, false)
        setLastUpdated(data.updatedAt)
      }
    } catch {}
  }, [token, lastUpdated, editor])

  useEffect(() => {
    // Poll for updates when in read-only mode OR when edit user is not actively typing
    pollRef.current = setInterval(poll, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [poll])

  const formattedDate = new Date(lastUpdated).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--editor-bg, #F9F7F4)', fontFamily: 'sans-serif' }}>
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
          {/* Save status */}
          {canEdit && saveStatus !== 'idle' && (
            <span style={{ fontSize: 12, color: '#8A8178' }}>
              {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
            </span>
          )}

          {/* Last updated */}
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

          {/* Sign in prompt for edit links */}
          {permission === 'EDIT' && isLoaded && !isSignedIn && (
            <SignInButton mode="modal">
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
            </SignInButton>
          )}
        </div>
      </div>

      {/* Toolbar — only for signed-in editors */}
      {canEdit && editor && <Toolbar editor={editor} />}

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1rem 4rem' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
