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
import type { MentionableUser } from '@/types'

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
  onMentionSelect,
  noteId,
  autoFocus,
}: {
  placeholder: string
  onSubmit: (text: string, mentionIds: string[]) => void
  onMentionSelect?: (user: MentionableUser) => void
  noteId?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionResults, setMentionResults] = useState<MentionableUser[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fetchRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.focus(), 50)
  }, [autoFocus])

  // Fetch mention suggestions
  useEffect(() => {
    if (mentionQuery === null) { setMentionResults([]); return }
    fetchRef.current?.abort()
    const ctrl = new AbortController()
    fetchRef.current = ctrl

    const doFetch = async () => {
      try {
        let url: string
        if (!mentionQuery && noteId) {
          url = `/api/notes/${noteId}/collaborators`
        } else if (mentionQuery) {
          url = `/api/users/search?q=${encodeURIComponent(mentionQuery)}`
        } else {
          setMentionResults([]); return
        }
        const res = await fetch(url, { signal: ctrl.signal })
        if (!res.ok) return
        const data = await res.json()
        // Collaborators endpoint returns different shape
        if (!mentionQuery && noteId) {
          setMentionResults((data as Array<{ userId: string; username: string; displayName: string; avatarUrl: string }>).map((c) => ({
            id: c.userId, username: c.username,
            displayName: c.displayName || c.username || 'Unknown',
            imageUrl: c.avatarUrl, email: '',
          })))
        } else {
          setMentionResults(data as MentionableUser[])
        }
        setMentionIndex(0)
      } catch {}
    }
    doFetch()
    return () => ctrl.abort()
  }, [mentionQuery, noteId])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)

    // Detect @mention trigger
    const pos = e.target.selectionStart
    const before = val.slice(0, pos)
    const match = before.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = (user: MentionableUser) => {
    const pos = ref.current?.selectionStart ?? text.length
    const before = text.slice(0, pos)
    const after = text.slice(pos)
    const match = before.match(/@(\w*)$/)
    if (match) {
      const newBefore = before.slice(0, match.index) + `@${user.displayName} `
      setText(newBefore + after)
      setMentionIds((prev) => [...prev, user.id])
      onMentionSelect?.(user)
    }
    setMentionQuery(null)
    ref.current?.focus()
  }

  const handleSubmit = () => {
    if (!text.trim()) return
    onSubmit(text.trim(), mentionIds)
    setText('')
    setMentionIds([])
    setMentionQuery(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % mentionResults.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i + mentionResults.length - 1) % mentionResults.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionResults[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Mention dropdown */}
      {mentionQuery !== null && mentionResults.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0,
          marginBottom: 4, background: 'var(--editor-bg)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          maxHeight: 180, overflowY: 'auto', zIndex: 50,
        }}>
          {mentionResults.map((user, i) => (
            <button
              key={user.id}
              onClick={() => insertMention(user)}
              onMouseEnter={() => setMentionIndex(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 10px', border: 'none',
                background: i === mentionIndex ? 'rgba(212,85,10,0.08)' : 'transparent',
                cursor: 'pointer', textAlign: 'left', fontSize: 12,
              }}
            >
              {user.imageUrl ? (
                <img src={user.imageUrl} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', background: '#D4550A',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 600,
                }}>
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12 }}>{user.displayName}</div>
                {user.username && (
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>@{user.username}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <textarea
          ref={ref}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
  onReply: (text: string, mentionIds?: string[]) => void
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
                  placeholder="Reply... (type @ to mention)"
                  noteId={thread.noteId}
                  onSubmit={(text, mentions) => { onReply(text, mentions); setShowReply(false) }}
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

  // Listen for comment highlight clicks + notification clicks — find the matching thread
  useEffect(() => {
    const handler = (e: Event) => {
      const { markCommentId } = (e as CustomEvent<{ markCommentId: string }>).detail
      if (markCommentId) {
        // May need to fetch first if comments aren't loaded yet
        const doActivate = (list: CommentThread[]) => {
          const thread = list.find((c) => c.commentId === markCommentId && !c.parentId)
          if (thread) {
            setLocalActive(thread.id)
            onActiveCommentChange?.(thread.id)
            // Highlight + scroll to the mark in the editor
            document.querySelectorAll('.comment-highlight.comment-active').forEach((el) => el.classList.remove('comment-active'))
            const els = document.querySelectorAll(`[data-comment-id="${markCommentId}"]`)
            els.forEach((el) => {
              el.classList.add('comment-active')
              void (el as HTMLElement).offsetWidth
            })
            if (els[0]) els[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
        if (comments.length > 0) {
          doActivate(comments)
        } else {
          // Comments not loaded yet — fetch first, then activate
          fetch(`/api/notes/${noteId}/comments`).then((r) => r.ok ? r.json() : []).then((data: CommentThread[]) => {
            setComments(data)
            setTimeout(() => doActivate(data), 50)
          }).catch(() => {})
        }
      }
    }
    window.addEventListener('barrapad:comment-activate-mark', handler)
    return () => window.removeEventListener('barrapad:comment-activate-mark', handler)
  }, [comments, noteId, onActiveCommentChange])

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
    if (open) {
      // Always re-fetch when sidebar opens so new comments are visible
      fetchComments()
    } else {
      // Clean up orphaned marks when sidebar closes with an unsaved pending comment
      if (pendingMarkId && editor) {
        editor.commands.unsetCommentMark(pendingMarkId)
      }
      setPendingMarkId(null)
      setLocalActive(null)
      // Remove active highlight from editor
      document.querySelectorAll('.comment-highlight.comment-active').forEach((el) => el.classList.remove('comment-active'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Detect orphaned comments — marks deleted from the editor
  useEffect(() => {
    if (!editor || !open || comments.length === 0 || !noteId) return

    const checkOrphans = () => {
      // Collect all mark commentIds currently in the document
      const markIds = new Set<string>()
      editor.state.doc.descendants((node) => {
        node.marks.forEach((mark) => {
          if (mark.type.name === 'commentMark' && mark.attrs.commentId) {
            markIds.add(mark.attrs.commentId as string)
          }
        })
      })

      // Find root comments whose marks are gone
      const orphans = comments.filter(
        (c) => !c.parentId && c.commentId && !markIds.has(c.commentId)
      )

      if (orphans.length > 0) {
        for (const orphan of orphans) {
          fetch(`/api/notes/${noteId}/comments/${orphan.id}`, { method: 'DELETE' }).catch(() => {})
        }
        fetchComments()
        window.dispatchEvent(new CustomEvent('barrapad:comment-broadcast', { detail: { noteId } }))
      }
    }

    // Check after a content update settles (debounced)
    const handler = () => { setTimeout(checkOrphans, 500) }
    editor.on('update', handler)
    return () => { editor.off('update', handler) }
  }, [editor, open, comments, noteId, fetchComments])

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

    // Scroll to the highlight in the editor + flash it
    highlightMarkInEditor(newActive ? commentId : null)
  }

  /** Add comment-active class to the corresponding mark elements, scroll into view */
  const highlightMarkInEditor = useCallback((threadId: string | null) => {
    // Remove any existing active highlights
    document.querySelectorAll('.comment-highlight.comment-active').forEach((el) => {
      el.classList.remove('comment-active')
    })
    if (!threadId) return
    const thread = comments.find((c) => c.id === threadId && !c.parentId)
    if (!thread?.commentId) return
    const els = document.querySelectorAll(`[data-comment-id="${thread.commentId}"]`)
    els.forEach((el) => {
      el.classList.add('comment-active')
      // Re-trigger animation by forcing reflow
      void (el as HTMLElement).offsetWidth
    })
    const first = els[0]
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [comments])

  const handleNewComment = async (text: string, mentionIds: string[] = []) => {
    if (!pendingMarkId || !noteId) return
    const markId = pendingMarkId
    setPendingMarkId(null)
    const res = await fetch(`/api/notes/${noteId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, commentId: markId, mentions: mentionIds }),
    })
    if (res.ok) {
      fetchComments()
      window.dispatchEvent(new CustomEvent('barrapad:comment-broadcast', { detail: { noteId } }))
    } else {
      // Remove the mark if the comment failed to save
      if (editor) editor.commands.unsetCommentMark(markId)
    }
  }

  const handleCancelNewComment = () => {
    // Remove the mark since no comment was created
    if (pendingMarkId && editor) editor.commands.unsetCommentMark(pendingMarkId)
    setPendingMarkId(null)
  }

  const handleReply = async (parentId: string, text: string, mentionIds: string[] = []) => {
    await fetch(`/api/notes/${noteId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, parentId, mentions: mentionIds }),
    })
    fetchComments()
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
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 320,
        height: '100%',
        borderLeft: '1px solid var(--border)',
        background: 'var(--sidebar-bg)',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
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
            placeholder="Write a comment... (type @ to mention)"
            noteId={noteId}
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
                  onReply={(text, mentions) => handleReply(thread.id, text, mentions)}
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
