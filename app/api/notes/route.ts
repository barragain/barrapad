import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listOwnedNotes } from '@/lib/notes'
import { createHash } from 'crypto'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json(await listOwnedNotes(userId), {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Optional body: used to move notes written before sign-up into the account.
  const body = (await request.json().catch(() => ({}))) as { title?: unknown; content?: unknown; tags?: unknown; guestId?: unknown }
  const tags = Array.isArray(body.tags) ? body.tags : []
  const data = {
    userId,
    title: typeof body.title === 'string' ? body.title.slice(0, 200) : 'Untitled',
    content: typeof body.content === 'string' ? body.content : '',
    tags: JSON.stringify(tags),
  }
  // An imported guest note gets an id derived from the account and its local
  // id, so a retry after a reload mid-import finds the same row instead of
  // creating a second copy.
  const id = typeof body.guestId === 'string'
    ? 'g' + createHash('sha256').update(`${userId}:${body.guestId}`).digest('hex').slice(0, 24)
    : null
  const note = id
    ? await prisma.note.upsert({ where: { id }, create: { id, ...data }, update: {} })
    : await prisma.note.create({ data })

  return NextResponse.json({ ...note, tags })
}
