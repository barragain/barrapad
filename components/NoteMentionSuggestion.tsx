'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { FileText } from 'lucide-react'
import type { MentionableNote } from '@/types'
import type { SuggestionKeyDownProps } from '@tiptap/suggestion'

interface Props {
  items: MentionableNote[]
  command: (item: { id: string; label: string }) => void
}

const NoteMentionSuggestion = forwardRef<{ onKeyDown: (props: SuggestionKeyDownProps) => boolean }, Props>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => setSelectedIndex(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
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
          if (item) command({ id: item.id, label: item.title })
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="mention-suggestion-list">
          <div className="mention-suggestion-empty">No notes found</div>
        </div>
      )
    }

    return (
      <div className="mention-suggestion-list">
        {items.map((item, index) => (
          <button
            key={item.id}
            className={`mention-suggestion-item${index === selectedIndex ? ' is-selected' : ''}`}
            onClick={() => command({ id: item.id, label: item.title })}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="mention-suggestion-note-icon">
              <FileText size={14} />
            </div>
            <div className="mention-suggestion-info">
              <span className="mention-suggestion-name">{item.title}</span>
              <span className="mention-suggestion-username">
                {item.isOwner ? 'My note' : `by ${item.ownerName}`}
              </span>
            </div>
          </button>
        ))}
      </div>
    )
  }
)

NoteMentionSuggestion.displayName = 'NoteMentionSuggestion'
export default NoteMentionSuggestion
