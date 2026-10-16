import { createHmac } from 'crypto'

// Server only. A ticket lets one browser join one realtime room for a short
// time: "<perm>.<expiresMs>.<hmac>". The Worker checks it with the same
// REALTIME_SECRET (see realtime/index.ts). READ tickets cannot change content.
export type RoomPerm = 'READ' | 'WRITE'

const TTL_MS = 10 * 60 * 1000

export function signRoomTicket(room: string, perm: RoomPerm): string | null {
  const secret = process.env.REALTIME_SECRET
  if (!secret) return null
  const exp = Date.now() + TTL_MS
  const sig = createHmac('sha256', secret).update(`${room}.${perm}.${exp}`).digest('hex')
  return `${perm}.${exp}.${sig}`
}
