'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useCallback, useEffect } from 'react'
import { BarChart2, Edit2 } from 'lucide-react'

export type PollOption = { id: string; label: string; votes: number }

let _uid = 0
const genId = () => `p${Date.now().toString(36)}${(++_uid).toString(36)}`

function PollView({ node, updateAttributes, selected }: NodeViewProps) {
  const q = node.attrs.question as string
  const opts: PollOption[] = JSON.parse((node.attrs.options as string) || '[]')

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

  // Custom drag ghost + animations
  useEffect(() => {
    const onStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      const nodeEl = target?.closest<HTMLElement>('[data-poll-view]')
      if (!nodeEl) return
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
      e.dataTransfer?.setDragImage(ghost, 0, Math.max(ghost.offsetHeight / 2, 8))
      setTimeout(() => ghost.remove(), 0)
      nodeEl.classList.add('barrapad-dragging')
    }
    const onEnd = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      const nodeEl = target?.closest<HTMLElement>('[data-poll-view]')
      if (!nodeEl) return
      nodeEl.classList.remove('barrapad-dragging')
      nodeEl.classList.add('barrapad-dropped')
      nodeEl.addEventListener('animationend', () => nodeEl.classList.remove('barrapad-dropped'), { once: true })
    }
    document.addEventListener('dragstart', onStart)
    document.addEventListener('dragend', onEnd)
    return () => {
      document.removeEventListener('dragstart', onStart)
      document.removeEventListener('dragend', onEnd)
    }
  }, [q])

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

  return (
    <NodeViewWrapper>
      <div
        contentEditable={false}
        data-drag-handle
        data-poll-view
        className={`barrapad-poll${selected ? ' is-selected' : ''}`}
      >
        {/* Header */}
        <div className="barrapad-poll-head">
          <BarChart2 size={13} />
          <span className="barrapad-poll-tag">Poll</span>
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
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-poll]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-poll': '' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PollView)
  },
})
