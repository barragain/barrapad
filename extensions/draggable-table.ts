import { Table } from '@tiptap/extension-table'

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

export const DraggableTable = Table.extend({
  draggable: true,

  addNodeView() {
    const parentNodeView = this.parent?.()
    if (!parentNodeView) return undefined as never

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (...args: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = (parentNodeView as any)(...args)
      const dom = view.dom as HTMLElement | undefined
      if (!dom) return view

      dom.style.position = 'relative'

      // Create drag handle
      const handle = document.createElement('div')
      handle.className = 'table-drag-handle'
      handle.contentEditable = 'false'
      handle.setAttribute('data-drag-handle', '')
      handle.setAttribute('draggable', 'true')
      // 6-dot grip icon
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
        const ghost = makeDragGhost(`Table ${rows}×${cols}`)
        e.dataTransfer?.setDragImage(ghost, 0, Math.max(ghost.offsetHeight / 2, 8))
        setTimeout(() => ghost.remove(), 0)
        dom.classList.add('barrapad-dragging')
      })

      dom.addEventListener('dragend', () => {
        dom.classList.remove('barrapad-dragging')
        dom.classList.add('barrapad-dropped')
        dom.addEventListener('animationend', () => dom.classList.remove('barrapad-dropped'), { once: true })
      })

      return view
    }
  },
})
