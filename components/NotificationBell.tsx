'use client'

import { useRef, useEffect, useState } from 'react'
import { Bell, CheckCheck, Trash2, Check, X, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CollabNotification } from '@/types'

const TYPE_COLOR: Record<string, string> = {
  shared: '#D4550A',
  deleted: '#ef4444',
  permission_changed: '#f59e0b',
  opened: '#3b82f6',
  mention: '#8b5cf6',
  access_request: '#f59e0b',
  access_response: '#22c55e',
}

const TYPE_LABEL: Record<string, string> = {
  shared: 'Shared',
  deleted: 'Removed',
  permission_changed: 'Access changed',
  opened: 'Opened',
  mention: 'Mention',
  access_request: 'Access request',
  access_response: 'Access response',
}

interface Props {
  notifications: CollabNotification[]
  open: boolean
  onToggle: () => void
  onMarkAllRead: () => void
  onDeleteAll: () => void
  onAccessRequestAction?: (requestId: string, action: 'accept' | 'deny', permission?: string) => void
}

export default function NotificationBell({
  notifications,
  open,
  onToggle,
  onMarkAllRead,
  onDeleteAll,
  onAccessRequestAction,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const unreadCount = notifications.filter((n) => !n.read).length
  const hasUnread = unreadCount > 0

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onToggle])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className="relative flex items-center gap-1.5 px-2.5 py-1.5 text-sm border rounded-lg hover:bg-black/5 transition-colors"
        style={{
          borderColor: 'var(--border)',
          color: hasUnread ? 'var(--ink)' : 'var(--muted)',
          opacity: hasUnread ? 1 : 0.6,
        }}
        title="Notifications"
      >
        <motion.div
          animate={hasUnread && !open
            ? { rotate: [0, -15, 15, -12, 12, -8, 8, 0] }
            : { rotate: 0 }
          }
          transition={hasUnread && !open
            ? { duration: 0.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 3 }
            : { duration: 0.2 }
          }
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Bell size={13} />
        </motion.div>

        <AnimatePresence>
          {hasUnread && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0, width: 0 }}
              animate={{ scale: 1, opacity: 1, width: 'auto' }}
              exit={{ scale: 0, opacity: 0, width: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              className="flex items-center justify-center text-white font-bold rounded-full overflow-hidden"
              style={{
                background: '#D4550A',
                fontSize: 10,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                lineHeight: 1,
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-popover"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
            className="absolute top-full right-0 mt-1 z-[55] rounded-xl shadow-xl overflow-hidden"
            style={{
              background: 'var(--editor-bg)',
              border: '1px solid var(--border)',
              width: 'min(340px, calc(100vw - 24px))',
              transformOrigin: 'top right',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-3 py-2.5"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                Notifications
              </span>
              <div className="flex items-center gap-1">
                {hasUnread && (
                  <button
                    onClick={onMarkAllRead}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md hover:bg-black/5 transition-colors"
                    style={{ color: 'var(--muted)' }}
                    title="Mark all as read"
                  >
                    <CheckCheck size={11} />
                    Mark as read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={() => { onDeleteAll(); onToggle() }}
                    className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-red-50 transition-colors"
                    style={{ color: '#ef4444' }}
                    title="Delete all notifications"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <AnimatePresence initial={false}>
                {notifications.length === 0 ? (
                  <motion.p
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-center py-7"
                    style={{ color: 'var(--muted)' }}
                  >
                    No notifications
                  </motion.p>
                ) : (
                  notifications.map((n, i) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      index={i}
                      isLast={i === notifications.length - 1}
                      onAccessRequestAction={onAccessRequestAction}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>

            {notifications.some((n) => n.read) && (
              <div
                className="px-3 py-2 text-center text-[10px]"
                style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}
              >
                Read notifications disappear after 14 days
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NotificationItem({
  notification: n,
  index: i,
  isLast,
  onAccessRequestAction,
}: {
  notification: CollabNotification
  index: number
  isLast: boolean
  onAccessRequestAction?: (requestId: string, action: 'accept' | 'deny', permission?: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [permChoice, setPermChoice] = useState<string | null>(null)
  const meta = (n.metadata ?? {}) as Record<string, unknown>
  const isAccessRequest = n.type === 'access_request'
  const isResolved = isAccessRequest && !!meta.resolved
  const color = TYPE_COLOR[n.type] ?? '#888'

  const handleAction = async (action: 'accept' | 'deny') => {
    const requestId = meta.accessRequestId as string
    if (!requestId || !onAccessRequestAction) return
    setLoading(true)
    onAccessRequestAction(requestId, action, permChoice ?? 'READ')
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: n.read ? 0.55 : 1, x: 0 }}
      transition={{ delay: i * 0.03, duration: 0.16 }}
      className="flex items-start gap-2.5 px-3 py-2.5"
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
      }}
    >
      {/* Dot or avatar */}
      {n.fromAvatar ? (
        <img
          src={n.fromAvatar}
          alt=""
          className="flex-shrink-0 rounded-full"
          style={{ width: 22, height: 22, objectFit: 'cover', marginTop: 2 }}
        />
      ) : (
        <span
          className="flex-shrink-0 rounded-full"
          style={{
            width: 6,
            height: 6,
            marginTop: 6,
            background: n.read ? 'var(--muted)' : color,
            boxShadow: n.read ? 'none' : `0 0 6px ${color}55`,
          }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{
              background: n.read ? 'var(--border)' : `${color}18`,
              color: n.read ? 'var(--muted)' : color,
            }}
          >
            {TYPE_LABEL[n.type] ?? n.type}
          </span>
        </div>
        <p className="text-xs leading-snug" style={{ color: 'var(--ink)' }}>
          {n.message}
        </p>

        {/* Access request actions */}
        {isAccessRequest && !isResolved && !loading && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Permission chooser */}
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setPermChoice('READ')}
                style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
                  border: '1px solid var(--border)', cursor: 'pointer',
                  background: (permChoice ?? 'READ') === 'READ' ? '#3b82f6' : 'transparent',
                  color: (permChoice ?? 'READ') === 'READ' ? '#fff' : 'var(--muted)',
                }}
              >
                View only
              </button>
              <button
                onClick={() => setPermChoice('EDIT')}
                style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
                  border: '1px solid var(--border)', cursor: 'pointer',
                  background: permChoice === 'EDIT' ? '#D4550A' : 'transparent',
                  color: permChoice === 'EDIT' ? '#fff' : 'var(--muted)',
                }}
              >
                Can edit
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => handleAction('accept')}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                  background: '#22c55e', color: '#fff',
                }}
              >
                <Check size={11} /> Accept
              </button>
              <button
                onClick={() => handleAction('deny')}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                  background: 'transparent', color: '#ef4444',
                }}
              >
                <X size={11} /> Deny
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
            <Loader2 size={12} className="animate-spin" /> Processing...
          </div>
        )}

        {isResolved && (
          <div style={{
            marginTop: 4, fontSize: 11, fontWeight: 500,
            color: (meta.action as string) === 'accept' ? '#22c55e' : '#ef4444',
          }}>
            {String(meta.action) === 'accept' ? 'Accepted' : 'Denied'} by {String(meta.resolvedByName)}
            {meta.permission ? ` (${String(meta.permission) === 'EDIT' ? 'Can edit' : 'View only'})` : ''}
          </div>
        )}

        <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
          {new Date(n.timestamp).toLocaleString()}
        </p>
      </div>
    </motion.div>
  )
}
