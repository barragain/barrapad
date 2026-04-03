import type * as Party from 'partykit/server'

// Message types
type ClientMessage =
  | { type: 'update'; content: string; title: string }

type ServerMessage =
  | { type: 'sync'; content: string; title: string; updatedAt: string; connections: number }
  | { type: 'update'; content: string; title: string; updatedAt: string }
  | { type: 'presence'; connections: number }

export default class NoteParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    // Send current state to the new joiner
    const content   = (await this.room.storage.get<string>('content'))   ?? ''
    const title     = (await this.room.storage.get<string>('title'))     ?? ''
    const updatedAt = (await this.room.storage.get<string>('updatedAt')) ?? new Date().toISOString()
    const connections = [...this.room.getConnections()].length

    const sync: ServerMessage = { type: 'sync', content, title, updatedAt, connections }
    conn.send(JSON.stringify(sync))

    // Tell everyone the new headcount
    this.broadcastPresence()
  }

  onClose() {
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

      // Persist in durable storage so late joiners get the latest version
      await this.room.storage.put('content', data.content)
      await this.room.storage.put('title', data.title)
      await this.room.storage.put('updatedAt', updatedAt)

      // Broadcast to everyone except the sender
      const outgoing: ServerMessage = {
        type: 'update',
        content: data.content,
        title: data.title,
        updatedAt,
      }
      this.room.broadcast(JSON.stringify(outgoing), [sender.id])
    }
  }

  private broadcastPresence() {
    const connections = [...this.room.getConnections()].length
    const msg: ServerMessage = { type: 'presence', connections }
    this.room.broadcast(JSON.stringify(msg))
  }
}
