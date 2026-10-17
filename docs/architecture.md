# How bpad saves and syncs

The database is the source of truth for every note. The browser keeps a copy in localStorage so the app paints instantly, and the realtime room on the Cloudflare Worker is a cache that carries live edits between open tabs. When the three disagree, the newest server-issued `updatedAt` wins.

## Saving

Every keystroke writes the note to localStorage and goes to the note's room through Yjs, and after one second without typing a PATCH goes to `/api/notes/<id>`. Saves are also forced on blur, when the tab is hidden, on note switch, and on unload with a synchronous request. A dirty counter per note stops a server refetch from overwriting edits that have not been saved yet, and each save is bound to the note id it was made for, so switching notes mid-save cannot write one note's text into another.

New notes appear at once with a `temp-` id and take the real id when the server answers. If the user has moved to another note by then, the app stays where they are. Guest notes (no account) use `local-` ids, live only in localStorage under `bpad_guest_notes`, never touch the API or the rooms, and move into the account on sign-in. The import sends each guest note's local id along, and the server gives the imported note an id derived from the account and that local id, so a reload in the middle of an import cannot create a second copy.

## Offline

`public/sw.js` is a service worker registered by AppShell. Page loads are network-first, and the last good copy of each path is kept. Hashed build files under `/_next/static` are cache-first. Icons and the Clerk script are network-first with a cached fallback. API calls, room sockets and uploads are never cached. A guest can open and edit bpad with no network, since their notes live in the browser anyway. Signed-in notes are edited offline through their Yjs docs. The Editor keeps every note's doc in IndexedDB with y-indexeddb (`persistDoc` in `lib/offlineNotes.ts`), so the doc of a note opened on this device before loads without the room. Offline, such a doc goes live at once (`offlineLive`) and skips the seed claim; a note without a kept doc stays a read-only preview, because a doc built from cached HTML would duplicate its content when merged with the room's. A failed PATCH, or any edit made while `navigator.onLine` is false, adds the note to `bpad_offline_dirty` in localStorage, and a successful save removes it. A page opened offline reloads when the network returns. Once a room syncs again (a reconnect, or that reload), the Editor saves the open note from its editor if it is listed, and merges each other listed note in the background: a headless Y.Doc loads it from IndexedDB, syncs with the room, renders HTML with the live editor's schema and saves it. Because the kept doc shares its history with the room, the merge keeps edits made elsewhere while this device was offline. A seed grant on a note that is still listed does not load the database HTML, so offline edits are never replaced by an older database copy.

## Polls

A poll is a Tiptap node whose attributes hold the question, the options with their vote counts, and `voters`, a JSON map from user id to the chosen option. A signed-in user votes once per account, on any device. A guest votes once per browser (localStorage). Only people who can edit the note can vote, since a view-only reader's change would never be saved.

The editor stays read-only until the first `/api/notes` answer of the session. The app refetches on window focus, on reconnect and when the tab becomes visible, and `fetchNotes` merges by `updatedAt`. That value must always come from the server; a client clock would make the merge pick the wrong copy.

Polling covers what the rooms do not: the open note every 5 seconds (three 404s in a row means it was deleted), the shared notes list and "who opened my note" events every 10 seconds, and the access-denied screen every 3 seconds.

## Realtime rooms

Each note has one room named by its id, at `/parties/note-y/<note>` on the Worker (`NoteYParty` in `realtime/index.ts`, a `YServer` from y-partyserver on Durable Objects). Each user also has a notification room at `/parties/main/notif-<userId>` (`NoteParty`). Guest notes have no room. Both room classes hibernate, so an idle open socket does not keep its Durable Object running (and billed); a wake-up reloads the Y doc from storage and y-partyserver keeps awareness ids in the connection state.

The note's content lives in the room as a Yjs doc, and Tiptap's Collaboration and CollaborationCaret extensions bind the editor to it, so two people typing in the same paragraph at the same moment both keep their text. Carets and the share page's presence avatars come from Yjs awareness. Everything else travels as custom messages on the same socket:

| Direction | Message | Carries |
|---|---|---|
| client to room | `seed?`, `seeded`, `saved` | the database `updatedAt` the client holds (see below) |
| client to room | `tags`, `title` | the new value, relayed to the other clients |
| client to room | `comment-update` | note id, tells others to refetch comments |
| room to client | `seed` | whether this client may fill the doc |
| room to client | `tags`, `title`, `comment-update`, `delete` | relayed |
| API to room (HTTP POST) | `title`, `delete`, `kick` | requires the `x-realtime-secret` header |
| API to notification room (HTTP POST) | `notification`, `notification_update` | same header |

The room keeps the doc in its storage, but the database is still where the note lives. Each tab that edits a note saves its HTML with the usual PATCH and reports the new `updatedAt` to the room (`saved`), so the room knows which database version its doc matches. A tab that only watches never saves. A fresh room is filled once: a tab asks with `seed?`, and the room lets exactly one tab load the database HTML, when the doc is empty or the database is newer than the room's stamp (an edit made outside the room, such as a direct PATCH). The others wait for the merged doc. Until a note's doc arrives, the cached copy is shown read-only.

The editor is mounted once per note, because Collaboration binds one doc per editor. A new note gets its doc at once and goes online on that same doc when its `temp-` id becomes the real one, so typing is never interrupted. Undo and redo come from Yjs, so they only undo your own edits.

The public share page (`/s/<token>`) is only for signed-out visitors of a view link, and it is always read-only. Edit links and signed-in visitors are redirected into the app (`/?shared=<token>`), where the note joins the room with the share token and saves through `/api/share/<token>`. The share page joins the same room with its token too. A view-only visitor cannot fill an empty room, so it keeps the server-rendered copy until someone with edit access has opened the note.

## Who can join a room

A browser cannot open a room socket on its own. It first asks `/api/realtime/ticket?room=<room>` (with `&share=<token>` on a public link), and the route checks access: the owner, a collaborator, a valid share link, or the user's own notification room. The answer is a ticket, `<READ|WRITE>.<expiresMs>.<hmac>`, signed with `REALTIME_SECRET` and valid for ten minutes. `partysocket` fetches a fresh one on every reconnect. The Worker verifies the signature in `onBeforeConnect` and refuses the socket without a valid ticket. A READ connection may send cursor and comment signals; its content writes are dropped.

Revoking or replacing a share link, removing a collaborator or changing a collaborator's permission sends `kick` to the note's room (`kickRoom` in `lib/realtime.ts`). The room closes every open socket with code 4001. Clients reconnect at once with a fresh ticket, so whoever lost access gets a 403 and stays out, and a downgraded editor comes back read-only. Everyone else only sees a short reconnect.

Without `REALTIME_SECRET` (local `wrangler dev`) neither side checks tickets.

## Files

Images, attachments and voice memos are uploaded to Vercel Blob through `/api/upload` (4 MB, since Vercel refuses bodies over 4.5 MB; no HTML, SVG, XML or script types; bigger photos are shrunk first and anything else too big or of a refused type is turned away with a message), and the note keeps only the URL. If the upload fails for another reason, for example for a guest without an account, the file falls back to a base64 data URL inside the note. Images are re-encoded as WebP at most 1600 px on that path first, since for guests the data URL ends up in localStorage.
