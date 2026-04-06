import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/notifications — fetch user's notifications
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json([])

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(
    notifications.map((n) => ({
      id: n.id,
      type: n.type,
      noteId: n.noteId,
      noteTitle: n.noteTitle,
      message: n.message,
      fromUserId: n.fromUserId,
      fromName: n.fromName,
      fromAvatar: n.fromAvatar,
      metadata: JSON.parse(n.metadata || '{}'),
      read: n.read,
      readAt: n.readAt?.toISOString() ?? null,
      timestamp: n.createdAt.toISOString(),
    }))
  )
}

// PATCH /api/notifications — mark all as read
export async function PATCH() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

// DELETE /api/notifications — delete all notifications
export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.notification.deleteMany({ where: { userId } })

  return NextResponse.json({ ok: true })
}
