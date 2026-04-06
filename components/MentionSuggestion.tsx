'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { MentionableUser } from '@/types'
import type { SuggestionKeyDownProps } from '@tiptap/suggestion'

interface Props {
  items: MentionableUser[]
  command: (item: { id: string; label: string }) => void
}

const MentionSuggestion = forwardRef<{ onKeyDown: (props: SuggestionKeyDownProps) => boolean }, Props>(
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
          if (item) {
            window.dispatchEvent(new CustomEvent('barrapad:mention-inserted', { detail: { userId: item.id, displayName: item.displayName } }))
            command({ id: item.id, label: item.displayName })
          }
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="mention-suggestion-list">
          <div className="mention-suggestion-empty">No users found</div>
        </div>
      )
    }

    return (
      <div className="mention-suggestion-list">
        {items.map((item, index) => (
          <button
            key={item.id}
            className={`mention-suggestion-item${index === selectedIndex ? ' is-selected' : ''}`}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('barrapad:mention-inserted', { detail: { userId: item.id, displayName: item.displayName } }))
              command({ id: item.id, label: item.displayName })
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="mention-suggestion-avatar" />
            ) : (
              <div className="mention-suggestion-avatar-placeholder">
                {item.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="mention-suggestion-info">
              <span className="mention-suggestion-name">{item.displayName}</span>
              {item.username && (
                <span className="mention-suggestion-username">@{item.username}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    )
  }
)

MentionSuggestion.displayName = 'MentionSuggestion'
export default MentionSuggestion
