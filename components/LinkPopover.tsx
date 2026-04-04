'use client'

import { useState, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'

interface LinkPopoverProps {
  editor: Editor
  onClose: () => void
  /** Screen coordinates to anchor the popover (fixed positioning). */
  pos?: { left: number; top: number } | null
}

export default function LinkPopover({ editor, onClose, pos }: LinkPopoverProps) {
  const existingHref = (editor.getAttributes('link').href as string) ?? ''
  const [url, setUrl] = useState(existingHref)
  const [openNewTab, setOpenNewTab] = useState(
    (editor.getAttributes('link').target as string) === '_blank'
  )
  const hasLink = editor.isActive('link')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose])

  const handleApply = () => {
    if (!url.trim()) return
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url.trim(), target: openNewTab ? '_blank' : null })
      .run()
    onClose()
  }

  const handleRemove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleApply()
    // Prevent Tab/Shift+Tab from moving focus outside the popover
    if (e.key === 'Tab') e.preventDefault()
  }

  // Use fixed positioning when coordinates are provided (floating near selection)
  const positionStyle = pos
    ? {
        position: 'fixed' as const,
        top: Math.min(pos.top, window.innerHeight - 160),
        left: Math.min(pos.left, window.innerWidth - 296),
      }
    : {
        position: 'absolute' as const,
        top: '100%',
        left: 0,
        marginTop: 4,
      }

  return (
    <div
      ref={containerRef}
      style={{
        ...positionStyle,
        zIndex: 9999,
        background: '#fff',
        border: '1px solid #E5E0D8',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: 280,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#C4BFB6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {hasLink ? 'Edit link' : 'Add link'}
      </div>

      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="https://example.com"
        style={{
          width: '100%',
          padding: '7px 10px',
          fontSize: 13,
          border: '1px solid #E5E0D8',
          borderRadius: 8,
          outline: 'none',
          color: '#1A1A1A',
          background: '#F9F7F4',
          boxSizing: 'border-box',
        }}
      />

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#6b6b6b',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input
          type="checkbox"
          checked={openNewTab}
          onChange={(e) => setOpenNewTab(e.target.checked)}
          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#D4550A' }}
        />
        Open in new tab
      </label>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleApply}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: 12,
            fontWeight: 600,
            background: '#D4550A',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#B84208' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#D4550A' }}
        >
          Apply
        </button>
        {hasLink && (
          <button
            onClick={handleRemove}
            style={{
              flex: 1,
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 600,
              background: '#F5F0E8',
              color: '#6b6b6b',
              border: '1px solid #E5E0D8',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#EDE8DF' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F5F0E8' }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
