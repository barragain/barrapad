'use client'

import { ReactRenderer } from '@tiptap/react'
import Mention from '@tiptap/extension-mention'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import tippy from 'tippy.js'
import type { Instance } from 'tippy.js'
import NoteMentionSuggestion from '@/components/NoteMentionSuggestion'
import type { MentionableNote } from '@/types'

let fetchController: AbortController | null = null

export const NoteMention = Mention.extend({ name: 'noteMention' }).configure({
  HTMLAttributes: {
    class: 'note-mention',
    'data-type': 'noteMention',
  },
  suggestion: {
    char: '#',
    allowSpaces: true,
    // @ts-expect-error — TipTap types don't include null but the runtime supports it for start-of-line
    allowedPrefixes: [' ', '\n', null],
    items: async ({ query }: { query: string }): Promise<MentionableNote[]> => {
      fetchController?.abort()
      fetchController = new AbortController()
      try {
        const res = await fetch(`/api/notes/mentionable?q=${encodeURIComponent(query)}`, { signal: fetchController.signal })
        if (!res.ok) return []
        return (await res.json()) as MentionableNote[]
      } catch { return [] }
    },
    render: () => {
      let component: ReactRenderer<{ onKeyDown: (props: SuggestionKeyDownProps) => boolean }>
      let popup: Instance[]

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(NoteMentionSuggestion, {
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
