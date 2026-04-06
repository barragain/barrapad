import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  try {
    const client = await clerkClient()
    const { data: users } = await client.users.getUserList({ query: q, limit: 8 })

    const results = users
      .filter((u) => u.id !== userId)
      .map((u) => ({
        id: u.id,
        username: u.username ?? '',
        displayName:
          [u.firstName, u.lastName].filter(Boolean).join(' ') ||
          u.username ||
          u.emailAddresses[0]?.emailAddress ||
          'Unknown',
        imageUrl: u.imageUrl,
        email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? '',
      }))

    return NextResponse.json(results)
  } catch {
    return NextResponse.json([])
  }
}
