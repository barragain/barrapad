'use client'

import { ReactRenderer } from '@tiptap/react'
import Mention from '@tiptap/extension-mention'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import tippy from 'tippy.js'
import type { Instance } from 'tippy.js'
import MentionSuggestion from '@/components/MentionSuggestion'
import type { MentionableUser } from '@/types'

let fetchController: AbortController | null = null

export const UserMention = Mention.extend({ name: 'userMention' }).configure({
  HTMLAttributes: {
    class: 'user-mention',
    'data-type': 'userMention',
  },
  suggestion: {
    char: '@',
    allowSpaces: false,
    // @ts-expect-error — TipTap types don't include null but the runtime supports it for start-of-line
    allowedPrefixes: [' ', '\n', null],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: async ({ query, editor }: { query: string; editor: any }): Promise<MentionableUser[]> => {
      if (!query || query.length < 1) {
        // Fetch collaborators for this note
        const noteId = editor?.storage?.userMention?.noteId as string | undefined
        if (!noteId) return []
        fetchController?.abort()
        fetchController = new AbortController()
        try {
          const res = await fetch(`/api/notes/${noteId}/collaborators`, { signal: fetchController.signal })
          if (!res.ok) return []
          const collabs = await res.json() as Array<{ userId: string; username: string; displayName: string; avatarUrl: string }>
          return collabs.map((c) => ({
            id: c.userId,
            username: c.username,
            displayName: c.displayName || c.username || 'Unknown',
            imageUrl: c.avatarUrl,
            email: '',
          }))
        } catch { return [] }
      }

      fetchController?.abort()
      fetchController = new AbortController()
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { signal: fetchController.signal })
        if (!res.ok) return []
        return (await res.json()) as MentionableUser[]
      } catch { return [] }
    },
    render: () => {
      let component: ReactRenderer<{ onKeyDown: (props: SuggestionKeyDownProps) => boolean }>
      let popup: Instance[]

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(MentionSuggestion, {
            props,
            editor: props.editor,
          })

          if (!props.clientRect) return

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            maxWidth: 320,
            theme: 'mention',
            animation: false,
          })
        },
        onUpdate: (props: SuggestionProps) => {
          component.updateProps(props)
          if (props.clientRect) {
            popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect })
          }
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide()
            return true
          }
          return component.ref?.onKeyDown(props) ?? false
        },
        onExit: () => {
          popup?.[0]?.destroy()
          component?.destroy()
        },
      }
    },
  },
})
