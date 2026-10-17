import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { kickRoom } from '@/lib/realtime'

async function verifyOwner(noteId: string, ownerId: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } })
  if (!note) return null
  if (note.userId !== ownerId) return false
  return note
}

// PATCH /api/notes/:id/collaborators/:userId — change a collaborator's permission (owner only)
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await verifyOwner(params.id, userId)
  if (!owned) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 403 })

  const { permission } = (await request.json()) as { permission: string }
  if (permission !== 'READ' && permission !== 'EDIT') {
    return NextResponse.json({ error: 'Invalid permission' }, { status: 400 })
  }

  const { count } = await prisma.noteCollaborator.updateMany({
    where: { noteId: params.id, userId: params.userId },
    data: { permission },
  })
  if (!count) return NextResponse.json({ error: 'Not a collaborator' }, { status: 404 })
  // The collaborator's "Shared with me" entry carries the permission too.
  await prisma.sharedAccess.updateMany({
    where: { noteId: params.id, userId: params.userId, token: `collab-${params.id}` },
    data: { permission },
  })
  await kickRoom(params.id)

  return NextResponse.json({ success: true, permission })
}

// DELETE /api/notes/:id/collaborators/:userId — remove a collaborator (owner only)
export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await verifyOwner(params.id, userId)
  if (!owned) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 403 })

  await prisma.noteCollaborator.deleteMany({
    where: { noteId: params.id, userId: params.userId },
  })
  await prisma.sharedAccess.deleteMany({
    where: { noteId: params.id, userId: params.userId, token: `collab-${params.id}` },
  })
  await kickRoom(params.id)

  return NextResponse.json({ success: true })
}
