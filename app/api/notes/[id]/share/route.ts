import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

async function verifyOwnership(noteId: string, userId: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } })
  if (!note) return null
  if (note.userId !== userId) return false
  return note
}

// GET /api/notes/:id/share — list active share links for a note
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await verifyOwnership(params.id, userId)
  if (owned === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (owned === false) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const links = await prisma.shareLink.findMany({
    where: { noteId: params.id, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(links)
}

// POST /api/notes/:id/share — create a share link
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await verifyOwnership(params.id, userId)
  if (owned === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (owned === false) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json()) as { permission?: string }
  const permission = body.permission === 'EDIT' ? 'EDIT' : 'READ'

  // Revoke any existing link of same permission before creating new one
  await prisma.shareLink.updateMany({
    where: { noteId: params.id, permission, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  const token = randomBytes(24).toString('hex') // 48-char hex, cryptographically random

  const link = await prisma.shareLink.create({
    data: { token, noteId: params.id, permission },
  })

  return NextResponse.json(link)
}
