'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Tag as TagIcon } from 'lucide-react'
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
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setInput('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    const handler = () => { if (!readOnly) setOpen(true) }
    window.addEventListener('barrapad:focus-tags', handler)
    return () => window.removeEventListener('barrapad:focus-tags', handler)
  }, [readOnly])

  const addTag = (label: string, color: string) => {
    const trimmed = label.trim()
    if (!trimmed || existingLabels.has(trimmed.toLowerCase())) return
    onChange([...tags, { id: crypto.randomUUID(), label: trimmed, color }])
    setInput('')
  }

  const removeTag = (id: string) => onChange(tags.filter(t => t.id !== id))

  if (readOnly && tags.length === 0) return null

  return (
    <div ref={containerRef} className="barrapad-tag-row">
      {tags.map(tag => (
        <span
          key={tag.id}
          className="barrapad-tag-pill"
          style={{ background: tag.color + '18', color: tag.color, border: `1px solid ${tag.color}40` }}
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

      {!readOnly && (
        <div style={{ position: 'relative' }}>
          <button className="barrapad-tag-add" onClick={() => setOpen(v => !v)} title="Add tag">
            <TagIcon size={11} />
            <span>Add tag</span>
          </button>

          {open && (
            <div className="barrapad-tag-popover">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && input.trim()) { addTag(input, selectedColor); if (!suggestions.length) setOpen(false) }
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
                      boxShadow: selectedColor === color
                        ? `0 0 0 2px var(--editor-bg), 0 0 0 3.5px ${color}`
                        : 'none',
                    }}
                    onPointerDown={e => { e.preventDefault(); setSelectedColor(color) }}
                  />
                ))}
              </div>

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
                  onPointerDown={e => { e.preventDefault(); addTag(input, selectedColor); setOpen(false) }}
                >
                  Create &ldquo;<strong>{input.trim()}</strong>&rdquo;
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
