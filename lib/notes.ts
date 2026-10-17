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

/** Whether a user who is not the owner can open a note: a collaborator, or
 *  someone who opened it through a share link that is still live. */
export async function canOpenNote(noteId: string, userId: string): Promise<boolean> {
  const [collab, access] = await Promise.all([
    prisma.noteCollaborator.findUnique({ where: { noteId_userId: { noteId, userId } } }),
    prisma.sharedAccess.findUnique({ where: { userId_noteId: { userId, noteId } } }),
  ])
  if (collab) return true
  return !!access && (await prisma.shareLink.count({ where: { token: access.token, noteId, revokedAt: null } })) > 0
}
