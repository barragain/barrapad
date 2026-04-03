'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useCallback } from 'react'
import { NodeSelection } from '@tiptap/pm/state'

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, title, width, align } = node.attrs as {
    src: string
    alt?: string
    title?: string
    width?: number
    align: 'left' | 'center' | 'right'
  }

  const [resizing, setResizing] = useState(false)
  const [hovered, setHovered] = useState(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const imgRef = useRef<HTMLImageElement>(null)

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setResizing(true)
      startX.current = e.clientX
      startW.current = imgRef.current?.offsetWidth ?? (width ?? 400)

      const onMove = (ev: MouseEvent) => {
        const newW = Math.max(80, Math.min(900, startW.current + ev.clientX - startX.current))
        updateAttributes({ width: Math.round(newW) })
      }

      const onUp = () => {
        setResizing(false)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [width, updateAttributes]
  )

  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
  const showHandle = selected || hovered || resizing

  return (
    <NodeViewWrapper contentEditable={false}>
      <div
        data-drag-handle
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          justifyContent: justify,
          paddingBlock: '2px',
          userSelect: 'none',
          cursor: resizing ? 'ew-resize' : 'default',
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            ref={imgRef}
            src={src}
            alt={alt ?? ''}
            title={title ?? ''}
            draggable={false}
            style={{
              width: width ? `${width}px` : 'auto',
              maxWidth: '100%',
              borderRadius: 6,
              display: 'block',
              outline: selected ? '2px solid var(--accent)' : '2px solid transparent',
              outlineOffset: 2,
            }}
          />
          {/* Right resize handle */}
          <div
            onMouseDown={onResizeStart}
            style={{
              position: 'absolute',
              right: -5,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 10,
              height: 40,
              background: 'var(--accent)',
              borderRadius: 5,
              cursor: 'ew-resize',
              opacity: showHandle ? 0.85 : 0,
              transition: 'opacity 0.15s',
              zIndex: 10,
            }}
          />
        </div>
      </div>
    </NodeViewWrapper>
  )
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setImage: (options: { src: string; alt?: string; title?: string }) => ReturnType
      setImageAlign: (align: 'left' | 'center' | 'right') => ReturnType
    }
  }
}

export const ResizableImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      align: { default: 'left' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (el) => {
          const img = el as HTMLImageElement
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            width: img.getAttribute('data-width') ? parseInt(img.getAttribute('data-width')!, 10) : null,
            align: (img.getAttribute('data-align') as 'left' | 'center' | 'right') ?? 'left',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        ...(HTMLAttributes.width ? { 'data-width': HTMLAttributes.width } : {}),
        ...(HTMLAttributes.align && HTMLAttributes.align !== 'left' ? { 'data-align': HTMLAttributes.align } : {}),
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },

  addCommands() {
    return {
      setImage:
        (options: { src: string; alt?: string; title?: string }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { ...options, width: null, align: 'left' },
          })
        },
      setImageAlign:
        (align: 'left' | 'center' | 'right') =>
        ({ tr, state, dispatch }) => {
          const { selection } = state
          if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
            if (dispatch) {
              tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, align })
              dispatch(tr)
            }
            return true
          }
          return false
        },
    }
  },
})
