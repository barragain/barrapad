// barraPAD realtime server on Cloudflare Workers + Durable Objects (PartyServer).
// Port of party/index.ts. Same rooms, same messages, same URL shape
// (/parties/main/<room>), so the clients only need a new host.
import { Server, routePartykitRequest, type Connection, type ConnectionContext } from 'partyserver'

// REALTIME_SECRET: `wrangler secret put REALTIME_SECRET`; the same value is set on
// Vercel so API routes can push into rooms. When set, HTTP pushes without it are
// rejected (anyone could otherwise fake notifications or delete-room signals).
type Env = { Main: DurableObjectNamespace<NoteParty>; REALTIME_SECRET?: string; APP_URL?: string }

type ClientMessage =
  | { type: 'update'; content: string; contentJson?: object; title: string; ts?: number }
  | { type: 'tags'; tags: object[] }
  | { type: 'title'; title: string }
  | { type: 'delete' }
  | { type: 'cursor'; from: number; to: number; name: string; color: string; imageUrl?: string; mx?: number; my?: number }
  | { type: 'comment-update'; noteId: string }

type CursorState = { id: string; from: number; to: number; name: string; color: string; imageUrl?: string; mx?: number; my?: number }

type ServerMessage =
  | { type: 'sync'; content: string; contentJson?: object; title: string; updatedAt: string; connections: number; cursors: CursorState[] }
  | { type: 'update'; content: string; contentJson?: object; title: string; updatedAt: string; ts?: number }
  | { type: 'tags'; tags: object[] }
  | { type: 'title'; title: string }
  | { type: 'delete' }
  | { type: 'presence'; connections: number }
  | { type: 'cursor'; id: string; from: number; to: number; name: string; color: string; imageUrl?: string; mx?: number; my?: number }
  | { type: 'cursor-leave'; id: string }

export class NoteParty extends Server<Env> {
  // Not hibernated on purpose: cursors live in memory, like the PartyKit version.
  private cursors = new Map<string, Omit<CursorState, 'id'>>()

  private get isNotifRoom() { return this.name.startsWith('notif-') }
  private send(msg: ServerMessage | Record<string, unknown>, exclude: string[] = []) {
    this.broadcast(JSON.stringify(msg), exclude)
  }

  async onConnect(conn: Connection<{ readOnly: boolean }>, ctx: ConnectionContext) {
    // Ticket was verified in onBeforeConnect; only its permission is read here.
    const ticket = new URL(ctx.request.url).searchParams.get('ticket') ?? ''
    conn.setState({ readOnly: ticket.startsWith('READ.') })
    if (this.isNotifRoom) return

    const deleted = await this.ctx.storage.get<boolean>('deleted')
    if (deleted) {
      conn.send(JSON.stringify({ type: 'delete' } satisfies ServerMessage))
      return
    }

    const content     = (await this.ctx.storage.get<string>('content'))     ?? ''
    const contentJson = (await this.ctx.storage.get<object>('contentJson')) ?? undefined
    const title       = (await this.ctx.storage.get<string>('title'))       ?? ''
    const updatedAt   = (await this.ctx.storage.get<string>('updatedAt'))   ?? new Date().toISOString()
    const connections = [...this.getConnections()].length
    const cursors     = [...this.cursors.entries()].map(([id, c]) => ({ id, ...c }))

    conn.send(JSON.stringify({ type: 'sync', content, contentJson, title, updatedAt, connections, cursors } satisfies ServerMessage))
    this.broadcastPresence()
  }

  onClose(conn: Connection) {
    this.cursors.delete(conn.id)
    this.send({ type: 'cursor-leave', id: conn.id })
    this.broadcastPresence()
  }

  // Note the argument order: PartyServer passes (connection, message), PartyKit passed (message, sender).
  async onMessage(sender: Connection, message: string | ArrayBuffer) {
    let data: ClientMessage
    try {
      data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)) as ClientMessage
    } catch {
      return
    }

    // View-only connections may move their cursor and signal comments (viewers can comment).
    const readOnly = (sender.state as { readOnly?: boolean } | null)?.readOnly
    if (readOnly && data.type !== 'cursor' && data.type !== 'comment-update') return

    if (data.type === 'update') {
      const updatedAt = new Date().toISOString()
      await this.ctx.storage.put('content', data.content)
      await this.ctx.storage.put('title', data.title)
      await this.ctx.storage.put('updatedAt', updatedAt)
      if (data.contentJson) await this.ctx.storage.put('contentJson', data.contentJson)
      this.send({ type: 'update', content: data.content, contentJson: data.contentJson, title: data.title, updatedAt, ts: data.ts }, [sender.id])
    }

    if (data.type === 'tags') this.send({ type: 'tags', tags: data.tags }, [sender.id])
    if (data.type === 'title') this.send({ type: 'title', title: data.title }, [sender.id])

    if (data.type === 'delete') {
      await this.ctx.storage.put('deleted', true)
      this.send({ type: 'delete' })
    }

    if (data.type === 'comment-update') this.send({ type: 'comment-update', noteId: data.noteId }, [sender.id])

    if (data.type === 'cursor') {
      const cursorData = { from: data.from, to: data.to, name: data.name, color: data.color, imageUrl: data.imageUrl, mx: data.mx, my: data.my }
      this.cursors.set(sender.id, cursorData)
      this.send({ type: 'cursor', id: sender.id, ...cursorData }, [sender.id])
    }
  }

  // HTTP POST into a room from the Next.js API routes (title/delete/notification pushes).
  async onRequest(request: Request) {
    if (request.method === 'POST') {
      const secret = this.env.REALTIME_SECRET
      if (secret && request.headers.get('x-realtime-secret') !== secret) {
        return new Response('Forbidden', { status: 403 })
      }
      try {
        const data = await request.json() as Record<string, unknown>
        if (this.isNotifRoom) {
          this.send(data)
          return new Response('ok')
        }
        const msg = data as unknown as ClientMessage
        if (msg.type === 'title') {
          await this.ctx.storage.put('title', msg.title)
          this.send({ type: 'title', title: msg.title })
        }
        if (msg.type === 'delete') {
          await this.ctx.storage.put('deleted', true)
          this.send({ type: 'delete' })
        }
      } catch {}
    }
    return new Response('ok')
  }

  private broadcastPresence() {
    this.send({ type: 'presence', connections: [...this.getConnections()].length })
  }
}

// Ticket from the app's /api/realtime/ticket (lib/roomTicket.ts):
// "<READ|WRITE>.<expiresMs>.<hex hmac-sha256 of room.perm.exp>".
async function verifyTicket(secret: string, room: string, ticket: string) {
  const [perm, exp, sig] = ticket.split('.')
  if ((perm !== 'READ' && perm !== 'WRITE') || !sig || !(Number(exp) > Date.now())) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = new Uint8Array(sig.match(/../g)?.map((h) => parseInt(h, 16)) ?? [])
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${room}.${perm}.${exp}`))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Binding "Main" => routes /parties/main/<room>, identical to the PartyKit URLs.
    const res = await routePartykitRequest(request, env, {
      onBeforeConnect: async (req, lobby) => {
        if (!env.REALTIME_SECRET) return // local dev without a secret
        const ticket = new URL(req.url).searchParams.get('ticket') ?? ''
        if (!(await verifyTicket(env.REALTIME_SECRET, lobby.name, ticket))) {
          return new Response('Forbidden', { status: 403 })
        }
      },
    })
    return res ?? new Response('Not found', { status: 404 })
  },
  // Cron (see wrangler.jsonc): keeps the Neon compute warm by hitting the
  // app's health route, which runs a single SELECT 1.
  async scheduled(_controller: ScheduledController, env: Env) {
    if (!env.APP_URL) return
    await fetch(`${env.APP_URL}/api/health`, {
      headers: env.REALTIME_SECRET ? { 'x-realtime-secret': env.REALTIME_SECRET } : {},
    }).catch(() => {})
  },
} satisfies ExportedHandler<Env>
