import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/notes/:id/access — check if user has access to a note
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const note = await prisma.note.findUnique({
    where: { id: params.id },
    include: { collaborators: true },
  })

  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  // Owner
  if (note.userId === userId) {
    return NextResponse.json({ access: true, permission: 'OWNER', noteTitle: note.title })
  }

  // Collaborator
  const collab = note.collaborators.find((c) => c.userId === userId)
  if (collab) {
    return NextResponse.json({ access: true, permission: collab.permission, noteTitle: note.title })
  }

  // Check if there's a pending access request
  const pendingRequest = await prisma.accessRequest.findUnique({
    where: { noteId_requesterId: { noteId: params.id, requesterId: userId } },
  })

  return NextResponse.json({
    access: false,
    noteTitle: note.title,
    pendingRequest: pendingRequest
      ? { id: pendingRequest.id, status: pendingRequest.status, resolvedByName: pendingRequest.resolvedByName, grantedPermission: pendingRequest.grantedPermission }
      : null,
  })
}
