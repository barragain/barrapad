import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet, Decoration } from '@tiptap/pm/view'

export interface RemoteCursor {
  id: string
  from: number
  to: number
  name: string
  color: string
}

export const collabCursorKey = new PluginKey<{ cursors: RemoteCursor[] }>('collabCursor')

function buildWidget(name: string, color: string): HTMLElement {
  const wrap = document.createElement('span')
  wrap.style.cssText =
    'display:inline-block;position:relative;width:0;overflow:visible;pointer-events:none;vertical-align:text-bottom;'

  const caret = document.createElement('span')
  caret.style.cssText = `position:absolute;top:-2px;bottom:-2px;left:-1px;border-left:2px solid ${color};`
  wrap.appendChild(caret)

  const label = document.createElement('span')
  label.textContent = name
  label.style.cssText = [
    'position:absolute',
    'bottom:100%',
    'left:-1px',
    'margin-bottom:3px',
    `background:${color}`,
    'color:#fff',
    'font-size:10px',
    'font-weight:600',
    'line-height:1.2',
    'padding:2px 6px',
    'border-radius:4px',
    'white-space:nowrap',
    'pointer-events:none',
    'user-select:none',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  ].join(';')
  wrap.appendChild(label)

  return wrap
}

export const CollabCursor = Extension.create({
  name: 'collabCursor',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: collabCursorKey,
        state: {
          init: () => ({ cursors: [] as RemoteCursor[] }),
          apply(tr, prev) {
            const meta = tr.getMeta(collabCursorKey)
            return meta ?? prev
          },
        },
        props: {
          decorations(state) {
            const pluginState = collabCursorKey.getState(state)
            if (!pluginState?.cursors.length) return DecorationSet.empty

            const decos: Decoration[] = []
            const docSize = state.doc.content.size

            for (const cursor of pluginState.cursors) {
              const from = Math.max(0, Math.min(cursor.from, docSize))
              const to = Math.max(0, Math.min(cursor.to, docSize))

              if (from !== to) {
                decos.push(
                  Decoration.inline(Math.min(from, to), Math.max(from, to), {
                    style: `background:${cursor.color}33;`,
                  })
                )
              }

              const color = cursor.color
              const name = cursor.name
              decos.push(
                Decoration.widget(from, () => buildWidget(name, color), {
                  key: `collab-cursor-${cursor.id}`,
                  side: 1,
                })
              )
            }

            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})

export function setCursors(
  editor: { view: { state: { tr: any }; dispatch: (tr: any) => void } },
  cursors: RemoteCursor[]
) {
  const tr = editor.view.state.tr.setMeta(collabCursorKey, { cursors })
  editor.view.dispatch(tr)
}

export const CURSOR_COLORS = [
  '#2563EB', '#16A34A', '#9333EA', '#0891B2',
  '#BE185D', '#D97706', '#DC2626', '#0D9488',
]

export function pickColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}
