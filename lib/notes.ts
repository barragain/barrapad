import { prisma } from '@/lib/prisma'
import type { Note, Tag } from '@/types'

function parseTags(raw: string): Tag[] {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

/** All notes a user owns, newest first, in the shape the client stores.
 *  Used by GET /api/notes and by the server-rendered page so the first paint
 *  already carries fresh notes (no round trip, no stale-cache lock). */
export async function listOwnedNotes(userId: string): Promise<Note[]> {
  const notes = await prisma.note.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { shareLinks: { where: { revokedAt: null } } } } },
  })
  return notes.map(({ _count, ...n }) => ({
    ...n,
    tags: parseTags(n.tags),
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    isShared: _count.shareLinks > 0,
  }))
}
