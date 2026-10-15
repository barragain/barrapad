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

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const note = await prisma.note.create({
    data: {
      userId,
      title: 'Untitled',
      content: '',
    },
  })

  return NextResponse.json({ ...note, tags: [] })
}
