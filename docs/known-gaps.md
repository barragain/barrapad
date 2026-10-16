# Known gaps

A view-only share page opened on a note nobody has edited since the move to Yjs shows the copy the server rendered, without live updates, until someone with edit access opens the note and fills its room.

Guest notes keep images and files as base64 inside localStorage. Images are shrunk to WebP at most 1600 px first (an 8 MB PNG becomes about 50 KB), but attachments and voice memos are stored as they are, so a few of those still fill the quota. The guest pill turns red when that happens.

Revoking a share link or removing a collaborator only takes effect on the next socket reconnect. A socket that is already open keeps receiving edits until then.

Poll votes are remembered per browser, so the same person can vote again from another device or a private window.

The first document request of a cold session spends about 0.4 seconds in Clerk's handshake redirect, and the app ships about 370 KB of script.

The app can be installed to a phone's home screen (web manifest), but there is no service worker, so it does not open offline.

