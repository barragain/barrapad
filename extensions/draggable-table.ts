import { Table, TableView } from '@tiptap/extension-table'
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

/**
 * Extends the default TableView to add a drag handle and drop animations.
 * This is passed as the `View` option to the columnResizing plugin.
 */
class DraggableTableView extends TableView {
  constructor(node: PmNode, cellMinWidth: number) {
    super(node, cellMinWidth)

    const dom = this.dom as HTMLElement

    // Create drag handle (6-dot grip)
    const handle = document.createElement('div')
    handle.className = 'table-drag-handle'
    handle.contentEditable = 'false'
    handle.setAttribute('data-drag-handle', '')
    handle.setAttribute('draggable', 'true')
    handle.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
      <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
      <circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/>
    </svg>`

    dom.insertBefore(handle, dom.firstChild)

    // Custom drag ghost
    handle.addEventListener('dragstart', (e: DragEvent) => {
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
})
