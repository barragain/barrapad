import { useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

/** Find any image or fileAttachment overlapping the current selection and set its align.
 *  Does not rely on instanceof — scans the doc for the active node. */
export function setNodeAlign(editor: Editor, align: 'left' | 'center' | 'right') {
  const TYPES = ['image', 'fileAttachment', 'poll']
  const { from, to } = editor.state.selection
  let done = false

  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (done) return false
    if (TYPES.includes(node.type.name)) {
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, align })
      editor.view.dispatch(tr)
      done = true
      return false
    }
  })

  // Also check the node AT the from position (for NodeSelection where from === to)
  if (!done) {
    const node = editor.state.doc.nodeAt(from)
    if (node && TYPES.includes(node.type.name)) {
      const tr = editor.state.tr.setNodeMarkup(from, undefined, { ...node.attrs, align })
      editor.view.dispatch(tr)
      done = true
    }
  }

  return done
}

export const TEXT_STYLES = [
  // Also leaves a quote, which setParagraph alone keeps.
  { label: 'Normal Text', action: (e: Editor) => {
    const c = e.chain().focus().setParagraph()
    ;(e.isActive('blockquote') ? c.lift('blockquote') : c).run()
  } },
  { label: 'Heading 1', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Quote', action: (e: Editor) => e.chain().focus().toggleBlockquote().run() },
]

export function useIsMac() {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(
      /Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
      navigator.userAgent.includes('Mac')
    )
  }, [])
  return isMac
}

/** Touch screen: the toolbar pins above the on-screen keyboard and its
 *  dropdowns open as bottom sheets. Keyed on the pointer, not the width, so
 *  a narrow desktop window keeps the desktop toolbar and dropdowns. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const check = () => setIsMobile(mq.matches)
    check()
    mq.addEventListener('change', check)
    return () => mq.removeEventListener('change', check)
  }, [])
  return isMobile
}

export function key(isMac: boolean, mac: string, win: string) {
  return isMac ? mac : win
}

/** Pixels the on-screen keyboard covers at the bottom of the layout viewport.
 *  Fixed elements use it as `bottom` to sit right above the keyboard. iOS
 *  Safari shrinks only the visual viewport; Android Chrome resizes the page
 *  (see `viewport` in app/layout.tsx), which makes this 0. Measured against
 *  clientHeight: Chrome's innerHeight follows the visual viewport, which hid
 *  the toolbar behind the keyboard. */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, Math.round(document.documentElement.clientHeight - vv.height - vv.offsetTop)))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}
