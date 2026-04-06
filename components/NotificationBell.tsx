'use client'

import { useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
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
  deleted: 'Deleted',
  permission_changed: 'Access changed',
  opened: 'Opened',
}

interface Props {
  notifications: CollabNotification[]
  open: boolean
  onToggle: () => void
  onDismiss: () => void
}

export default function NotificationBell({ notifications, open, onToggle, onDismiss }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const hasNew = notifications.length > 0

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
          color: hasNew ? 'var(--ink)' : 'var(--muted)',
          opacity: hasNew ? 1 : 0.6,
        }}
        title="Notifications"
      >
        {/* Bell icon — wiggles when there are unread notifications */}
        <motion.div
          animate={hasNew && !open
            ? { rotate: [0, -15, 15, -12, 12, -8, 8, 0] }
            : { rotate: 0 }
          }
          transition={hasNew && !open
            ? { duration: 0.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 3 }
            : { duration: 0.2 }
          }
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Bell size={13} />
        </motion.div>

        {/* Badge count shown inline next to icon when there are notifications */}
        <AnimatePresence>
          {hasNew && (
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
              {notifications.length > 9 ? '9+' : notifications.length}
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
              width: 'min(292px, calc(100vw - 24px))',
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
              {notifications.length > 0 && (
                <button
                  onClick={() => { onDismiss(); onToggle() }}
                  className="text-[11px] hover:underline transition-opacity"
                  style={{ color: 'var(--muted)' }}
                >
                  Clear all
                </button>
              )}
            </div>

            {/* List */}
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              <AnimatePresence initial={false}>
                {notifications.length === 0 ? (
                  <motion.p
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-center py-7"
                    style={{ color: 'var(--muted)' }}
                  >
                    No new notifications
                  </motion.p>
                ) : (
                  notifications.map((n, i) => (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.18 }}
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
                          background: TYPE_COLOR[n.type],
                          boxShadow: `0 0 6px ${TYPE_COLOR[n.type]}66`,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                            style={{
                              background: `${TYPE_COLOR[n.type]}18`,
                              color: TYPE_COLOR[n.type],
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
