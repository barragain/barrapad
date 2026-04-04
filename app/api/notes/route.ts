import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Tag } from '@/types'

function parseTags(raw: string): Tag[] {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notes = await prisma.note.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(notes.map(n => ({ ...n, tags: parseTags(n.tags) })))
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
