'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import TablePicker from './TablePicker'
import ColorPicker from './ColorPicker'
import LinkPopover from './LinkPopover'
import { useRef } from 'react'

interface ToolbarProps {
  editor: Editor | null
}

const TEXT_STYLES = [
  { label: 'Normal Text', action: (e: Editor) => e.chain().focus().setParagraph().run() },
  { label: 'Heading 1', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
]

function TBtn({
  onClick,
  active,
  disabled,
  title,
  children,
  className = '',
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        relative flex items-center justify-center p-1.5 rounded-lg
        transition-all duration-150 ease-out
        disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none
        hover:scale-110 hover:shadow-sm active:scale-95
        ${active
          ? 'bg-[#D4550A]/10 text-[#D4550A] shadow-inner'
          : 'text-[#6b6b6b] hover:bg-[#F5F2ED] hover:text-[#1A1A1A]'
        }
        ${className}
      `}
      style={{ transition: 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 150ms ease, background 150ms ease, color 150ms ease' }}
    >
      {children}
      {active && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#D4550A]" />
      )}
    </button>
  )
}

export default function Toolbar({ editor }: ToolbarProps) {
  const imageRef = useRef<HTMLInputElement>(null)
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
      {hasAnyDropdown && (
        <div className="fixed inset-0 z-40" onClick={closeAll} />
      )}

      {/* onMouseDown preventDefault stops toolbar clicks from stealing editor focus/selection */}
      <div
        className="toolbar flex items-center gap-0.5 px-3 py-2 flex-wrap relative"
        onMouseDown={(e) => e.preventDefault()}
      >

        {/* Undo / Redo */}
        <TBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editorState.canUndo} title="Undo">
          <Undo2 size={15} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editorState.canRedo} title="Redo">
          <Redo2 size={15} />
        </TBtn>

        <div className="w-px h-4 bg-[#E5E0D8] mx-1" />

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
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-[#6b6b6b] hover:bg-[#F5F2ED] hover:text-[#1A1A1A] hover:scale-105 transition-all duration-150 active:scale-95"
            style={{ transition: 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease' }}
          >
            <span className="min-w-[78px] text-left font-medium">{getCurrentStyle()}</span>
            <ChevronDown size={11} className={`transition-transform duration-200 ${showTextStyle ? 'rotate-180' : ''}`} />
          </button>
          {showTextStyle && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl overflow-hidden min-w-[150px]">
              {TEXT_STYLES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setShowTextStyle(false)
                    s.action(editor)
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#F5F2ED] transition-colors text-[#1A1A1A] font-medium first:pt-2.5 last:pb-2.5"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-[#E5E0D8] mx-1" />

        {/* Bold / Italic / Underline */}
        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editorState.isBold} title="Bold (⌘B)">
          <Bold size={15} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editorState.isItalic} title="Italic (⌘I)">
          <Italic size={15} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editorState.isUnderline} title="Underline (⌘U)">
          <Underline size={15} />
        </TBtn>

        {/* Link button — popover floats near the selection */}
        <TBtn
          onClick={openLink}
          active={editorState.isLink}
          title="Link (⌘K)"
        >
          <Link2 size={15} />
        </TBtn>

        <div className="w-px h-4 bg-[#E5E0D8] mx-1" />

        {/* Text color */}
        <div className="relative z-50">
          <TBtn
            onClick={() => {
              setShowColor((v) => !v)
              setShowTextStyle(false)
              setShowHighlight(false)
              setShowGradient(false)
              setShowLink(false)
              setShowTable(false)
            }}
            title="Text color"
          >
            <Palette size={15} />
          </TBtn>
          {showColor && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl overflow-hidden">
              <div style={{ padding: '8px 8px 4px' }}>
                <ColorPicker
                  value={editor.getAttributes('textStyle').color as string ?? '#000000'}
                  onChange={(color) => {
                    editor.chain().focus().setColor(color).run()
                  }}
                  mode="color"
                />
                <button
                  onClick={() => { editor.chain().focus().unsetColor().run(); setShowColor(false) }}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    padding: '5px 0',
                    fontSize: 11,
                    color: '#9b9b9b',
                    background: '#F5F0E8',
                    border: '1px solid #E5E0D8',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  Unset color
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="relative z-50">
          <TBtn
            onClick={() => {
              setShowHighlight((v) => !v)
              setShowTextStyle(false)
              setShowColor(false)
              setShowGradient(false)
              setShowLink(false)
              setShowTable(false)
            }}
            active={editorState.isHighlight}
            title="Highlight"
          >
            <Highlighter size={15} />
          </TBtn>
          {showHighlight && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl overflow-hidden">
              <div style={{ padding: '8px 8px 4px' }}>
                <ColorPicker
                  value={editor.getAttributes('highlight').color as string ?? '#fef08a'}
                  onChange={(color) => {
                    editor.chain().focus().setHighlight({ color }).run()
                  }}
                  mode="color"
                />
                <button
                  onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlight(false) }}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    padding: '5px 0',
                    fontSize: 11,
                    color: '#9b9b9b',
                    background: '#F5F0E8',
                    border: '1px solid #E5E0D8',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  Unset highlight
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Gradient text */}
        <div className="relative z-50">
          <TBtn
            onClick={() => {
              setShowGradient((v) => !v)
              setShowTextStyle(false)
              setShowColor(false)
              setShowHighlight(false)
              setShowLink(false)
              setShowTable(false)
            }}
            active={editorState.isGradient}
            title="Gradient text"
          >
            <Sparkles size={15} />
          </TBtn>
          {showGradient && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl overflow-hidden">
              <div style={{ padding: '8px 8px 4px' }}>
                <ColorPicker
                  value={
                    editorState.isGradient
                      ? (editor.getAttributes('gradientText').gradient as string ?? 'linear-gradient(90deg, #D4550A, #3b82f6)')
                      : 'linear-gradient(90deg, #D4550A, #3b82f6)'
                  }
                  onChange={(gradient) => {
                    editor.chain().focus().setGradientText(gradient).run()
                  }}
                  mode="gradient"
                />
                {editorState.isGradient && (
                  <button
                    onClick={() => { editor.chain().focus().unsetGradientText().run(); setShowGradient(false) }}
                    style={{
                      marginTop: 8,
                      width: '100%',
                      padding: '5px 0',
                      fontSize: 11,
                      color: '#9b9b9b',
                      background: '#F5F0E8',
                      border: '1px solid #E5E0D8',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    Unset gradient
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-[#E5E0D8] mx-1" />

        {/* Lists */}
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editorState.isBulletList} title="Bullet list">
          <List size={15} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editorState.isOrderedList} title="Numbered list">
          <ListOrdered size={15} />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editorState.isTaskList} title="Checklist">
          <CheckSquare size={15} />
        </TBtn>

        <div className="w-px h-4 bg-[#E5E0D8] mx-1" />

        {/* Table */}
        <div className="relative z-50">
          <TBtn
            onClick={() => {
              setShowTable((v) => !v)
              setShowTextStyle(false)
              setShowColor(false)
              setShowHighlight(false)
              setShowGradient(false)
              setShowLink(false)
            }}
            title="Insert table"
          >
            <Table size={15} />
          </TBtn>
          {showTable && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E0D8] rounded-xl shadow-xl">
              <TablePicker
                onSelect={(rows, cols) => {
                  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
                  setShowTable(false)
                }}
                onClose={() => setShowTable(false)}
              />
            </div>
          )}
        </div>

        {/* Image */}
        <TBtn onClick={() => imageRef.current?.click()} title="Insert image">
          <ImageIcon size={15} />
        </TBtn>
        <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />

        {/* Code block */}
        <TBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editorState.isCodeBlock} title="Code block">
          <Code2 size={15} />
        </TBtn>
      </div>

      {/* Floating link popover — rendered outside toolbar so it can position freely */}
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
