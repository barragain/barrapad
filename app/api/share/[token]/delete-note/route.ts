import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function broadcastDeleteToParty(noteId: string) {
  const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'barrapad.barragain.partykit.dev'
  const isLocal = partyHost.startsWith('localhost') || partyHost.startsWith('127.0.0.1')
  const protocol = isLocal ? 'http' : 'https'
  await fetch(`${protocol}://${partyHost}/parties/main/${noteId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'delete' }),
  }).catch(() => {})
}

// DELETE /api/share/:token/delete-note — delete the underlying note via share link
// Requires auth + EDIT permission on the share link
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const link = await prisma.shareLink.findUnique({
    where: { token: params.token },
    include: { note: true },
  })
  if (!link || link.revokedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (link.permission !== 'EDIT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Broadcast before deleting so the room still exists to receive it
  await broadcastDeleteToParty(link.noteId)
  await prisma.sharedAccess.deleteMany({ where: { noteId: link.noteId } })
  await prisma.note.delete({ where: { id: link.noteId } })

  return NextResponse.json({ success: true })
}
