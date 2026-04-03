'use client'

import { useEffect, useCallback, useRef } from 'react'
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
import type { Note } from '@/types'

const lowlight = createLowlight(common)

interface EditorProps {
  note: Note
  onSave: (title: string, content: string) => void
  onWordCountChange: (words: number, chars: number) => void
}

export default function EditorComponent({ note, onSave, onWordCountChange }: EditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref so editorProps callbacks can access the latest editor instance
  const editorRef = useRef<Editor | null>(null)

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
        // Let ProseMirror handle internal node moves
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
              if (!result) return
              ed.chain().focus().setImage({ src: result }).run()
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
                if (!result) return
                ed.chain().focus().setImage({ src: result }).run()
              }
              reader.readAsDataURL(file)
              return true // handled
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
      const chars = text.length
      onWordCountChange(words, chars)

      const firstLine = text.split('\n')[0]?.trim() ?? ''
      const title = firstLine.slice(0, 100) || 'Untitled'

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onSave(title, html)
      }, 2000)
    },
  })

  // Keep ref in sync with editor instance
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Sync content when switching notes
  useEffect(() => {
    if (!editor) return
    const currentHtml = editor.getHTML()
    if (currentHtml !== note.content) {
      editor.commands.setContent(note.content || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  const handleManualSave = useCallback(() => {
    if (!editor) return
    const html = editor.getHTML()
    const text = editor.getText()
    const firstLine = text.split('\n')[0]?.trim() ?? ''
    const title = firstLine.slice(0, 100) || 'Untitled'
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onSave(title, html)
  }, [editor, onSave])

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
        onDrop={handleOuterDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <EditorContent
          editor={editor}
          style={{
            maxWidth: 720,
            margin: '0 auto',
            padding: '2rem',
            minHeight: '100%',
          }}
        />
      </div>
    </div>
  )
}
