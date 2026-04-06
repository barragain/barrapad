import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PATCH /api/notifications/:id — mark single notification as read
export async function PATCH(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notif = await prisma.notification.findUnique({ where: { id: params.id } })
  if (!notif || notif.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.notification.update({
    where: { id: params.id },
    data: { read: true, readAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
