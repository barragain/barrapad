'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import PartySocket from 'partysocket'
import type { SharedAccessRecord, CollabNotification } from '@/types'
import { REALTIME_HOST, roomQuery } from '@/lib/realtime'

// Bell notifications: the stored ones from /api/notifications, live pushes from
// the user's notif-<userId> room, and the ones computed in the browser by
// diffing the shared-notes list against the last snapshot in localStorage.

type KnownSharedMap = Record<string, { title: string; permission: string; ownerName: string }>

export function loadKnownShared(): KnownSharedMap {
  try {
    const raw = localStorage.getItem('barrapad_known_shared')
    return raw ? (JSON.parse(raw) as KnownSharedMap) : {}
  } catch { return {} }
}

function saveKnownShared(records: SharedAccessRecord[]) {
  const map: KnownSharedMap = {}
  for (const r of records) {
    map[r.token] = {
      title: r.noteTitle,
      permission: r.permission,
      ownerName: r.ownerName ?? '',
    }
  }
  try { localStorage.setItem('barrapad_known_shared', JSON.stringify(map)) } catch {}
}

/** userId is null while Clerk loads or for guests; then nothing is fetched or opened. */
export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<CollabNotification[]>([])
  // true on first sharedNotes fetch — used to set baseline without firing notifications
  const isFirstNotifFetch = useRef(true)
  // Set of "{noteId}:{accessorUserId}" pairs the owner has already been notified about
  const openedNotifiedRef = useRef<Set<string>>(new Set())

  // Fetch notifications from server on mount + connect to real-time notification room
  useEffect(() => {
    if (!userId) return

    // Fetch existing notifications from DB
    fetch('/api/notifications')
      .then((r) => r.ok ? r.json() : [])
      .then((data: CollabNotification[]) => setNotifications(data))
      .catch(() => {})

    // Connect to notification PartyKit room
    const socket = new PartySocket({ host: REALTIME_HOST, room: `notif-${userId}`, query: roomQuery(`notif-${userId}`) })

    socket.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as Record<string, unknown>

        if (msg.type === 'notification') {
          const notif = msg.notification as CollabNotification
          setNotifications((prev) => {
            if (prev.some((n) => n.id === notif.id)) return prev
            return [notif, ...prev]
          })

          // If this is an access response, dispatch event for AccessDeniedView
          if (notif.type === 'access_response' && notif.noteId) {
            const meta = (notif.metadata ?? {}) as Record<string, unknown>
            window.dispatchEvent(new CustomEvent('barrapad:access-response', {
              detail: {
                noteId: notif.noteId,
                action: meta.action as string,
                resolvedByName: notif.fromName ?? 'Someone',
                permission: meta.permission as string | undefined,
              },
            }))
          }
        }

        if (msg.type === 'notification_update') {
          const id = msg.notificationId as string
          const updates = msg.updates as Partial<CollabNotification>
          setNotifications((prev) =>
            prev.map((n) => n.id === id ? { ...n, ...updates } : n)
          )
        }
      } catch {}
    })

    return () => {
      socket.close()
    }
  }, [userId])

  // Detect changes in sharedNotes compared to the last-known snapshot in localStorage.
  // First call sets the baseline without firing notifications (avoids flooding on first load).
  const detectSharedNotesChanges = useCallback((freshShared: SharedAccessRecord[]) => {
    const known = loadKnownShared()
    const freshMap = new Map(freshShared.map((r) => [r.token, r]))
    const isFirst = isFirstNotifFetch.current
    isFirstNotifFetch.current = false

    // First run with empty known → silent initialization (existing user first time with feature)
    if (isFirst && Object.keys(known).length === 0) {
      saveKnownShared(freshShared)
      return
    }

    const newNotifs: CollabNotification[] = []

    // New shares
    for (const [token, record] of freshMap) {
      if (!known[token]) {
        const who = record.ownerName || 'Someone'
        newNotifs.push({
          id: `shared-${token}`,
          type: 'shared',
          noteTitle: record.noteTitle,
          message: `${who} shared "${record.noteTitle || 'a note'}" with you`,
          timestamp: new Date().toISOString(),
        })
      }
    }

    // Deleted / access removed
    for (const [token, info] of Object.entries(known)) {
      if (!freshMap.has(token)) {
        const who = info.ownerName || 'Someone'
        newNotifs.push({
          id: `deleted-${token}`,
          type: 'deleted',
          noteTitle: info.title,
          message: `${who} removed access to "${info.title || 'a shared note'}"`,
          timestamp: new Date().toISOString(),
        })
      }
    }

    // Permission changes
    for (const [token, record] of freshMap) {
      const prev = known[token]
      if (prev && prev.permission !== record.permission) {
        const who = record.ownerName || prev.ownerName || 'Someone'
        newNotifs.push({
          id: `perm-${token}-${record.permission}`,
          type: 'permission_changed',
          noteTitle: record.noteTitle,
          message: `${who} changed your access to "${record.noteTitle || 'a note'}" to ${record.permission === 'EDIT' ? 'Can edit' : 'View only'}`,
          timestamp: new Date().toISOString(),
        })
      }
    }

    saveKnownShared(freshShared)

    if (newNotifs.length > 0) {
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((n) => n.id))
        const truly_new = newNotifs.filter((n) => !existingIds.has(n.id))
        if (truly_new.length === 0) return prev
        return [...truly_new, ...prev]
      })
    }
  }, [])

  // Poll for "opened" events — owner gets notified the first time a collaborator opens their note
  useEffect(() => {
    if (!userId) return
    // Ids already shown, kept across reloads so each open is announced once.
    try {
      const raw = localStorage.getItem('barrapad_opened_notified')
      if (raw) openedNotifiedRef.current = new Set(JSON.parse(raw) as string[])
    } catch {}
    const checkOpenedEvents = async () => {
      try {
        const res = await fetch('/api/share/access-events')
        if (!res.ok) return
        const events = (await res.json()) as { id: string; noteTitle: string; accessorName: string; accessedAt: string }[]
        const seen = openedNotifiedRef.current
        const newNotifs: CollabNotification[] = []
        for (const ev of events) {
          if (!seen.has(ev.id)) {
            newNotifs.push({
              id: `opened-${ev.id}`,
              type: 'opened',
              noteTitle: ev.noteTitle,
              message: `${ev.accessorName} opened "${ev.noteTitle || 'your note'}"`,
              timestamp: ev.accessedAt,
            })
            seen.add(ev.id)
          }
        }
        if (newNotifs.length > 0) {
          try { localStorage.setItem('barrapad_opened_notified', JSON.stringify([...seen])) } catch {}
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id))
            const truly_new = newNotifs.filter((n) => !existingIds.has(n.id))
            if (truly_new.length === 0) return prev
            return [...truly_new, ...prev]
          })
        }
      } catch {}
    }
    checkOpenedEvents()
    const interval = setInterval(checkOpenedEvents, 10000)
    return () => clearInterval(interval)
  }, [userId])

  return { notifications, setNotifications, detectSharedNotesChanges }
}
