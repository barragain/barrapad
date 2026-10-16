# Known gaps

Live editing is last write wins. Two people typing in the same paragraph at the same moment can overwrite each other; a CRDT (Yjs) would fix it and is the next step once more than two people edit one note at a time.

Guest notes keep images and files as base64 inside localStorage, so a few large images fill the browser's quota. The guest pill turns red when that happens, but nothing shrinks the files.

Revoking a share link or removing a collaborator only takes effect on the next socket reconnect. A socket that is already open keeps receiving edits until then.

Poll votes are remembered per browser, so the same person can vote again from another device or a private window.

The first document request of a cold session spends about 0.4 seconds in Clerk's handshake redirect, and the app ships about 370 KB of script.

There is no PWA manifest or service worker, so the app cannot be installed on a phone and does not open offline.

`npm run dev` on localhost cannot sign in, because Clerk is a production instance. A Clerk development instance would fix that.
