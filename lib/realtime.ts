// Single place for the realtime (PartyServer on Cloudflare Workers) host.
// Note rooms live at /parties/note-y/<noteId>, notification rooms at
// /parties/main/notif-<userId>; clients use wss://, API routes use https://.
export const REALTIME_HOST =
  process.env.NEXT_PUBLIC_REALTIME_HOST ?? 'barrapad-realtime.barra-ggez.workers.dev'

const isLocal = REALTIME_HOST.startsWith('localhost') || REALTIME_HOST.startsWith('127.0.0.1')

/** HTTP URL of a room, for server-side pushes (title, delete, notifications). */
export function roomUrl(room: string) {
  const party = room.startsWith('notif-') ? 'main' : 'note-y'
  return `${isLocal ? 'http' : 'https'}://${REALTIME_HOST}/parties/${party}/${room}`
}

/** partysocket `query` for the browser. Fetches a fresh room ticket on every
 *  (re)connect, since tickets expire after 10 minutes. */
export function roomQuery(room: string, share?: string) {
  return async () => {
    const qs = new URLSearchParams({ room, ...(share ? { share } : {}) })
    const res = await fetch(`/api/realtime/ticket?${qs}`).catch(() => null)
    const data = res?.ok ? await res.json() as { ticket: string } : null
    return { ticket: data?.ticket ?? '' }
  }
}

/** Closes every live connection to a note room after access was revoked or
 *  lowered. Clients reconnect with a fresh ticket, which re-checks access. */
export async function kickRoom(noteId: string) {
  await fetch(roomUrl(noteId), {
    method: 'POST',
    headers: roomPushHeaders(),
    body: JSON.stringify({ type: 'kick' }),
  }).catch(() => {})
}

/** Headers for server-side pushes. The Worker rejects pushes without the shared
 *  secret when REALTIME_SECRET is configured on both sides. */
export function roomPushHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.REALTIME_SECRET) h['x-realtime-secret'] = process.env.REALTIME_SECRET
  return h
}
