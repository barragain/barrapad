import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/user/username — update the current user's username via the backend SDK,
// which bypasses Clerk's front-end "session step-up" verification requirement.
export async function PATCH(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username } = (await request.json()) as { username: string }
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
    const client = await clerkClient()
    await client.users.updateUser(userId, { username })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    let msg = 'Failed to update username'
    if (e && typeof e === 'object' && 'errors' in e) {
      const clerkErrors = (e as { errors: Array<{ longMessage?: string; message?: string }> }).errors
      msg = clerkErrors[0]?.longMessage ?? clerkErrors[0]?.message ?? msg
    }
    const status = msg.toLowerCase().includes('taken') || msg.toLowerCase().includes('unique') ? 409 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
