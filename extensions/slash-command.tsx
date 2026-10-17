'use client'

import { Extension, ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import tippy from 'tippy.js'
import type { Instance } from 'tippy.js'
import SlashMenu, { filterSlashItems } from '@/components/SlashMenu'
import type { SlashItem } from '@/components/SlashMenu'

/** "/" at the start of a line or after a space opens a menu of blocks to insert. */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        // Not inside code, where "/" is just a character.
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run()
          props.run(editor)
        },
        render: () => {
          let component: ReactRenderer<{ onKeyDown: (props: SuggestionKeyDownProps) => boolean }>
          let popup: Instance[]

          return {
            onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
              component = new ReactRenderer(SlashMenu, { props, editor: props.editor })
              if (!props.clientRect) return
              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                maxWidth: 260,
                theme: 'mention',
                animation: false,
              })
            },
            onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
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
      }),
    ]
  },
})
