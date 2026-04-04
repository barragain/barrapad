'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { useUser } from '@clerk/nextjs'
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
import { Footnote } from '@/extensions/footnote'
import { Poll } from '@/extensions/poll'
import Toolbar from './Toolbar'
import InfoPopover from './InfoPopover'
import LinkPopover from './LinkPopover'
import ContextMenu from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
import {
  Info,
  Clipboard,
  MousePointer2,
  ImageIcon as ImageIconLucide,
  Paperclip,
  Mic,
  Table as TableIconLucide,
  Type,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough,
  Link2,
  Copy,
  Scissors,
  ExternalLink,
  Pencil,
  Trash2,
  Download,
  Quote as QuoteIcon,
  Minus,
  Superscript,
  BarChart2,
} from 'lucide-react'
import PartySocket from 'partysocket'
import { CollabCursor, setCursors, pickColor } from '@/extensions/collab-cursor'
import type { RemoteCursor } from '@/extensions/collab-cursor'
import type { Note } from '@/types'

const lowlight = createLowlight(common)

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'barrapad.barragain.partykit.dev'

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
  const socketRef = useRef<PartySocket | null>(null)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks when the user last made a local edit — used to reject stale remote content
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
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const [isEditorFocused, setIsEditorFocused] = useState(true)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [linkPopover, setLinkPopover] = useState<{ x: number; y: number } | null>(null)
  const contextClickRef = useRef<{ x: number; y: number; editorPos?: number }>({ x: 0, y: 0 })
  const ctxImageRef = useRef<HTMLInputElement>(null)
  const ctxFileRef = useRef<HTMLInputElement>(null)
  const [ctxIsRecording, setCtxIsRecording] = useState(false)
  const ctxMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const ctxChunksRef = useRef<BlobPart[]>([])

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
      Footnote,
      Poll,
      LoremIpsum,
      CollabCursor,
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

      // Record when this local change happened — used to reject stale remote content
      lastLocalChangeTimeRef.current = Date.now()

      // Broadcast to PartyKit for real-time sync with share-link viewers
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
      sendTimerRef.current = setTimeout(() => {
        socketRef.current?.send(JSON.stringify({ type: 'update', content: html, title, ts: lastLocalChangeTimeRef.current }))
      }, 50)

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
    onSelectionUpdate: ({ editor }) => {
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

  // Keep ref in sync
  useEffect(() => { editorRef.current = editor }, [editor])

  // Sync content when switching notes
  useEffect(() => {
    if (!editor) return
    const wasTemp = prevNoteIdRef.current.startsWith('temp-')
    prevNoteIdRef.current = note.id
    const currentHtml = editor.getHTML()
    // Don't wipe editor when a temp note is promoted to a real one —
    // the user may have typed content while the API request was in flight.
    if (wasTemp && !note.id.startsWith('temp-') && (!note.content || note.content === '<p></p>')) {
      // Keep current editor content; trigger a save so it reaches the server
      const text = editor.getText()
      const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'
      pendingRef.current = { title, html: currentHtml }
      return
    }
    if (currentHtml !== note.content) {
      editor.commands.setContent(note.content || '')
    }
    // Reset pending state when switching notes
    pendingRef.current = null
    lastLocalChangeTimeRef.current = 0
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  // PartyKit — real-time sync with share-link viewers
  useEffect(() => {
    if (!editor || note.id.startsWith('temp-')) return

    const socket = new PartySocket({ host: PARTYKIT_HOST, room: note.id })
    socketRef.current = socket

    socket.addEventListener('message', (evt) => {
      type Msg = {
        type: 'sync' | 'update' | 'presence' | 'cursor' | 'cursor-leave'
        content?: string
        cursors?: RemoteCursor[]
        id?: string
        from?: number; to?: number; name?: string; color?: string
        ts?: number
      }
      const msg = JSON.parse(evt.data as string) as Msg
      const ed = editorRef.current

      if (msg.type === 'sync' || msg.type === 'update') {
        if (msg.content && msg.content !== '') {
          const msgTs = msg.ts ?? 0
          // Only apply remote content when ALL of these are true:
          // 1. Editor is not focused (user isn't actively typing)
          // 2. No unsaved local changes (pendingRef would be set if user typed recently)
          // 3. The remote message is not older than the last local edit
          //    (prevents a stale phone version from wiping out newer desktop edits)
          // Apply remote content when there are no unsaved local edits and the
          // message is not older than our last edit (prevents stale overwrites).
          // We intentionally do NOT gate on ed.isFocused — that was blocking all
          // updates whenever the editor was focused, even during read-only viewing.
          const safeToApply =
            ed &&
            !pendingRef.current &&
            msgTs >= lastLocalChangeTimeRef.current
          if (safeToApply) {
            const current = ed!.getHTML()
            if (current !== msg.content) {
              // Preserve cursor position so the view doesn't jump
              const { from, to } = ed!.state.selection
              ed!.commands.setContent(msg.content, { emitUpdate: false })
              const maxPos = ed!.state.doc.content.size
              try {
                ed!.commands.setTextSelection({
                  from: Math.min(from, maxPos),
                  to: Math.min(to, maxPos),
                })
              } catch { /* position no longer valid in new doc */ }
            }
          }
        }
        // Initialise cursors from sync snapshot
        if (msg.type === 'sync' && msg.cursors) {
          remoteCursorsRef.current.clear()
          for (const c of msg.cursors) remoteCursorsRef.current.set(c.id, c)
          if (ed) setCursors(ed, [...remoteCursorsRef.current.values()])
        }
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
  }, [note.id, editor])

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

  // Show toolbar when clicking anywhere inside the editor area;
  // hide it when clicking outside (e.g. sidebar)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (editorAreaRef.current?.contains(e.target as Node)) {
        setIsEditorFocused(true)
      } else {
        setIsEditorFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!editor) return
    e.preventDefault()

    const x = e.clientX
    const y = e.clientY
    const target = e.target as HTMLElement

    // Find editor position at click
    const coords = editor.view.posAtCoords({ left: x, top: y })
    contextClickRef.current = { x, y, editorPos: coords?.inside ?? coords?.pos }

    // Context: blockquote / quote
    const bqEl = target.closest('blockquote')
    if (bqEl) {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Remove quote', icon: <QuoteIcon size={13} />, danger: true, onClick: () => {
          editor.chain().focus().toggleBlockquote().run()
          setContextMenu(null)
        }},
      ]})
      return
    }

    // Context: horizontal rule / divider
    if (target.tagName === 'HR') {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Remove divider', icon: <Minus size={13} />, danger: true, onClick: () => {
          const pos = contextClickRef.current.editorPos
          if (pos !== undefined) editor.chain().focus().setNodeSelection(pos).deleteSelection().run()
          setContextMenu(null)
        }},
      ]})
      return
    }

    // Context: footnote
    if (target.closest('.barrapad-fn-wrap')) {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Edit footnote', icon: <Superscript size={13} />, onClick: () => {
          // Click on the marker to open popover
          const marker = target.closest('.barrapad-fn-wrap')?.querySelector('.barrapad-fn-marker') as HTMLElement | null
          marker?.click()
          setContextMenu(null)
        }},
        { type: 'separator' },
        { type: 'item', label: 'Remove footnote', icon: <Trash2 size={13} />, danger: true, onClick: () => {
          const pos = contextClickRef.current.editorPos
          if (pos !== undefined) editor.chain().focus().setNodeSelection(pos).deleteSelection().run()
          setContextMenu(null)
        }},
      ]})
      return
    }

    // Context: poll
    if (target.closest('.barrapad-poll')) {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Edit poll', icon: <BarChart2 size={13} />, onClick: () => {
          const editBtn = target.closest('.barrapad-poll')?.querySelector('.barrapad-poll-editbtn') as HTMLElement | null
          editBtn?.click()
          setContextMenu(null)
        }},
        { type: 'separator' },
        { type: 'item', label: 'Remove poll', icon: <Trash2 size={13} />, danger: true, onClick: () => {
          const pos = contextClickRef.current.editorPos
          if (pos !== undefined) editor.chain().focus().setNodeSelection(pos).deleteSelection().run()
          setContextMenu(null)
        }},
      ]})
      return
    }

    // Context 4: image
    const imgEl = target.tagName === 'IMG' ? target as HTMLImageElement : target.closest('img') as HTMLImageElement | null
    if (imgEl) {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Copy image URL', icon: <Copy size={13} />, onClick: () => { navigator.clipboard.writeText(imgEl.src); setContextMenu(null) } },
        { type: 'item', label: 'Download image', icon: <Download size={13} />, onClick: () => {
          const a = document.createElement('a'); a.href = imgEl.src; a.download = 'image'; a.click(); setContextMenu(null)
        }},
        { type: 'item', label: 'Replace image', icon: <ImageIconLucide size={13} />, onClick: () => { ctxImageRef.current?.click(); setContextMenu(null) }},
        { type: 'separator' },
        { type: 'item', label: 'Remove image', icon: <Trash2 size={13} />, danger: true, onClick: () => {
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
        { type: 'item', label: 'Open link', icon: <ExternalLink size={13} />, onClick: () => { window.open(href, '_blank'); setContextMenu(null) }},
        { type: 'item', label: 'Copy link URL', icon: <Copy size={13} />, onClick: () => { navigator.clipboard.writeText(href); setContextMenu(null) }},
        { type: 'item', label: 'Edit link…', icon: <Pencil size={13} />, onClick: () => { setContextMenu(null); setLinkPopover({ x, y }) }},
        { type: 'separator' },
        { type: 'item', label: 'Remove link', icon: <Trash2 size={13} />, danger: true, onClick: () => {
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
        { type: 'item', label: 'Bold', icon: <BoldIcon size={13} />, onClick: () => { editor.chain().focus().toggleBold().run(); setContextMenu(null) }},
        { type: 'item', label: 'Italic', icon: <ItalicIcon size={13} />, onClick: () => { editor.chain().focus().toggleItalic().run(); setContextMenu(null) }},
        { type: 'item', label: 'Underline', icon: <UnderlineIcon size={13} />, onClick: () => { editor.chain().focus().toggleUnderline().run(); setContextMenu(null) }},
        { type: 'item', label: 'Strikethrough', icon: <Strikethrough size={13} />, onClick: () => { editor.chain().focus().toggleStrike().run(); setContextMenu(null) }},
        { type: 'separator' },
        { type: 'item', label: 'Link…', icon: <Link2 size={13} />, onClick: () => { setContextMenu(null); setLinkPopover({ x, y }) }},
        { type: 'separator' },
        { type: 'item', label: 'Copy', icon: <Copy size={13} />, onClick: () => { navigator.clipboard.writeText(selectedText); setContextMenu(null) }},
        { type: 'item', label: 'Cut', icon: <Scissors size={13} />, onClick: () => { navigator.clipboard.writeText(selectedText); editor.chain().focus().deleteSelection().run(); setContextMenu(null) }},
      ]})
      return
    }

    // Context 3: empty cursor / no selection
    setContextMenu({ x, y, items: [
      { type: 'item', label: 'Paste', icon: <Clipboard size={13} />, onClick: () => {
        navigator.clipboard.readText().then(text => { if (text) editor.chain().focus().insertContent(text).run() }); setContextMenu(null)
      }},
      { type: 'item', label: 'Select All', icon: <MousePointer2 size={13} />, onClick: () => { editor.commands.selectAll(); setContextMenu(null) }},
      { type: 'separator' },
      { type: 'item', label: 'Insert image', icon: <ImageIconLucide size={13} />, onClick: () => { ctxImageRef.current?.click(); setContextMenu(null) }},
      { type: 'item', label: 'Upload file', icon: <Paperclip size={13} />, onClick: () => { ctxFileRef.current?.click(); setContextMenu(null) }},
      { type: 'item', label: 'Insert voice memo', icon: <Mic size={13} />, onClick: () => { setContextMenu(null); startCtxVoiceMemo() }},
      { type: 'item', label: 'Insert table', icon: <TableIconLucide size={13} />, onClick: () => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setContextMenu(null) }},
      { type: 'item', label: 'Insert lorem ipsum', icon: <Type size={13} />, onClick: () => {
        editor.chain().focus().insertContent('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.').run(); setContextMenu(null)
      }},
    ]})
  }, [editor])

  const startCtxVoiceMemo = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      ctxChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) ctxChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(ctxChunksRef.current, { type: recorder.mimeType })
        const ext = recorder.mimeType.split('/')[1]?.split(';')[0] || 'webm'
        const name = `Voice memo ${new Date().toLocaleString()}.${ext}`
        const fr = new FileReader()
        fr.onload = (ev) => {
          const dataUrl = ev.target?.result as string
          if (!dataUrl || !editor) return
          editor.chain().focus().insertFileAttachment({
            name, size: blob.size, mimeType: recorder.mimeType, dataUrl,
          }).run()
        }
        fr.readAsDataURL(blob)
      }
      ctxMediaRecorderRef.current = recorder
      recorder.start()
      setCtxIsRecording(true)
    } catch {
      // microphone permission denied
    }
  }, [editor])

  const stopCtxVoiceMemo = useCallback(() => {
    ctxMediaRecorderRef.current?.stop()
    setCtxIsRecording(false)
  }, [])

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
    <div ref={editorAreaRef} className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--editor-bg)' }}>
      <AnimatePresence>
        {editor && isEditorFocused && (
          <motion.div
            key="toolbar"
            initial={{ opacity: 0, y: -24, scaleY: 0.84 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -20, scaleY: 0.88, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.65 }}
            style={{ transformOrigin: 'top', overflow: 'hidden' }}
          >
            <Toolbar editor={editor} />
          </motion.div>
        )}
      </AnimatePresence>
      {ctxIsRecording && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(239, 68, 68, 0.07)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
          padding: '7px 16px', fontSize: 12, color: '#ef4444',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
            display: 'inline-block', flexShrink: 0,
            animation: 'pulse 1s ease-in-out infinite',
          }} />
          <span>Recording voice memo…</span>
          <button
            onClick={stopCtxVoiceMemo}
            style={{
              marginLeft: 'auto', fontSize: 11, fontWeight: 600,
              padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
              background: '#ef4444', color: 'white', border: 'none',
            }}
          >
            Stop & Insert
          </button>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '2rem 2rem 4rem' }}
        onDrop={handleOuterDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <div className="editor-anim-border" style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
          {/* Info button — top-left of the writing area */}
          <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 20 }}>
            <motion.button
              ref={infoButtonRef}
              onClick={() => setShowInfo((v) => !v)}
              className="p-2 rounded-xl"
              style={{ color: showInfo ? '#7A2C06' : '#D4550A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              animate={{
                rotate: showInfo ? 22 : 0,
                backgroundColor: showInfo ? 'rgba(212, 85, 10, 0.13)' : 'rgba(0,0,0,0)',
              }}
              whileHover={{ scale: 1.15, backgroundColor: 'rgba(212, 85, 10, 0.09)' }}
              whileTap={{ scale: 0.78, rotate: showInfo ? 0 : 30 }}
              transition={{ type: 'spring', stiffness: 460, damping: 18, mass: 0.6 }}
              title="Note info"
            >
              <Info size={22} />
            </motion.button>
            <AnimatePresence>
              {showInfo && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.88, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -6, transition: { duration: 0.13, ease: [0.4, 0, 1, 1] } }}
                  transition={{ type: 'spring', stiffness: 480, damping: 26, mass: 0.55 }}
                  style={{ transformOrigin: 'top left' }}
                >
                  <InfoPopover
                    note={note}
                    wordCount={wordCount}
                    charCount={charCount}
                    onClose={() => setShowInfo(false)}
                    anchorRef={infoButtonRef}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div
            id="barrapad-editor-content"
            style={{ background: 'var(--editor-bg)', borderRadius: 11, WebkitTouchCallout: 'none' } as React.CSSProperties}
            onClick={(e) => {
              // Don't steal focus from inputs/textareas or any contentEditable=false
              // NodeView (poll, footnote, etc.) — they manage their own focus
              if ((e.target as HTMLElement).closest('[contenteditable="false"]')) return
              editor?.commands.focus()
            }}
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
            <input
              ref={ctxFileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file || !editor) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  const result = ev.target?.result as string
                  if (!result) return
                  editor.chain().focus().insertFileAttachment({
                    name: file.name,
                    size: file.size,
                    mimeType: file.type || 'application/octet-stream',
                    dataUrl: result,
                  }).run()
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
