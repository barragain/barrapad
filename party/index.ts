import type * as Party from 'partykit/server'

type ClientMessage =
  | { type: 'update'; content: string; title: string; ts?: number }
  | { type: 'cursor'; from: number; to: number; name: string; color: string; imageUrl?: string; mx?: number; my?: number }

type CursorState = { id: string; from: number; to: number; name: string; color: string; imageUrl?: string; mx?: number; my?: number }

type ServerMessage =
  | { type: 'sync'; content: string; title: string; updatedAt: string; connections: number; cursors: CursorState[] }
  | { type: 'update'; content: string; title: string; updatedAt: string; ts?: number }
  | { type: 'presence'; connections: number }
  | { type: 'cursor'; id: string; from: number; to: number; name: string; color: string; imageUrl?: string; mx?: number; my?: number }
  | { type: 'cursor-leave'; id: string }

export default class NoteParty implements Party.Server {
  private cursors = new Map<string, Omit<CursorState, 'id'>>()

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    const content   = (await this.room.storage.get<string>('content'))   ?? ''
    const title     = (await this.room.storage.get<string>('title'))     ?? ''
    const updatedAt = (await this.room.storage.get<string>('updatedAt')) ?? new Date().toISOString()
    const connections = [...this.room.getConnections()].length
    const cursors = [...this.cursors.entries()].map(([id, c]) => ({ id, ...c }))

    const sync: ServerMessage = { type: 'sync', content, title, updatedAt, connections, cursors }
    conn.send(JSON.stringify(sync))

    this.broadcastPresence()
  }

  onClose(conn: Party.Connection) {
    this.cursors.delete(conn.id)
    this.room.broadcast(JSON.stringify({ type: 'cursor-leave', id: conn.id } satisfies ServerMessage))
    this.broadcastPresence()
  }

  async onMessage(message: string, sender: Party.Connection) {
    let data: ClientMessage
    try {
      data = JSON.parse(message) as ClientMessage
    } catch {
      return
    }

    if (data.type === 'update') {
      const updatedAt = new Date().toISOString()
      await this.room.storage.put('content', data.content)
      await this.room.storage.put('title', data.title)
      await this.room.storage.put('updatedAt', updatedAt)

      const outgoing: ServerMessage = { type: 'update', content: data.content, title: data.title, updatedAt, ts: data.ts }
      this.room.broadcast(JSON.stringify(outgoing), [sender.id])
    }

    if (data.type === 'cursor') {
      const cursorData = { from: data.from, to: data.to, name: data.name, color: data.color, imageUrl: data.imageUrl, mx: data.mx, my: data.my }
      this.cursors.set(sender.id, cursorData)

      const outgoing: ServerMessage = { type: 'cursor', id: sender.id, ...cursorData }
      this.room.broadcast(JSON.stringify(outgoing), [sender.id])
    }
  }

  private broadcastPresence() {
    const connections = [...this.room.getConnections()].length
    this.room.broadcast(JSON.stringify({ type: 'presence', connections } satisfies ServerMessage))
  }
}
