import type { Editor } from '@tiptap/react'
import type YProvider from 'y-partyserver/provider'
import type { Tag } from '@/types'

/** Custom messages a note room (NoteYParty) sends besides the Y doc. */
export type RoomMessage =
  | { type: 'seed'; grant: boolean }
  | { type: 'tags'; tags: Tag[] }
  | { type: 'title'; title: string }
  | { type: 'delete' }
  | { type: 'comment-update'; noteId?: string }

/** Listen to a note room's custom messages. Returns the unsubscribe. */
export function onRoomMessage(provider: YProvider, handler: (msg: RoomMessage) => void) {
  const listener = (raw: string) => {
    let msg: RoomMessage
    try { msg = JSON.parse(raw) as RoomMessage } catch { return }
    handler(msg)
  }
  provider.on('custom-message', listener)
  return () => provider.off('custom-message', listener)
}

export function sendRoomMessage(provider: YProvider | null | undefined, msg: Record<string, unknown>) {
  provider?.sendMessage(JSON.stringify(msg))
}

/**
 * Seed claim (see NoteYParty): ask the room whether this tab should load the
 * database HTML into the doc. Calls `done` once answered. Returns the cleanup.
 */
export function claimSeed(provider: YProvider, editor: Editor, db: () => { html: string; updatedAt: string }, done: () => void) {
  let answered = false
  const off = onRoomMessage(provider, (msg) => {
    if (msg.type !== 'seed' || answered) return
    answered = true
    if (msg.grant) {
      editor.commands.setContent(db().html || '', { emitUpdate: false })
      sendRoomMessage(provider, { type: 'seeded', dbUpdatedAt: db().updatedAt })
    }
    done()
  })
  const ask = () => sendRoomMessage(provider, { type: 'seed?', dbUpdatedAt: db().updatedAt })
  ask()
  // The ask is dropped while the socket is down; repeat until answered. The
  // editor stays read-only meanwhile, since the doc may still be empty.
  const t = setInterval(() => { if (!answered) ask() }, 3_000)
  return () => { clearInterval(t); off() }
}
