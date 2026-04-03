import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
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
