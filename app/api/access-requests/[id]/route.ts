import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushNotification, pushNotificationUpdate } from '@/lib/notifications'

// PATCH /api/access-requests/:id — accept or deny
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { action: 'accept' | 'deny'; permission?: string }
  if (!body.action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const accessReq = await prisma.accessRequest.findUnique({
    where: { id: params.id },
    include: { note: { include: { collaborators: true } } },
  })
  if (!accessReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only owner or editors can accept/deny
  const isOwner = accessReq.note.userId === userId
  const isEditor = accessReq.note.collaborators.some((c) => c.userId === userId && c.permission === 'EDIT')
  if (!isOwner && !isEditor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (accessReq.status !== 'pending') {
    return NextResponse.json({ error: 'Already resolved', resolvedByName: accessReq.resolvedByName }, { status: 400 })
  }

  // Get resolver name
  let resolverName = 'Someone'
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    resolverName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      'Someone'
  } catch {}

  const permission = body.action === 'accept' ? (body.permission === 'EDIT' ? 'EDIT' : 'READ') : null

  // Update request
  await prisma.accessRequest.update({
    where: { id: params.id },
    data: {
      status: body.action === 'accept' ? 'accepted' : 'denied',
      resolvedBy: userId,
      resolvedByName: resolverName,
      grantedPermission: permission,
      resolvedAt: new Date(),
    },
  })

  // If accepted, add as collaborator
  if (body.action === 'accept' && permission) {
    let requesterUsername = ''
    let requesterDisplayName = accessReq.requesterName
    let requesterAvatarUrl = accessReq.requesterAvatar
    try {
      const client = await clerkClient()
      const user = await client.users.getUser(accessReq.requesterId)
      requesterUsername = user.username ?? ''
      requesterDisplayName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.username ||
        requesterDisplayName
      requesterAvatarUrl = user.imageUrl ?? requesterAvatarUrl
    } catch {}

    await prisma.noteCollaborator.upsert({
      where: { noteId_userId: { noteId: accessReq.noteId, userId: accessReq.requesterId } },
      update: { permission, username: requesterUsername, displayName: requesterDisplayName, avatarUrl: requesterAvatarUrl },
      create: {
        noteId: accessReq.noteId,
        userId: accessReq.requesterId,
        permission,
        username: requesterUsername,
        displayName: requesterDisplayName,
        avatarUrl: requesterAvatarUrl,
      },
    })
  }

  // Notify the requester
  const actionWord = body.action === 'accept' ? 'accepted' : 'denied'
  await pushNotification({
    userId: accessReq.requesterId,
    type: 'access_response',
    noteId: accessReq.noteId,
    noteTitle: accessReq.note.title,
    message: `${resolverName} ${actionWord} your request to access "${accessReq.note.title || 'a note'}"${permission ? ` (${permission === 'EDIT' ? 'Can edit' : 'View only'})` : ''}`,
    fromUserId: userId,
    fromName: resolverName,
    metadata: { action: body.action, permission, accessRequestId: accessReq.id },
  })

  // Mark all related access_request notifications as read and update with "solved by" info
  const relatedNotifs = await prisma.notification.findMany({
    where: {
      type: 'access_request',
      metadata: { contains: accessReq.id },
    },
  })

  for (const notif of relatedNotifs) {
    await prisma.notification.update({
      where: { id: notif.id },
      data: {
        read: true,
        readAt: new Date(),
        metadata: JSON.stringify({
          ...JSON.parse(notif.metadata || '{}'),
          resolved: true,
          resolvedByName: resolverName,
          action: body.action,
          permission,
        }),
      },
    })

    // Push real-time update to all notification holders
    await pushNotificationUpdate(notif.userId, {
      type: 'notification_update',
      notificationId: notif.id,
      updates: {
        read: true,
        readAt: new Date().toISOString(),
        metadata: {
          ...JSON.parse(notif.metadata || '{}'),
          resolved: true,
          resolvedByName: resolverName,
          action: body.action,
          permission,
        },
      },
    })
  }

  return NextResponse.json({ ok: true, action: body.action, resolvedByName: resolverName })
}

// DELETE /api/access-requests/:id — cancel request (by requester)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessReq = await prisma.accessRequest.findUnique({ where: { id: params.id } })
  if (!accessReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (accessReq.requesterId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.accessRequest.delete({ where: { id: params.id } })

  // Clean up related notifications
  await prisma.notification.deleteMany({
    where: {
      type: 'access_request',
      metadata: { contains: accessReq.id },
    },
  })

  return NextResponse.json({ ok: true })
}
