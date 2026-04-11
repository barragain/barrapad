import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Tag } from '@/types'

function parseTags(raw: string): Tag[] {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

function partyUrl(noteId: string) {
  const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'barrapad.barragain.partykit.dev'
  const isLocal = partyHost.startsWith('localhost') || partyHost.startsWith('127.0.0.1')
  const protocol = isLocal ? 'http' : 'https'
  return `${protocol}://${partyHost}/parties/main/${noteId}`
}

async function broadcastTitleToParty(noteId: string, title: string) {
  await fetch(partyUrl(noteId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'title', title }),
  }).catch(() => {})
}

async function broadcastDeleteToParty(noteId: string) {
  await fetch(partyUrl(noteId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'delete' }),
  }).catch(() => {})
}

async function verifyOwnership(noteId: string, userId: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } })
  if (!note) return null
  if (note.userId !== userId) return false
  return note
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const note = await prisma.note.findUnique({ where: { id: params.id } })
  if (!note || note.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ id: note.id }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
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
    await broadcastTitleToParty(params.id, body.title)
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

  // Broadcast before deleting so the PartyKit room still exists to receive it
  await broadcastDeleteToParty(params.id)
  await prisma.sharedAccess.deleteMany({ where: { noteId: params.id } })
  await prisma.note.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
