'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { SuggestionKeyDownProps } from '@tiptap/suggestion'
import {
  Type, Heading1, Heading2, Heading3, Quote, List, ListOrdered, CheckSquare, Code2,
  SeparatorHorizontal, Table, ImageIcon, Paperclip, BarChart2, Superscript,
} from 'lucide-react'
import { uploadImage, uploadFile } from '@/lib/upload-image'
import { TEXT_STYLES } from './toolbar/helpers'

export interface SlashItem {
  label: string
  /** Extra words the filter matches, e.g. "h1" for Heading 1. */
  keywords: string
  icon: React.ReactNode
  run: (editor: Editor) => void
}

// Open the system file picker and hand back the chosen file.
function pickFile(accept: string, then: (file: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => { const f = input.files?.[0]; if (f) then(f) }
  input.click()
}

const style = (label: string) => TEXT_STYLES.find((s) => s.label === label)!.action

export const SLASH_ITEMS: SlashItem[] = [
  { label: 'Text', keywords: 'normal paragraph plain', icon: <Type size={14} />, run: style('Normal Text') },
  { label: 'Heading 1', keywords: 'h1 title big', icon: <Heading1 size={14} />, run: style('Heading 1') },
  { label: 'Heading 2', keywords: 'h2 subtitle', icon: <Heading2 size={14} />, run: style('Heading 2') },
  { label: 'Heading 3', keywords: 'h3', icon: <Heading3 size={14} />, run: style('Heading 3') },
  { label: 'Bullet list', keywords: 'ul unordered', icon: <List size={14} />, run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', keywords: 'ol ordered', icon: <ListOrdered size={14} />, run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Checklist', keywords: 'todo task checkbox', icon: <CheckSquare size={14} />, run: (e) => e.chain().focus().toggleTaskList().run() },
  { label: 'Quote', keywords: 'blockquote', icon: <Quote size={14} />, run: style('Quote') },
  { label: 'Code block', keywords: 'code snippet', icon: <Code2 size={14} />, run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { label: 'Divider', keywords: 'hr rule line separator', icon: <SeparatorHorizontal size={14} />, run: (e) => e.chain().focus().setHorizontalRule().run() },
  { label: 'Table', keywords: 'grid', icon: <Table size={14} />, run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: 'Image', keywords: 'picture photo upload', icon: <ImageIcon size={14} />, run: (e) => pickFile('image/*', (f) => uploadImage(f).then((src) => e.chain().focus().setImage({ src }).run())) },
  { label: 'File', keywords: 'attachment upload', icon: <Paperclip size={14} />, run: (e) => pickFile('', (f) => uploadFile(f).then((dataUrl) => e.chain().focus().insertFileAttachment({ name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream', dataUrl }).run())) },
  { label: 'Poll', keywords: 'vote survey', icon: <BarChart2 size={14} />, run: (e) => e.chain().focus().insertContent({ type: 'poll' }).run() },
  { label: 'Footnote', keywords: 'note reference', icon: <Superscript size={14} />, run: (e) => e.chain().focus().insertContent({ type: 'footnote' }).run() },
]

export function filterSlashItems(query: string) {
  const q = query.toLowerCase().trim()
  return SLASH_ITEMS.filter((i) => `${i.label} ${i.keywords}`.toLowerCase().includes(q))
}

interface Props {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

const SlashMenu = forwardRef<{ onKeyDown: (props: SuggestionKeyDownProps) => boolean }, Props>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => setSelectedIndex(0), [items])
    useEffect(() => {
      listRef.current?.children[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (!items.length) return false
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length)
          return true
        }
        if (event.key === 'Enter') {
          const item = items[selectedIndex]
          if (item) command(item)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="mention-suggestion-list">
          <div className="mention-suggestion-empty">No matches</div>
        </div>
      )
    }

    return (
      <div className="mention-suggestion-list" ref={listRef} data-slash-menu>
        {items.map((item, index) => (
          <button
            key={item.label}
            className={`mention-suggestion-item${index === selectedIndex ? ' is-selected' : ''}`}
            onClick={() => command(item)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', color: 'var(--ink-soft)', flexShrink: 0 }}>
              {item.icon}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink)' }}>{item.label}</span>
          </button>
        ))}
      </div>
    )
  }
)

SlashMenu.displayName = 'SlashMenu'
export default SlashMenu
