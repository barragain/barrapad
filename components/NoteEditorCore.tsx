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
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { DraggableTable } from '@/extensions/draggable-table'
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
import { CollabCursor } from '@/extensions/collab-cursor'
import { CommentMark } from '@/extensions/comment-mark'
import Toolbar from './Toolbar'
import CommentSidebar from './CommentSidebar'
import type { CommentThread } from './CommentSidebar'
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
  Tag as TagIcon,
  Wand2,
  MessageSquare,
} from 'lucide-react'
import { isCorrectSync, suggestSync, ensureLoaded } from '@/utils/spellcheck'
import { SpellCheck, SPELL_KEY } from '@/extensions/spell-check'
import { UserMention } from '@/extensions/user-mention'
import { NoteMention } from '@/extensions/note-mention'
import MentionProfilePopover from './MentionProfilePopover'
import { uploadImage } from '@/lib/upload-image'

const lowlight = createLowlight(common)

// Move cursor out of a NodeSelection so the next insert appends rather than replaces.
function deselect(ed: Editor | null) {
  if (!ed) return
  const sel = ed.state.selection
  if ('node' in sel && sel.node) ed.commands.setTextSelection(sel.to)
}

export interface NoteEditorCoreProps {
  initialContent: string
  editable?: boolean

  /** Called once when the Tiptap editor is ready. Parent stores it for imperative ops. */
  onEditorReady?: (editor: Editor) => void
  /** Called on every content change. */
  onUpdate?: (html: string, text: string, title: string) => void
  /** Called when the editor loses focus. */
  onBlur?: () => void
  /** Called on every selection change (for cursor broadcasting). */
  onSelectionUpdate?: (from: number, to: number) => void

  /**
   * Refs managed by the parent and used by its PartyKit handler to decide
   * whether to apply incoming remote content.
   * If not provided, NoteEditorCore uses internal refs (fine for standalone use).
   */
  isLocallyEditingRef?: React.MutableRefObject<boolean>
  localEditTimeoutRef?: React.MutableRefObject<ReturnType<typeof setTimeout> | null>

  /** Extra rows shown in the info popover after Words / Characters. */
  infoRows?: Array<{ label: string; value: string | number }>

  /** Content rendered below the editor (e.g. TagInput). */
  bottomSlot?: React.ReactNode

  /** Note ID — used for @mention collaborator lookups */
  noteId?: string

  /** Callback when a @mention is inserted (for sending notifications) */
  onMentionInserted?: (userId: string, displayName: string) => void

  /** Callback when a #note mention is clicked */
  onNoteMentionClick?: (noteId: string) => void

  /** Callback when user adds a comment via context menu or keyboard shortcut */
  onAddComment?: (commentId: string) => void

  className?: string
  rootStyle?: React.CSSProperties
}

export default function NoteEditorCore({
  initialContent,
  editable = true,
  onEditorReady,
  onUpdate,
  onBlur,
  onSelectionUpdate,
  isLocallyEditingRef: parentIsLocallyEditingRef,
  localEditTimeoutRef: parentLocalEditTimeoutRef,
  infoRows,
  bottomSlot,
  noteId,
  onMentionInserted,
  onNoteMentionClick,
  onAddComment,
  className,
  rootStyle,
}: NoteEditorCoreProps) {
  // Internal editor ref — always in sync with the Tiptap instance
  const editorRef = useRef<Editor | null>(null)

  // Callback refs — TipTap's useEditor captures handler closures at mount time and
  // does not refresh them when props change. Routing through refs ensures every
  // editor event calls the LATEST callback, so a parent that recreates handlers
  // when the active note changes can't have its old callbacks fire on new content.
  // Without this, switching notes would leave the editor calling the previous
  // note's onUpdate/onBlur, causing cross-note contamination during autosave.
  const onUpdateRef = useRef(onUpdate)
  const onBlurRef = useRef(onBlur)
  const onSelectionUpdateRef = useRef(onSelectionUpdate)
  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])
  useEffect(() => { onBlurRef.current = onBlur }, [onBlur])
  useEffect(() => { onSelectionUpdateRef.current = onSelectionUpdate }, [onSelectionUpdate])

  // Sync-guard refs — use parent's if provided, otherwise own internal ones
  const _ownIsLocallyEditingRef = useRef(false)
  const _ownLocalEditTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIsLocallyEditingRef = parentIsLocallyEditingRef ?? _ownIsLocallyEditingRef
  const activeLocalEditTimeoutRef = parentLocalEditTimeoutRef ?? _ownLocalEditTimeoutRef

  // UI state
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [isEditorFocused, setIsEditorFocused] = useState(false)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [linkPopover, setLinkPopover] = useState<{ x: number; y: number } | null>(null)
  const contextClickRef = useRef<{ x: number; y: number; editorPos?: number }>({ x: 0, y: 0 })
  const ctxImageRef = useRef<HTMLInputElement>(null)
  const ctxFileRef = useRef<HTMLInputElement>(null)
  const [commentSidebarOpen, setCommentSidebarOpen] = useState(false)
  const [activeCommentThreadId, setActiveCommentThreadId] = useState<string | null>(null)
  const [pendingCommentMarkId, setPendingCommentMarkId] = useState<string | null>(null)
  const [commentBubble, setCommentBubble] = useState<{ x: number; y: number } | null>(null)
  const [ctxIsRecording, setCtxIsRecording] = useState(false)
  const ctxMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const ctxChunksRef = useRef<BlobPart[]>([])

  // ── Comment highlight click handler ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { commentId: cid } = (e as CustomEvent<{ commentId: string }>).detail
      if (cid) {
        setCommentSidebarOpen(true)
        // Find the thread with this mark commentId and activate it
        // The sidebar will handle scrolling to the thread
        window.dispatchEvent(new CustomEvent('barrapad:comment-activate-mark', { detail: { markCommentId: cid } }))
      }
    }
    window.addEventListener('barrapad:comment-click', handler)
    return () => window.removeEventListener('barrapad:comment-click', handler)
  }, [])

  // Handle comment creation from context menu or toolbar
  const handleAddComment = useCallback((markCommentId: string) => {
    setPendingCommentMarkId(markCommentId)
    setCommentSidebarOpen(true)
  }, [])

  // Listen for toolbar toggle-comments and comment-new events
  useEffect(() => {
    const toggleHandler = () => setCommentSidebarOpen((v) => !v)
    const newHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ markCommentId: string }>).detail
      if (detail?.markCommentId) {
        setPendingCommentMarkId(detail.markCommentId)
      }
      setCommentSidebarOpen(true)
    }
    window.addEventListener('barrapad:toggle-comments', toggleHandler)
    window.addEventListener('barrapad:comment-new', newHandler)
    return () => {
      window.removeEventListener('barrapad:toggle-comments', toggleHandler)
      window.removeEventListener('barrapad:comment-new', newHandler)
    }
  }, [])

  // ── Spell-check word lookup ───────────────────────────────────────────────
  const getWordAtPos = useCallback((pos: number): { word: string; from: number; to: number } | null => {
    const ed = editorRef.current
    if (!ed) return null
    try {
      const $pos = ed.state.doc.resolve(pos)
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
  }, [])

  // ── Tiptap editor ────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, dropcursor: { color: '#D4550A', width: 4 } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      DraggableTable.configure({ resizable: true }),
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
      SpellCheck,
      UserMention,
      NoteMention,
      CommentMark,
    ],
    content: initialContent,
    editable,
    editorProps: {
      // Native browser spell-check is disabled — our SpellCheck extension
      // draws its own decorations via nspell so they survive programmatic edits.
      attributes: { spellcheck: 'false' },
      handleDrop(_, event, _slice, moved) {
        if (moved) return false
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        event.preventDefault()
        const ed = editorRef.current
        if (!ed) return false
        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            uploadImage(file).then(url => {
              deselect(ed); ed.chain().focus().setImage({ src: url }).run()
            })
          } else {
            const reader = new FileReader()
            reader.onload = (e) => {
              const result = e.target?.result as string
              if (!result) return
              deselect(ed)
              ed.chain().focus().insertFileAttachment({
                name: file.name, size: file.size,
                mimeType: file.type || 'application/octet-stream', dataUrl: result,
              }).run()
            }
            reader.readAsDataURL(file)
          }
        }
        return true
      },
      handlePaste(_, event) {
        const ed = editorRef.current
        if (!ed) return false
        const items = event.clipboardData?.items
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile()
              if (!file) continue
              uploadImage(file).then(url => {
                deselect(ed); ed.chain().focus().setImage({ src: url }).run()
              })
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
                deselect(ed)
                ed.chain().focus().insertFileAttachment({
                  name: file.name, size: file.size,
                  mimeType: file.type || 'application/octet-stream', dataUrl: result,
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
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      const text = ed.getText()
      const words = text.trim() ? text.trim().split(/\s+/).length : 0
      setWordCount(words)
      setCharCount(text.length)
      const title = text.split('\n')[0]?.trim().slice(0, 100) || 'Untitled'

      // Mark as actively editing for the PartyKit sync guard
      activeIsLocallyEditingRef.current = true
      if (activeLocalEditTimeoutRef.current) clearTimeout(activeLocalEditTimeoutRef.current)
      activeLocalEditTimeoutRef.current = setTimeout(() => { activeIsLocallyEditingRef.current = false }, 1500)

      onUpdateRef.current?.(html, text, title)
    },
    onBlur: () => { onBlurRef.current?.(); setCommentBubble(null) },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection
      onSelectionUpdateRef.current?.(from, to)

      // Show/hide floating comment bubble on text selection
      if (from !== to && editable) {
        try {
          const coords = ed.view.coordsAtPos(to)
          setCommentBubble({ x: coords.left, y: coords.top - 36 })
        } catch {
          setCommentBubble(null)
        }
      } else {
        setCommentBubble(null)
      }
    },
  })

  // Keep internal ref in sync; notify parent once editor is ready
  useEffect(() => {
    editorRef.current = editor
    if (editor) onEditorReady?.(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Once the nspell dictionary finishes loading, re-run decorations so that
  // existing content (loaded before the dict was ready) gets underlines.
  useEffect(() => {
    if (!editor) return
    ensureLoaded().then(() => {
      if (!editor.isDestroyed) {
        editor.view.dispatch(editor.view.state.tr.setMeta(SPELL_KEY, true))
      }
    })
  }, [editor])

  // Sync noteId into editor storage for @mention collaborator lookups
  useEffect(() => {
    if (!editor || !noteId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = editor.storage as any
    if (storage.userMention) storage.userMention.noteId = noteId
  }, [editor, noteId])

  // Handle @mention insertions — fire notification callback via custom event from dropdown
  useEffect(() => {
    if (!onMentionInserted) return
    const handler = (e: Event) => {
      const { userId, displayName } = (e as CustomEvent<{ userId: string; displayName: string }>).detail
      onMentionInserted(userId, displayName)
    }
    window.addEventListener('barrapad:mention-inserted', handler)
    return () => window.removeEventListener('barrapad:mention-inserted', handler)
  }, [onMentionInserted])

  // Handle #note mention clicks
  useEffect(() => {
    if (!onNoteMentionClick) return
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.note-mention') as HTMLElement | null
      if (target) {
        e.preventDefault()
        const noteRefId = target.getAttribute('data-id')
        if (noteRefId) onNoteMentionClick(noteRefId)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [onNoteMentionClick])

  // ── Toolbar focus tracking ─────────────────────────────────────────────────
  // Use Tiptap's own focus/blur events. The Toolbar has onMouseDown={e =>
  // e.preventDefault()} which keeps the editor focused when clicking toolbar
  // buttons, so onBlur only fires when clicking truly outside the editor.
  // Exception: toolbar popovers (e.g. LinkPopover) actively focus their own
  // inputs, which steals focus from the editor. We detect this by checking
  // whether the newly-focused element lives inside the toolbar wrapper.
  useEffect(() => {
    if (!editor) return
    const onFocus = () => setIsEditorFocused(true)
    const onBlur  = () => {
      // Delay so the browser has time to set document.activeElement to the new target
      setTimeout(() => {
        const active = document.activeElement
        if (active && toolbarRef.current?.contains(active)) return // focus moved to toolbar child
        setIsEditorFocused(false)
      }, 0)
    }
    editor.on('focus', onFocus)
    editor.on('blur',  onBlur)
    return () => {
      editor.off('focus', onFocus)
      editor.off('blur',  onBlur)
    }
  }, [editor])

  // Respond to editable prop changes (e.g. SharedNoteView sign-in state resolves)
  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editor, editable])

  // ── Context menu ─────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const ed = editorRef.current
    if (!ed || !editable) return
    e.preventDefault()

    const x = e.clientX
    const y = e.clientY
    const target = e.target as HTMLElement
    const coords = ed.view.posAtCoords({ left: x, top: y })
    contextClickRef.current = { x, y, editorPos: coords?.inside ?? coords?.pos }

    const addTagItem: ContextMenuItem = {
      type: 'item', label: 'Add tag…', icon: <TagIcon size={13} />, onClick: () => {
        setContextMenu(null)
        window.dispatchEvent(new Event('barrapad:focus-tags'))
      },
    }

    // Blockquote
    if (target.closest('blockquote')) {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Remove quote', icon: <QuoteIcon size={13} />, danger: true, onClick: () => {
          ed.chain().focus().toggleBlockquote().run(); setContextMenu(null)
        }},
      ]})
      return
    }

    // Horizontal rule
    if (target.tagName === 'HR') {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Remove divider', icon: <Minus size={13} />, danger: true, onClick: () => {
          const pos = contextClickRef.current.editorPos
          if (pos !== undefined) ed.chain().focus().setNodeSelection(pos).deleteSelection().run()
          setContextMenu(null)
        }},
      ]})
      return
    }

    // Footnote
    if (target.closest('.barrapad-fn-wrap')) {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Edit footnote', icon: <Superscript size={13} />, onClick: () => {
          const marker = target.closest('.barrapad-fn-wrap')?.querySelector('.barrapad-fn-marker') as HTMLElement | null
          marker?.click(); setContextMenu(null)
        }},
        { type: 'separator' },
        { type: 'item', label: 'Remove footnote', icon: <Trash2 size={13} />, danger: true, onClick: () => {
          const pos = contextClickRef.current.editorPos
          if (pos !== undefined) ed.chain().focus().setNodeSelection(pos).deleteSelection().run()
          setContextMenu(null)
        }},
      ]})
      return
    }

    // Poll
    if (target.closest('.barrapad-poll')) {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Edit poll', icon: <BarChart2 size={13} />, onClick: () => {
          const editBtn = target.closest('.barrapad-poll')?.querySelector('.barrapad-poll-editbtn') as HTMLElement | null
          editBtn?.click(); setContextMenu(null)
        }},
        { type: 'separator' },
        { type: 'item', label: 'Remove poll', icon: <Trash2 size={13} />, danger: true, onClick: () => {
          const pos = contextClickRef.current.editorPos
          if (pos !== undefined) ed.chain().focus().setNodeSelection(pos).deleteSelection().run()
          setContextMenu(null)
        }},
      ]})
      return
    }

    // Image
    const imgEl = (target.tagName === 'IMG' ? target : target.closest('img')) as HTMLImageElement | null
    if (imgEl) {
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Copy image URL', icon: <Copy size={13} />, onClick: () => { navigator.clipboard.writeText(imgEl.src); setContextMenu(null) }},
        { type: 'item', label: 'Download image', icon: <Download size={13} />, onClick: () => {
          const a = document.createElement('a'); a.href = imgEl.src; a.download = 'image'; a.click(); setContextMenu(null)
        }},
        { type: 'item', label: 'Replace image', icon: <ImageIconLucide size={13} />, onClick: () => { ctxImageRef.current?.click(); setContextMenu(null) }},
        { type: 'separator' },
        { type: 'item', label: 'Remove image', icon: <Trash2 size={13} />, danger: true, onClick: () => {
          const pos = contextClickRef.current.editorPos
          if (pos !== undefined) ed.chain().focus().setNodeSelection(pos).deleteSelection().run()
          setContextMenu(null)
        }},
      ]})
      return
    }

    // Link
    const linkEl = (target.tagName === 'A' ? target : target.closest('a')) as HTMLAnchorElement | null
    if (linkEl) {
      const href = linkEl.href
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Open link', icon: <ExternalLink size={13} />, onClick: () => { window.open(href, '_blank'); setContextMenu(null) }},
        { type: 'item', label: 'Copy link URL', icon: <Copy size={13} />, onClick: () => { navigator.clipboard.writeText(href); setContextMenu(null) }},
        { type: 'item', label: 'Edit link…', icon: <Pencil size={13} />, onClick: () => { setContextMenu(null); setLinkPopover({ x, y }) }},
        { type: 'separator' },
        { type: 'item', label: 'Remove link', icon: <Trash2 size={13} />, danger: true, onClick: () => {
          ed.chain().focus().extendMarkRange('link').unsetLink().run(); setContextMenu(null)
        }},
      ]})
      return
    }

    // Text selection
    if (!ed.state.selection.empty) {
      const { from, to } = ed.state.selection
      const selectedText = ed.state.doc.textBetween(from, to, ' ')
      setContextMenu({ x, y, items: [
        { type: 'item', label: 'Bold', icon: <BoldIcon size={13} />, onClick: () => { ed.chain().focus().toggleBold().run(); setContextMenu(null) }},
        { type: 'item', label: 'Italic', icon: <ItalicIcon size={13} />, onClick: () => { ed.chain().focus().toggleItalic().run(); setContextMenu(null) }},
        { type: 'item', label: 'Underline', icon: <UnderlineIcon size={13} />, onClick: () => { ed.chain().focus().toggleUnderline().run(); setContextMenu(null) }},
        { type: 'item', label: 'Strikethrough', icon: <Strikethrough size={13} />, onClick: () => { ed.chain().focus().toggleStrike().run(); setContextMenu(null) }},
        { type: 'separator' },
        { type: 'item', label: 'Link…', icon: <Link2 size={13} />, onClick: () => { setContextMenu(null); setLinkPopover({ x, y }) }},
        { type: 'separator' },
        { type: 'item', label: 'Copy', icon: <Copy size={13} />, onClick: () => { navigator.clipboard.writeText(selectedText); setContextMenu(null) }},
        { type: 'item', label: 'Cut', icon: <Scissors size={13} />, onClick: () => { navigator.clipboard.writeText(selectedText); ed.chain().focus().deleteSelection().run(); setContextMenu(null) }},
        { type: 'separator' },
        { type: 'item', label: 'Comment', icon: <MessageSquare size={13} />, onClick: () => {
          setContextMenu(null)
          const cid = `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          ed.chain().focus().setCommentMark(cid).run()
          handleAddComment(cid)
        }},
        { type: 'separator' },
        addTagItem,
      ]})
      return
    }

    // Empty cursor — show spell suggestions if word is misspelled
    const wordResult = coords?.pos !== undefined ? getWordAtPos(coords.pos) : null
    const spellItems: ContextMenuItem[] = []
    if (wordResult) {
      const correct = isCorrectSync(wordResult.word)
      if (correct === false) {
        const suggestions = suggestSync(wordResult.word)
        if (suggestions && suggestions.length > 0) {
          suggestions.forEach((s) => {
            spellItems.push({
              type: 'item', label: s, icon: <Wand2 size={13} />,
              onClick: () => {
                // Replace the misspelled word. The SpellCheck plugin automatically
                // recomputes decorations on every document change, so underlines
                // on all remaining misspelled words stay intact with no extra work.
                ed.chain().focus()
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
        navigator.clipboard.readText().then(text => { if (text) ed.chain().focus().insertContent(text).run() }); setContextMenu(null)
      }},
      { type: 'item', label: 'Select All', icon: <MousePointer2 size={13} />, onClick: () => { ed.commands.selectAll(); setContextMenu(null) }},
      { type: 'separator' },
      { type: 'item', label: 'Insert image', icon: <ImageIconLucide size={13} />, onClick: () => { ctxImageRef.current?.click(); setContextMenu(null) }},
      { type: 'item', label: 'Upload file', icon: <Paperclip size={13} />, onClick: () => { ctxFileRef.current?.click(); setContextMenu(null) }},
      { type: 'item', label: 'Insert voice memo', icon: <Mic size={13} />, onClick: () => { setContextMenu(null); startCtxVoiceMemo() }},
      { type: 'item', label: 'Insert table', icon: <TableIconLucide size={13} />, onClick: () => { ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setContextMenu(null) }},
      { type: 'item', label: 'Insert lorem ipsum', icon: <Type size={13} />, onClick: () => {
        ed.chain().focus().insertContent('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.').run(); setContextMenu(null)
      }},
      { type: 'separator' },
      addTagItem,
    ]})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, getWordAtPos])

  // ── Context-menu voice memo ───────────────────────────────────────────────
  const startCtxVoiceMemo = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) return
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
          if (!dataUrl) return
          deselect(ed)
          ed.chain().focus().insertFileAttachment({ name, size: blob.size, mimeType: recorder.mimeType, dataUrl }).run()
        }
        fr.readAsDataURL(blob)
      }
      ctxMediaRecorderRef.current = recorder
      recorder.start()
      setCtxIsRecording(true)
    } catch { /* mic permission denied */ }
  }, [])

  const stopCtxVoiceMemo = useCallback(() => {
    ctxMediaRecorderRef.current?.stop()
    setCtxIsRecording(false)
  }, [])

  // ── Outer drop zone (files dropped outside the ProseMirror canvas) ────────
  const handleOuterDrop = useCallback((e: React.DragEvent) => {
    if (e.defaultPrevented) return
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    e.preventDefault()
    const ed = editorRef.current
    if (!ed) return
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        uploadImage(file).then(url => {
          deselect(ed); ed.chain().focus().setImage({ src: url }).run()
        })
      } else {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const result = ev.target?.result as string
          if (!result) return
          deselect(ed)
          ed.chain().focus().insertFileAttachment({
            name: file.name, size: file.size,
            mimeType: file.type || 'application/octet-stream', dataUrl: result,
          }).run()
        }
        reader.readAsDataURL(file)
      }
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
    <div
      ref={editorAreaRef}
      className={`flex flex-col h-full overflow-hidden${className ? ` ${className}` : ''}`}
      style={{ background: 'var(--editor-bg)', ...rootStyle }}
    >
      {/* Toolbar — always in flow to prevent layout shift; fades in/out */}
      {editor && editable && (
        <div
          ref={toolbarRef}
          style={{
            opacity: isEditorFocused ? 1 : 0,
            pointerEvents: isEditorFocused ? 'auto' : 'none',
            transition: 'opacity 0.15s ease',
          }}
        >
          <Toolbar editor={editor} />
        </div>
      )}

      {/* Context-menu voice recording banner */}
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

      {/* Scrollable editor area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '2rem 2rem 4rem', position: 'relative' }}
        onDrop={handleOuterDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <div
          ref={editorContainerRef}
          className="editor-anim-border"
          style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}
        >
          {/* ⓘ Info button — snapped to left border, popover opens right */}
          <div style={{ position: 'absolute', top: 10, left: -28, transform: 'translateX(-50%)', zIndex: 20 }}>
            <motion.button
              ref={infoButtonRef}
              onClick={() => setShowInfo((v) => !v)}
              className="p-2 rounded-xl"
              style={{ color: showInfo ? '#7A2C06' : '#D4550A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              initial={{ rotate: 0, backgroundColor: 'rgba(0,0,0,0)' }}
              animate={{
                rotate: showInfo ? 22 : 0,
                backgroundColor: showInfo ? 'rgba(212,85,10,0.13)' : 'rgba(0,0,0,0)',
              }}
              whileHover={{ scale: 1.15, backgroundColor: 'rgba(212,85,10,0.09)' }}
              whileTap={{ scale: 0.78, rotate: showInfo ? 0 : 30 }}
              transition={{ type: 'spring', stiffness: 460, damping: 18, mass: 0.6 }}
              title="Note info"
            >
              <Info size={22} />
            </motion.button>
            {/* Absolute wrapper so the popover never shifts the button */}
            <div style={{ position: 'absolute', top: 0, left: '100%', paddingLeft: 12, zIndex: 50 }}>
              <AnimatePresence>
                {showInfo && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
                    transition={{ type: 'spring', stiffness: 480, damping: 26, mass: 0.55 }}
                    style={{ transformOrigin: 'top left' }}
                  >
                    <div style={{
                      background: 'var(--editor-bg)', border: '1px solid var(--border)',
                      borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                      width: 220, padding: '12px 16px',
                    }}>
                      {[
                        { label: 'Words', value: wordCount },
                        { label: 'Characters', value: charCount },
                        ...(infoRows ?? []),
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                          <span style={{ color: 'var(--muted)' }}>{label}</span>
                          <span style={{ fontWeight: 600, color: 'var(--ink)', textAlign: 'right', maxWidth: 130, whiteSpace: 'pre-line' }}>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Editor canvas */}
          <div
            id="barrapad-editor-content"
            style={{ background: 'var(--editor-bg)', borderRadius: 11, WebkitTouchCallout: 'none' } as React.CSSProperties}
            onClick={(e) => {
              // Click on a comment highlight → open that thread
              const commentEl = (e.target as HTMLElement).closest('.comment-highlight') as HTMLElement | null
              if (commentEl) {
                const cid = commentEl.getAttribute('data-comment-id')
                if (cid) {
                  window.dispatchEvent(new CustomEvent('barrapad:comment-click', { detail: { commentId: cid } }))
                  return
                }
              }
              if ((e.target as HTMLElement).closest('[contenteditable="false"]')) return
              editor?.commands.focus()
            }}
            onContextMenu={handleContextMenu}
          >
            <EditorContent editor={editor} style={{ padding: '2rem', minHeight: '70vh' }} />

            {/* Hidden file inputs for context-menu "Replace image" / "Upload file" */}
            <input
              ref={ctxImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                const ed = editorRef.current
                if (!file || !ed) return
                uploadImage(file).then(url => {
                  const pos = contextClickRef.current.editorPos
                  if (pos !== undefined) ed.chain().focus().setNodeSelection(pos).run()
                  ed.chain().focus().setImage({ src: url }).run()
                })
                e.target.value = ''
              }}
            />
            <input
              ref={ctxFileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                const ed = editorRef.current
                if (!file || !ed) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  const result = ev.target?.result as string
                  if (!result) return
                  deselect(ed)
                  ed.chain().focus().insertFileAttachment({
                    name: file.name, size: file.size,
                    mimeType: file.type || 'application/octet-stream', dataUrl: result,
                  }).run()
                }
                reader.readAsDataURL(file)
                e.target.value = ''
              }}
            />
          </div>

          {/* Bottom slot — typically TagInput */}
          {bottomSlot && (
            <div style={{ padding: '0.5rem 2rem 2rem' }}>
              {bottomSlot}
            </div>
          )}

          {/* Floating comment bubble on text selection */}
          <AnimatePresence>
            {commentBubble && (
              <motion.button
                key="comment-bubble"
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.5 }}
                onMouseDown={(e) => {
                  e.preventDefault()  // keep editor selection
                  const ed = editorRef.current
                  if (!ed) return
                  const cid = `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
                  ed.chain().focus().setCommentMark(cid).run()
                  handleAddComment(cid)
                  setCommentBubble(null)
                }}
                style={{
                  position: 'fixed',
                  left: commentBubble.x,
                  top: commentBubble.y,
                  transform: 'translateX(-50%)',
                  zIndex: 40,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--editor-bg)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  color: '#D4550A',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <MessageSquare size={13} />
                Comment
              </motion.button>
            )}
          </AnimatePresence>

          {/* Mention profile hover card */}
          <MentionProfilePopover />

          {/* Popovers */}
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
    {/* Comment sidebar */}
    <AnimatePresence>
      {commentSidebarOpen && (
        <CommentSidebar
          noteId={noteId ?? ''}
          editor={editor}
          open={commentSidebarOpen}
          onClose={() => { setCommentSidebarOpen(false); setPendingCommentMarkId(null) }}
          activeCommentId={activeCommentThreadId}
          onActiveCommentChange={setActiveCommentThreadId}
          pendingMarkId={pendingCommentMarkId}
          onPendingMarkConsumed={() => setPendingCommentMarkId(null)}
        />
      )}
    </AnimatePresence>
    </div>
  )
}
