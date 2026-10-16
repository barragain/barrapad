# Known gaps

Live editing is last write wins by default. Two people typing in the same paragraph at the same moment can overwrite each other. Yjs merging fixes this and is on trial behind a per-browser switch (`?crdt=1`, see architecture.md). While it is on trial, a browser with the switch and one without do not see each other's edits live; they meet again through the database when a note is reopened or refetched. Public share pages (`/s/<token>`) still use the old path even with the switch on.

Guest notes keep images and files as base64 inside localStorage. Images are shrunk to WebP at most 1600 px first (an 8 MB PNG becomes about 50 KB), but attachments and voice memos are stored as they are, so a few of those still fill the quota. The guest pill turns red when that happens.

Revoking a share link or removing a collaborator only takes effect on the next socket reconnect. A socket that is already open keeps receiving edits until then.

Poll votes are remembered per browser, so the same person can vote again from another device or a private window.

The first document request of a cold session spends about 0.4 seconds in Clerk's handshake redirect, and the app ships about 370 KB of script.

The app can be installed to a phone's home screen (web manifest), but there is no service worker, so it does not open offline.

