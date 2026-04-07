import { Table, TableView } from '@tiptap/extension-table'
import { NodeSelection, Plugin } from '@tiptap/pm/state'
import { DOMSerializer } from '@tiptap/pm/model'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

/** Resolve the table node position from a DOM element inside the table wrapper. */
function findTablePos(view: EditorView, wrapper: HTMLElement): number | null {
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

    // Drag animations — delay adding the class so the browser's drag
    // isn't cancelled by the CSS transform + pointer-events:none
    dom.addEventListener('dragstart', () => {
      requestAnimationFrame(() => dom.classList.add('barrapad-dragging'))
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
            // Block ProseMirror's mousedown on the handle — prevents it from
            // placing a text cursor or creating a competing drag tracker.
            mousedown: (_view, event) => {
              const target = event.target as HTMLElement
              if (!target.closest('.table-drag-handle')) return false
              return true
            },

            // The handle has draggable="true", so the browser fires dragstart.
            // We fully handle it: select the table, serialize the content,
            // set dataTransfer, and set view.dragging so ProseMirror's drop
            // handler treats this as an internal move.
            dragstart: (view, event) => {
              const target = event.target as HTMLElement
              if (!target.closest('.table-drag-handle')) return false

              const wrapper = target.closest('.tableWrapper') as HTMLElement
              if (!wrapper) return false

              const tablePos = findTablePos(view, wrapper)
              if (tablePos === null) return false

              // Select the table node
              view.dispatch(
                view.state.tr.setSelection(
                  NodeSelection.create(view.state.doc, tablePos)
                )
              )

              // Serialize the table for dataTransfer
              const slice = view.state.selection.content()
              const serializer = DOMSerializer.fromSchema(view.state.schema)
              const fragment = serializer.serializeFragment(slice.content)
              const div = document.createElement('div')
              div.appendChild(fragment)

              const dt = event.dataTransfer
              if (dt) {
                dt.clearData()
                dt.setData('text/html', div.innerHTML)
                dt.setData('text/plain', div.textContent || '')
                dt.effectAllowed = 'move'
              }

              // Tell ProseMirror's drop handler this is an internal move
              // so it deletes the source and inserts at the drop position.
              ;(view as any).dragging = { slice, move: true }

              // Prevent ProseMirror's internal dragstart from running
              // (it would fail to set things up correctly)
              return true
            },
          },
        },
      }),
    ]
  },
})
