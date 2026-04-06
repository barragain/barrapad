import { auth } from '@clerk/nextjs/server'
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

  const collabRecords = collaborations
    .filter((c) => !sharedNoteIds.has(c.noteId))
    .map((c) => ({
      id: c.id,
      noteId: c.noteId,
      noteTitle: c.note.title,
      token: `collab-${c.noteId}`,
      permission: c.permission,
      lastSeen: c.invitedAt.toISOString(),
    }))

  const result = [
    ...sharedAccess.map((r) => ({
      id: r.id,
      noteId: r.noteId,
      noteTitle: r.noteTitle,
      token: r.token,
      permission: r.permission,
      lastSeen: r.lastSeen.toISOString(),
    })),
    ...collabRecords,
  ]

  return NextResponse.json(result)
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
