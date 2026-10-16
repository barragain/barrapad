import { auth } from '@clerk/nextjs/server'
import AppShell from '@/components/AppShell'
import { listOwnedNotes } from '@/lib/notes'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Load the user's notes during the request instead of after Clerk boots in
  // the browser: the page arrives with fresh data, so the editor is usable at
  // first paint and never has to wait on /api/notes. Falls back to the client
  // path (localStorage cache + fetch) if the query fails.
  const { userId } = await auth()
  const initialNotes = userId ? await listOwnedNotes(userId).catch(() => undefined) : undefined
  return <AppShell initialNotes={initialNotes} guest={!userId} />
}
