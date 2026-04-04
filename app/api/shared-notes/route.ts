import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json([], { status: 200 })

  const records = await prisma.sharedAccess.findMany({
    where: { userId },
    orderBy: { lastSeen: 'desc' },
    take: 50,
  })

  return NextResponse.json(records)
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { noteId } = await req.json() as { noteId: string }
  if (!noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 })

  await prisma.sharedAccess.deleteMany({ where: { userId, noteId } })
  return NextResponse.json({ ok: true })
}
