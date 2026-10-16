import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signRoomTicket } from '@/lib/roomTicket'

// GET /api/realtime/ticket?room=<room>[&share=<token>]
// Public in the middleware: share-link viewers have no account. Every branch
// checks access itself before signing.
export async function GET(request: NextRequest) {
  const room = request.nextUrl.searchParams.get('room') ?? ''
  const share = request.nextUrl.searchParams.get('share')

  let perm: 'READ' | 'WRITE' | null = null

  if (share && !share.startsWith('collab-')) {
    const link = await prisma.shareLink.findUnique({ where: { token: share } })
    if (link && !link.revokedAt && link.noteId === room) perm = link.permission === 'EDIT' ? 'WRITE' : 'READ'
  } else {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (room.startsWith('notif-')) {
      if (room === `notif-${userId}`) perm = 'WRITE'
    } else {
      const note = await prisma.note.findUnique({
        where: { id: room },
        select: { userId: true, collaborators: { where: { userId }, select: { permission: true } } },
      })
      if (note?.userId === userId) perm = 'WRITE'
      else if (note?.collaborators[0]) perm = note.collaborators[0].permission === 'EDIT' ? 'WRITE' : 'READ'
    }
  }

  if (!perm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // No secret configured (local dev): the Worker does not check tickets either.
  return NextResponse.json({ ticket: signRoomTicket(room, perm) ?? '' })
}
