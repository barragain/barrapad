'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { motion, AnimatePresence } from 'framer-motion'
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
import { LoremIpsum } from '@/extensions/lorem-ipsum'
import { FileAttachment } from '@/extensions/file-attachment'
import { ResizableImage } from '@/extensions/resizable-image'
import Toolbar from './Toolbar'
import InfoPopover from './InfoPopover'
import LinkPopover from './LinkPopover'
import ContextMenu from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [linkPopover, setLinkPopover] = useState<{ x: number; y: number } | null>(null)
  const contextClickRef = useRef<{ x: number; y: number; editorPos?: number }>({ x: 0, y: 0 })
  const ctxImageRef = useRef<HTMLInputElement>(null)

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
      LoremIpsum,
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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!editor) return
    e.preventDefault()

    const x = e.clientX
    const y = e.clientY
    const target = e.target as HTMLElement

    // Find editor position at click
    const coords = editor.view.posAtCoords({ left: x, top: y })
    contextClickRef.current = { x, y, editorPos: coords?.inside ?? coords?.pos }

    // Context 4: image
    const imgEl = target.tagName === 'IMG' ? target as HTMLImageElement : target.closest('img') as HTMLImageElement | null
    if (imgEl) {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Copy image URL', onClick: () => { navigator.clipboard.writeText(imgEl.src); setContextMenu(null) } },
        { type: 'item', label: 'Download image', onClick: () => {
          const a = document.createElement('a'); a.href = imgEl.src; a.download = 'image'; a.click(); setContextMenu(null)
        }},
        { type: 'item', label: 'Replace image', onClick: () => { ctxImageRef.current?.click(); setContextMenu(null) }},
        { type: 'separator' },
        { type: 'item', label: 'Remove image', danger: true, onClick: () => {
          const pos = contextClickRef.current.editorPos
          if (pos !== undefined) editor.chain().focus().setNodeSelection(pos).deleteSelection().run()
          setContextMenu(null)
        }},
      ]})
      return
    }

    // Context 5: link
    const linkEl = (target.tagName === 'A' ? target : target.closest('a')) as HTMLAnchorElement | null
    if (linkEl) {
      const href = linkEl.href
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Open link', onClick: () => { window.open(href, '_blank'); setContextMenu(null) }},
        { type: 'item', label: 'Copy link URL', onClick: () => { navigator.clipboard.writeText(href); setContextMenu(null) }},
        { type: 'item', label: 'Edit link…', onClick: () => { setContextMenu(null); setLinkPopover({ x, y }) }},
        { type: 'separator' },
        { type: 'item', label: 'Remove link', danger: true, onClick: () => {
          editor.chain().focus().extendMarkRange('link').unsetLink().run(); setContextMenu(null)
        }},
      ]})
      return
    }

    // Context 2: text selection
    if (!editor.state.selection.empty) {
      const { from, to } = editor.state.selection
      const selectedText = editor.state.doc.textBetween(from, to, ' ')
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Bold', onClick: () => { editor.chain().focus().toggleBold().run(); setContextMenu(null) }},
        { type: 'item', label: 'Italic', onClick: () => { editor.chain().focus().toggleItalic().run(); setContextMenu(null) }},
        { type: 'item', label: 'Underline', onClick: () => { editor.chain().focus().toggleUnderline().run(); setContextMenu(null) }},
        { type: 'item', label: 'Strikethrough', onClick: () => { editor.chain().focus().toggleStrike().run(); setContextMenu(null) }},
        { type: 'separator' },
        { type: 'item', label: 'Link…', onClick: () => { setContextMenu(null); setLinkPopover({ x, y }) }},
        { type: 'separator' },
        { type: 'item', label: 'Copy', onClick: () => { navigator.clipboard.writeText(selectedText); setContextMenu(null) }},
        { type: 'item', label: 'Cut', onClick: () => { navigator.clipboard.writeText(selectedText); editor.chain().focus().deleteSelection().run(); setContextMenu(null) }},
      ]})
      return
    }

    // Context 3: empty cursor / no selection
    setContextMenu({ x, y, items: [
      { type: 'item', label: 'Paste', onClick: () => {
        navigator.clipboard.readText().then(text => { if (text) editor.chain().focus().insertContent(text).run() }); setContextMenu(null)
      }},
      { type: 'item', label: 'Select All', onClick: () => { editor.commands.selectAll(); setContextMenu(null) }},
      { type: 'separator' },
      { type: 'item', label: 'Insert image', onClick: () => { ctxImageRef.current?.click(); setContextMenu(null) }},
      { type: 'item', label: 'Insert table', onClick: () => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setContextMenu(null) }},
      { type: 'item', label: 'Insert lorem ipsum', onClick: () => {
        editor.chain().focus().insertContent('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.').run(); setContextMenu(null)
      }},
    ]})
  }, [editor])

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
      <AnimatePresence>
        {editor && (
          <motion.div
            key="toolbar"
            initial={{ opacity: 0, y: -10, scaleY: 0.92 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -10, scaleY: 0.92 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
            style={{ transformOrigin: 'top' }}
          >
            <Toolbar editor={editor} />
          </motion.div>
        )}
      </AnimatePresence>
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
              className="p-1.5 rounded-lg transition-all"
              style={{ color: 'var(--accent)', opacity: showInfo ? 1 : 0.75 }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = showInfo ? '1' : '0.75')}
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

          <div
            id="barrapad-editor-content"
            style={{ background: 'var(--editor-bg)', borderRadius: 11 }}
            onClick={() => editor?.commands.focus()}
            onContextMenu={handleContextMenu}
          >
            <EditorContent
              editor={editor}
              style={{ padding: '2rem', minHeight: '70vh' }}
            />
            <input
              ref={ctxImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file || !editor) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  const result = ev.target?.result as string
                  if (!result) return
                  const pos = contextClickRef.current.editorPos
                  if (pos !== undefined) {
                    editor.chain().focus().setNodeSelection(pos).run()
                  }
                  editor.chain().focus().setImage({ src: result }).run()
                }
                reader.readAsDataURL(file)
                e.target.value = ''
              }}
            />
          </div>
          {linkPopover && (
            <LinkPopover
              editor={editor!}
              onClose={() => setLinkPopover(null)}
              pos={{ left: linkPopover.x, top: linkPopover.y }}
            />
          )}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={contextMenu.items}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
