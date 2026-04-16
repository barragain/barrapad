'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Tag as TagIcon, Pencil, Trash2, Check } from 'lucide-react'
import type { Tag } from '@/types'

export const TAG_COLORS = [
  '#D4550A', // brand orange
  '#2563EB', // blue
  '#16A34A', // green
  '#DC2626', // red
  '#9333EA', // purple
  '#CA8A04', // amber
  '#0891B2', // cyan
  '#64748B', // slate
  '#E11D48', // rose
  '#7C3AED', // violet
  '#059669', // emerald
  '#D97706', // orange
  '#4F46E5', // indigo
  '#0D9488', // teal
  '#BE185D', // pink
  '#334155', // dark slate
]

interface TagInputProps {
  tags: Tag[]
  allTags: Tag[]
  onChange: (tags: Tag[]) => void
  readOnly?: boolean
}

export default function TagInput({ tags, allTags, onChange, readOnly = false }: TagInputProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0])
  const [customColor, setCustomColor] = useState('')
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [tagContextMenu, setTagContextMenu] = useState<{ tag: Tag; x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tagCtxRef = useRef<HTMLDivElement>(null)

  const existingLabels = new Set(tags.map(t => t.label.toLowerCase()))

  const suggestions = (() => {
    const seen = new Set<string>()
    return allTags.filter(t => {
      const key = t.label.toLowerCase()
      if (existingLabels.has(key)) return false
      if (input && !key.includes(input.toLowerCase())) return false
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 5)
  })()

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (editingTag) editInputRef.current?.focus()
  }, [editingTag])

  useEffect(() => {
    if (!open && !tagContextMenu) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setInput('')
        setEditingTag(null)
      }
      if (tagCtxRef.current && !tagCtxRef.current.contains(e.target as Node)) {
        setTagContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, tagContextMenu])

  useEffect(() => {
    const handler = () => { if (!readOnly) setOpen(true) }
    window.addEventListener('barrapad:focus-tags', handler)
    return () => window.removeEventListener('barrapad:focus-tags', handler)
  }, [readOnly])

  const effectiveColor = customColor || selectedColor

  const addTag = (label: string, color: string) => {
    const trimmed = label.trim()
    if (!trimmed || existingLabels.has(trimmed.toLowerCase())) return
    onChange([...tags, { id: crypto.randomUUID(), label: trimmed, color }])
    setInput('')
    setCustomColor('')
  }

  const removeTag = (id: string) => {
    onChange(tags.filter(t => t.id !== id))
    setTagContextMenu(null)
  }

  const startEditTag = (tag: Tag) => {
    setEditingTag(tag)
    setEditName(tag.label)
    setEditColor(tag.color)
    setTagContextMenu(null)
    setOpen(true)
  }

  const saveEditTag = () => {
    if (!editingTag || !editName.trim()) return
    onChange(tags.map(t =>
      t.id === editingTag.id
        ? { ...t, label: editName.trim(), color: editColor }
        : t
    ))
    setEditingTag(null)
    setEditName('')
    setEditColor('')
  }

  const handleTagContextMenu = (e: React.MouseEvent, tag: Tag) => {
    e.preventDefault()
    e.stopPropagation()
    setTagContextMenu({ tag, x: e.clientX, y: e.clientY })
  }

  if (readOnly && tags.length === 0) return null

  return (
    <div ref={containerRef} className="barrapad-tag-row">
      {tags.map(tag => (
        <span
          key={tag.id}
          className="barrapad-tag-pill"
          style={{ background: tag.color, color: '#fff', border: 'none', cursor: readOnly ? 'default' : 'context-menu' }}
          onContextMenu={readOnly ? undefined : (e) => handleTagContextMenu(e, tag)}
        >
          {tag.label}
          {!readOnly && (
            <button
              className="barrapad-tag-remove"
              onPointerDown={e => { e.preventDefault(); removeTag(tag.id) }}
              title="Remove tag"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          )}
        </span>
      ))}

      {/* Tag right-click context menu */}
      {tagContextMenu && (
        <div
          ref={tagCtxRef}
          style={{
            position: 'fixed',
            left: tagContextMenu.x,
            top: tagContextMenu.y,
            zIndex: 100,
            background: 'var(--editor-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: 4,
            minWidth: 140,
          }}
        >
          <button
            onClick={() => startEditTag(tagContextMenu.tag)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent',
              fontSize: 12, color: 'var(--ink)', cursor: 'pointer', textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Pencil size={12} /> Edit tag
          </button>
          <button
            onClick={() => removeTag(tagContextMenu.tag.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent',
              fontSize: 12, color: '#DC2626', cursor: 'pointer', textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Trash2 size={12} /> Delete tag
          </button>
        </div>
      )}

      {!readOnly && (
        <div style={{ position: 'relative' }}>
          <button className="barrapad-tag-add" onClick={() => { setOpen(v => !v); setEditingTag(null) }} title="Add tag">
            <TagIcon size={11} />
            <span>Add tag</span>
          </button>

          {open && (
            <div className="barrapad-tag-popover">
              {/* Edit mode */}
              {editingTag ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Edit tag</div>
                  <input
                    ref={editInputRef}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEditTag()
                      if (e.key === 'Escape') { setEditingTag(null) }
                      e.stopPropagation()
                    }}
                    placeholder="Tag name…"
                    className="barrapad-tag-input"
                  />
                  <div className="barrapad-tag-colors">
                    {TAG_COLORS.map(color => (
                      <button
                        key={color}
                        className="barrapad-tag-color-swatch"
                        style={{
                          background: color,
                          boxShadow: editColor === color
                            ? `0 0 0 2px var(--editor-bg), 0 0 0 3.5px ${color}`
                            : 'none',
                        }}
                        onPointerDown={e => { e.preventDefault(); setEditColor(color) }}
                      />
                    ))}
                  </div>
                  {/* Custom color input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <input
                      type="color"
                      value={editColor}
                      onChange={e => setEditColor(e.target.value)}
                      style={{ width: 22, height: 22, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4 }}
                      title="Custom color"
                    />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>Custom</span>
                  </div>
                  <button
                    onPointerDown={e => { e.preventDefault(); saveEditTag() }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      width: '100%', marginTop: 8, padding: '6px 0', borderRadius: 7,
                      border: '1px solid var(--border)', background: editColor, color: '#fff',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Check size={12} /> Save
                  </button>
                </>
              ) : (
                <>
                  {/* Create mode */}
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && input.trim()) { addTag(input, effectiveColor); if (!suggestions.length) setOpen(false) }
                      if (e.key === 'Escape') { setOpen(false); setInput('') }
                      e.stopPropagation()
                    }}
                    placeholder="Tag name…"
                    className="barrapad-tag-input"
                  />
                  <div className="barrapad-tag-colors">
                    {TAG_COLORS.map(color => (
                      <button
                        key={color}
                        className="barrapad-tag-color-swatch"
                        style={{
                          background: color,
                          boxShadow: (customColor ? false : selectedColor === color)
                            ? `0 0 0 2px var(--editor-bg), 0 0 0 3.5px ${color}`
                            : 'none',
                        }}
                        onPointerDown={e => { e.preventDefault(); setSelectedColor(color); setCustomColor('') }}
                      />
                    ))}
                  </div>
                  {/* Custom color picker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <input
                      type="color"
                      value={customColor || selectedColor}
                      onChange={e => setCustomColor(e.target.value)}
                      style={{
                        width: 22, height: 22, border: customColor ? '2px solid var(--ink)' : 'none',
                        padding: 0, cursor: 'pointer', borderRadius: 4,
                      }}
                      title="Custom color"
                    />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>Custom</span>
                  </div>

                  {/* Current tags on this note — edit/delete inline */}
                  {tags.length > 0 && !input && (
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Current tags</div>
                      {tags.map(tag => (
                        <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag.label}</span>
                          <button
                            onPointerDown={e => { e.preventDefault(); startEditTag(tag) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--muted)', display: 'flex' }}
                            title="Edit"
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            onPointerDown={e => { e.preventDefault(); removeTag(tag.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#DC2626', display: 'flex' }}
                            title="Delete"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {suggestions.length > 0 && (
                    <div className="barrapad-tag-suggestions">
                      {suggestions.map(tag => (
                        <button
                          key={tag.label}
                          className="barrapad-tag-suggestion"
                          onPointerDown={e => { e.preventDefault(); addTag(tag.label, tag.color); setOpen(false) }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0, display: 'inline-block' }} />
                          {tag.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {input.trim() && !suggestions.some(t => t.label.toLowerCase() === input.trim().toLowerCase()) && (
                    <button
                      className="barrapad-tag-create"
                      onPointerDown={e => { e.preventDefault(); addTag(input, effectiveColor); setOpen(false) }}
                    >
                      Create &ldquo;<strong>{input.trim()}</strong>&rdquo;
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
