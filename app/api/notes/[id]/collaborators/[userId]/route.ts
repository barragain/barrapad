import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// DELETE /api/notes/:id/collaborators/:userId — remove a collaborator (owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const note = await prisma.note.findUnique({ where: { id: params.id } })
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (note.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.noteCollaborator.deleteMany({
    where: { noteId: params.id, userId: params.userId },
  })

  return NextResponse.json({ success: true })
}
