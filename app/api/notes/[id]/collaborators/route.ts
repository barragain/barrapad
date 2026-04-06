import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function verifyOwnership(noteId: string, userId: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } })
  if (!note) return null
  if (note.userId !== userId) return false
  return note
}

// GET /api/notes/:id/collaborators — list collaborators (owner or any collaborator can see)
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const note = await prisma.note.findUnique({ where: { id: params.id } })
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Allow access if user is owner or a collaborator
  const isOwner = note.userId === userId
  let isCollaborator = false
  if (!isOwner) {
    const collab = await prisma.noteCollaborator.findUnique({
      where: { noteId_userId: { noteId: params.id, userId } },
    })
    isCollaborator = !!collab
  }
  if (!isOwner && !isCollaborator) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const collaborators = await prisma.noteCollaborator.findMany({
    where: { noteId: params.id },
    orderBy: { invitedAt: 'desc' },
  })

  // Include the owner in the list for @mention purposes
  const result = [...collaborators]
  if (!result.some((c) => c.userId === note.userId)) {
    let ownerName = 'Owner'
    let ownerUsername = ''
    let ownerAvatar = ''
    try {
      const client = await clerkClient()
      const owner = await client.users.getUser(note.userId)
      ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.username || 'Owner'
      ownerUsername = owner.username ?? ''
      ownerAvatar = owner.imageUrl ?? ''
    } catch {}
    result.unshift({
      id: `owner-${note.userId}`,
      noteId: params.id,
      userId: note.userId,
      username: ownerUsername,
      displayName: ownerName,
      avatarUrl: ownerAvatar,
      permission: 'OWNER',
      invitedAt: note.createdAt,
    } as typeof result[0])
  }

  return NextResponse.json(result)
}

// POST /api/notes/:id/collaborators — invite a user by their Clerk userId
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await verifyOwnership(params.id, userId)
  if (owned === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (owned === false) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json()) as { targetUserId: string; permission?: string }
  if (!body.targetUserId) return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })
  if (body.targetUserId === userId) return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 })

  const permission = body.permission === 'EDIT' ? 'EDIT' : 'READ'

  // Fetch the invited user's profile from Clerk
  let username = ''
  let displayName = ''
  let avatarUrl = ''
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(body.targetUserId)
    username = user.username ?? ''
    displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      username ||
      user.emailAddresses[0]?.emailAddress ||
      ''
    avatarUrl = user.imageUrl ?? ''
  } catch {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const collab = await prisma.noteCollaborator.upsert({
    where: { noteId_userId: { noteId: params.id, userId: body.targetUserId } },
    update: { permission, username, displayName, avatarUrl },
    create: {
      noteId: params.id,
      userId: body.targetUserId,
      permission,
      username,
      displayName,
      avatarUrl,
    },
  })

  // ─── RESEND EMAIL NOTIFICATION ────────────────────────────────────────────
  // To notify the invited user by email, uncomment and complete the following:
  //
  // Prerequisites:
  //   1. npm install resend
  //   2. Add RESEND_API_KEY=re_... to .env
  //   3. Verify your sending domain at resend.com/domains
  //
  // import { Resend } from 'resend'
  // const resend = new Resend(process.env.RESEND_API_KEY)
  //
  // Get the invited user's primary email first (add to the clerkClient block above):
  //   const inviteeEmail = user.emailAddresses.find(
  //     (e) => e.id === user.primaryEmailAddressId
  //   )?.emailAddress
  //
  // Get the owner's name (add a second clerkClient call for the inviter):
  //   const owner = await client.users.getUser(userId)
  //   const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Someone'
  //
  // Then send:
  //   if (inviteeEmail) {
  //     await resend.emails.send({
  //       from: 'barraPAD <no-reply@bpad.cc>',
  //       to: inviteeEmail,
  //       subject: `${ownerName} shared "${owned.title || 'a note'}" with you`,
  //       html: `
  //         <p>Hi ${displayName || 'there'},</p>
  //         <p><strong>${ownerName}</strong> invited you to ${permission === 'EDIT' ? 'collaborate on' : 'view'} a note in barraPAD.</p>
  //         <p><a href="${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.bpad.cc'}">Open barraPAD →</a></p>
  //       `,
  //     })
  //   }
  // ──────────────────────────────────────────────────────────────────────────

  return NextResponse.json(collab)
}
