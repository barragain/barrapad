import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/notes/mentionable?q=query — notes the user can link to
export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json([])

  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? ''

  // Get own notes
  const ownNotes = await prisma.note.findMany({
    where: { userId },
    select: { id: true, title: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  // Get notes where user is a collaborator
  const collabs = await prisma.noteCollaborator.findMany({
    where: { userId },
    include: { note: { select: { id: true, title: true, userId: true } } },
    take: 50,
  })

  // Get owner names for collab notes
  const ownerIds = [...new Set(collabs.map((c) => c.note.userId))]
  const ownerNames = new Map<string, string>()
  if (ownerIds.length > 0) {
    try {
      const { clerkClient } = await import('@clerk/nextjs/server')
      const client = await clerkClient()
      for (const uid of ownerIds) {
        const u = await client.users.getUser(uid)
        ownerNames.set(uid, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'Someone')
      }
    } catch {}
  }

  const results = [
    ...ownNotes.map((n) => ({
      id: n.id,
      title: n.title || 'Untitled',
      isOwner: true,
      ownerName: undefined as string | undefined,
    })),
    ...collabs
      .filter((c) => !ownNotes.some((n) => n.id === c.noteId))
      .map((c) => ({
        id: c.noteId,
        title: c.note.title || 'Untitled',
        isOwner: false,
        ownerName: ownerNames.get(c.note.userId) ?? 'Someone',
      })),
  ]

  // Filter by query
  const filtered = q
    ? results.filter((r) => r.title.toLowerCase().includes(q))
    : results

  return NextResponse.json(filtered.slice(0, 15))
}
