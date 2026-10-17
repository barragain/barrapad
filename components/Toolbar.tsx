'use client'

import { useState, useRef, useEffect } from 'react'
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
  AlignLeft,
  AlignCenter,
  AlignRight,
  Paperclip,
  SeparatorHorizontal,
  Superscript,
  BarChart2,
  MessageSquare,
} from 'lucide-react'
import TablePicker from './TablePicker'
import ColorPicker, { HIGHLIGHT_SWATCHES } from './ColorPicker'
import LinkPopover from './LinkPopover'
import '@/extensions/resizable-image'
import { uploadImage, uploadFile } from '@/lib/upload-image'

import { setNodeAlign, TEXT_STYLES, useIsMac, useIsMobile, key } from './toolbar/helpers'
import { MobileSheet, TBtn } from './toolbar/parts'
import { VoiceMemoButton } from './toolbar/VoiceMemoButton'

interface ToolbarProps {
  editor: Editor | null
  commentsEnabled?: boolean
}

export default function Toolbar({ editor, commentsEnabled = true }: ToolbarProps) {
  const isMac = useIsMac()
  const isMobile = useIsMobile()
  const iconSize = isMobile ? 18 : 15
  const mod = isMac ? '⌘' : 'CTRL'
  const imageRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showTextStyle, setShowTextStyle] = useState(false)
  const [showColor, setShowColor] = useState(false)
  const [showHighlight, setShowHighlight] = useState(false)
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
        isBlockquote: ctx.editor.isActive('blockquote'),
        isH1: ctx.editor.isActive('heading', { level: 1 }),
        isH2: ctx.editor.isActive('heading', { level: 2 }),
        isH3: ctx.editor.isActive('heading', { level: 3 }),
        canUndo: ctx.editor.can().undo(),
        canRedo: ctx.editor.can().redo(),
        isAlignLeft: ctx.editor.isActive({ textAlign: 'left' }) || ctx.editor.isActive('image', { align: 'left' }) || ctx.editor.isActive('fileAttachment', { align: 'left' }) || ctx.editor.isActive('poll', { align: 'left' }),
        isAlignCenter: ctx.editor.isActive({ textAlign: 'center' }) || ctx.editor.isActive('image', { align: 'center' }) || ctx.editor.isActive('fileAttachment', { align: 'center' }) || ctx.editor.isActive('poll', { align: 'center' }),
        isAlignRight: ctx.editor.isActive({ textAlign: 'right' }) || ctx.editor.isActive('image', { align: 'right' }) || ctx.editor.isActive('fileAttachment', { align: 'right' }) || ctx.editor.isActive('poll', { align: 'right' }),
        isImageSelected: ctx.editor.isActive('image'),
        isFileAttachmentSelected: ctx.editor.isActive('fileAttachment'),
      }
    },
  })

  if (!editor || !editorState) return null

  const getCurrentStyle = () => {
    if (editorState.isH1) return 'Heading 1'
    if (editorState.isH2) return 'Heading 2'
    if (editorState.isH3) return 'Heading 3'
    if (editorState.isBlockquote) return 'Quote'
    return 'Normal Text'
  }

  const closeAll = () => {
    setShowTextStyle(false)
    setShowColor(false)
    setShowHighlight(false)
    setShowTable(false)
    setShowLink(false)
    setLinkPos(null)
  }

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadImage(file).then(url => {
      const sel = editor.state.selection
      if ('node' in sel && sel.node) editor.commands.setTextSelection(sel.to)
      editor.chain().focus().setImage({ src: url }).run()
    })
    e.target.value = ''
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadFile(file).then((result) => {
      const sel = editor.state.selection
      if ('node' in sel && sel.node) editor.commands.setTextSelection(sel.to)
      editor.chain().focus().insertFileAttachment({
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        dataUrl: result,
      }).run()
    })
    e.target.value = ''
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
    setShowTable(false)
  }

  // Ctrl/Cmd+K opens the link box, as the Link button's tooltip says.
  const openLinkRef = useRef(openLink)
  openLinkRef.current = openLink
  useEffect(() => {
    const dom = editor.view.dom
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && editor.isEditable) {
        e.preventDefault()
        openLinkRef.current()
      }
    }
    dom.addEventListener('keydown', onKey)
    return () => dom.removeEventListener('keydown', onKey)
  }, [editor])

  const hasAnyDropdown = showTextStyle || showColor || showHighlight || showTable || showLink

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
              setShowLink(false)
              setShowTable(false)
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-[var(--ink-soft)] hover:bg-[var(--hover)] hover:text-[var(--ink)] transition-colors active:scale-95"
            style={{ transition: 'background 120ms ease, color 120ms ease' }}
          >
            <span className="min-w-[78px] text-left font-medium">{getCurrentStyle()}</span>
            <ChevronDown size={11} className={`transition-transform duration-200 ${showTextStyle ? 'rotate-180' : ''}`} />
          </button>
          {showTextStyle && !isMobile && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--editor-bg)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden min-w-[150px]">
              {TEXT_STYLES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => { setShowTextStyle(false); s.action(editor) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--hover)] transition-colors text-[var(--ink)] font-medium first:pt-2.5 last:pb-2.5"
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
            onClick={() => { setShowColor((v) => !v); setShowTextStyle(false); setShowHighlight(false); setShowLink(false); setShowTable(false) }}
            label="Text color"
          >
            <Palette size={iconSize} />
          </TBtn>
          {showColor && !isMobile && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--editor-bg)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden">
              <div style={{ padding: '8px 8px 4px' }}>
                <ColorPicker
                  value={editor.getAttributes('textStyle').color as string ?? '#000000'}
                  onChange={(value) => {
                    // If the user picks a gradient from the gradient tab, apply it
                    // as a gradient mark instead of a color (CSS color doesn't support gradients)
                    if (value.includes('gradient')) {
                      editor.chain().focus().unsetColor().setGradientText(value).run()
                    } else {
                      editor.chain().focus().unsetGradientText().setColor(value).run()
                    }
                  }}
                  mode="color"
                />
                <button onClick={() => { editor.chain().focus().unsetColor().unsetGradientText().run(); setShowColor(false) }} style={{ marginTop: 8, width: '100%', padding: '5px 0', fontSize: 11, color: 'var(--muted)', background: 'var(--sidebar-bg)', border: '1px solid #E5E0D8', borderRadius: 6, cursor: 'pointer' }}>
                  Unset color
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="relative z-50">
          <TBtn
            onClick={() => { setShowHighlight((v) => !v); setShowTextStyle(false); setShowColor(false); setShowLink(false); setShowTable(false) }}
            active={editorState.isHighlight}
            label="Highlight"
          >
            <Highlighter size={iconSize} />
          </TBtn>
          {showHighlight && !isMobile && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--editor-bg)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden">
              <div style={{ padding: '8px 8px 4px' }}>
                <ColorPicker
                  value={editor.getAttributes('highlight').color as string ?? '#fef08a'}
                  swatches={HIGHLIGHT_SWATCHES}
                  onChange={(color) => editor.chain().focus().setHighlight({ color }).run()}
                  mode="color"
                />
                <button onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlight(false) }} style={{ marginTop: 8, width: '100%', padding: '5px 0', fontSize: 11, color: 'var(--muted)', background: 'var(--sidebar-bg)', border: '1px solid #E5E0D8', borderRadius: 6, cursor: 'pointer' }}>
                  Unset highlight
                </button>
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
          onClick={() => { if (!setNodeAlign(editor, 'left')) editor.chain().focus().setTextAlign('left').run() }}
          active={editorState.isAlignLeft}
          label="Align left"
        >
          <AlignLeft size={iconSize} />
        </TBtn>
        <TBtn
          onClick={() => { if (!setNodeAlign(editor, 'center')) editor.chain().focus().setTextAlign('center').run() }}
          active={editorState.isAlignCenter}
          label="Align center"
        >
          <AlignCenter size={iconSize} />
        </TBtn>
        <TBtn
          onClick={() => { if (!setNodeAlign(editor, 'right')) editor.chain().focus().setTextAlign('right').run() }}
          active={editorState.isAlignRight}
          label="Align right"
        >
          <AlignRight size={iconSize} />
        </TBtn>

        {/* Table */}
        <div className="relative z-50">
          <TBtn
            onClick={() => { setShowTable((v) => !v); setShowTextStyle(false); setShowColor(false); setShowHighlight(false); setShowLink(false) }}
            label="Table"
          >
            <Table size={iconSize} />
          </TBtn>
          {showTable && !isMobile && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--editor-bg)] border border-[var(--border)] rounded-xl shadow-xl">
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

        <VoiceMemoButton editor={editor} iconSize={iconSize} isMobile={isMobile} />

        {/* Code block */}
        <TBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editorState.isCodeBlock} label="Code block">
          <Code2 size={iconSize} />
        </TBtn>

        {/* Divider */}
        <TBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          label="Divider"
        >
          <SeparatorHorizontal size={iconSize} />
        </TBtn>

        {/* Footnote */}
        <TBtn
          onClick={() => editor.chain().focus().insertContent({ type: 'footnote' }).run()}
          label="Footnote"
        >
          <Superscript size={iconSize} />
        </TBtn>

        {/* Poll */}
        <TBtn
          onClick={() => editor.chain().focus().insertContent({ type: 'poll' }).run()}
          label="Poll"
        >
          <BarChart2 size={iconSize} />
        </TBtn>

        {commentsEnabled && (<>
        {/* Separator before comment — visually separate collaboration from formatting */}
        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        {/* Comment — if text is selected, create a new comment on the selection.
            Otherwise, just toggle the comment sidebar open/closed. */}
        <button
          onClick={() => {
            if (editor && !editor.state.selection.empty) {
              const cid = `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
              editor.chain().focus().setCommentMark(cid).run()
              window.dispatchEvent(new CustomEvent('barrapad:comment-new', { detail: { markCommentId: cid } }))
            } else {
              window.dispatchEvent(new Event('barrapad:toggle-comments'))
            }
          }}
          className="flex items-center gap-1 rounded-lg"
          style={{
            padding: isMobile ? '6px 10px' : '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
            cursor: 'pointer',
            transition: 'background 120ms ease, transform 130ms cubic-bezier(0.34,1.56,0.64,1)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
          onMouseDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).style.transform = 'scale(0.95)' }}
          onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
          title="Comments"
        >
          <MessageSquare size={isMobile ? 14 : 13} />
          {!isMobile && <span>Comments</span>}
        </button>
        </>)}
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
            onChange={(value) => {
              if (value.includes('gradient')) {
                editor.chain().unsetColor().setGradientText(value).run()
              } else {
                editor.chain().unsetGradientText().setColor(value).run()
              }
            }}
            mode="color"
          />
          <button onClick={() => { editor.chain().unsetColor().unsetGradientText().run(); closeAll() }} style={{ marginTop: 12, width: '100%', padding: '10px 0', fontSize: 13, color: 'var(--muted)', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
            Unset color
          </button>
        </MobileSheet>
      )}

      {isMobile && showHighlight && (
        <MobileSheet onClose={closeAll} title="Highlight">
          <ColorPicker
            value={editor.getAttributes('highlight').color as string ?? '#fef08a'}
                  swatches={HIGHLIGHT_SWATCHES}
            onChange={(color) => editor.chain().setHighlight({ color }).run()}
            mode="color"
          />
          <button onClick={() => { editor.chain().unsetHighlight().run(); closeAll() }} style={{ marginTop: 12, width: '100%', padding: '10px 0', fontSize: 13, color: 'var(--muted)', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
            Unset highlight
          </button>
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
