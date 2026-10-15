import { prisma } from '@/lib/prisma'
import { roomUrl as partyUrl, roomPushHeaders } from '@/lib/realtime'

/** Create a notification in the DB and push it to the user via PartyKit */
export async function pushNotification(params: {
  userId: string
  type: string
  noteId?: string
  noteTitle?: string
  message: string
  fromUserId?: string
  fromName?: string
  fromAvatar?: string
  metadata?: Record<string, unknown>
}) {
  const notif = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      noteId: params.noteId ?? null,
      noteTitle: params.noteTitle ?? '',
      message: params.message,
      fromUserId: params.fromUserId ?? null,
      fromName: params.fromName ?? '',
      fromAvatar: params.fromAvatar ?? '',
      metadata: JSON.stringify(params.metadata ?? {}),
    },
  })

  // Push to user's notification room via PartyKit
  const payload = {
    type: 'notification',
    notification: {
      id: notif.id,
      type: notif.type,
      noteId: notif.noteId,
      noteTitle: notif.noteTitle,
      message: notif.message,
      fromUserId: notif.fromUserId,
      fromName: notif.fromName,
      fromAvatar: notif.fromAvatar,
      metadata: params.metadata ?? {},
      read: false,
      timestamp: notif.createdAt.toISOString(),
    },
  }

  await fetch(partyUrl(`notif-${params.userId}`), {
    method: 'POST',
    headers: roomPushHeaders(),
    body: JSON.stringify(payload),
  }).catch(() => {})

  return notif
}

/** Push a real-time update to a user's notification room (e.g. access request resolved) */
export async function pushNotificationUpdate(userId: string, update: Record<string, unknown>) {
  await fetch(partyUrl(`notif-${userId}`), {
    method: 'POST',
    headers: roomPushHeaders(),
    body: JSON.stringify(update),
  }).catch(() => {})
}
