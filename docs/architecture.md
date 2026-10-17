# How bpad saves and syncs

The database is the source of truth for every note. The browser keeps a copy in localStorage so the app paints instantly, and the realtime room on the Cloudflare Worker is a cache that carries live edits between open tabs. When the three disagree, the newest server-issued `updatedAt` wins.

## Saving

Every keystroke writes the note to localStorage and goes to the note's room through Yjs, and after one second without typing a PATCH goes to `/api/notes/<id>`. Saves are also forced on blur, when the tab is hidden, on note switch, and on unload with a synchronous request. A dirty counter per note stops a server refetch from overwriting edits that have not been saved yet, and each save is bound to the note id it was made for, so switching notes mid-save cannot write one note's text into another.

New notes appear at once with a `temp-` id and take the real id when the server answers. If the user has moved to another note by then, the app stays where they are. Guest notes (no account) use `local-` ids, live only in localStorage under `bpad_guest_notes`, never touch the API or the rooms, and move into the account on sign-in. The import sends each guest note's local id along, and the server gives the imported note an id derived from the account and that local id, so a reload in the middle of an import cannot create a second copy.

## Offline

`public/sw.js` is a service worker registered by AppShell. Page loads are network-first, and the last good copy of each path is kept. Hashed build files under `/_next/static` are cache-first. Icons and the Clerk script are network-first with a cached fallback. API calls, room sockets and uploads are never cached. A guest can open and edit bpad with no network, since their notes live in the browser anyway. A signed-in user who opens the app offline gets the saved page, and its notes may be stale, so the editor stays read-only and the page reloads when the network returns.

## Polls

A poll is a Tiptap node whose attributes hold the question, the options with their vote counts, and `voters`, a JSON map from user id to the chosen option. A signed-in user votes once per account, on any device. A guest votes once per browser (localStorage). Only people who can edit the note can vote, since a view-only reader's change would never be saved.

The editor stays read-only until the first `/api/notes` answer of the session. The app refetches on window focus, on reconnect and when the tab becomes visible, and `fetchNotes` merges by `updatedAt`. That value must always come from the server; a client clock would make the merge pick the wrong copy.

Polling covers what the rooms do not: the open note every 5 seconds (three 404s in a row means it was deleted), the shared notes list and "who opened my note" events every 10 seconds, and the access-denied screen every 3 seconds.

## Realtime rooms

Each note has one room named by its id, at `/parties/note-y/<note>` on the Worker (`NoteYParty` in `realtime/index.ts`, a `YServer` from y-partyserver on Durable Objects). Each user also has a notification room at `/parties/main/notif-<userId>` (`NoteParty`). Guest notes have no room.

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

The public share page (`/s/<token>`) joins the same room with its share token. An edit link works like the app's editor and saves through `/api/share/<token>`. A view-only visitor cannot fill an empty room, so it keeps the server-rendered copy until someone with edit access has opened the note.

## Who can join a room

A browser cannot open a room socket on its own. It first asks `/api/realtime/ticket?room=<room>` (with `&share=<token>` on a public link), and the route checks access: the owner, a collaborator, a valid share link, or the user's own notification room. The answer is a ticket, `<READ|WRITE>.<expiresMs>.<hmac>`, signed with `REALTIME_SECRET` and valid for ten minutes. `partysocket` fetches a fresh one on every reconnect. The Worker verifies the signature in `onBeforeConnect` and refuses the socket without a valid ticket. A READ connection may send cursor and comment signals; its content writes are dropped.

Revoking or replacing a share link, removing a collaborator or changing a collaborator's permission sends `kick` to the note's room (`kickRoom` in `lib/realtime.ts`). The room closes every open socket with code 4001. Clients reconnect at once with a fresh ticket, so whoever lost access gets a 403 and stays out, and a downgraded editor comes back read-only. Everyone else only sees a short reconnect.

Without `REALTIME_SECRET` (local `wrangler dev`) neither side checks tickets.

## Files

Images, attachments and voice memos are uploaded to Vercel Blob through `/api/upload` (10 MB, no HTML, SVG, XML or script types), and the note keeps only the URL. If the upload fails, for example for a guest without an account, the file falls back to a base64 data URL inside the note. Images are re-encoded as WebP at most 1600 px on that path first, since for guests the data URL ends up in localStorage.
