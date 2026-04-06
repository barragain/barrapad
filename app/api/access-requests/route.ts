import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pushNotification } from '@/lib/notifications'

// POST /api/access-requests — create an access request
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { noteId: string }
  if (!body.noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 })

  const note = await prisma.note.findUnique({
    where: { id: body.noteId },
    include: { collaborators: true },
  })
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  // Check if user already has access
  if (note.userId === userId) return NextResponse.json({ error: 'You own this note' }, { status: 400 })
  const existingCollab = note.collaborators.find((c) => c.userId === userId)
  if (existingCollab) return NextResponse.json({ error: 'You already have access' }, { status: 400 })

  // Get requester info
  let requesterName = 'Someone'
  let requesterAvatar = ''
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    requesterName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      'Someone'
    requesterAvatar = user.imageUrl ?? ''
  } catch {}

  // Create or update access request
  const request_ = await prisma.accessRequest.upsert({
    where: { noteId_requesterId: { noteId: body.noteId, requesterId: userId } },
    update: { status: 'pending', requesterName, requesterAvatar, resolvedBy: null, resolvedByName: null, grantedPermission: null, resolvedAt: null },
    create: {
      noteId: body.noteId,
      requesterId: userId,
      requesterName,
      requesterAvatar,
    },
  })

  // Notify owner
  await pushNotification({
    userId: note.userId,
    type: 'access_request',
    noteId: note.id,
    noteTitle: note.title,
    message: `${requesterName} is requesting access to "${note.title || 'your note'}"`,
    fromUserId: userId,
    fromName: requesterName,
    fromAvatar: requesterAvatar,
    metadata: { accessRequestId: request_.id },
  })

  // Notify editors
  const editors = note.collaborators.filter((c) => c.permission === 'EDIT')
  for (const editor of editors) {
    await pushNotification({
      userId: editor.userId,
      type: 'access_request',
      noteId: note.id,
      noteTitle: note.title,
      message: `${requesterName} is requesting access to "${note.title || 'a note'}"`,
      fromUserId: userId,
      fromName: requesterName,
      fromAvatar: requesterAvatar,
      metadata: { accessRequestId: request_.id },
    })
  }

  return NextResponse.json({
    id: request_.id,
    status: request_.status,
  })
}

// GET /api/access-requests — get user's pending requests
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json([])

  const requests = await prisma.accessRequest.findMany({
    where: { requesterId: userId },
    include: { note: { select: { title: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    requests.map((r) => ({
      id: r.id,
      noteId: r.noteId,
      noteTitle: r.note.title,
      status: r.status,
      resolvedByName: r.resolvedByName,
      grantedPermission: r.grantedPermission,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }))
  )
}
