'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Users } from 'lucide-react'
import type { Note, SharedAccessRecord } from '@/types'

export interface PaletteAction {
  label: string
  keywords?: string
  hint?: string
  icon: React.ReactNode
  run: () => void
}

interface Item {
  key: string
  label: string
  detail?: string
  icon: React.ReactNode
  /** Lowercased text the query is matched against. */
  haystack: string
  run: () => void
}

interface Props {
  notes: Note[]
  sharedNotes: SharedAccessRecord[]
  actions: PaletteAction[]
  onSelectNote: (id: string) => void
  onOpenShared: (token: string) => void
  onClose: () => void
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

/** Ctrl+/ palette: jump to any note (by title, tag or text) or run an action. */
export default function CommandPalette({ notes, sharedNotes, actions, onSelectNote, onOpenShared, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const all = useMemo<Item[]>(() => [
    ...notes.filter((n) => !n.sharedToken).map((n) => ({
      key: `n-${n.id}`,
      label: n.title || 'Untitled',
      detail: n.tags.map((t) => `#${t.label}`).join(' '),
      icon: <FileText size={14} />,
      haystack: `${n.title} ${n.tags.map((t) => t.label).join(' ')} ${plain(n.content)}`.toLowerCase(),
      run: () => onSelectNote(n.id),
    })),
    ...sharedNotes.map((r) => ({
      key: `s-${r.token}`,
      label: r.noteTitle || 'Untitled',
      detail: r.ownerName ? `shared by ${r.ownerName}` : 'shared',
      icon: <Users size={14} />,
      haystack: `${r.noteTitle} ${r.ownerName ?? ''} shared`.toLowerCase(),
      run: () => onOpenShared(r.token),
    })),
    ...actions.map((a) => ({
      key: `a-${a.label}`,
      label: a.label,
      detail: a.hint,
      icon: a.icon,
      haystack: `${a.label} ${a.keywords ?? ''}`.toLowerCase(),
      run: a.run,
    })),
  ], [notes, sharedNotes, actions, onSelectNote, onOpenShared])

  const items = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return all.filter((i) => words.every((w) => i.haystack.includes(w))).slice(0, 50)
  }, [all, query])

  useEffect(() => setSelected(0), [query])
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const choose = (item: Item | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[15vh]" style={{ background: 'rgba(0,0,0,0.3)' }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        data-command-palette
        className="w-full max-w-lg overflow-hidden rounded-xl shadow-2xl"
        style={{ background: 'var(--editor-bg)', border: '1px solid var(--border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); choose(items[selected]) }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
          }}
          placeholder="Search notes or type a command"
          aria-label="Search notes or type a command"
          className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b"
          style={{ color: 'var(--ink)', borderColor: 'var(--border)' }}
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 && <div className="px-3 py-2 text-sm" style={{ color: 'var(--muted)' }}>No matches</div>}
          {items.map((item, i) => (
            <button
              key={item.key}
              role="option"
              aria-selected={i === selected}
              onClick={() => choose(item)}
              onMouseMove={() => setSelected(i)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left"
              style={{ background: i === selected ? 'var(--hover)' : 'transparent', color: 'var(--ink)' }}
            >
              <span className="flex-shrink-0" style={{ color: 'var(--muted)' }}>{item.icon}</span>
              <span className="truncate text-sm">{item.label}</span>
              {item.detail && <span className="ml-auto flex-shrink-0 truncate pl-3 text-xs" style={{ color: 'var(--muted)', maxWidth: '45%' }}>{item.detail}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
