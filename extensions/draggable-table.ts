import { Table, TableView } from '@tiptap/extension-table'
import { NodeSelection, Plugin } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'

function makeDragGhost(label: string): HTMLElement {
  const el = document.createElement('div')
  el.textContent = label
  el.style.cssText = [
    'position:fixed', 'top:0', 'left:-9999px',
    'background:#D4550A', 'color:white',
    'font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'padding:5px 10px', 'border-radius:99px',
    'white-space:nowrap', 'pointer-events:none',
    'box-shadow:0 2px 8px rgba(212,85,10,0.35)',
  ].join(';')
  document.body.appendChild(el)
  return el
}

/** Resolve the table node position from a DOM element inside the table wrapper. */
function findTablePos(view: import('@tiptap/pm/view').EditorView, wrapper: HTMLElement): number | null {
  try {
    const pos = view.posAtDOM(wrapper, 0)
    const $pos = view.state.doc.resolve(pos)
    for (let d = $pos.depth; d >= 0; d--) {
      if ($pos.node(d).type.name === 'table') {
        return $pos.before(d)
      }
    }
  } catch {
    // Position resolution can fail at doc boundaries
  }
  return null
}

/**
 * Extends the default TableView to add a drag handle.
 */
class DraggableTableView extends TableView {
  constructor(node: PmNode, cellMinWidth: number) {
    super(node, cellMinWidth)

    const dom = this.dom as HTMLElement

    const handle = document.createElement('div')
    handle.className = 'table-drag-handle'
    handle.contentEditable = 'false'
    handle.draggable = true
    handle.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
      <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
      <circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/>
    </svg>`

    dom.insertBefore(handle, dom.firstChild)

    // Drag ghost + animations
    dom.addEventListener('dragstart', (e: DragEvent) => {
      const table = dom.querySelector('table')
      const rows = table?.querySelectorAll('tr').length ?? 0
      const cols = table?.querySelector('tr')?.children.length ?? 0
      const ghost = makeDragGhost(`Table ${rows}\u00d7${cols}`)
      e.dataTransfer?.setDragImage(ghost, 0, Math.max(ghost.offsetHeight / 2, 8))
      setTimeout(() => ghost.remove(), 0)
      dom.classList.add('barrapad-dragging')
    })

    dom.addEventListener('dragend', () => {
      dom.classList.remove('barrapad-dragging')
      dom.classList.add('barrapad-dropped')
      dom.addEventListener('animationend', () => dom.classList.remove('barrapad-dropped'), { once: true })
    })
  }
}

export const DraggableTable = Table.extend({
  draggable: true,

  addOptions() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts = this.parent?.() as any
    return { ...opts, View: DraggableTableView, allowTableNodeSelection: true }
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? []
    return [
      ...parentPlugins,
      new Plugin({
        props: {
          handleDOMEvents: {
            // Intercept mousedown on the drag handle to set up NodeSelection.
            // Return true to prevent ProseMirror's own mousedown from interfering.
            // The handle is draggable="true", so the browser will fire dragstart,
            // and ProseMirror's dragstart handler sees the NodeSelection and handles
            // serialization + drop.
            mousedown: (view, event) => {
              const target = event.target as HTMLElement
              if (!target.closest('.table-drag-handle')) return false

              const wrapper = target.closest('.tableWrapper') as HTMLElement
              if (!wrapper) return false

              const tablePos = findTablePos(view, wrapper)
              if (tablePos === null) return false

              view.dispatch(
                view.state.tr.setSelection(NodeSelection.create(view.state.doc, tablePos))
              )
              // Return true — block ProseMirror's mousedown so it doesn't
              // override our selection or fail to set mightDrag
              return true
            },
          },
        },
      }),
    ]
  },
})
