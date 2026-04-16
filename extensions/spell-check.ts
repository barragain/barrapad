import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const SPELL_KEY = new PluginKey('spellcheck')

/**
 * Re-triggers the browser's native spellcheck after ProseMirror rebuilds DOM.
 *
 * Problem: when ProseMirror applies a transaction (user correction, remote sync,
 * any content change), it may recreate DOM nodes. The browser's native spellcheck
 * underlines are tied to specific DOM nodes, so they vanish when nodes are replaced.
 *
 * Fix: after every document change, briefly toggle the `spellcheck` attribute
 * off → on. This forces the browser to re-analyze all text and re-add underlines.
 * The toggle happens across two animation frames (~32ms) — imperceptible to users.
 */
export const SpellCheck = Extension.create({
  name: 'spellcheck',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SPELL_KEY,
        view() {
          let refreshTimer: ReturnType<typeof setTimeout> | null = null
          return {
            update(view, prevState) {
              if (view.state.doc === prevState.doc) return
              // Content changed — schedule a spellcheck refresh
              if (refreshTimer) clearTimeout(refreshTimer)
              refreshTimer = setTimeout(() => {
                const el = view.dom
                el.setAttribute('spellcheck', 'false')
                requestAnimationFrame(() => {
                  el.setAttribute('spellcheck', 'true')
                })
              }, 150) // debounce: wait 150ms after last change before refreshing
            },
            destroy() {
              if (refreshTimer) clearTimeout(refreshTimer)
            },
          }
        },
      }),
    ]
  },
})
