'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
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
import Placeholder from '@tiptap/extension-placeholder'
import { common, createLowlight } from 'lowlight'
import { GradientText } from '@/extensions/gradient-text'
import { FileAttachment } from '@/extensions/file-attachment'
import { ResizableImage } from '@/extensions/resizable-image'
import Toolbar from './Toolbar'
import InfoPopover from './InfoPopover'
import { Info } from 'lucide-react'
import type { Note } from '@/types'

const lowlight = createLowlight(common)

interface EditorProps {
  note: Note
  /** Called immediately on every change — updates localStorage only, no API */
  onLocalChange: (title: string, content: string) => void
  /** Called after 30s idle, blur, or tab switch — syncs to API */
  onAutoSave: (title: string, content: string) => void
  /** Called when the user explicitly presses Save */
  onManualSave: (title: string, content: string) => void
}

export default function EditorComponent({
  note,
  onLocalChange,
  onAutoSave,
  onManualSave,
}: EditorProps) {
  const editorRef = useRef<Editor | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ title: string; html: string } | null>(null)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      ResizableImage,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: 'Start typing to get started...' }),
      GradientText,
      FileAttachment,
    ],
    editorProps: {
      handleDrop(view, event, _slice, moved) {
        if (moved) return false
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        event.preventDefault()
        const ed = editorRef.current
        if (!ed) return false
        for (const file of Array.from(files)) {
          const reader = new FileReader()
          if (file.type.startsWith('image/')) {
            reader.onload = (e) => {
              const result = e.target?.result as string
              if (result) ed.chain().focus().setImage({ src: result }).run()
            }
          } else {
            reader.onload = (e) => {
              const result = e.target?.result as string
              if (!result) return
              ed.chain().focus().insertFileAttachment({
                name: file.name,
                size: file.size,
                mimeType: file.type || 'application/octet-stream',
                dataUrl: result,
              }).run()
            }
          }
          reader.readAsDataURL(file)
        }
        return true
      },

      handlePaste(view, event) {
        const ed = editorRef.current
        if (!ed) return false
        const items = event.clipboardData?.items
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile()
              if (!file) continue
              const reader = new FileReader()
              reader.onload = (e) => {
                const result = e.target?.result as string
                if (result) ed.chain().focus().setImage({ src: result }).run()
              }
              reader.readAsDataURL(file)
              return true
            }
          }
        }
        const files = event.clipboardData?.files
        if (files && files.length > 0) {
          for (const file of Array.from(files)) {
            if (!file.type.startsWith('image/')) {
              const reader = new FileReader()
              reader.onload = (e) => {
                const result = e.target?.result as string
                if (!result) return
                ed.chain().focus().insertFileAttachment({
                  name: file.name,
                  size: file.size,
                  mimeType: file.type || 'application/octet-stream',
                  dataUrl: result,
                }).run()
              }
              reader.readAsDataURL(file)
              return true
            }
          }
        }
        return false
      },
    },
    content: note.content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const text = editor.getText()

      const words = text.trim() ? text.trim().split(/\s+/).length : 0
      setWordCount(words)
      setCharCount(text.length)

      const firstLine = text.split('\n')[0]?.trim() ?? ''
      const title = firstLine.slice(0, 100) || 'Untitled'

      // Immediate: update localStorage, no network
      onLocalChange(title, html)

      // Track what needs to be synced
      pendingRef.current = { title, html }

      // Reset the 30s idle timer
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = setTimeout(() => {
        flushAutoSave()
      }, 30_000)
    },
    onBlur: () => {
      // Sync to API when editor loses focus (e.g. user clicks sidebar)
      flushAutoSave()
    },
  })

  // Keep ref in sync
  useEffect(() => { editorRef.current = editor }, [editor])

  // Sync content when switching notes
  useEffect(() => {
    if (!editor) return
    const currentHtml = editor.getHTML()
    if (currentHtml !== note.content) {
      editor.commands.setContent(note.content || '')
    }
    // Reset pending state when switching notes
    pendingRef.current = null
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  // Sync to API when tab is hidden (user switches tabs/minimizes)
  useEffect(() => {
    const handler = () => {
      if (document.hidden) flushAutoSave()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [flushAutoSave])

  // Manual save — triggered by the Save button
  const handleManualSave = useCallback(() => {
    if (!editor) return
    const html = editor.getHTML()
    const text = editor.getText()
    const firstLine = text.split('\n')[0]?.trim() ?? ''
    const title = firstLine.slice(0, 100) || 'Untitled'
    // Cancel pending auto-save (manual supersedes it)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    pendingRef.current = null
    onManualSave(title, html)
  }, [editor, onManualSave])

  useEffect(() => {
    const handler = () => handleManualSave()
    window.addEventListener('barrapad:save', handler)
    return () => window.removeEventListener('barrapad:save', handler)
  }, [handleManualSave])

  const handleOuterDrop = useCallback((e: React.DragEvent) => {
    if (e.defaultPrevented) return
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    e.preventDefault()
    const ed = editorRef.current
    if (!ed) return
    for (const file of Array.from(files)) {
      const reader = new FileReader()
      if (file.type.startsWith('image/')) {
        reader.onload = (ev) => {
          const result = ev.target?.result as string
          if (result) ed.chain().focus().setImage({ src: result }).run()
        }
      } else {
        reader.onload = (ev) => {
          const result = ev.target?.result as string
          if (!result) return
          ed.chain().focus().insertFileAttachment({
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            dataUrl: result,
          }).run()
        }
      }
      reader.readAsDataURL(file)
    }
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--editor-bg)' }}>
      <Toolbar editor={editor} />
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '2rem 2rem 4rem' }}
        onDrop={handleOuterDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <div className="editor-anim-border" style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
          {/* Info button — top-left of the writing area */}
          <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 20 }}>
            <button
              ref={infoButtonRef}
              onClick={() => setShowInfo((v) => !v)}
              className="p-2 rounded-lg transition-colors"
              style={{
                color: 'var(--ink)',
                background: 'var(--border)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--border)')}
              title="Note info"
            >
              <Info size={16} />
            </button>
            {showInfo && (
              <InfoPopover
                note={note}
                wordCount={wordCount}
                charCount={charCount}
                onClose={() => setShowInfo(false)}
                anchorRef={infoButtonRef}
              />
            )}
          </div>

          <div style={{ background: 'var(--editor-bg)', borderRadius: 11 }}>
            <EditorContent
              editor={editor}
              style={{ padding: '2rem', minHeight: '70vh' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
