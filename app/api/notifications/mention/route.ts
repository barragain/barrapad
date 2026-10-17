import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canOpenNote } from '@/lib/notes'
import { pushNotification } from '@/lib/notifications'

// POST /api/notifications/mention — send mention notification
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    mentionedUserId: string
    noteId: string
  }

  if (!body.mentionedUserId || !body.noteId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Don't notify yourself
  if (body.mentionedUserId === userId) {
    return NextResponse.json({ ok: true })
  }

  // Only someone who can open the note may mention from it, and the title
  // comes from the database, not the request.
  const note = await prisma.note.findUnique({ where: { id: body.noteId }, select: { userId: true, title: true } })
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  if (note.userId !== userId && !(await canOpenNote(body.noteId, userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const noteTitle = note.title || 'a note'

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
    noteTitle,
    message: `${fromName} mentioned you in "${noteTitle}"`,
    fromUserId: userId,
    fromName,
    fromAvatar,
  })

  return NextResponse.json({ ok: true })
}
