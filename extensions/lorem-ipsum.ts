'use client'

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

const LOREM_PARAGRAPHS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante.',
]

let loremIndex = 0

const hintPluginKey = new PluginKey('loremIpsumHint')

export const LoremIpsum = Extension.create({
  name: 'loremIpsum',

  addKeyboardShortcuts() {
    return {
      'Shift-Tab': () => {
        // Lift list/task items first — supports repeated presses at every nesting level
        if (this.editor.can().liftListItem('listItem')) {
          return this.editor.commands.liftListItem('listItem')
        }
        if (this.editor.can().liftListItem('taskItem')) {
          return this.editor.commands.liftListItem('taskItem')
        }

        const { state, dispatch } = this.editor.view
        const { selection } = state
        const $from = selection.$from

        // Only insert lorem ipsum in paragraphs; for other node types just consume
        // the event so focus never jumps out of the editor
        if ($from.parent.type.name !== 'paragraph') {
          return true
        }

        const text = LOREM_PARAGRAPHS[loremIndex % LOREM_PARAGRAPHS.length]
        loremIndex++
        if (!selection.empty) {
          dispatch(state.tr.replaceSelectionWith(state.schema.text(text)))
        } else {
          dispatch(state.tr.insertText(text, selection.from))
        }
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: hintPluginKey,
        props: {
          decorations(state) {
            const { selection } = state
            if (!selection.empty) return DecorationSet.empty

            const $from = selection.$from
            // Only show hint on a completely empty paragraph (new line with no text)
            if ($from.parent.type.name !== 'paragraph' || $from.parent.textContent !== '') {
              return DecorationSet.empty
            }

            // Don't show hint on a completely empty doc — the placeholder is showing there
            if (state.doc.textContent === '') return DecorationSet.empty

            const widget = Decoration.widget(
              selection.from,
              () => {
                const el = document.createElement('span')
                el.textContent = 'shift+tab · lorem ipsum'
                el.setAttribute('aria-hidden', 'true')
                el.style.cssText = [
                  'color: #C0BAB2',
                  'font-style: italic',
                  'font-size: 0.9em',
                  'pointer-events: none',
                  'user-select: none',
                  'white-space: nowrap',
                  'padding-left: 6px',
                ].join('; ')
                return el
              },
              { side: 1, key: 'lorem-hint' }
            )

            return DecorationSet.create(state.doc, [widget])
          },
        },
      }),
    ]
  },
})
