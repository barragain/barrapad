import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node } from '@tiptap/pm/model'
import { isCorrectSync } from '@/utils/spellcheck'

export const SPELL_KEY = new PluginKey<DecorationSet>('spellcheck')

const WORD_RE = /[a-zA-Z']+/g

const ALLOWED_PARENTS = new Set([
  'paragraph', 'heading', 'listItem', 'taskItem', 'blockquote',
])

function buildDecorations(doc: Node): DecorationSet {
  const decos: Decoration[] = []

  doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text) return
    // Only check words inside prose-like nodes
    if (!parent || !ALLOWED_PARENTS.has(parent.type.name)) return
    // Skip inline code
    if (node.marks.some(m => m.type.name === 'code')) return

    const text = node.text
    WORD_RE.lastIndex = 0
    let m: RegExpExecArray | null

    while ((m = WORD_RE.exec(text)) !== null) {
      const word = m[0]
      if (word.length < 2) continue
      // Skip ALL-CAPS (acronyms like USA, NASA)
      if (word === word.toUpperCase()) continue

      const correct = isCorrectSync(word)
      if (correct === false) {
        decos.push(
          Decoration.inline(pos + m.index, pos + m.index + word.length, {
            class: 'spell-error',
          })
        )
      }
    }
  })

  return DecorationSet.create(doc, decos)
}

export const SpellCheck = Extension.create({
  name: 'spellcheck',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SPELL_KEY,
        state: {
          init(_, { doc }) {
            return buildDecorations(doc)
          },
          apply(tr, old) {
            // Re-compute on document change OR when a refresh is requested
            // (e.g. after the nspell dictionary finishes loading)
            if (!tr.docChanged && !tr.getMeta(SPELL_KEY)) return old
            return buildDecorations(tr.doc)
          },
        },
        props: {
          decorations(state) {
            return SPELL_KEY.getState(state)
          },
        },
      }),
    ]
  },
})
