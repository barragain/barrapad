import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

  const body = (await request.json()) as { title?: string; content?: string }

  const note = await prisma.note.update({
    where: { id: params.id },
    data: {
      title: body.title ?? owned.title,
      content: body.content ?? owned.content,
    },
  })

  return NextResponse.json(note)
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
