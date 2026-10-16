import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listOwnedNotes } from '@/lib/notes'

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
  const body = (await request.json().catch(() => ({}))) as { title?: unknown; content?: unknown; tags?: unknown }
  const tags = Array.isArray(body.tags) ? body.tags : []
  const note = await prisma.note.create({
    data: {
      userId,
      title: typeof body.title === 'string' ? body.title.slice(0, 200) : 'Untitled',
      content: typeof body.content === 'string' ? body.content : '',
      tags: JSON.stringify(tags),
    },
  })

  return NextResponse.json({ ...note, tags })
}
