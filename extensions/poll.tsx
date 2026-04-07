'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { BarChart2, Edit2, Minimize2, Maximize2, Square } from 'lucide-react'

export type PollOption = { id: string; label: string; votes: number }

let _uid = 0
const genId = () => `p${Date.now().toString(36)}${(++_uid).toString(36)}`

const POLL_SIZES = { compact: 280, medium: 400, full: undefined } as const
type PollSize = keyof typeof POLL_SIZES

function PollView({ node, updateAttributes, selected }: NodeViewProps) {
  const q = node.attrs.question as string
  const opts: PollOption[] = JSON.parse((node.attrs.options as string) || '[]')
  const size = (node.attrs.size as PollSize) || 'medium'

  const [voted, setVoted] = useState<string | null>(null)
  const [editing, setEditing] = useState(!q)
  const [dq, setDq] = useState(q || '')
  const [dopts, setDopts] = useState<PollOption[]>(() =>
    opts.length >= 2
      ? opts
      : [
          { id: genId(), label: '', votes: 0 },
          { id: genId(), label: '', votes: 0 },
        ]
  )

  const totalVotes = opts.reduce((s, o) => s + o.votes, 0)
  const pollRef = useRef<HTMLDivElement>(null)

  const cycleSize = useCallback(() => {
    const order: PollSize[] = ['compact', 'medium', 'full']
    const next = order[(order.indexOf(size) + 1) % order.length]
    updateAttributes({ size: next })
  }, [size, updateAttributes])

  const onDragStart = useCallback((e: React.DragEvent) => {
    const ghost = document.createElement('div')
    ghost.textContent = q ? `Poll: ${q.slice(0, 24)}${q.length > 24 ? '…' : ''}` : 'Poll'
    ghost.style.cssText = [
      'position:fixed', 'top:0', 'left:-9999px',
      'background:#D4550A', 'color:white',
      'font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'padding:5px 10px', 'border-radius:99px',
      'white-space:nowrap', 'pointer-events:none',
      'box-shadow:0 2px 8px rgba(212,85,10,0.35)',
    ].join(';')
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, Math.max(ghost.offsetHeight / 2, 8))
    setTimeout(() => ghost.remove(), 0)
    pollRef.current?.classList.add('barrapad-dragging')
  }, [q])

  const onDragEnd = useCallback(() => {
    const el = pollRef.current
    if (!el) return
    el.classList.remove('barrapad-dragging')
    el.classList.add('barrapad-dropped')
    el.addEventListener('animationend', () => el.classList.remove('barrapad-dropped'), { once: true })
  }, [])

  const save = () => {
    const valid = dopts.filter(o => o.label.trim())
    if (!dq.trim() || valid.length < 2) return
    updateAttributes({ question: dq.trim(), options: JSON.stringify(valid) })
    setEditing(false)
  }

  const vote = useCallback(
    (id: string) => {
      if (voted) return
      setVoted(id)
      updateAttributes({
        options: JSON.stringify(opts.map(o => (o.id === id ? { ...o, votes: o.votes + 1 } : o))),
      })
    },
    [voted, opts, updateAttributes]
  )

  const pollWidth = POLL_SIZES[size]
  const SizeIcon = size === 'compact' ? Minimize2 : size === 'full' ? Maximize2 : Square

  // Sync TipTap's outer wrapper width so drag ghost + selection outline match.
  // NodeViewWrapper renders as [data-node-view-wrapper], and TipTap wraps it
  // in an outer content div. We style both to ensure correct sizing.
  useEffect(() => {
    const el = pollRef.current
    if (!el) return
    // Walk up to find TipTap's outer wrapper (the one with data-node-view-content or parent of node-view-wrapper)
    const outer = el.closest('[data-node-view-wrapper]')?.parentElement as HTMLElement | null
    if (outer && outer.classList.contains('ProseMirror') === false) {
      if (pollWidth) {
        outer.style.width = `${pollWidth}px`
        outer.style.maxWidth = '100%'
      } else {
        outer.style.width = '100%'
        outer.style.maxWidth = ''
      }
    }
  }, [pollWidth])

  return (
    <NodeViewWrapper
      data-drag-handle
      data-poll-view
      ref={pollRef}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        width: pollWidth ? `${pollWidth}px` : '100%',
        maxWidth: '100%',
        transition: 'width 0.2s ease',
      }}
    >
      <div
        contentEditable={false}
        className={`barrapad-poll${selected ? ' is-selected' : ''}`}
      >
        {/* Header */}
        <div className="barrapad-poll-head">
          <BarChart2 size={13} />
          <span className="barrapad-poll-tag">Poll</span>
          <button
            className="barrapad-poll-editbtn"
            onClick={cycleSize}
            title={`Size: ${size}`}
            style={{ marginLeft: 'auto' }}
          >
            <SizeIcon size={11} />
          </button>
          {!editing && (
            <button className="barrapad-poll-editbtn" onClick={() => setEditing(true)} title="Edit poll">
              <Edit2 size={11} />
            </button>
          )}
        </div>

        {editing ? (
          /* ── Edit mode ── */
          <div className="barrapad-poll-editor">
            <input
              autoFocus
              className="barrapad-poll-q-input"
              value={dq}
              onChange={e => setDq(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter') { e.preventDefault(); save() }
              }}
              placeholder="Ask a question…"
            />
            <div className="barrapad-poll-opts-edit">
              {dopts.map((o, i) => (
                <div key={o.id} className="barrapad-poll-opt-row">
                  <span className="barrapad-poll-opt-bullet" />
                  <input
                    className="barrapad-poll-opt-input"
                    value={o.label}
                    onChange={e =>
                      setDopts(prev => prev.map(p => (p.id === o.id ? { ...p, label: e.target.value } : p)))
                    }
                    onKeyDown={e => {
                      e.stopPropagation()
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (i === dopts.length - 1 && dopts.length < 8) {
                          setDopts(p => [...p, { id: genId(), label: '', votes: 0 }])
                        }
                      }
                    }}
                    placeholder={`Option ${i + 1}…`}
                  />
                  {dopts.length > 2 && (
                    <button
                      className="barrapad-poll-rm"
                      onClick={() => setDopts(p => p.filter(x => x.id !== o.id))}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {dopts.length < 8 && (
                <button
                  className="barrapad-poll-addopt"
                  onClick={() => setDopts(p => [...p, { id: genId(), label: '', votes: 0 }])}
                >
                  + Add option
                </button>
              )}
            </div>
            <div className="barrapad-poll-actions">
              {q && (
                <button className="barrapad-poll-cancel" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
              <button className="barrapad-poll-save" onClick={save}>
                Save Poll
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <div className="barrapad-poll-view">
            <p className="barrapad-poll-question">{q}</p>
            <div className="barrapad-poll-options">
              {opts.map(o => {
                const pct = totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0
                return (
                  <button
                    key={o.id}
                    className={`barrapad-poll-opt${voted === o.id ? ' is-voted' : ''}${voted ? ' is-revealed' : ''}`}
                    onClick={() => vote(o.id)}
                    disabled={!!voted}
                  >
                    <span className="barrapad-poll-opt-marker" />
                    <span className="barrapad-poll-opt-label">{o.label}</span>
                    {voted && <span className="barrapad-poll-opt-pct">{pct}%</span>}
                    {voted && <div className="barrapad-poll-opt-bar" style={{ width: `${pct}%` }} />}
                  </button>
                )
              })}
            </div>
            {voted && (
              <p className="barrapad-poll-votes">
                {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
              </p>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const Poll = Node.create({
  name: 'poll',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      question: { default: '' },
      options: {
        default: JSON.stringify([
          { id: 'a', label: '', votes: 0 },
          { id: 'b', label: '', votes: 0 },
        ]),
      },
      size: { default: 'medium' },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-poll]',
      getAttrs: (el) => {
        const div = el as HTMLDivElement
        return { size: div.getAttribute('data-poll-size') ?? 'medium' }
      },
    }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-poll': '',
      ...(HTMLAttributes.size && HTMLAttributes.size !== 'medium' ? { 'data-poll-size': HTMLAttributes.size } : {}),
    })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PollView)
  },
})
