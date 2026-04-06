import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/share/access-events
// Returns SharedAccess records for notes owned by the current user (i.e. "who has opened my notes").
// Only returns events for collaborators that still have an active NoteCollaborator invite.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json([])

  const ownedNotes = await prisma.note.findMany({
    where: { userId },
    select: { id: true, title: true },
  })
  if (ownedNotes.length === 0) return NextResponse.json([])

  const noteIds = ownedNotes.map((n) => n.id)
  const noteTitleMap = new Map(ownedNotes.map((n) => [n.id, n.title]))

  // SharedAccess records for my notes from other users
  const accesses = await prisma.sharedAccess.findMany({
    where: {
      noteId: { in: noteIds },
      NOT: { userId },
    },
  })

  if (accesses.length === 0) return NextResponse.json([])

  // Only include accesses where the collaborator invite is still active
  const activeCollabs = await prisma.noteCollaborator.findMany({
    where: {
      noteId: { in: accesses.map((a) => a.noteId) },
      userId: { in: accesses.map((a) => a.userId) },
    },
    select: { noteId: true, userId: true, displayName: true, username: true },
  })

  const activeSet = new Set(activeCollabs.map((c) => `${c.noteId}:${c.userId}`))
  const nameMap = new Map(
    activeCollabs.map((c) => [
      `${c.noteId}:${c.userId}`,
      c.displayName || c.username || 'Someone',
    ])
  )

  const result = accesses
    .filter((a) => activeSet.has(`${a.noteId}:${a.userId}`))
    .map((a) => ({
      id: `${a.noteId}:${a.userId}`,
      noteId: a.noteId,
      noteTitle: noteTitleMap.get(a.noteId) ?? a.noteTitle,
      accessorName: nameMap.get(`${a.noteId}:${a.userId}`) ?? 'Someone',
      accessedAt: a.lastSeen.toISOString(),
    }))

  return NextResponse.json(result)
}
