import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import YProvider from 'y-partyserver/provider'
import { getHTMLFromFragment } from '@tiptap/core'
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import type { Schema } from '@tiptap/pm/model'
import { REALTIME_HOST, roomQuery } from '@/lib/realtime'
import { onRoomMessage } from '@/lib/noteRoom'

// Offline editing for signed-in notes (docs/architecture.md, Offline). Each
// note's Yjs doc is kept in IndexedDB, so a note opened on this device can be
// edited with no network. Edits made while offline merge into the room when
// the socket is back, and the notes listed here still owe the database a save.

const DIRTY_KEY = 'bpad_offline_dirty'

/** IndexedDB copy of a note room's doc. */
export const persistDoc = (room: string, doc: Y.Doc) => new IndexeddbPersistence(`bpad-y-${room}`, doc)

export function loadOfflineDirty(): string[] {
  try { return JSON.parse(localStorage.getItem(DIRTY_KEY) ?? '[]') as string[] } catch { return [] }
}
function storeDirty(ids: string[]) {
  try { localStorage.setItem(DIRTY_KEY, JSON.stringify(ids)) } catch {}
}
/** Only owned notes with a room: temp-, local- and shared- ids are skipped. */
export function markOfflineDirty(noteId: string) {
  if (/^(temp|local|shared)-/.test(noteId)) return
  const ids = loadOfflineDirty()
  if (!ids.includes(noteId)) storeDirty([...ids, noteId])
}
export function clearOfflineDirty(noteId: string) {
  const ids = loadOfflineDirty()
  if (ids.includes(noteId)) storeDirty(ids.filter((id) => id !== noteId))
}

/**
 * Merge a note's offline doc into its room without opening it, and return its
 * HTML for the database save. `null` means nothing to save (no local doc, or
 * the note was deleted); a throw means try again later.
 */
export async function syncOfflineNote(room: string, schema: Schema): Promise<{ html: string; title: string } | null> {
  const doc = new Y.Doc()
  const idb = persistDoc(room, doc)
  let provider: YProvider | null = null
  try {
    await idb.whenSynced
    if (doc.getXmlFragment('default').length === 0) return null
    const p = new YProvider(REALTIME_HOST, room, doc, { party: 'note-y', params: roomQuery(room) })
    provider = p
    const deleted = await new Promise<boolean>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('sync timeout')), 15_000)
      p.on('synced', (s: boolean) => { if (s) { clearTimeout(t); resolve(false) } })
      onRoomMessage(p, (msg) => { if (msg.type === 'delete') { clearTimeout(t); resolve(true) } })
    })
    if (deleted) return null
    // Our side of the sync goes out right after the room's; give it a moment.
    await new Promise((r) => setTimeout(r, 500))
    const node = yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment('default'), schema)
    return { html: getHTMLFromFragment(node.content, schema), title: node.firstChild?.textContent.trim().slice(0, 100) || 'Untitled' }
  } finally {
    provider?.destroy()
    await idb.destroy()
    doc.destroy()
  }
}
