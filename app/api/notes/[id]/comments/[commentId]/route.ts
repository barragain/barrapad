import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushNotification } from '@/lib/notifications'

// PATCH /api/notes/[id]/comments/[commentId] — resolve or edit
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: noteId, commentId } = await params
  const body = (await request.json()) as {
    resolved?: boolean
    content?: string
  }

  const comment = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment || comment.noteId !== noteId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Verify access
  const note = await prisma.note.findUnique({ where: { id: noteId } })
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  const isOwner = note.userId === userId
  if (!isOwner) {
    const collab = await prisma.noteCollaborator.findUnique({
      where: { noteId_userId: { noteId, userId } },
    })
    if (!collab) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data: Record<string, unknown> = {}
  if (body.resolved !== undefined) {
    data.resolved = body.resolved
    data.resolvedBy = body.resolved ? userId : null
    data.resolvedAt = body.resolved ? new Date() : null
  }
  if (body.content !== undefined) {
    data.content = body.content.trim()
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data,
  })

  // Notify the comment author when someone resolves their comment
  if (body.resolved === true && comment.userId !== userId) {
    let resolverName = 'Someone'
    let resolverAvatar = ''
    try {
      const client = await clerkClient()
      const user = await client.users.getUser(userId)
      resolverName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.username ||
        'Someone'
      resolverAvatar = user.imageUrl ?? ''
    } catch {}

    await pushNotification({
      userId: comment.userId,
      type: 'comment_resolved',
      noteId,
      noteTitle: note.title || 'a note',
      message: `${resolverName} resolved your comment on "${note.title || 'a note'}"`,
      fromUserId: userId,
      fromName: resolverName,
      fromAvatar: resolverAvatar,
      metadata: { commentId },
    })
  }

  return NextResponse.json(updated)
}

// DELETE /api/notes/[id]/comments/[commentId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: noteId, commentId } = await params

  const comment = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment || comment.noteId !== noteId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Only the comment author or note owner can delete
  const note = await prisma.note.findUnique({ where: { id: noteId } })
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  if (comment.userId !== userId && note.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.comment.delete({ where: { id: commentId } })

  return NextResponse.json({ ok: true })
}
