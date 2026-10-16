# How bpad saves and syncs

The database is the source of truth for every note. The browser keeps a copy in localStorage so the app paints instantly, and the realtime room on the Cloudflare Worker is a cache that carries live edits between open tabs. When the three disagree, the newest server-issued `updatedAt` wins.

## Saving

Every keystroke writes the note to localStorage. Fifty milliseconds later the change is broadcast to the note's room, and after one second without typing a PATCH goes to `/api/notes/<id>`. Saves are also forced on blur, when the tab is hidden, on note switch, and on unload with a synchronous request. A dirty counter per note stops a server refetch from overwriting edits that have not been saved yet, and each save is bound to the note id it was made for, so switching notes mid-save cannot write one note's text into another.

New notes appear at once with a `temp-` id and take the real id when the server answers. Guest notes (no account) use `local-` ids, live only in localStorage under `bpad_guest_notes`, never touch the API or the rooms, and move into the account on sign-in.

The editor stays read-only until the first `/api/notes` answer of the session. The app refetches on window focus, on reconnect and when the tab becomes visible, and `fetchNotes` merges by `updatedAt`. That value must always come from the server; a client clock would make the merge pick the wrong copy.

Polling covers what the rooms do not: the open note every 5 seconds (three 404s in a row means it was deleted), the shared notes list and "who opened my note" events every 10 seconds, and the access-denied screen every 3 seconds.

## Realtime rooms

Each note has a room named by its id, and each user has a notification room `notif-<userId>`. Rooms live at `/parties/main/<room>` on the Worker (`realtime/index.ts`, PartyServer on Durable Objects). The room stores content, title, `updatedAt` and a deleted flag. A client takes the room's initial `sync` only when its `updatedAt` is newer than the copy it already holds.

Remote content is applied as one replace step over the range that changed (`applyRemoteContent` in `extensions/collab-cursor.ts`), so the local caret and the remote cursors move with their text when someone edits above them. Edits are last write wins; two people typing in the same paragraph at the same moment can overwrite each other. The Yjs trial below removes that.

| Direction | Message | Carries |
|---|---|---|
| client to room | `update` | HTML, JSON, title, timestamp |
| client to room | `tags`, `title`, `delete` | the new value |
| client to room | `cursor` | position, name, colour, avatar |
| client to room | `comment-update` | note id, tells others to refetch comments |
| room to client | `sync` | content, title, `updatedAt`, connection count, cursors (on connect) |
| room to client | `update`, `tags`, `title`, `delete`, `cursor`, `cursor-leave`, `comment-update` | relayed from other clients |
| room to client | `presence` | connection count |
| API to room (HTTP POST) | `title`, `delete`, `notification`, `notification_update` | requires the `x-realtime-secret` header |

## Live merging with Yjs (on trial)

Opening bpad with `?crdt=1` turns on Yjs for that browser (stored in `localStorage.bpad_crdt`, `?crdt=0` turns it off). Note content then travels through a Y doc in a second room, `/parties/note-y/<note>` (`NoteYParty`, a `YServer`), and Tiptap's Collaboration and CollaborationCaret extensions bind the editor to it. Concurrent edits merge instead of overwriting each other. The JSON room stays open for tags, titles, deletes and comments, and its content and cursor messages are ignored.

The room keeps the doc in its storage, but the database is still where the note lives. Each tab that edits a note saves its HTML with the usual PATCH and reports the new `updatedAt` to the room (`saved`), so the room knows which database version its doc matches. A tab that only watches never saves. A fresh room is filled once: a tab asks with `seed?`, and the room lets exactly one tab load the database HTML, when the doc is empty or the database is newer than the room's stamp (an edit made without the switch). The others wait for the merged doc. Until a note's doc arrives, the cached copy is shown read-only.

The editor is mounted once per note in this mode, because Collaboration binds one doc per editor. A new note gets its doc at once and goes online on that same doc when its `temp-` id becomes the real one, so typing is never interrupted. Guest notes have no room and keep the plain path. Undo and redo come from Yjs, so they only undo your own edits.

## Who can join a room

A browser cannot open a room socket on its own. It first asks `/api/realtime/ticket?room=<room>` (with `&share=<token>` on a public link), and the route checks access: the owner, a collaborator, a valid share link, or the user's own notification room. The answer is a ticket, `<READ|WRITE>.<expiresMs>.<hmac>`, signed with `REALTIME_SECRET` and valid for ten minutes. `partysocket` fetches a fresh one on every reconnect. The Worker verifies the signature in `onBeforeConnect` and refuses the socket without a valid ticket. A READ connection may send cursor and comment signals; its content writes are dropped.

Revoking a link or removing a collaborator does not close sockets that are already open. They lose access at their next reconnect.

Without `REALTIME_SECRET` (local `wrangler dev`) neither side checks tickets.

## Files

Images, attachments and voice memos are uploaded to Vercel Blob through `/api/upload` (10 MB, no HTML, SVG, XML or script types), and the note keeps only the URL. If the upload fails, for example for a guest without an account, the file falls back to a base64 data URL inside the note. Images are re-encoded as WebP at most 1600 px on that path first, since for guests the data URL ends up in localStorage.
