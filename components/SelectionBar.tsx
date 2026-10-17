'use client'

import { useEffect, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { motion } from 'framer-motion'
import { Bold, Italic, Underline, Link2, Palette, Highlighter, MessageSquare, Ban, ChevronDown } from 'lucide-react'
import ColorPicker, { PRESET_SWATCHES, HIGHLIGHT_SWATCHES } from './ColorPicker'
import { TBtn } from './toolbar/parts'

interface SelectionBarProps {
  editor: Editor
  pos: { x: number; y: number }
  commentsEnabled: boolean
  onLink: () => void
  onComment: () => void
}

/** Small formatting bar shown above a text selection (Medium style).
 *  A selected block (image, poll) only gets the Comment button. */
export default function SelectionBar({ editor, pos, commentsEnabled, onLink, onComment }: SelectionBarProps) {
  const [swatches, setSwatches] = useState<'color' | 'highlight' | null>(null)
  const [more, setMore] = useState(false)
  useEffect(() => setMore(false), [swatches])
  const s = useEditorState({
    editor,
    selector: (ctx) => ({
      isBlock: 'node' in ctx.editor.state.selection,
      isBold: ctx.editor.isActive('bold'),
      isItalic: ctx.editor.isActive('italic'),
      isUnderline: ctx.editor.isActive('underline'),
      isLink: ctx.editor.isActive('link'),
      isHighlight: ctx.editor.isActive('highlight'),
    }),
  })

  // Esc closes an open swatch row before anything else.
  useEffect(() => {
    if (!swatches) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setSwatches(null) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [swatches])

  if (s.isBlock && !commentsEnabled) return null

  const apply = (value: string | null) => {
    const chain = editor.chain().focus()
    if (swatches === 'highlight') (value ? chain.setHighlight({ color: value }) : chain.unsetHighlight()).run()
    else if (!value) chain.unsetColor().unsetGradientText().run()
    // CSS color can't hold a gradient, so a gradient becomes the gradient mark.
    else if (value.includes('gradient')) chain.unsetColor().setGradientText(value).run()
    else chain.unsetGradientText().setColor(value).run()
  }
  const pick = (value: string | null) => { apply(value); setSwatches(null) }

  return (
    <motion.div
      role="toolbar"
      aria-label="Format selection"
      data-selection-bar
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      // Keep the editor selection, except in the full picker's text fields.
      onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault() }}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        x: '-50%',  // motion owns transform, so a raw translateX would be dropped
        zIndex: 40,
        padding: 2,
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--editor-bg)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {!s.isBlock && (
          <>
            <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={s.isBold} label="Bold"><Bold size={15} /></TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={s.isItalic} label="Italic"><Italic size={15} /></TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={s.isUnderline} label="Underline"><Underline size={15} /></TBtn>
            <TBtn onClick={onLink} active={s.isLink} label="Link"><Link2 size={15} /></TBtn>
            <TBtn onClick={() => setSwatches((v) => (v === 'highlight' ? null : 'highlight'))} active={s.isHighlight} label="Highlight"><Highlighter size={15} /></TBtn>
            <TBtn onClick={() => setSwatches((v) => (v === 'color' ? null : 'color'))} label="Text color"><Palette size={15} /></TBtn>
          </>
        )}
        {commentsEnabled && (
          <TBtn onClick={onComment} label="Comment"><MessageSquare size={15} /></TBtn>
        )}
      </div>
      {swatches && (
        <div style={{ display: 'flex', gap: 4, padding: '4px 6px 6px', borderTop: '1px solid var(--border)' }}>
          {(swatches === 'highlight' ? HIGHLIGHT_SWATCHES : PRESET_SWATCHES)[0].map((c) => (
            <button
              key={c}
              aria-label={c}
              onClick={() => pick(c)}
              style={{ width: 18, height: 18, borderRadius: 5, background: c, border: '1px solid var(--border)', cursor: 'pointer' }}
            />
          ))}
          <button
            aria-label={swatches === 'highlight' ? 'Remove highlight' : 'Remove color'}
            title={swatches === 'highlight' ? 'Remove highlight' : 'Remove color'}
            onClick={() => pick(null)}
            style={{ width: 18, height: 18, borderRadius: 5, display: 'grid', placeItems: 'center', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            <Ban size={12} />
          </button>
          <button
            aria-label="More colors"
            title="More colors"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
            style={{ width: 18, height: 18, borderRadius: 5, display: 'grid', placeItems: 'center', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', background: more ? 'var(--hover)' : 'none' }}
          >
            <ChevronDown size={12} style={{ transform: more ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
          </button>
        </div>
      )}
      {swatches && more && (
        <div data-color-more style={{ padding: '4px 6px 6px', borderTop: '1px solid var(--border)' }}>
          <ColorPicker
            value={(swatches === 'highlight' ? editor.getAttributes('highlight').color : editor.getAttributes('textStyle').color) as string ?? (swatches === 'highlight' ? '#fef08a' : '#000000')}
            swatches={swatches === 'highlight' ? HIGHLIGHT_SWATCHES : PRESET_SWATCHES}
            onChange={apply}
            mode="color"
            boardOpen
          />
        </div>
      )}
    </motion.div>
  )
}
