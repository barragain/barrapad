import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  // Server-side limits; the browser checks are advisory only. Images, attachments
  // and voice memos all land here. Types a browser would run as a page are refused
  // (Blob serves files publicly, so an HTML or SVG upload would be a phishing page).
  if (/html|svg|xml|javascript/i.test(file.type)) return NextResponse.json({ error: 'File type not allowed' }, { status: 415 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File larger than 10 MB' }, { status: 413 })

  const blob = await put(`notes/${userId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`, file, {
    access: 'public',
    addRandomSuffix: true,
  })

  return NextResponse.json({ url: blob.url })
}
