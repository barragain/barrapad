# Known gaps

A view-only share page opened on a note nobody has edited since the move to Yjs shows the copy the server rendered, without live updates, until someone with edit access opens the note and fills its room.

Guest notes keep images and files as base64 inside localStorage. Images are shrunk to WebP at most 1600 px first (an 8 MB PNG becomes about 50 KB), but attachments and voice memos are stored as they are, so a few of those still fill the quota. The guest pill turns red when that happens.

Someone cut off by a revoked link keeps whatever they typed in the open tab, but it never syncs or saves.

Two people voting on the same poll in the same instant can overwrite each other's vote, because the votes live in one node attribute and the last write wins. A signed-in user who voted before votes moved to the account (2026-10-17) can vote once more.

Signed-in users can read their notes offline but not edit them. Offline editing for accounts would need the local Yjs doc to be kept (y-indexeddb) and merged on reconnect. If someone signs out and goes offline before the next page load, the saved offline page still holds their notes.

The first document request of a cold session spends about 0.4 seconds in Clerk's handshake redirect, and the app ships about 370 KB of script.
