import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/share/:token/links
// Returns active share links for the note referenced by :token.
// Requires the caller to be authenticated and the token to have EDIT permission.
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const link = await prisma.shareLink.findUnique({
    where: { token: params.token },
  })
  if (!link || link.revokedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (link.permission !== 'EDIT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const links = await prisma.shareLink.findMany({
    where: { noteId: link.noteId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(links)
}
