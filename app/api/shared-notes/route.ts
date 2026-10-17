import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json([], { status: 200 })

  const [sharedAccess, collaborations] = await Promise.all([
    prisma.sharedAccess.findMany({
      where: { userId },
      orderBy: { lastSeen: 'desc' },
      take: 50,
    }),
    prisma.noteCollaborator.findMany({
      where: { userId },
      include: { note: true },
      orderBy: { invitedAt: 'desc' },
    }),
  ])

  // Avoid duplicates — if a noteId is already covered by a SharedAccess record, skip it
  const sharedNoteIds = new Set(sharedAccess.map((r) => r.noteId))

  // Owner display names from Clerk, for every entry. SharedAccess rows are
  // created with an empty ownerName, so they need the note's owner too.
  const collabsToShow = collaborations.filter((c) => !sharedNoteIds.has(c.noteId))
  const accessOwners = await prisma.note.findMany({
    where: { id: { in: sharedAccess.filter((r) => !r.ownerName).map((r) => r.noteId) } },
    select: { id: true, userId: true },
  })
  const ownerOfNote = new Map(accessOwners.map((n) => [n.id, n.userId]))
  const ownerUserIds = [...new Set([...collabsToShow.map((c) => c.note.userId), ...ownerOfNote.values()])]
  const ownerNameMap = new Map<string, string>()
  if (ownerUserIds.length > 0) {
    try {
      const client = await clerkClient()
      await Promise.all(
        ownerUserIds.map(async (uid) => {
          // One missing user (deleted in Clerk) must not blank every other name.
          const u = await client.users.getUser(uid).catch(() => null)
          if (!u) return
          const name =
            [u.firstName, u.lastName].filter(Boolean).join(' ') ||
            u.username ||
            'Someone'
          ownerNameMap.set(uid, name)
        })
      )
    } catch {}
  }

  const collabRecords = collabsToShow.map((c) => ({
    id: c.id,
    noteId: c.noteId,
    noteTitle: c.note.title,
    token: `collab-${c.noteId}`,
    permission: c.permission,
    lastSeen: c.invitedAt.toISOString(),
    ownerName: ownerNameMap.get(c.note.userId) ?? '',
  }))

  const result = [
    ...sharedAccess.map((r) => ({
      id: r.id,
      noteId: r.noteId,
      noteTitle: r.noteTitle,
      token: r.token,
      permission: r.permission,
      lastSeen: r.lastSeen.toISOString(),
      ownerName: r.ownerName || ownerNameMap.get(ownerOfNote.get(r.noteId) ?? '') || '',
    })),
    ...collabRecords,
  ]

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { noteId } = (await req.json()) as { noteId: string }
  if (!noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 })

  // Remove from both sources so collab-invited and link-accessed notes are handled
  await Promise.all([
    prisma.sharedAccess.deleteMany({ where: { userId, noteId } }),
    prisma.noteCollaborator.deleteMany({ where: { userId, noteId } }),
  ])
  return NextResponse.json({ ok: true })
}
