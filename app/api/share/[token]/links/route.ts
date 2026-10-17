import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/share/:token/links
// Returns active share links for the note referenced by :token.
// Requires the caller to be authenticated and the token (or collab-<noteId> for
// an edit collaborator) to have EDIT permission.
export async function GET(_request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Edit collaborators come in with the virtual token collab-<noteId>.
  const collabNoteId = params.token.startsWith('collab-') ? params.token.slice('collab-'.length) : null
  const grant = collabNoteId
    ? await prisma.noteCollaborator.findUnique({ where: { noteId_userId: { noteId: collabNoteId, userId } } })
    : await prisma.shareLink.findUnique({ where: { token: params.token } })
  if (!grant || ('revokedAt' in grant && grant.revokedAt)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (grant.permission !== 'EDIT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const links = await prisma.shareLink.findMany({
    where: { noteId: grant.noteId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(links)
}
