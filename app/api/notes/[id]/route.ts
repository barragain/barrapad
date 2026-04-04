import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Tag } from '@/types'

function parseTags(raw: string): Tag[] {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

function broadcastTitleToParty(noteId: string, title: string) {
  const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'barrapad.barragain.partykit.dev'
  const isLocal = partyHost.startsWith('localhost') || partyHost.startsWith('127.0.0.1')
  const protocol = isLocal ? 'http' : 'https'
  fetch(`${protocol}://${partyHost}/parties/main/${noteId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'title', title }),
  }).catch(() => {})
}

async function verifyOwnership(noteId: string, userId: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } })
  if (!note) return null
  if (note.userId !== userId) return false
  return note
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await verifyOwnership(params.id, userId)
  if (owned === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (owned === false) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json()) as { title?: string; content?: string; tags?: Tag[] }

  const note = await prisma.note.update({
    where: { id: params.id },
    data: {
      title: body.title ?? owned.title,
      content: body.content ?? owned.content,
      ...(body.tags !== undefined && { tags: JSON.stringify(body.tags) }),
    },
  })

  // If the title changed, broadcast to the PartyKit room so collaborators' editors update
  if (body.title !== undefined && body.title !== owned.title) {
    broadcastTitleToParty(params.id, body.title)
  }

  return NextResponse.json({ ...note, tags: parseTags(note.tags) })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await verifyOwnership(params.id, userId)
  if (owned === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (owned === false) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.note.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
