'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { NodeSelection } from '@tiptap/pm/state'

function ResizableImageView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const { src, alt, title, width, align } = node.attrs as {
    src: string
    alt?: string
    title?: string
    width?: number
    align: 'left' | 'center' | 'right'
  }

  const [resizing, setResizing] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false) // for animation
  const [editingCaption, setEditingCaption] = useState(false)
  const [editingAlt, setEditingAlt] = useState(false)
  const [captionValue, setCaptionValue] = useState(title ?? '')
  const [altValue, setAltValue] = useState(alt ?? '')
  const [btnHover, setBtnHover] = useState(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const imgRef = useRef<HTMLImageElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const captionRef = useRef<HTMLInputElement>(null)

  // Menu open/close with animation
  const openMenu = useCallback(() => {
    setMenuOpen(true)
    requestAnimationFrame(() => setMenuVisible(true))
  }, [])

  const closeMenu = useCallback(() => {
    setMenuVisible(false)
    setTimeout(() => setMenuOpen(false), 150)
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen, closeMenu])

  // Sync caption/alt when node attrs change externally
  useEffect(() => { setCaptionValue(title ?? '') }, [title])
  useEffect(() => { setAltValue(alt ?? '') }, [alt])

  // Auto-focus caption input when it appears
  useEffect(() => {
    if (editingCaption && captionRef.current) {
      captionRef.current.focus()
    }
  }, [editingCaption])

  // Custom drag image
  useEffect(() => {
    const handler = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      const nodeEl = target?.closest<HTMLElement>('[data-image-view]')
      if (!nodeEl) return
      const label = (nodeEl.dataset.imageLabel ?? 'Image')
      const ghost = document.createElement('div')
      ghost.textContent = label.length > 28 ? label.slice(0, 28) + '…' : label
      ghost.style.cssText = [
        'position:fixed', 'top:0', 'left:-9999px',
        'background:#D4550A', 'color:white',
        'font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'padding:5px 10px', 'border-radius:99px',
        'white-space:nowrap', 'pointer-events:none',
        'box-shadow:0 2px 8px rgba(212,85,10,0.35)',
      ].join(';')
      document.body.appendChild(ghost)
      e.dataTransfer?.setDragImage(ghost, 0, Math.max(ghost.offsetHeight / 2, 8))
      setTimeout(() => ghost.remove(), 0)
    }
    document.addEventListener('dragstart', handler)
    return () => document.removeEventListener('dragstart', handler)
  }, [])

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

  const handleReplace = useCallback(() => {
    replaceInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => updateAttributes({ src: reader.result as string })
    reader.readAsDataURL(file)
    e.target.value = ''
    closeMenu()
  }, [updateAttributes, closeMenu])

  const handleDelete = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos !== undefined) {
      editor.chain().focus().setNodeSelection(pos).deleteSelection().run()
    }
  }, [editor, getPos])

  const handleDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = src
    a.download = alt || title || 'image'
    a.click()
    closeMenu()
  }, [src, alt, title, closeMenu])

  const handleSetAlign = useCallback((newAlign: 'left' | 'center' | 'right') => {
    // Use editor transaction directly since updateAttributes can be swallowed
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos !== undefined) {
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, align: newAlign })
      editor.view.dispatch(tr)
    }
    closeMenu()
  }, [editor, getPos, node.attrs, closeMenu])

  const handleSetWidth = useCallback((mode: 'wide' | 'full' | 'reset') => {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos === undefined) return
    const newAttrs = { ...node.attrs }
    if (mode === 'full') {
      newAttrs.width = null
      newAttrs.align = 'center'
    } else if (mode === 'wide') {
      newAttrs.width = 700
    } else {
      newAttrs.width = null
    }
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, newAttrs)
    editor.view.dispatch(tr)
    closeMenu()
  }, [editor, getPos, node.attrs, closeMenu])

  const saveCaption = useCallback(() => {
    const val = captionValue.trim() || null
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos !== undefined) {
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, title: val })
      editor.view.dispatch(tr)
    }
    setEditingCaption(false)
  }, [captionValue, editor, getPos, node.attrs])

  const saveAlt = useCallback(() => {
    const val = altValue.trim() || null
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos !== undefined) {
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: val })
      editor.view.dispatch(tr)
    }
    setEditingAlt(false)
    closeMenu()
  }, [altValue, editor, getPos, node.attrs, closeMenu])

  const startCaption = useCallback(() => {
    closeMenu()
    // Small delay so the menu closes first
    setTimeout(() => setEditingCaption(true), 160)
  }, [closeMenu])

  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
  const showHandle = selected || hovered || resizing
  const isFullWidth = !width && align === 'center'

  return (
    <NodeViewWrapper contentEditable={false}>
      <div
        data-drag-handle
        data-image-view
        data-image-label={alt || title || 'Image'}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          justifyContent: justify,
          paddingBlock: '2px',
          userSelect: 'none',
          cursor: resizing ? 'ew-resize' : 'grab',
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img
            ref={imgRef}
            src={src}
            alt={alt ?? ''}
            title={title ?? ''}
            draggable={false}
            style={{
              width: isFullWidth ? '100%' : width ? `${width}px` : 'auto',
              maxWidth: '100%',
              borderRadius: 6,
              display: 'block',
              outline: selected ? '2px solid var(--accent)' : '2px solid transparent',
              outlineOffset: 2,
            }}
          />

          {/* ⋯ Menu button — top right, with hover animation */}
          <button
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={(e) => { e.stopPropagation(); menuOpen ? closeMenu() : openMenu() }}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: btnHover ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              backdropFilter: 'blur(4px)',
              opacity: (showHandle || menuOpen) ? 1 : 0,
              transform: btnHover ? 'scale(1.1)' : 'scale(1)',
              transition: 'opacity 0.2s, transform 0.15s ease, background 0.15s',
              zIndex: 20,
              pointerEvents: (showHandle || menuOpen) ? 'auto' : 'none',
            }}
            title="Image options"
          >
            ⋯
          </button>

          {/* Dropdown menu with animation */}
          {menuOpen && (
            <div
              ref={menuRef}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              style={{
                position: 'absolute',
                top: 42,
                right: 8,
                width: 200,
                background: '#fff',
                borderRadius: 10,
                boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
                border: '1px solid var(--border)',
                zIndex: 30,
                overflow: 'hidden',
                paddingBlock: 4,
                opacity: menuVisible ? 1 : 0,
                transform: menuVisible ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.96)',
                transformOrigin: 'top right',
                transition: 'opacity 0.15s ease, transform 0.15s ease',
              }}
            >
              {/* Replace image */}
              <MenuButton onClick={handleReplace}>
                Replace image
              </MenuButton>

              <MenuSeparator />

              {/* Caption — opens inline below image */}
              <MenuButton onClick={startCaption}>
                {title ? 'Edit caption' : 'Add caption'}
              </MenuButton>

              {/* Edit alt text — inline in menu */}
              {editingAlt ? (
                <div style={{ padding: '6px 14px' }}>
                  <input
                    autoFocus
                    value={altValue}
                    onChange={(e) => setAltValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveAlt(); if (e.key === 'Escape') { setEditingAlt(false) } }}
                    onBlur={saveAlt}
                    placeholder="Describe the image…"
                    style={{
                      width: '100%',
                      border: '1px solid var(--border)',
                      borderRadius: 5,
                      padding: '4px 8px',
                      fontSize: 13,
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              ) : (
                <MenuButton onClick={() => setEditingAlt(true)}>
                  {alt ? 'Edit alt text' : 'Add alt text'}
                </MenuButton>
              )}

              <MenuSeparator />

              {/* Alignment */}
              <div style={{ padding: '4px 14px 2px', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Alignment
              </div>
              <div style={{ display: 'flex', gap: 2, padding: '2px 10px 6px' }}>
                <AlignButton active={align === 'left'} onClick={() => handleSetAlign('left')} title="Left">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="10" height="2" rx="0.5"/><rect x="1" y="7" width="14" height="2" rx="0.5"/><rect x="1" y="11" width="10" height="2" rx="0.5"/></svg>
                </AlignButton>
                <AlignButton active={align === 'center'} onClick={() => handleSetAlign('center')} title="Center">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="2" rx="0.5"/><rect x="1" y="7" width="14" height="2" rx="0.5"/><rect x="3" y="11" width="10" height="2" rx="0.5"/></svg>
                </AlignButton>
                <AlignButton active={align === 'right'} onClick={() => handleSetAlign('right')} title="Right">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="5" y="3" width="10" height="2" rx="0.5"/><rect x="1" y="7" width="14" height="2" rx="0.5"/><rect x="5" y="11" width="10" height="2" rx="0.5"/></svg>
                </AlignButton>
              </div>

              <MenuSeparator />

              {/* Width options */}
              <MenuButton onClick={() => handleSetWidth('wide')} active={width === 700}>
                Wide width
              </MenuButton>
              <MenuButton onClick={() => handleSetWidth('full')} active={isFullWidth}>
                Full width
              </MenuButton>
              <MenuButton onClick={() => handleSetWidth('reset')}>
                Reset size
              </MenuButton>

              <MenuSeparator />

              {/* Download */}
              <MenuButton onClick={handleDownload}>
                Download image
              </MenuButton>

              {/* Delete */}
              <MenuButton onClick={handleDelete} danger>
                Delete image
              </MenuButton>
            </div>
          )}

          {/* Hidden file input for replace */}
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
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

      {/* Caption below image — inline editable, outside the image container */}
      {(editingCaption || title) && (
        <div style={{
          display: 'flex',
          justifyContent: justify,
          marginTop: 4,
          marginBottom: 2,
        }}>
          {editingCaption ? (
            <input
              ref={captionRef}
              value={captionValue}
              onChange={(e) => setCaptionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCaption()
                if (e.key === 'Escape') { setCaptionValue(title ?? ''); setEditingCaption(false) }
              }}
              onBlur={saveCaption}
              placeholder="Type a caption…"
              style={{
                border: 'none',
                borderBottom: '1.5px solid var(--accent)',
                background: 'transparent',
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--ink)',
                fontStyle: 'italic',
                fontFamily: 'inherit',
                outline: 'none',
                padding: '2px 8px 4px',
                minWidth: 180,
                maxWidth: '80%',
                lineHeight: 1.5,
              }}
            />
          ) : (
            <div
              onClick={() => setEditingCaption(true)}
              style={{
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--muted)',
                fontStyle: 'italic',
                lineHeight: 1.4,
                cursor: 'text',
                padding: '2px 8px',
              }}
            >
              {title}
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  )
}

/* ── Tiny helper components for the menu ──────────────────────────── */

function MenuButton({ children, onClick, danger, active }: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
  active?: boolean
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 14px',
        border: 'none',
        background: hover ? 'var(--sidebar)' : 'transparent',
        color: danger ? '#dc2626' : active ? 'var(--accent)' : 'var(--ink)',
        fontSize: 14,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontWeight: active ? 600 : 400,
        lineHeight: 1.3,
        transition: 'background 0.1s',
      }}
    >
      {children}
    </button>
  )
}

function MenuSeparator() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '4px 10px' }} />
}

function AlignButton({ children, onClick, active, title }: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
  title: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{
        width: 32,
        height: 28,
        border: '1px solid',
        borderColor: active ? 'var(--accent)' : hover ? 'var(--muted)' : 'var(--border)',
        borderRadius: 5,
        background: active ? 'rgba(212,85,10,0.08)' : hover ? 'rgba(0,0,0,0.03)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--muted)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.12s ease',
      }}
    >
      {children}
    </button>
  )
}

/* ── TipTap node definition ───────────────────────────────────────── */

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
    return ReactNodeViewRenderer(ResizableImageView, {
      attrs: { style: 'display: inline-block' },
    })
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
