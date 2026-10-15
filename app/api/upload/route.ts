import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  // Server-side limits; the browser checks are advisory only.
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Only images can be uploaded' }, { status: 415 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Image larger than 10 MB' }, { status: 413 })

  const blob = await put(`notes/${userId}/${Date.now()}-${file.name}`, file, {
    access: 'public',
    addRandomSuffix: true,
  })

  return NextResponse.json({ url: blob.url })
}
