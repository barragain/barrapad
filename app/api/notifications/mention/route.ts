import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushNotification } from '@/lib/notifications'

// POST /api/notifications/mention — send mention notification
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    mentionedUserId: string
    noteId: string
    noteTitle: string
  }

  if (!body.mentionedUserId || !body.noteId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Don't notify yourself
  if (body.mentionedUserId === userId) {
    return NextResponse.json({ ok: true })
  }

  // Get sender info from Clerk
  let fromName = 'Someone'
  let fromAvatar = ''
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    fromName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      'Someone'
    fromAvatar = user.imageUrl ?? ''
  } catch {}

  await pushNotification({
    userId: body.mentionedUserId,
    type: 'mention',
    noteId: body.noteId,
    noteTitle: body.noteTitle || 'a note',
    message: `${fromName} mentioned you in "${body.noteTitle || 'a note'}"`,
    fromUserId: userId,
    fromName,
    fromAvatar,
  })

  return NextResponse.json({ ok: true })
}
