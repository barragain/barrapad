'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, useEditorState } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { Plugin, PluginKey } from 'prosemirror-state'
import type { Node as PmNode } from '@tiptap/pm/model'

export const footnoteCounterKey = new PluginKey<Map<number, number>>('footnoteCounter')

function buildMap(doc: PmNode): Map<number, number> {
  const map = new Map<number, number>()
  let n = 0
  doc.descendants((node, pos) => {
    if (node.type.name === 'footnote') map.set(pos, ++n)
  })
  return map
}

function FootnoteView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState((node.attrs.content as string) || '')
  const boxRef = useRef<HTMLSpanElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const num = useEditorState({
    editor: editor!,
    selector: () => {
      const rawPos = typeof getPos === 'function' ? getPos() : undefined
      const pos = rawPos ?? -1
      if (pos < 0) return 1
      return footnoteCounterKey.getState(editor!.state)?.get(pos) ?? 1
    },
  }) ?? 1

  useEffect(() => {
    if (!open) setDraft((node.attrs.content as string) || '')
  }, [node.attrs.content, open])

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as globalThis.Node)) {
        updateAttributes({ content: draft })
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, draft, updateAttributes])

  return (
    <NodeViewWrapper as="span" className="barrapad-fn-wrap">
      <span ref={boxRef} style={{ position: 'relative', display: 'inline' }}>
        <sup
          contentEditable={false}
          className="barrapad-fn-marker"
          onClick={() => setOpen(v => !v)}
          title={(node.attrs.content as string) || 'Click to add footnote text'}
        >
          [{num}]
        </sup>
        {open && (
          <span contentEditable={false} className="barrapad-fn-popover">
            <span className="barrapad-fn-label">Footnote {num}</span>
            <textarea
              ref={textareaRef}
              className="barrapad-fn-textarea"
              value={draft}
              rows={3}
              placeholder="Footnote text…"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setOpen(false); return }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  updateAttributes({ content: draft })
                  setOpen(false)
                }
                e.stopPropagation()
              }}
            />
            <button
              className="barrapad-fn-save"
              onPointerDown={e => {
                e.preventDefault()
                updateAttributes({ content: draft })
                setOpen(false)
              }}
            >
              Save
            </button>
          </span>
        )}
      </span>
    </NodeViewWrapper>
  )
}

export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      content: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, { 'data-footnote': '' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView)
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: footnoteCounterKey,
        state: {
          init: (_, state) => buildMap(state.doc),
          apply: (tr, old) => (tr.docChanged ? buildMap(tr.doc) : old),
        },
      }),
    ]
  },
})
