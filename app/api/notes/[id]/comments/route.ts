import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushNotification } from '@/lib/notifications'

// GET /api/notes/[id]/comments — fetch all comments for a note
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: noteId } = await params

  // Verify the user has access to this note (owner or collaborator)
  const note = await prisma.note.findUnique({ where: { id: noteId } })
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  const isOwner = note.userId === userId
  if (!isOwner) {
    const collab = await prisma.noteCollaborator.findUnique({
      where: { noteId_userId: { noteId, userId } },
    })
    if (!collab) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const comments = await prisma.comment.findMany({
    where: { noteId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(comments)
}

// POST /api/notes/[id]/comments — create a comment or reply
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: noteId } = await params
  const body = (await request.json()) as {
    content: string
    commentId?: string    // mark ID for root comments
    parentId?: string     // for replies
    mentions?: string[]   // userIds mentioned in the comment
  }

  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 })
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

  // Get commenter info
  let userName = 'Someone'
  let userAvatar = ''
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    userName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      'Someone'
    userAvatar = user.imageUrl ?? ''
  } catch {}

  const comment = await prisma.comment.create({
    data: {
      noteId,
      userId,
      userName,
      userAvatar,
      content: body.content.trim(),
      commentId: body.commentId ?? '',
      parentId: body.parentId ?? null,
    },
  })

  // Determine the note title for notifications
  const noteTitle = note.title || 'a note'

  // Collect all mentioned userIds so we never double-notify them
  const mentionedSet = new Set(body.mentions ?? [])
  mentionedSet.delete(userId) // never notify yourself

  // Notify mentioned users — this is the ONLY notification they get
  for (const mentionedId of mentionedSet) {
    await pushNotification({
      userId: mentionedId,
      type: 'comment_mention',
      noteId,
      noteTitle,
      message: `${userName} mentioned you in a comment on "${noteTitle}"`,
      fromUserId: userId,
      fromName: userName,
      fromAvatar: userAvatar,
      metadata: { commentId: comment.id, markCommentId: comment.commentId },
    })
  }

  // Notify non-mentioned users about the comment
  if (body.parentId) {
    // Reply — notify the root comment author (if not already mentioned)
    const rootComment = await prisma.comment.findUnique({ where: { id: body.parentId } })
    if (rootComment && rootComment.userId !== userId && !mentionedSet.has(rootComment.userId)) {
      await pushNotification({
        userId: rootComment.userId,
        type: 'comment_reply',
        noteId,
        noteTitle,
        message: `${userName} replied to your comment on "${noteTitle}"`,
        fromUserId: userId,
        fromName: userName,
        fromAvatar: userAvatar,
        metadata: { commentId: comment.id, markCommentId: rootComment.commentId },
      })
    }
  } else {
    // Root comment — notify note owner + collaborators (skip commenter + mentioned)
    const collaborators = await prisma.noteCollaborator.findMany({ where: { noteId } })
    const notifyIds = [note.userId, ...collaborators.map((c) => c.userId)]
      .filter((id) => id !== userId && !mentionedSet.has(id))
    const uniqueIds = [...new Set(notifyIds)]

    for (const targetId of uniqueIds) {
      await pushNotification({
        userId: targetId,
        type: 'comment',
        noteId,
        noteTitle,
        message: `${userName} commented on "${noteTitle}"`,
        fromUserId: userId,
        fromName: userName,
        fromAvatar: userAvatar,
        metadata: { commentId: comment.id, markCommentId: comment.commentId },
      })
    }
  }

  return NextResponse.json(comment)
}
