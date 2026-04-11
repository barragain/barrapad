'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { AnimatePresence, motion } from 'framer-motion'
import {
  MessageSquare,
  Send,
  Check,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'

export interface CommentThread {
  id: string
  noteId: string
  userId: string
  userName: string
  userAvatar: string
  content: string
  commentId: string
  parentId: string | null
  resolved: boolean
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  replies?: CommentThread[]
}

interface CommentSidebarProps {
  noteId: string
  editor: Editor | null
  open: boolean
  onClose: () => void
  /** Active comment mark ID (clicked highlight) */
  activeCommentId?: string | null
  onActiveCommentChange?: (commentId: string | null) => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Avatar({ src, name, size = 28 }: { src?: string; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: '#D4550A', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.45, fontWeight: 600, flexShrink: 0,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function CommentInput({
  placeholder,
  onSubmit,
  autoFocus,
}: {
  placeholder: string
  onSubmit: (text: string) => void
  autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const handleSubmit = () => {
    if (!text.trim()) return
    onSubmit(text.trim())
    setText('')
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}
        placeholder={placeholder}
        rows={1}
        style={{
          flex: 1, resize: 'none', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 10px', fontSize: 12,
          background: 'var(--editor-bg)', color: 'var(--ink)',
          fontFamily: 'inherit', lineHeight: 1.4,
          outline: 'none', minHeight: 34, maxHeight: 120,
        }}
        onInput={(e) => {
          const el = e.currentTarget
          el.style.height = 'auto'
          el.style.height = Math.min(el.scrollHeight, 120) + 'px'
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!text.trim()}
        style={{
          width: 32, height: 32, borderRadius: 8, border: 'none',
          background: text.trim() ? '#D4550A' : 'var(--border)',
          color: text.trim() ? '#fff' : 'var(--muted)',
          cursor: text.trim() ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'background 150ms ease',
        }}
      >
        <Send size={14} />
      </button>
    </div>
  )
}

function ThreadCard({
  thread,
  replies,
  isActive,
  currentUserId,
  noteOwnerId,
  onClick,
  onReply,
  onResolve,
  onDelete,
}: {
  thread: CommentThread
  replies: CommentThread[]
  isActive: boolean
  currentUserId: string
  noteOwnerId: string
  onClick: () => void
  onReply: (text: string) => void
  onResolve: (resolved: boolean) => void
  onDelete: (commentId: string) => void
}) {
  const [showReply, setShowReply] = useState(false)

  const canDelete = (c: CommentThread) =>
    c.userId === currentUserId || noteOwnerId === currentUserId

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        border: isActive ? '1.5px solid #D4550A' : '1px solid var(--border)',
        background: thread.resolved ? 'var(--sidebar-bg)' : 'var(--editor-bg)',
        cursor: 'pointer',
        opacity: thread.resolved ? 0.6 : 1,
        transition: 'border-color 150ms ease, opacity 150ms ease',
      }}
    >
      {/* Root comment */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Avatar src={thread.userAvatar} name={thread.userName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
              {thread.userName}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              {timeAgo(thread.createdAt)}
            </span>
            {thread.resolved && (
              <span style={{
                fontSize: 9, fontWeight: 600, color: '#16a34a',
                background: 'rgba(22,163,74,0.1)', padding: '1px 6px',
                borderRadius: 4,
              }}>
                Resolved
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink)', margin: '4px 0 0', lineHeight: 1.45, wordBreak: 'break-word' }}>
            {thread.content}
          </p>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div style={{ marginTop: 10, marginLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
          {replies.map((reply) => (
            <div key={reply.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Avatar src={reply.userAvatar} name={reply.userName} size={22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>
                    {reply.userName}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {timeAgo(reply.createdAt)}
                  </span>
                  {canDelete(reply) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(reply.id) }}
                      style={{
                        marginLeft: 'auto', background: 'none', border: 'none',
                        color: 'var(--muted)', cursor: 'pointer', padding: 2,
                        borderRadius: 4, display: 'flex',
                      }}
                      title="Delete reply"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 12, color: 'var(--ink)', margin: '2px 0 0', lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {reply.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions bar */}
      {isActive && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          {!thread.resolved && (
            <>
              {showReply ? (
                <CommentInput
                  placeholder="Reply... (use @mention)"
                  onSubmit={(text) => { onReply(text); setShowReply(false) }}
                  autoFocus
                />
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setShowReply(true)}
                    style={{
                      fontSize: 11, fontWeight: 500, color: '#D4550A',
                      background: 'rgba(212,85,10,0.08)', border: 'none',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => onResolve(true)}
                    style={{
                      fontSize: 11, fontWeight: 500, color: '#16a34a',
                      background: 'rgba(22,163,74,0.08)', border: 'none',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <Check size={12} /> Resolve
                  </button>
                  {canDelete(thread) && (
                    <button
                      onClick={() => onDelete(thread.id)}
                      style={{
                        fontSize: 11, fontWeight: 500, color: '#ef4444',
                        background: 'rgba(239,68,68,0.08)', border: 'none',
                        borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {thread.resolved && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => onResolve(false)}
                style={{
                  fontSize: 11, fontWeight: 500, color: 'var(--muted)',
                  background: 'var(--border)', border: 'none',
                  borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <RotateCcw size={12} /> Re-open
              </button>
              {canDelete(thread) && (
                <button
                  onClick={() => onDelete(thread.id)}
                  style={{
                    fontSize: 11, fontWeight: 500, color: '#ef4444',
                    background: 'rgba(239,68,68,0.08)', border: 'none',
                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default function CommentSidebar({
  noteId,
  editor,
  open,
  onClose,
  activeCommentId,
  onActiveCommentChange,
}: CommentSidebarProps) {
  const { user } = useUser()
  const [comments, setComments] = useState<CommentThread[]>([])
  const [showResolved, setShowResolved] = useState(false)
  const [localActive, setLocalActive] = useState<string | null>(null)
  const [noteOwnerId, setNoteOwnerId] = useState('')
  const [pendingMarkId, setPendingMarkId] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  const active = activeCommentId ?? localActive

  // Listen for new comment creation (from context menu or toolbar)
  useEffect(() => {
    const handler = (e: Event) => {
      const { markCommentId } = (e as CustomEvent<{ markCommentId: string }>).detail
      if (markCommentId) setPendingMarkId(markCommentId)
    }
    window.addEventListener('barrapad:comment-new', handler)
    return () => window.removeEventListener('barrapad:comment-new', handler)
  }, [])

  // Listen for comment highlight clicks — find the matching thread
  useEffect(() => {
    const handler = (e: Event) => {
      const { markCommentId } = (e as CustomEvent<{ markCommentId: string }>).detail
      if (markCommentId) {
        const thread = comments.find((c) => c.commentId === markCommentId && !c.parentId)
        if (thread) {
          setLocalActive(thread.id)
          onActiveCommentChange?.(thread.id)
        }
      }
    }
    window.addEventListener('barrapad:comment-activate-mark', handler)
    return () => window.removeEventListener('barrapad:comment-activate-mark', handler)
  }, [comments, onActiveCommentChange])

  // Fetch comments
  const fetchComments = useCallback(async () => {
    if (!noteId || noteId.startsWith('temp-')) return
    try {
      const res = await fetch(`/api/notes/${noteId}/comments`)
      if (res.ok) {
        const data = (await res.json()) as CommentThread[]
        setComments(data)
      }
    } catch {}
  }, [noteId])

  // Fetch note owner
  useEffect(() => {
    if (!noteId || noteId.startsWith('temp-')) return
    fetch(`/api/notes/${noteId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.userId) setNoteOwnerId(data.userId) })
      .catch(() => {})
  }, [noteId])

  useEffect(() => {
    if (open && !fetchedRef.current) {
      fetchComments()
      fetchedRef.current = true
    }
    if (!open) fetchedRef.current = false
  }, [open, fetchComments])

  // Listen for real-time comment events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.noteId === noteId) fetchComments()
    }
    window.addEventListener('barrapad:comment-update', handler)
    return () => window.removeEventListener('barrapad:comment-update', handler)
  }, [noteId, fetchComments])

  // Group into threads (root + replies)
  const rootComments = comments.filter((c) => !c.parentId)
  const replyMap = new Map<string, CommentThread[]>()
  for (const c of comments) {
    if (c.parentId) {
      const existing = replyMap.get(c.parentId) ?? []
      existing.push(c)
      replyMap.set(c.parentId, existing)
    }
  }

  const filteredRoots = showResolved
    ? rootComments
    : rootComments.filter((c) => !c.resolved)

  const handleClickThread = (commentId: string) => {
    const newActive = active === commentId ? null : commentId
    setLocalActive(newActive)
    onActiveCommentChange?.(newActive)

    // Scroll to the highlight in the editor
    if (newActive && editor) {
      const thread = rootComments.find((c) => c.id === commentId)
      if (thread?.commentId) {
        const el = document.querySelector(`[data-comment-id="${thread.commentId}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  const handleNewComment = async (text: string) => {
    if (!pendingMarkId || !noteId) return
    const res = await fetch(`/api/notes/${noteId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, commentId: pendingMarkId }),
    })
    setPendingMarkId(null)
    if (res.ok) {
      fetchComments()
      window.dispatchEvent(new CustomEvent('barrapad:comment-broadcast', { detail: { noteId } }))
    } else {
      // Remove the mark if the comment failed to save
      if (editor) editor.commands.unsetCommentMark(pendingMarkId)
    }
  }

  const handleCancelNewComment = () => {
    // Remove the mark since no comment was created
    if (pendingMarkId && editor) editor.commands.unsetCommentMark(pendingMarkId)
    setPendingMarkId(null)
  }

  const handleReply = async (parentId: string, text: string) => {
    // Extract @mentions from text
    const mentionMatches = text.match(/@(\w+)/g) ?? []
    // For now just send the text — mentions are best-effort
    await fetch(`/api/notes/${noteId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, parentId }),
    })
    fetchComments()
    // Broadcast to other clients
    window.dispatchEvent(new CustomEvent('barrapad:comment-broadcast', { detail: { noteId } }))
  }

  const handleResolve = async (commentId: string, resolved: boolean) => {
    await fetch(`/api/notes/${noteId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    })

    // Update the mark in the editor
    if (editor) {
      const thread = rootComments.find((c) => c.id === commentId)
      if (thread?.commentId) {
        const { doc, tr } = editor.state
        doc.descendants((node, pos) => {
          node.marks.forEach((mark) => {
            if (mark.type.name === 'commentMark' && mark.attrs.commentId === thread.commentId) {
              tr.removeMark(pos, pos + node.nodeSize, mark)
              if (!resolved) {
                tr.addMark(pos, pos + node.nodeSize, editor.schema.marks.commentMark.create({
                  commentId: thread.commentId, resolved: false,
                }))
              }
              // If resolving, remove the highlight entirely
            }
          })
        })
        editor.view.dispatch(tr)
      }
    }

    fetchComments()
    window.dispatchEvent(new CustomEvent('barrapad:comment-broadcast', { detail: { noteId } }))
  }

  const handleDelete = async (commentId: string) => {
    const thread = comments.find((c) => c.id === commentId)

    await fetch(`/api/notes/${noteId}/comments/${commentId}`, { method: 'DELETE' })

    // If deleting a root comment, remove its mark from the editor
    if (thread && !thread.parentId && thread.commentId && editor) {
      editor.commands.unsetCommentMark(thread.commentId)
    }

    fetchComments()
    window.dispatchEvent(new CustomEvent('barrapad:comment-broadcast', { detail: { noteId } }))
  }

  if (!open) return null

  const resolvedCount = rootComments.filter((c) => c.resolved).length

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        height: '100%',
        borderLeft: '1px solid var(--border)',
        background: 'var(--sidebar-bg)',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <MessageSquare size={16} style={{ color: '#D4550A' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
          Comments
        </span>
        {resolvedCount > 0 && (
          <button
            onClick={() => setShowResolved((v) => !v)}
            style={{
              fontSize: 10, fontWeight: 500,
              color: showResolved ? '#D4550A' : 'var(--muted)',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 6px', borderRadius: 4,
            }}
          >
            {showResolved ? 'Hide' : 'Show'} resolved ({resolvedCount})
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            cursor: 'pointer', padding: 4, borderRadius: 6,
            display: 'flex',
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* New comment input (when a mark was just created) */}
      {pendingMarkId && (
        <div style={{ padding: '10px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#D4550A', marginBottom: 6 }}>
            New comment
          </div>
          <CommentInput
            placeholder="Write a comment..."
            onSubmit={handleNewComment}
            autoFocus
          />
          <button
            onClick={handleCancelNewComment}
            style={{
              fontSize: 10, color: 'var(--muted)', background: 'none',
              border: 'none', cursor: 'pointer', marginTop: 4, padding: '2px 0',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
        <AnimatePresence mode="popLayout">
          {filteredRoots.length === 0 && !pendingMarkId ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                textAlign: 'center', padding: '40px 20px',
                color: 'var(--muted)', fontSize: 12,
              }}
            >
              <MessageSquare size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p>No comments yet</p>
              <p style={{ fontSize: 11, marginTop: 4 }}>
                Select text and click &ldquo;Comment&rdquo; to start a thread
              </p>
            </motion.div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredRoots.map((thread) => (
                <ThreadCard
                  key={thread.id}
                  thread={thread}
                  replies={replyMap.get(thread.id) ?? []}
                  isActive={active === thread.id}
                  currentUserId={user?.id ?? ''}
                  noteOwnerId={noteOwnerId}
                  onClick={() => handleClickThread(thread.id)}
                  onReply={(text) => handleReply(thread.id, text)}
                  onResolve={(resolved) => handleResolve(thread.id, resolved)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
