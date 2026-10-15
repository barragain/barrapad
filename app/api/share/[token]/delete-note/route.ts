import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roomUrl, roomPushHeaders } from '@/lib/realtime'

async function broadcastDeleteToParty(noteId: string) {
  await fetch(roomUrl(noteId), {
    method: 'POST',
    headers: roomPushHeaders(),
    body: JSON.stringify({ type: 'delete' }),
  }).catch(() => {})
}

async function deleteNote(noteId: string) {
  await broadcastDeleteToParty(noteId)
  await prisma.sharedAccess.deleteMany({ where: { noteId } })
  await prisma.noteCollaborator.deleteMany({ where: { noteId } })
  await prisma.note.delete({ where: { id: noteId } })
}

// DELETE /api/share/:token/delete-note — delete the underlying note via share link
// Requires auth + EDIT permission
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Direct collaborator access via collab-{noteId} token
  if (params.token.startsWith('collab-')) {
    const noteId = params.token.slice(7)
    const collab = await prisma.noteCollaborator.findUnique({
      where: { noteId_userId: { noteId, userId } },
    })
    if (!collab) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (collab.permission !== 'EDIT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await deleteNote(noteId)
    return NextResponse.json({ success: true })
  }

  const link = await prisma.shareLink.findUnique({
    where: { token: params.token },
    include: { note: true },
  })
  if (!link || link.revokedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (link.permission !== 'EDIT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await deleteNote(link.noteId)
  return NextResponse.json({ success: true })
}
