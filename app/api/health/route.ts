import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/health — one cheap query. The realtime Worker calls this on a cron
// so the Neon compute never autosuspends; a cold wake otherwise adds one to
// two seconds to the first save or load after a quiet spell.
export async function GET(request: NextRequest) {
  const secret = process.env.REALTIME_SECRET
  if (secret && request.headers.get('x-realtime-secret') !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const t = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, dbMs: Date.now() - t })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
