import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Tag } from '@/types'

function parseTags(raw: string): Tag[] {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

async function resolveToken(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { note: true },
  })
  if (!link || link.revokedAt) return null
  return link
}

// GET /api/share/:token — fetch note content (public, no auth required)
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const link = await resolveToken(params.token)
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    noteId: link.noteId,
    title: link.note.title,
    content: link.note.content,
    tags: parseTags(link.note.tags),
    permission: link.permission,
    updatedAt: link.note.updatedAt,
  })
}

// PATCH /api/share/:token — save edits via share link (requires auth + EDIT permission)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const link = await resolveToken(params.token)
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (link.permission !== 'EDIT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json()) as { title?: string; content?: string; tags?: Tag[] }

  const note = await prisma.note.update({
    where: { id: link.noteId },
    data: {
      title: body.title ?? link.note.title,
      content: body.content ?? link.note.content,
      ...(body.tags !== undefined && { tags: JSON.stringify(body.tags) }),
    },
  })

  // If the title changed, broadcast to the PartyKit room so the owner's open editor updates
  if (body.title !== undefined && body.title !== link.note.title) {
    const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'barrapad.barragain.partykit.dev'
    fetch(`https://${partyHost}/parties/main/${link.noteId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'title', title: body.title }),
    }).catch(() => {}) // best-effort
  }

  return NextResponse.json({ title: note.title, content: note.content, updatedAt: note.updatedAt })
}

// DELETE /api/share/:token — revoke a share link (owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const link = await resolveToken(params.token)
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (link.note.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.shareLink.update({
    where: { token: params.token },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
