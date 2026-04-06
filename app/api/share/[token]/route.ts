import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Tag } from '@/types'

function parseTags(raw: string): Tag[] {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

async function broadcastTitleToParty(noteId: string, title: string) {
  const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'barrapad.barragain.partykit.dev'
  const isLocal = partyHost.startsWith('localhost') || partyHost.startsWith('127.0.0.1')
  const protocol = isLocal ? 'http' : 'https'
  await fetch(`${protocol}://${partyHost}/parties/main/${noteId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'title', title }),
  }).catch(() => {})
}

async function resolveToken(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { note: true },
  })
  if (!link || link.revokedAt) return null
  return link
}

// Resolve a "collab-{noteId}" token — direct user invite, requires auth
async function resolveCollabToken(noteId: string, userId: string) {
  const [collab, note] = await Promise.all([
    prisma.noteCollaborator.findUnique({
      where: { noteId_userId: { noteId, userId } },
    }),
    prisma.note.findUnique({ where: { id: noteId } }),
  ])
  if (!collab || !note) return null
  return { noteId, note, permission: collab.permission }
}

// GET /api/share/:token — fetch note content (public, no auth required)
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  // Direct collaborator access — requires auth
  if (params.token.startsWith('collab-')) {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const noteId = params.token.slice(7)
    const access = await resolveCollabToken(noteId, userId)
    if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({
      noteId: access.noteId,
      title: access.note.title,
      content: access.note.content,
      tags: parseTags(access.note.tags),
      permission: access.permission,
      updatedAt: access.note.updatedAt,
    })
  }

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

  // Direct collaborator access
  if (params.token.startsWith('collab-')) {
    const noteId = params.token.slice(7)
    const access = await resolveCollabToken(noteId, userId)
    if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (access.permission !== 'EDIT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = (await request.json()) as { title?: string; content?: string; tags?: Tag[] }
    const note = await prisma.note.update({
      where: { id: noteId },
      data: {
        title: body.title ?? access.note.title,
        content: body.content ?? access.note.content,
        ...(body.tags !== undefined && { tags: JSON.stringify(body.tags) }),
      },
    })
    if (body.title !== undefined && body.title !== access.note.title) {
      await broadcastTitleToParty(noteId, body.title)
    }
    return NextResponse.json({ title: note.title, content: note.content, updatedAt: note.updatedAt })
  }

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
    await broadcastTitleToParty(link.noteId, body.title)
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
