// barraPAD realtime server on Cloudflare Workers + Durable Objects (PartyServer).
// Two kinds of room: NoteYParty (/parties/note-y/<noteId>) carries a note's
// content as a Yjs doc plus its tags, title, delete and comment signals;
// NoteParty (/parties/main/notif-<userId>) carries a user's notifications.
import { Server, routePartykitRequest, type Connection, type ConnectionContext } from 'partyserver'
import { YServer } from 'y-partyserver'
import * as Y from 'yjs'

// REALTIME_SECRET: `wrangler secret put REALTIME_SECRET`; the same value is set on
// Vercel so API routes can push into rooms. When set, HTTP pushes without it are
// rejected (anyone could otherwise fake notifications or delete-room signals).
type Env = { Main: DurableObjectNamespace<NoteParty>; NoteY: DurableObjectNamespace<NoteYParty>; REALTIME_SECRET?: string }

function allowedPush(request: Request, env: Env) {
  return !env.REALTIME_SECRET || request.headers.get('x-realtime-secret') === env.REALTIME_SECRET
}

// Notification rooms: API routes POST, the room relays to the user's tabs.
export class NoteParty extends Server<Env> {
  async onRequest(request: Request) {
    if (request.method !== 'POST') return new Response('ok')
    if (!allowedPush(request, this.env)) return new Response('Forbidden', { status: 403 })
    if (this.name.startsWith('notif-')) {
      try { this.broadcast(JSON.stringify(await request.json())) } catch {}
    }
    return new Response('ok')
  }
}

// Note rooms. The Y doc starts empty, so one client must fill it from the
// database HTML. The client asks with "seed?" and its database updatedAt; the
// room grants exactly one connection at a time, when the doc is empty or the
// database is newer than the version the doc was last matched to (an edit
// made outside the room). The granted client loads the HTML and answers
// "seeded". Clients report each saved version with "saved", so the room knows
// which database version it holds.
//
// The other custom messages are relayed as they come: "tags", "title" and
// "comment-update" from clients, "title" and "delete" from API routes.
type ClientMessage =
  | { type: 'seed?'; dbUpdatedAt: string }
  | { type: 'seeded'; dbUpdatedAt: string }
  | { type: 'saved'; dbUpdatedAt: string }
  | { type: 'tags'; tags: object[] }
  | { type: 'title'; title: string }
  | { type: 'comment-update'; noteId: string }

export class NoteYParty extends YServer<Env> {
  static callbackOptions = { debounceWait: 1_000, debounceMaxWait: 5_000 }
  // In memory only: a seed that never finishes (tab closed) frees itself.
  private seeding: { id: string; until: number } | null = null

  async onLoad() {
    const state = await this.ctx.storage.get<Uint8Array>('ydoc')
    if (state) Y.applyUpdate(this.document, state)
  }

  async onSave() {
    await this.ctx.storage.put('ydoc', Y.encodeStateAsUpdate(this.document))
  }

  isReadOnly(conn: Connection) {
    return (conn.state as { readOnly?: boolean } | null)?.readOnly === true
  }

  async onConnect(conn: Connection, ctx: ConnectionContext) {
    const ticket = new URL(ctx.request.url).searchParams.get('ticket') ?? ''
    // Merge: YServer keeps awareness ids in the same connection state.
    conn.setState((prev: object | null) => ({ ...prev, readOnly: ticket.startsWith('READ.') }))
    if (await this.ctx.storage.get<boolean>('deleted')) {
      this.sendCustomMessage(conn, JSON.stringify({ type: 'delete' }))
      return
    }
    return super.onConnect(conn, ctx)
  }

  onClose(conn: Connection, code: number, reason: string, wasClean: boolean) {
    if (this.seeding?.id === conn.id) this.seeding = null
    return super.onClose(conn, code, reason, wasClean)
  }

  async onCustomMessage(conn: Connection, message: string) {
    let msg: ClientMessage
    try { msg = JSON.parse(message) as ClientMessage } catch { return }
    // Viewers can comment, so they may signal it. Everything else is a write.
    if (msg.type === 'comment-update') {
      this.broadcastCustomMessage(JSON.stringify({ type: 'comment-update', noteId: msg.noteId }), conn)
      return
    }
    if (this.isReadOnly(conn)) return
    if (msg.type === 'tags') { this.broadcastCustomMessage(JSON.stringify({ type: 'tags', tags: msg.tags }), conn); return }
    if (msg.type === 'title') { this.broadcastCustomMessage(JSON.stringify({ type: 'title', title: msg.title }), conn); return }

    if (typeof msg.dbUpdatedAt !== 'string') return
    const roomDb = (await this.ctx.storage.get<string>('dbUpdatedAt')) ?? ''
    if (msg.type === 'seed?') {
      if (this.seeding && this.seeding.until < Date.now()) this.seeding = null
      const empty = this.document.getXmlFragment('default').length === 0
      // No stamp yet with content present: a note created online in a tab
      // (temp- doc); its first save stamps it. Never replace that content.
      const grant = !this.seeding && (empty || (roomDb !== '' && msg.dbUpdatedAt > roomDb))
      if (grant) this.seeding = { id: conn.id, until: Date.now() + 10_000 }
      this.sendCustomMessage(conn, JSON.stringify({ type: 'seed', grant }))
      return
    }
    if (msg.type === 'seeded' && this.seeding?.id === conn.id) this.seeding = null
    if (msg.dbUpdatedAt > roomDb) await this.ctx.storage.put('dbUpdatedAt', msg.dbUpdatedAt)
  }

  // HTTP POST from the Next.js API routes: renames, deletes and kicks.
  async onRequest(request: Request) {
    if (request.method !== 'POST') return new Response('ok')
    if (!allowedPush(request, this.env)) return new Response('Forbidden', { status: 403 })
    try {
      const msg = await request.json() as { type?: string; title?: string }
      if (msg.type === 'title' && typeof msg.title === 'string') this.broadcastCustomMessage(JSON.stringify({ type: 'title', title: msg.title }))
      if (msg.type === 'delete') {
        await this.ctx.storage.put('deleted', true)
        this.broadcastCustomMessage(JSON.stringify({ type: 'delete' }))
      }
      // Access revoked or lowered: drop everyone. Clients reconnect with a
      // fresh ticket, so whoever lost access gets 403 and stays out, and a
      // downgraded editor comes back read-only.
      if (msg.type === 'kick') {
        for (const conn of this.getConnections()) conn.close(4001, 'access changed')
      }
    } catch {}
    return new Response('ok')
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
    // Binding "Main" => /parties/main/<room>, "NoteY" => /parties/note-y/<room>.
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
} satisfies ExportedHandler<Env>
