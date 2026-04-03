'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Link2,
  Palette,
  Highlighter,
  List,
  ListOrdered,
  CheckSquare,
  Table,
  ImageIcon,
  Code2,
  ChevronDown,
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Paperclip,
  Mic,
  MicOff,
} from 'lucide-react'
import TablePicker from './TablePicker'
import ColorPicker from './ColorPicker'
import LinkPopover from './LinkPopover'
import '@/extensions/resizable-image'

interface ToolbarProps {
  editor: Editor | null
}

const TEXT_STYLES = [
  { label: 'Normal Text', action: (e: Editor) => e.chain().focus().setParagraph().run() },
  { label: 'Heading 1', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
]

function useIsMac() {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(
      /Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
      navigator.userAgent.includes('Mac')
    )
  }, [])
  return isMac
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

function key(isMac: boolean, mac: string, win: string) {
  return isMac ? mac : win
}

function MobileSheet({
  onClose,
  title,
  children,
}: {
  onClose: () => void
  title?: string
  children: React.ReactNode
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const dragYRef = useRef(0)
  const draggingRef = useRef(false)

  const onPillTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation()
    startYRef.current = e.touches[0].clientY
    dragYRef.current = 0
    draggingRef.current = true
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }, [])

  const onPillTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingRef.current) return
    e.stopPropagation()
    const dy = Math.max(0, e.touches[0].clientY - startYRef.current)
    dragYRef.current = dy
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`
  }, [])

  const onPillTouchEnd = useCallback(() => {
    draggingRef.current = false
    if (dragYRef.current > 80) {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.22s ease'
        sheetRef.current.style.transform = 'translateY(100%)'
      }
      setTimeout(onClose, 220)
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        sheetRef.current.style.transform = 'translateY(0)'
      }
      dragYRef.current = 0
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--editor-bg)',
          borderTop: '1px solid var(--border)',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: '0 -8px 32px rgba(0,0,0,0.14)',
          maxHeight: '82vh',
          overflowY: 'auto',
          animation: 'slideUp 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Pill handle — drag down to dismiss */}
        <div
          onTouchStart={onPillTouchStart}
          onTouchMove={onPillTouchMove}
          onTouchEnd={onPillTouchEnd}
          onClick={onClose}
          aria-label="Close"
          style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            padding: '12px 0 4px',
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--muted)' }} />
        </div>
        {title && (
          <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--ink)', padding: '4px 0 4px' }}>
            {title}
          </p>
        )}
        <div style={{ padding: '8px 16px 32px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function TBtn({
  onClick,
  active,
  disabled,
  label,
  shortcut,
  children,
  className = '',
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label?: string
  shortcut?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="tbtn-wrapper" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          relative flex items-center justify-center p-2 md:p-1.5 rounded-lg
          disabled:opacity-25 disabled:cursor-not-allowed
          ${active
            ? 'bg-[#D4550A]/10 text-[#D4550A] shadow-inner'
            : 'text-[#6b6b6b] hover:bg-[#F5F2ED] hover:text-[#1A1A1A]'
          }
          ${className}
        `}
        style={{ transition: 'background 120ms ease, color 120ms ease, transform 130ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 120ms ease' }}
        onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'scale(1.12)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
        onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.92)' }}
        onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.12)' }}
      >
        {children}
        {active && (
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#D4550A]" />
        )}
      </button>

      {label && (
        <div className="tbtn-tooltip">
          {label}
          {shortcut && (
            <>
              <span style={{ opacity: 0.45, margin: '0 4px' }}>·</span>
              <span className="tbtn-tooltip-key">{shortcut}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Toolbar({ editor }: ToolbarProps) {
  const isMac = useIsMac()
  const isMobile = useIsMobile()
  const iconSize = isMobile ? 18 : 15
  const mod = isMac ? '⌘' : 'CTRL'
  const imageRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const [showTextStyle, setShowTextStyle] = useState(false)
  const [showColor, setShowColor] = useState(false)
  const [showHighlight, setShowHighlight] = useState(false)
  const [showGradient, setShowGradient] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [linkPos, setLinkPos] = useState<{ left: number; top: number } | null>(null)

  const editorState = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor) return null
      return {
        isBold: ctx.editor.isActive('bold'),
        isItalic: ctx.editor.isActive('italic'),
        isUnderline: ctx.editor.isActive('underline'),
        isLink: ctx.editor.isActive('link'),
        isHighlight: ctx.editor.isActive('highlight'),
        isGradient: ctx.editor.isActive('gradientText'),
        isBulletList: ctx.editor.isActive('bulletList'),
        isOrderedList: ctx.editor.isActive('orderedList'),
        isTaskList: ctx.editor.isActive('taskList'),
        isCodeBlock: ctx.editor.isActive('codeBlock'),
        isH1: ctx.editor.isActive('heading', { level: 1 }),
        isH2: ctx.editor.isActive('heading', { level: 2 }),
        isH3: ctx.editor.isActive('heading', { level: 3 }),
        canUndo: ctx.editor.can().undo(),
        canRedo: ctx.editor.can().redo(),
        isAlignLeft: ctx.editor.isActive({ textAlign: 'left' }) || ctx.editor.isActive('image', { align: 'left' }),
        isAlignCenter: ctx.editor.isActive({ textAlign: 'center' }) || ctx.editor.isActive('image', { align: 'center' }),
        isAlignRight: ctx.editor.isActive({ textAlign: 'right' }) || ctx.editor.isActive('image', { align: 'right' }),
        isImageSelected: ctx.editor.isActive('image'),
      }
    },
  })

  if (!editor || !editorState) return null

  const getCurrentStyle = () => {
    if (editorState.isH1) return 'Heading 1'
    if (editorState.isH2) return 'Heading 2'
    if (editorState.isH3) return 'Heading 3'
    return 'Normal Text'
  }

  const closeAll = () => {
    setShowTextStyle(false)
    setShowColor(false)
    setShowHighlight(false)
    setShowGradient(false)
    setShowTable(false)
    setShowLink(false)
    setLinkPos(null)
  }

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (ev.target?.result) {
        editor.chain().focus().setImage({ src: ev.target.result as string }).run()
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
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
  }

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        const ext = recorder.mimeType.split('/')[1]?.split(';')[0] || 'webm'
        const name = `Voice memo ${new Date().toLocaleString()}.${ext}`
        const fr = new FileReader()
        fr.onload = (ev) => {
          const dataUrl = ev.target?.result as string
          if (!dataUrl) return
          editor.chain().focus().insertFileAttachment({
            name, size: blob.size, mimeType: recorder.mimeType, dataUrl,
          }).run()
        }
        fr.readAsDataURL(blob)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch {
      // microphone permission denied or not available
    }
  }

  const openLink = () => {
    try {
      const { from } = editor.state.selection
      const coords = editor.view.coordsAtPos(from)
      setLinkPos({ left: coords.left, top: coords.bottom + 8 })
    } catch {
      setLinkPos(null)
    }
    setShowLink(true)
    setShowTextStyle(false)
    setShowColor(false)
    setShowHighlight(false)
    setShowGradient(false)
    setShowTable(false)
  }

  const hasAnyDropdown = showTextStyle || showColor || showHighlight || showGradient || showTable || showLink

  return (
    <>
      {/* Desktop backdrop — closes dropdowns when clicking outside */}
      {hasAnyDropdown && !isMobile && (
        <div className="fixed inset-0 z-40" onClick={closeAll} />
      )}

      <div
        className="toolbar flex items-center justify-center gap-0.5 px-3 py-1.5 flex-wrap md:flex-nowrap md:py-2 relative"
        onMouseDown={(e) => e.preventDefault()}
      >

        {/* ── ROW 1: Undo · Redo · Text style · B · I · U · Link ── */}

        <TBtn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editorState.canUndo}
          label="Undo"
          shortcut={key(isMac, '⌘ Z', 'CTRL Z')}
        >
          <Undo2 size={iconSize} />
        </TBtn>
        <TBtn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editorState.canRedo}
          label="Redo"
          shortcut={key(isMac, '⇧⌘ Z', 'CTRL Y')}
        >
          <Redo2 size={iconSize} />
        </TBtn>

        {/* Text style dropdown */}
        <div className="relative z-50">
          <button
            onClick={() => {
              setShowTextStyle((v) => !v)
              setShowColor(false)
              setShowHighlight(false)
              setShowGradient(false)
              setShowLink(false)
              setShowTable(false)
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-[#6b6b6b] hover:bg-[#F5F2ED] hover:text-[#1A1A1A] transition-colors active:scale-95"
            style={{ transition: 'background 120ms ease, color 120ms ease' }}
          >
            <span className="min-w-[78px] text-left font-medium">{getCurrentStyle()}</span>
            <ChevronDown size={11} className={`transition-transform duration-200 ${showTextStyle ? 'rotate-180' : ''}`} />
          </button>
          {showTextStyle && !isMobile && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl overflow-hidden min-w-[150px]">
              {TEXT_STYLES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => { setShowTextStyle(false); s.action(editor) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#F5F2ED] transition-colors text-[#1A1A1A] font-medium first:pt-2.5 last:pb-2.5"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editorState.isBold} label="Bold" shortcut={`${mod} B`}>
          <Bold size={iconSize} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editorState.isItalic} label="Italic" shortcut={`${mod} I`}>
          <Italic size={iconSize} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editorState.isUnderline} label="Underline" shortcut={`${mod} U`}>
          <Underline size={iconSize} />
        </TBtn>
        <TBtn onClick={openLink} active={editorState.isLink} label="Link" shortcut={`${mod} K`}>
          <Link2 size={iconSize} />
        </TBtn>

        {/* Mobile row break */}
        <div className="block md:hidden w-full" style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />

        {/* ── ROW 2: Text color · Highlight · Gradient · Lists ── */}

        {/* Text color */}
        <div className="relative z-50">
          <TBtn
            onClick={() => { setShowColor((v) => !v); setShowTextStyle(false); setShowHighlight(false); setShowGradient(false); setShowLink(false); setShowTable(false) }}
            label="Text color"
          >
            <Palette size={iconSize} />
          </TBtn>
          {showColor && !isMobile && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl overflow-hidden">
              <div style={{ padding: '8px 8px 4px' }}>
                <ColorPicker
                  value={editor.getAttributes('textStyle').color as string ?? '#000000'}
                  onChange={(color) => editor.chain().focus().setColor(color).run()}
                  mode="color"
                />
                <button onClick={() => { editor.chain().focus().unsetColor().run(); setShowColor(false) }} style={{ marginTop: 8, width: '100%', padding: '5px 0', fontSize: 11, color: '#9b9b9b', background: '#F5F0E8', border: '1px solid #E5E0D8', borderRadius: 6, cursor: 'pointer' }}>
                  Unset color
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="relative z-50">
          <TBtn
            onClick={() => { setShowHighlight((v) => !v); setShowTextStyle(false); setShowColor(false); setShowGradient(false); setShowLink(false); setShowTable(false) }}
            active={editorState.isHighlight}
            label="Highlight"
          >
            <Highlighter size={iconSize} />
          </TBtn>
          {showHighlight && !isMobile && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl overflow-hidden">
              <div style={{ padding: '8px 8px 4px' }}>
                <ColorPicker
                  value={editor.getAttributes('highlight').color as string ?? '#fef08a'}
                  onChange={(color) => editor.chain().focus().setHighlight({ color }).run()}
                  mode="color"
                />
                <button onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlight(false) }} style={{ marginTop: 8, width: '100%', padding: '5px 0', fontSize: 11, color: '#9b9b9b', background: '#F5F0E8', border: '1px solid #E5E0D8', borderRadius: 6, cursor: 'pointer' }}>
                  Unset highlight
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Gradient text */}
        <div className="relative z-50">
          <TBtn
            onClick={() => { setShowGradient((v) => !v); setShowTextStyle(false); setShowColor(false); setShowHighlight(false); setShowLink(false); setShowTable(false) }}
            active={editorState.isGradient}
            label="Gradient"
          >
            <Sparkles size={iconSize} />
          </TBtn>
          {showGradient && !isMobile && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl overflow-hidden">
              <div style={{ padding: '8px 8px 4px' }}>
                <ColorPicker
                  value={editorState.isGradient ? (editor.getAttributes('gradientText').gradient as string ?? 'linear-gradient(90deg, #D4550A, #3b82f6)') : 'linear-gradient(90deg, #D4550A, #3b82f6)'}
                  onChange={(gradient) => editor.chain().focus().setGradientText(gradient).run()}
                  mode="gradient"
                />
                {editorState.isGradient && (
                  <button onClick={() => { editor.chain().focus().unsetGradientText().run(); setShowGradient(false) }} style={{ marginTop: 8, width: '100%', padding: '5px 0', fontSize: 11, color: '#9b9b9b', background: '#F5F0E8', border: '1px solid #E5E0D8', borderRadius: 6, cursor: 'pointer' }}>
                    Unset gradient
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editorState.isBulletList} label="Bullet list">
          <List size={iconSize} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editorState.isOrderedList} label="Numbered list">
          <ListOrdered size={iconSize} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editorState.isTaskList} label="Checklist">
          <CheckSquare size={iconSize} />
        </TBtn>

        {/* Mobile row break */}
        <div className="block md:hidden w-full" style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />

        {/* ── ROW 3: Alignment · Table · Image · Code ── */}

        <TBtn
          onClick={() => editorState.isImageSelected ? editor.chain().focus().setImageAlign('left').run() : editor.chain().focus().setTextAlign('left').run()}
          active={editorState.isAlignLeft}
          label="Align left"
        >
          <AlignLeft size={iconSize} />
        </TBtn>
        <TBtn
          onClick={() => editorState.isImageSelected ? editor.chain().focus().setImageAlign('center').run() : editor.chain().focus().setTextAlign('center').run()}
          active={editorState.isAlignCenter}
          label="Align center"
        >
          <AlignCenter size={iconSize} />
        </TBtn>
        <TBtn
          onClick={() => editorState.isImageSelected ? editor.chain().focus().setImageAlign('right').run() : editor.chain().focus().setTextAlign('right').run()}
          active={editorState.isAlignRight}
          label="Align right"
        >
          <AlignRight size={iconSize} />
        </TBtn>

        {/* Table */}
        <div className="relative z-50">
          <TBtn
            onClick={() => { setShowTable((v) => !v); setShowTextStyle(false); setShowColor(false); setShowHighlight(false); setShowGradient(false); setShowLink(false) }}
            label="Table"
          >
            <Table size={iconSize} />
          </TBtn>
          {showTable && !isMobile && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl">
              <TablePicker
                onSelect={(rows, cols) => { editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run(); setShowTable(false) }}
                onClose={() => setShowTable(false)}
              />
            </div>
          )}
        </div>

        {/* Image */}
        <TBtn onClick={() => imageRef.current?.click()} label="Insert image">
          <ImageIcon size={iconSize} />
        </TBtn>
        <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />

        {/* File upload */}
        <TBtn onClick={() => fileRef.current?.click()} label="Upload file">
          <Paperclip size={iconSize} />
        </TBtn>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />

        {/* Voice memo */}
        <TBtn
          onClick={toggleRecording}
          active={isRecording}
          label={isRecording ? 'Stop recording' : 'Voice memo'}
          className={isRecording ? 'animate-pulse' : ''}
        >
          {isRecording ? <MicOff size={iconSize} /> : <Mic size={iconSize} />}
        </TBtn>

        {/* Code block */}
        <TBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editorState.isCodeBlock} label="Code block">
          <Code2 size={iconSize} />
        </TBtn>
      </div>

      {/* ── Mobile bottom sheets ── */}

      {isMobile && showTextStyle && (
        <MobileSheet onClose={closeAll} title="Text style">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TEXT_STYLES.map((s) => (
              <button
                key={s.label}
                onClick={() => { closeAll(); s.action(editor) }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 16px',
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 500,
                  color: 'var(--ink)',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </MobileSheet>
      )}

      {isMobile && showColor && (
        <MobileSheet onClose={closeAll} title="Text color">
          <ColorPicker
            value={editor.getAttributes('textStyle').color as string ?? '#000000'}
            onChange={(color) => editor.chain().focus().setColor(color).run()}
            mode="color"
          />
          <button onClick={() => { editor.chain().focus().unsetColor().run(); closeAll() }} style={{ marginTop: 12, width: '100%', padding: '10px 0', fontSize: 13, color: '#9b9b9b', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
            Unset color
          </button>
        </MobileSheet>
      )}

      {isMobile && showHighlight && (
        <MobileSheet onClose={closeAll} title="Highlight">
          <ColorPicker
            value={editor.getAttributes('highlight').color as string ?? '#fef08a'}
            onChange={(color) => editor.chain().focus().setHighlight({ color }).run()}
            mode="color"
          />
          <button onClick={() => { editor.chain().focus().unsetHighlight().run(); closeAll() }} style={{ marginTop: 12, width: '100%', padding: '10px 0', fontSize: 13, color: '#9b9b9b', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
            Unset highlight
          </button>
        </MobileSheet>
      )}

      {isMobile && showGradient && (
        <MobileSheet onClose={closeAll} title="Gradient">
          <ColorPicker
            value={editorState.isGradient ? (editor.getAttributes('gradientText').gradient as string ?? 'linear-gradient(90deg, #D4550A, #3b82f6)') : 'linear-gradient(90deg, #D4550A, #3b82f6)'}
            onChange={(gradient) => editor.chain().focus().setGradientText(gradient).run()}
            mode="gradient"
          />
          {editorState.isGradient && (
            <button onClick={() => { editor.chain().focus().unsetGradientText().run(); closeAll() }} style={{ marginTop: 12, width: '100%', padding: '10px 0', fontSize: 13, color: '#9b9b9b', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
              Unset gradient
            </button>
          )}
        </MobileSheet>
      )}

      {isMobile && showTable && (
        <MobileSheet onClose={closeAll} title="Insert table">
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <TablePicker
              onSelect={(rows, cols) => { editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run(); closeAll() }}
              onClose={closeAll}
            />
          </div>
        </MobileSheet>
      )}

      {showLink && (
        <LinkPopover
          editor={editor}
          pos={linkPos}
          onClose={() => { setShowLink(false); setLinkPos(null) }}
        />
      )}
    </>
  )
}
