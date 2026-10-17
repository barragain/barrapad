# Known gaps

A view-only share page opened on a note nobody has edited since the move to Yjs shows the copy the server rendered, without live updates, until someone with edit access opens the note and fills its room.

Guest notes keep images and files as base64 inside localStorage. Images are shrunk to WebP at most 1600 px first (an 8 MB PNG becomes about 50 KB), but attachments and voice memos are stored as they are, so a few of those still fill the quota. The guest pill turns red when that happens.

Someone cut off by a revoked link keeps whatever they typed in the open tab, but it never syncs or saves.

Two people voting on the same poll in the same instant can overwrite each other's vote, because the votes live in one node attribute and the last write wins. A signed-in user who voted before votes moved to the account (2026-10-17) can vote once more. Polls inserted before 2026-10-17 share the option ids `a` and `b`, so a guest who votes on one of them sees every other such poll as voted in that browser; new polls get random ids.

The "manually renamed" flag is kept per browser, so typing in a renamed note on another device can put the first line back as its title. Keeping it would need a column on the note.

A collaborator moved to view only keeps an editable-looking editor for up to 10 seconds (the shared list poll), though the room already drops their writes at once.

Signed-in users can only edit notes offline that they opened on that device while online, because those are the notes whose Yjs doc is kept in IndexedDB. New notes cannot be created offline when signed in, and shared notes are not available offline. If the room grants a seed because the database was changed outside the room while a note had offline edits, the offline copy wins and that outside change is overwritten. The kept docs stay in IndexedDB after sign-out, and if someone signs out and goes offline before the next page load, the saved offline page still holds their notes.

The first document request of a cold session spends about 0.4 seconds in Clerk's handshake redirect, and the app ships about 370 KB of script.

DM Mono has no bold weight (Google Fonts serves 300, 400 and 500), so bold text and headings in the default font are thickened by the browser. Switching the body font or the heading font would fix it and is a brand decision.

Highlights made before 2026-10-17 with a dark color (the old picker offered black and saturated colors) are hard to read, because highlighted text is now always drawn dark.

Clicking a presence avatar does nothing until that person has a caret in the note, which only happens once they click into it.

The phone toolbar is pinned above the on-screen keyboard, but the e2e phone test cannot open a real keyboard, so the offset still needs a check on a real iPhone.

Google sign-in is disabled until a Google Cloud OAuth client exists (see [action-list.md](action-list.md)).
