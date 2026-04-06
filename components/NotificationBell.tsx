'use client'

import { useRef, useEffect } from 'react'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CollabNotification } from '@/types'

const TYPE_COLOR: Record<CollabNotification['type'], string> = {
  shared: '#D4550A',
  deleted: '#ef4444',
  permission_changed: '#f59e0b',
  opened: '#3b82f6',
}

const TYPE_LABEL: Record<CollabNotification['type'], string> = {
  shared: 'Shared',
  deleted: 'Removed',
  permission_changed: 'Access changed',
  opened: 'Opened',
}

interface Props {
  notifications: CollabNotification[]
  open: boolean
  onToggle: () => void
  onMarkAllRead: () => void
  onDeleteAll: () => void
}

export default function NotificationBell({
  notifications,
  open,
  onToggle,
  onMarkAllRead,
  onDeleteAll,
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
        {/* Bell icon — wiggles when there are unread notifications */}
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

        {/* Unread count badge */}
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

      {/* Popover */}
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
              width: 'min(300px, calc(100vw - 24px))',
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
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
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
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: n.read ? 0.45 : 1, x: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.16 }}
                      className="flex items-start gap-2.5 px-3 py-2.5"
                      style={{
                        borderBottom: i < notifications.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <span
                        className="flex-shrink-0 rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          marginTop: 4,
                          background: n.read ? 'var(--muted)' : TYPE_COLOR[n.type],
                          boxShadow: n.read ? 'none' : `0 0 6px ${TYPE_COLOR[n.type]}55`,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                            style={{
                              background: n.read ? 'var(--border)' : `${TYPE_COLOR[n.type]}18`,
                              color: n.read ? 'var(--muted)' : TYPE_COLOR[n.type],
                            }}
                          >
                            {TYPE_LABEL[n.type]}
                          </span>
                        </div>
                        <p className="text-xs leading-snug" style={{ color: 'var(--ink)' }}>
                          {n.message}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
                          {new Date(n.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Footer hint for auto-expiry */}
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
