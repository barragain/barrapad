# bpad product and behavior spec

This document describes what bpad (live at https://www.bpad.cc) does today. It was written from the code on 2026-10-17, not from plans, so where a plan and the code disagree, this file follows the code. The sync and room-auth design is explained in more depth in [architecture.md](architecture.md), and what is still missing is listed in [known-gaps.md](known-gaps.md).

## Contents

1. [The product and its users](#1-the-product-and-its-users)
2. [Features](#2-features)
3. [Permission matrix](#3-permission-matrix)
4. [Data model](#4-data-model)
5. [API reference](#5-api-reference)
6. [Realtime protocol](#6-realtime-protocol)
7. [Test coverage map](#7-test-coverage-map)
8. [Known gaps](#8-known-gaps)
9. [Browser storage keys](#9-browser-storage-keys)

## 1. The product and its users

bpad is a rich text notepad in the browser. You open the site and start typing. With an account, your notes are saved to a database and follow you to every device. You can also share a note with other people, who read or edit it with you live. Nothing has to be installed, though phones can add the site to the home screen.

There are four kinds of people who use it.

A guest has no account. The whole app works for them, but their notes stay in that one browser's localStorage and never reach the server. Sharing, comments and notifications are not available, and a small pill invites them to sign up. When a guest signs in, their notes are moved into the account.

A signed-in owner has a Clerk account. Every note belongs to exactly one owner, who can rename it, tag it, delete it, create share links, invite collaborators and answer access requests.

A collaborator is another bpad user the owner invited by name (or whose access request was accepted). A collaborator has either view access (`READ`) or edit access (`EDIT`). The note shows up in their sidebar under "Shared with me".

A share-link visitor opens a `/s/<token>` link. A view-only link works without an account: the visitor sees a read-only page that updates live. An edit link requires signing in, after which the note opens inside the visitor's own app with edit rights. Signed-in visitors of a view-only link are also taken into the app, read-only.

## 2. Features

### 2.1 Notes: create, open, rename, delete

The sidebar lists "My Notes", newest first by last update. The "New note" button creates a note called "Untitled" and opens it with the cursor in place. For a signed-in user the note appears at once under a temporary `temp-` id while `POST /api/notes` runs, and it takes its real id when the server answers. Text typed during that short window is kept and saved under the real id. If the user switches to another note before the server answers, the app stays on the note the user picked. If the create request fails, the temporary note disappears. A guest's new note gets a `local-` id and never touches the server.

A note's **title** follows its first line of text (trimmed, up to 100 characters, "Untitled" when empty) until the user renames it. Renaming happens from the sidebar's right-click menu ("Rename") with an inline field; Enter or clicking away saves, Escape cancels, and an empty name becomes "Untitled". After a manual rename the title stops following the first line. That "manually renamed" flag is kept per browser in localStorage, so on a second device the title can still be replaced by the first line once someone types there (see [known-gaps.md](known-gaps.md)). The server cuts titles to 200 characters only when a note is created with a body; renames are not limited. Renames are sent to the note's room, so other open tabs update their sidebar at once. The browser tab title is `<note title> | bpad - A notepad for whatever`.

Shared notes never take their title from their content. Their title only changes through an explicit rename by someone with edit access.

**Deleting** an owned note is done with the trash icon on its sidebar row or "Delete" in its right-click menu. There is no confirmation. The note disappears from the list at once, the server deletes it with its share links, collaborators, comments and access requests (database cascades), and every open tab on that note gets a `delete` message and shows "This note has been deleted" with a "Remove from my view" button. If the network request throws, the note comes back.

When no note is open (for example after deleting the last one), the editor area shows "No note selected" with a "Create a note" button.

### 2.2 Saving, sync and the save indicator

Every change is written to the local copy at once (localStorage `barrapad_notes` for an account, `bpad_guest_notes` for a guest) and, for an account, sent live to the note's room through Yjs. After one second without typing, the note's HTML is saved with `PATCH /api/notes/<id>` (or `PATCH /api/share/<token>` for a shared note with edit rights). A save is also forced when the editor loses focus, when the tab is hidden, when the user switches notes, and on page unload with a synchronous request. There is no Save button: Ctrl+S (Cmd+S on a Mac) forces an immediate save instead of opening the browser's save dialog.

A per-note dirty counter makes sure a refetch never overwrites text that has not been saved yet. Each save is tied to the note id it was made for, so switching notes in the middle of a save cannot write one note's text into another. The `updatedAt` value always comes from the server.

When the app loads, notes are rendered on the server, so a signed-in user can type immediately. If the server render failed, the cached copy is shown read-only until the first `GET /api/notes` answer. The app refetches on window focus, when the tab becomes visible and when the browser comes back online. If the tab was hidden for more than 60 seconds, editing is locked again until that refetch lands, so edits made on another computer in the meantime cannot be typed over. When the server copy and the local copy differ, the local copy wins only if it has unsaved edits or a newer server-issued `updatedAt`.

The top bar shows a sync indicator for signed-in users: a spinning cloud with "Loading" while the first fetch is pending (hover text: "Loading your latest notes (read-only until done)"), "Syncing" while a save runs, and a quiet gray "Saved" with a check the rest of the time. Guests see a gray "Local" label with a drive icon in the same place (hover text: "Notes are saved in this browser only. Sign up to sync them.").

While a note is open, the app also checks every 5 seconds whether it still exists. Three 404 answers in a row show the "This note has been deleted" screen, in case the room's delete signal was missed.

### 2.3 Offline behavior

A service worker (`public/sw.js`, registered by AppShell on https) lets the site open with no network. Page loads are network-first and the last good copy of each path is kept; hashed build files are cache-first; icons and the Clerk script are network-first with a cached fallback; API calls, sockets and uploads are never cached. A guest opened offline gets a fully working app, because guest notes live in the browser. A signed-in user opened offline gets the saved page with their last loaded notes, read-only, since that copy may be older than edits made on another device; when the browser reports it is online again, the page reloads and editing works as usual.

A tab that was already open when the connection dropped keeps working to a degree. A guest loses nothing, because guest notes only live in the browser. For a signed-in user, the open note stays editable if its room had already synced before the connection dropped: edits go into the local Yjs doc and the localStorage cache, the PATCH fails quietly, and the note stays marked dirty. When the connection returns, the Yjs provider reconnects and merges the offline edits into the room, and the note is saved to the database with the next edit, blur or tab switch. A note opened while offline never gets its room and stays read-only, because the editor waits for the room to answer the seed claim. New notes cannot be created offline when signed in: the create request fails and the temporary note is removed. If the very first notes fetch of a session fails, editing is unlocked anyway so the cached copy can be typed into.

### 2.4 Editor

The editor is Tiptap 3 on ProseMirror. The text column holds about 68 characters a line in the editor font, with 3rem of side padding on desktop, 2rem up to 1024 px wide and 1rem on phones. Spacing follows three steps: wrapped lines use the line height (1.65 in DM Mono, 1.55 in the other fonts), list items sit 0.3em apart, and blocks sit 0.6em apart, or 0.8em around quotes, code blocks, tables, images, attachments and polls, and 1.2em around a divider. Headings have more space above than below. Nested bullets go disc, circle, square and nested numbers go 1, a, i, with muted markers. A checked task is struck through and muted without touching the items nested under it. The values and the research behind them are in [design-audit.md](design-audit.md). Quotes are upright with softer text and an accent bar. Code blocks color their syntax (keywords, strings, numbers, names, comments) with hues mixed into the theme's text color, so they work in every theme. Inline code sits on a faint chip. Highlighted text is always drawn dark, and the highlight picker offers only pastel colors so it stays readable in dark themes. Links use a darker shade of the accent with a thin underline that thickens on hover, selection and the caret use the accent, and a selected block (a divider, an image) gets an accent outline. Pasting rich HTML that holds images keeps the text around them; HTML that is only images is uploaded as images. "Normal Text" in the text style menu also takes the line out of a quote. Typing `#` at the start of a line opens the note picker only once a letter follows, so `# ` still makes a heading. The placeholder in an empty note reads "Start writing, or type / for headings, lists, tables and more". While the editor has focus, an empty top-level line the caret is on shows a fainter "Type / for blocks · Shift+Tab for lorem ipsum" (just "Type / for blocks" on touch screens). On desktop the toolbar fades in when the editor has focus and fades out when it loses it. Toolbar buttons are, in order: Undo, Redo, a text style dropdown (Normal Text, Heading 1, Heading 2, Heading 3, Quote), Bold, Italic, Underline, Link, Text color, Highlight, Bullet list, Numbered list, Checklist, Align left, Align center, Align right, Table, Insert image, Upload file, Voice memo, Code block, Divider, Footnote, Poll and, for signed-in users, Comments. Hovering a button shows its name and shortcut. On desktop, selecting text also shows a small formatting bar centered above the selection, with Bold, Italic, Underline, Link, Highlight, Text color and, for signed-in users, Comment. Highlight and Text color open one row of swatches, a remove button and a More colors arrow that expands the full color picker (custom colors, and gradients for text color) under the row; Esc closes the row. Link opens the link box, whose X (or Esc) cancels and puts the selection back, which brings the bar back. Selecting a block such as an image or a poll shows the bar with only Comment, and guests get no bar for blocks. The bar fades out when the selection collapses or the editor loses focus. The full toolbar stays so the two can be compared. Typing `/` at the start of a line or after a space opens a slash menu of blocks: Text, Heading 1 to 3, Bullet list, Numbered list, Checklist, Quote, Code block, Divider, Table, Image, File, Poll and Footnote. Typing after the slash filters the list by name or a keyword (such as `h1` or `todo`), arrow keys move, Enter or a click inserts the block and removes the typed command, and Esc closes the menu. It does not open inside a code block. Focus mode, opened from the focus icon in the top bar or with Ctrl+Shift+F (Cmd+Shift+F on a Mac), hides the sidebar, the top bar and the toolbar, and while the editor has focus it dims every block to 30% except the one holding the caret. Inside lists, quotes and tables only the inner lines dim, so the line being written stays lit. A faint "Exit focus" button sits in the top right corner, and Esc or the same shortcut leaves the mode. Focus mode is not remembered across page loads.

| Shortcut | Action |
|---|---|
| Ctrl/Cmd+B, I, U | Bold, italic, underline |
| Ctrl/Cmd+K | Open the link box (editable notes only) |
| Ctrl/Cmd+Z, Ctrl+Y or Shift+Cmd+Z | Undo, redo |
| Ctrl/Cmd+Shift+V | Paste as plain text: one paragraph per line, the text taken literally (markup such as `<b>` is not read) |
| Shift+Tab | Outdent a list or checklist item; in an ordinary paragraph, insert a lorem ipsum paragraph |

**Undo and redo** come from Yjs for every note that has a room, so they only undo your own changes, never a collaborator's. Guest notes use Tiptap's normal history.

**Text styles.** Headings 1 to 3, quote, bold, italic, underline, strikethrough (context menu), inline code (StarterKit), bullet, numbered and nested checklists, and a divider. Copying a checklist puts ☐ and ☑ in the plain-text clipboard so it pastes well into other apps. On phones the text style, color, highlight and table pickers open as bottom sheets.

**Color and highlight.** The text color picker sets a solid color or, from its gradient tab, a gradient fill (the `gradientText` mark, rendered with `background-clip: text`). Picking one replaces the other. "Unset color" removes both. Highlight takes any color; "Unset highlight" removes it.

**Alignment.** The three align buttons align paragraphs and headings. If an image, file attachment or poll is selected, they align that block instead.

**Links.** URLs typed into the text become links automatically. Clicking a link does not open it; the right-click menu offers "Open link", "Copy link URL", "Edit link…" and "Remove link". The link popover takes a URL (placeholder `https://example.com`).

**Code blocks** get syntax highlighting for the common languages that lowlight ships.

**Tables.** The table picker inserts a table of the chosen size with a header row. Column widths can be dragged, and a six-dot handle on the table's left lets the whole table be dragged to another place. The right-click menu's "Insert table" adds a 3 by 3 table.

**Footnotes.** The Footnote button inserts a superscript marker like `[1]`. Markers are numbered automatically in document order. Clicking one opens a small box ("Footnote n") with a text field: Enter or the Save button saves, Shift+Enter adds a line, Escape closes without saving, and clicking outside saves. Hovering the marker shows its text. The right-click menu offers "Edit footnote" and "Remove footnote".

**Lorem ipsum.** The empty-line placeholder names the shortcut. Shift+Tab in an ordinary paragraph inserts one of three filler paragraphs in turn. The right-click menu has "Insert lorem ipsum" as well.

**Spell check.** An English dictionary (nspell with `/dict/en.aff` and `/dict/en.dic`, plus extra modern words) loads in the background and underlines misspelled words in paragraphs, headings, list items and quotes. Words in inline code, all-caps words and single letters are skipped. Right-clicking a misspelled word on desktop lists suggestions at the top of the context menu.

**Context menu.** On desktop, right-clicking in an editable note replaces the browser menu. What it shows depends on what was clicked: a quote offers "Remove quote"; a divider "Remove divider"; a footnote, poll, image or link offers the actions listed in their sections; selected text offers Bold, Italic, Underline, Strikethrough, "Link…", Copy, Cut, Comment (signed in only) and "Add tag…"; an empty spot offers spelling suggestions, Paste, "Select All", "Insert image", "Upload file", "Insert voice memo", "Insert table", "Insert lorem ipsum" and "Add tag…". On touch devices the browser's own long-press menu is kept, and the custom menu is not shown.

**Presence.** When other people have the same note open, the top bar shows their avatars on the left of the sync indicator: their profile picture with a ring in their caret color, or their initial on that color. Up to five are shown, then "+n". Clicking an avatar scrolls the note to that person's caret and gives it a short pulse. If they have no caret in the note (they have not clicked into it yet), nothing happens. The public share page uses the same avatars, and everyone there is called Guest.

**Note info.** The ⓘ button in the top bar opens a card under it with the word count, character count, created date and updated date. Clicking outside it or pressing Escape closes it. On the public share page the same button sits in that page's top bar, and the card shows the permission and the updated date instead.

### 2.5 Images

Images can be added with the toolbar's "Insert image", the context menu, pasting (a screenshot, an image file, or HTML that contains images, such as an image copied from a web page) and dropping files onto the page. Files are uploaded to Vercel Blob through `POST /api/upload`, and the note stores only the URL. An image pasted from a web page whose source is an `http(s)` URL is inserted with that URL, without copying the file. HTML, SVG, XML and JavaScript types are refused before upload with a browser alert naming the file, and nothing is inserted. Vercel refuses request bodies over 4.5 MB, so the limit is 4 MB: a bigger PNG, JPEG, WebP or BMP image is first re-encoded as WebP at most 1600 px on the long side, and anything still over 4 MB is refused the same way. A 413 or 415 from the server is also refused, not embedded. If the upload fails for any other reason (guest, offline, server error), the image is stored inside the note as a base64 data URL instead; PNG, JPEG, WebP and BMP images are first re-encoded as WebP at most 1600 px on the long side, when that makes them smaller. GIFs keep their animation.

An image can be resized by dragging its handle, between 80 and 900 px wide. Its options menu (the button on the image) offers "Replace image", "Add caption" or "Edit caption", alt text, left, center or right alignment, "Wide width" (700 px), "Full width", "Reset size", download and delete. The right-click menu has "Copy image URL", "Download image", "Replace image" and "Remove image".

### 2.6 File attachments

Any other file (toolbar "Upload file", context menu "Upload file", paste or drop) becomes an attachment card showing an icon (a special one for PDFs), the file name and its size. Uploads follow the same path as images: the same refusals, Blob first, base64 data URL if that fails for another reason, but attachments are never shrunk. The server accepts files up to 4 MB and refuses HTML, SVG, XML and JavaScript types with 415, because Blob serves files publicly. The download button adds `?download=1` to Blob URLs so the browser saves the file instead of opening it. Double-clicking the name renames the attachment in the note. Attachments can be aligned left, center or right. Audio files get a small player with play, pause and a seek bar.

### 2.7 Voice memos

The microphone button in the toolbar (or "Insert voice memo" in the context menu) records from the microphone with the browser's MediaRecorder. While it records, the button turns into a stop square and an orange "Recording" pill appears next to it (the context-menu version shows a red banner, "Recording voice memo…", with a "Stop & Insert" button). Stopping uploads the recording and inserts it as an audio attachment named `Voice memo <date and time>.<ext>`, usually WebM. If microphone permission is denied, nothing happens.

### 2.8 Polls

The Poll button inserts a poll block and opens its form. The form has a question ("Ask a question…") and between two and eight options. Enter in the question saves; Enter in the last option adds another option; "+ Add option" does the same; × removes an option when there are more than two. "Save Poll" saves only when there is a question and at least two filled options. Clicking away from the form saves what was typed, the same as pressing Save Poll. "Cancel" appears when editing an existing poll.

In view mode the poll shows its question and options. Clicking an option casts one vote: the counts are stored in the note itself (the `options` attribute), and after voting the percentages, bars and the total ("1 vote", "n votes") appear. A signed-in user's vote is recorded in the poll's `voters` attribute (user id to option id), so it counts once per account and shows as cast on every device. A guest's vote is remembered in this browser's localStorage. Only people who can edit the note can vote; a click from a view-only reader does nothing, because their change could never be saved. Two votes cast in the same instant can overwrite each other (see known gaps).

The poll header has a size button that cycles compact (280 px), medium (400 px) and full width, and an edit button that reopens the form. Polls follow the toolbar align buttons, can be dragged to another place (the drag ghost reads "Poll: <question>"), and the right-click menu offers "Edit poll" and "Remove poll".

### 2.9 Tags

Below each note is a tag row with an "Add tag" button. The tag picker takes a name ("Tag name…"), a color from a palette or a custom color, and suggests up to five existing tags that match. Tags are saved to the note right away (no debounce), sent to the note's room so other open tabs update, and remembered in a per-browser registry (`barrapad_tag_registry`), so a tag stays available even after no note uses it. Right-clicking a tag on a note lets you edit or remove it. The context menus' "Add tag…" opens the same picker.

The sidebar shows every known tag as a colored chip. Clicking chips filters the note list to notes that have any of the selected tags, and "Clear" removes the filter. Right-clicking a chip offers "Edit tag" (rename and recolor everywhere) and "Delete from all notes". Rename and delete rewrite every owned note that uses the tag and save each one to the server.

On a shared note, tag changes are saved only with edit access.

### 2.10 Search and the sidebar

The sidebar has the logo, a "New note" button, a search box ("Search..."), the tag chips, "My Notes", a "Shared with me" list, and a footer with About, Settings (appearance) and either the Clerk user button or a "Sign In" link. Search matches the note title and the plain text of its content, case-insensitively, and the preview line under each note shows the match in context with the matched text highlighted. Without a search, the preview shows the start of the second line or "No additional content". Owned notes that have an active share link show a small link icon. An empty list reads "No notes yet", or "No results" during a search.

"Shared with me" lists notes shared with you, each with "Can edit" or "View only", under a plain heading styled like "My Notes". The heading and list only appear when at least one note is shared with you, so guests never see them. Clicking an entry opens the note in the main editor. Its right-click menu offers "Rename" and "Delete note for everyone" (both only with edit access) and "Remove from my list". The list is refreshed every 10 seconds, and a permission change reaches an open note then: a collaborator moved to view only sees the editor lock, while the room kick already stops their writes at once.

### 2.11 Guest mode and importing guest notes

A visitor without an account lands in the app, not on a sign-in page. On the very first visit a blank "Untitled" note is created and opened, with a "Welcome to bpad" note under it in the sidebar. It teaches by example: a heading, a short checklist of things to try (the slash menu, the selection bar, `# ` headings), a quote saying notes save as you type, and a line about signing up. Its creation is remembered (`bpad_welcomed`), so later, when the guest has no notes left, an empty "Untitled" note is created instead. Guest notes are kept in localStorage under `bpad_guest_notes` with `local-` ids. They make no API calls and open no realtime sockets, so there is no sync indicator, no comments (no Comments button, no Comment item in the context menu), no tags on the server, and no mentions. The Share button links to `/sign-up`. Images that cannot be uploaded are shrunk and stored inline, as described in 2.5.

After the guest's first edit in a page visit, a quiet pill at the bottom (higher on phones, clear of the pinned toolbar) asks "Want this note on your other devices?" ("Use it on any device?" on narrow screens) with a "Sign up" link and a dismiss X. Dismissing it is remembered (`bpad_guest_pill_dismissed`), so it is offered until dismissed and then never again. If the browser refuses to store the notes because localStorage is full, the pill appears even if it was dismissed, shows a red dot, reads "Browser storage full, changes not saved" ("Storage full" on narrow screens), cannot be dismissed, and clears itself once a save succeeds again.

When a guest signs in, the next notes fetch moves every guest note into the account, one at a time, with `POST /api/notes`. Each note leaves guest storage only after the server has it, so a failure retries on the next fetch. The request carries the guest note's local id, and the server derives the new note's id from the account and that local id, so a retry after a reload finds the same row instead of creating a copy. A Web Lock stops two open tabs from importing the same notes. A welcome note the guest never changed, and any empty note, is dropped from guest storage instead of being imported.

### 2.12 Realtime collaboration

Every note that has a server id has a room on the Cloudflare Worker. Opening a note joins its room with a signed ticket (see section 6). The note's content lives in the room as a Yjs document, bound to the editor with Tiptap's Collaboration extension, so two people typing in the same paragraph at the same moment both keep their text.

When a room's doc is empty or older than the database, exactly one tab is allowed to fill it from the database HTML (the seed claim). Until the doc has arrived, the note is shown read-only from the cached copy, and a click into that preview hands focus to the live editor when it arrives. The database stays the source of truth: each tab that edits a note also saves it with the usual PATCH and tells the room which database version its doc now matches. A tab that only watches never saves, except that a tab which has typed in the note also saves merges that arrive from others.

Other people's carets are drawn with a colored line and a name label. The name is the user's first name, username or email prefix, and the color is picked at random per tab from eight colors. Remote edits above your caret do not move your caret. Titles, tags, deletes and comment changes travel as extra messages in the same room.

### 2.13 Sharing

The Share button in the top bar (signed in, owned note or shared note with edit access) opens the "Share Note" dialog. It has two link rows, "View only" ("Anyone with this link can read") and "Can edit", and an "Invite people" section.

Each link row has "Generate link" when there is no link. With a link, it shows the URL, Copy (shows "Copied!" for two seconds), Share (the system share sheet where available, else copy) and QR, which shows a QR code that can be downloaded as `barrapad-<note id>.png`. There is at most one active link per permission: "Regenerate link" revokes the old link and makes a new token, and "Revoke link" revokes it. Tokens are 48 random hex characters. A note with at least one active link shows the link icon in the sidebar.

People who opened the note through an edit link see the same dialog with a notice ("You can share these links. Only the note owner can generate or revoke them.") and no generate, regenerate, revoke or invite controls.

**Opening a link.** `/s/<token>` for a revoked or unknown token shows "This link is no longer active" with "Go to bpad →". An edit link sends a visitor who is not signed in to `/sign-in?redirect_url=/s/<token>`. A signed-in visitor of either kind of link is recorded (for the "Shared with me" list) and redirected to `/?shared=<token>`, where the note opens in the main editor, editable only with an edit link. A visitor of a view-only link who is not signed in stays on the public share page.

**The public share page** is always read-only. It shows the logo, presence avatars of up to five other people in the room, a green dot with "n online" (grey "Connecting…" while the socket is down), "Updated <date>", a "View only" or "Can edit" badge, an About button (it plays a looping audio clip while open) and an Appearance button. The content follows the owner's typing live. If nobody with edit access has opened the note since the move to Yjs, the room is empty and the page keeps showing the copy the server rendered. Tags are shown read-only. A floating pill invites the visitor to create their own notes for free, with a "Get started" button to `/sign-up`. (The pill's copy in `components/SharedNoteView.tsx` contains an em dash, which breaks the project's writing rule.) If the note is deleted, the page shows "This note has been deleted." with "← Go to bpad". Share pages get Open Graph and Twitter metadata with the note title and a 200-character text snippet.

**Collaborators.** In "Invite people" the owner picks "View only" or "Can edit", then searches bpad users by name, username or email (at least two characters, up to eight results, people already invited and the owner left out). Clicking a result adds them right away; there is no email or invitation to accept. Each collaborator row lets the owner switch between View only and Can edit, or remove them. An invited note appears in the collaborator's "Shared with me" list within ten seconds.

**Access requests.** Clicking a `#note` mention or a notification for a note you cannot open shows "You don't have access" with the note's title and a "Request Access" button. Sending a request notifies the owner and every collaborator with edit access, and the screen shows "Waiting for approval...", "The owner and editors have been notified." and "Cancel request". The owner or an editor answers from the notification bell, choosing View only or Can edit. Accepting adds the requester as a collaborator with that permission. The requester's screen switches to "Access granted by <name> (Can edit)" with "Go to note", or "Access denied by <name>", live through their notification room and through a 3-second poll as a fallback. A pending request can be cancelled, which also deletes the related notifications.

**Revoking access.** Revoking or regenerating a link, removing a collaborator and changing a collaborator's permission all send a `kick` to the note's room, which closes every open socket in it. Each client reconnects with a fresh ticket, so whoever lost access is refused and a downgraded editor comes back read-only on the socket. What the person sees differs. A removed collaborator's note leaves their "Shared with me" list on the next 10-second poll, and their bell shows "<owner> removed access to …". Someone viewing a revoked link inside the app sees the "This note has been deleted" screen about 15 seconds later, because the existence check gets 404. The public share page keeps the last content and shows "Connecting…". A downgraded collaborator's editor stays editable on screen until the note is reopened, but their changes no longer reach the room or the database.

**Leaving and deleting shared notes.** "Remove from my list" drops the note from your own list and deletes your collaborator row, if any. "Delete note for everyone" (edit access only) deletes the owner's note itself; the owner's open tab shows "A collaborator deleted your note …" in the bell.

### 2.14 Comments

Comments are for signed-in users on notes that have a server id. To start one, select text and click Comment in the selection bar (desktop only), click the toolbar's Comments button with text selected, or pick "Comment" from the right-click menu. The selected text gets a highlight and the comment sidebar opens with a new comment form ("Write a comment... (type @ to mention)"). Cancelling, closing the sidebar with its X or the toolbar button before posting, or a failed save removes the highlight. The Comments button with nothing selected just opens or closes the sidebar, and clicking a highlight in the text opens its thread.

Threads show the author's name and avatar, replies ("Reply... (type @ to mention)"), and Resolve. Resolving removes the highlight from the text and hides the thread unless "Show resolved (n)" is on; reopening puts the highlight back. In the `@` picker, an empty query lists the note's owner and collaborators and a typed query searches all users. The author of a comment and the note's owner may delete it; deleting a root comment removes its highlight. If the highlighted text is deleted while the sidebar is open, the thread is deleted with it. Any change makes the other open tabs refetch the comments through the room.

The API allows the owner, collaborators and signed-in people who opened the note through a share link that is still live to read and write comments. View-only collaborators can read, reply to and resolve threads, but cannot start a new one in the UI because the toolbar, selection bar and context menu are hidden when the editor is read-only.

### 2.15 Mentions

**People.** Typing `@` at the start of a line or after a space opens a picker. With nothing typed after `@`, it lists the note's owner and collaborators; with text, it searches all bpad users (results start at two characters). Choosing a person inserts a mention chip and sends that person a `mention` notification ("<name> mentioned you in "<title>""), unless it is yourself or the note has no server id yet. Hovering a mention on desktop shows a profile card.

**Notes.** Typing `#` opens a picker of notes you can link to: up to 50 of your most recent notes and notes you collaborate on, filtered by title, at most 15 results, with the owner's name for shared ones. Clicking a note mention opens that note if it is yours or shared with you, and otherwise shows the access request screen.

### 2.16 Notifications

The bell in the top bar (signed in only) shows a small orange dot when something is unread, with no count; the count is in its hover text. Its panel lists up to 50 stored notifications plus the ones the browser works out itself, newest first, each with the sender's avatar or a colored dot, a type label, the message and the time. "Mark all as read" and "Delete all notifications" act on the stored ones. Clicking a notification that refers to a note opens that note (or the access request screen) and marks it read. For comment notifications it also opens the comment sidebar and highlights the thread. The footer reads "Read notifications disappear after 14 days", and the server deletes read notifications older than 14 days whenever the list is fetched.

| Type | Stored on server | Sent to | When |
|---|---|---|---|
| `mention` | yes | the mentioned user | someone inserts an `@` mention of them in a note |
| `comment` | yes | owner and all collaborators, except the author and anyone mentioned | a new root comment |
| `comment_reply` | yes | the root comment's author, unless they wrote the reply or are mentioned | a reply |
| `comment_mention` | yes | each user mentioned in a comment or reply, except the author | a comment or reply mentions them |
| `comment_resolved` | yes | the comment's author, unless they resolved it themselves | a thread is resolved |
| `access_request` | yes | the owner and every collaborator with edit access | someone requests access; shows inline Accept and Deny with a View only or Can edit choice, then "Accepted by <name> (…)" or "Denied by <name>" for everyone who got it |
| `access_response` | yes | the requester | the request is accepted or denied |
| `shared` | no, worked out in the browser | the collaborator or link visitor | a new entry appears in their "Shared with me" list |
| `deleted` | no | the collaborator or link visitor, or the owner | an entry disappears from "Shared with me" ("<owner> removed access to …"), or a collaborator deletes the owner's note |
| `permission_changed` | no | the collaborator | their permission on a shared note changes |
| `opened` | no | the owner | an invited collaborator opens the note for the first time ("<name> opened …") |

Stored notifications reach an open tab live through the user's notification room. The browser-only types come from comparing the "Shared with me" list every 10 seconds against a snapshot in localStorage (`barrapad_known_shared`), and from polling `/api/share/access-events` every 10 seconds (already announced ones are kept in `barrapad_opened_notified`). The first comparison on a browser only takes the snapshot, so nobody gets a flood of old events. Because they are not stored, these types exist only in the browser that worked them out.

### 2.17 Export

The Export menu in the top bar downloads the open note as `.pdf`, `.md`, `.txt` or `.docx`, named after the note title. The PDF is a picture of the editor as rendered, split over A4 pages, with an invisible text layer so it can be searched and copied. Markdown uses Turndown with ATX headings and `-` bullets, text strips all formatting, and DOCX converts the HTML with html-docx-js. A note under the menu reads "PDF preserves your design. Others export basic or no styles."

### 2.18 Appearance and About

Settings in the sidebar footer opens "Appearance": mode (light, dark or system), font (Sans, Serif, Mono or Comic), zoom (12, 14, 16, 18, 20 or 24 px, with a reset to 16) and theme (Default, Calm, Synthwave, Earth, bpad or Midnight). The defaults are light, Mono, 16 px and bpad. Every editor color is either one of the six theme colors (sidebar, accent, border, muted, ink, editor background) or mixed from them in `app/globals.css` (`--ink-soft`, `--hover`, `--code-bg`, `--accent-soft`, `--accent-tint`, `--accent-ink`, `--decor`), so popovers, attachments, polls, mentions and the toolbar follow the theme and dark mode. Dark mode uses `#d4d4dc` text on `#16161f` with an orange accent, and native controls draw dark. Muted text is at least 4.5:1 against the editor background in every theme. The choice is saved per browser in `barrapad_appearance` and also applies to the public share page. The About button opens a short dialog about bpad with an animated image, and plays a looping audio clip while it is open, both in the app and on the share page.

### 2.19 Sign in, sign up and onboarding

`/sign-in` and `/sign-up` show Clerk's own forms on the bpad background. Sign-in returns to the `redirect_url` query parameter, or to `/`. Sign-up has no redirect parameter. According to the action list, Clerk sessions last 90 days, passkeys are on and Google sign-in is turned off; these are Clerk settings, not code. A signed-in user without a first name sees "Welcome! What's your name?" and must enter one, which is saved to their Clerk profile. Middleware only requires sign-in for `/api/*` (except the share and ticket routes), so every page is reachable without an account.

### 2.20 Mobile behavior

Below 768 px wide the sidebar is hidden behind a menu button in the top bar and slides in as a drawer over a dark backdrop. Picking a note, creating a note, opening a shared note or opening settings closes the drawer. The toolbar shows only while the editor has focus. It is pinned right above the on-screen keyboard (it follows `visualViewport`) as one row that scrolls sideways, and the note gets room under its last line so the toolbar never covers it. Its dropdowns open as bottom sheets, which also sit above the keyboard. The custom right-click menu and the selection bar are not used on touch devices, so the toolbar's Comments button is the way to comment. The guest pill uses its short wording and fits a 375 px screen.

### 2.21 Install to home screen (web manifest)

`/manifest.webmanifest` (from `app/manifest.ts`) names the app "bpad", starts at `/`, opens standalone, uses `#f3efe4` for background and theme color, and lists 192 px, 512 px and maskable 512 px icons. Phones can install it to the home screen, and the installed app opens offline (2.3).

### 2.22 Not found pages

Any unknown URL shows a 404 page styled as a blank ruled note: "Untitled · 404", "Nothing written here" with a blinking cursor, "This page doesn't exist, or the link has a typo.", "Your notes are fine. They're one click away." and "Back to my notes". Share links that are revoked or unknown get their own page, described in 2.13.

## 3. Permission matrix

"Link" means someone who reached the note through a share link and is not a collaborator. A signed-in link visitor works inside the app; an anonymous one only has the public share page.

| Action | Guest (own local notes) | Anonymous, view link | Signed in, view link | Signed in, edit link | Collaborator, view | Collaborator, edit | Owner |
|---|---|---|---|---|---|---|---|
| Read the note | own notes only | yes, share page | yes | yes | yes | yes | yes |
| Live updates and presence | no rooms | yes | yes | yes | yes | yes | yes |
| Edit content | yes, locally | no | no | yes | no | yes | yes |
| Rename | yes, locally | no | no | yes | no | yes | yes |
| Add or remove tags | yes, locally | no | no | yes | no | yes | yes |
| Vote in a poll | yes, per browser | no | no | yes | no | yes | yes |
| Delete the note | yes, locally | no | no | yes ("Delete note for everyone") | no | yes | yes |
| Remove from "Shared with me" | n/a | n/a | yes | yes | yes | yes | n/a |
| Read and write comments | no | no | read, reply, resolve | yes | read, reply, resolve | yes | yes |
| Delete a comment | no | no | no | no | own only | own only | any |
| See share links | no | no | no | yes, read-only | no | yes, read-only | yes |
| Create, regenerate, revoke links | no | no | no | no | no | no | yes |
| Invite, change, remove collaborators | no | no | no | no | no | no | yes |
| Answer access requests | no | no | no | no | no | yes | yes |
| Request access | no | no | yes | yes | n/a | n/a | n/a |
| Export | yes | no | yes | yes | yes | yes | yes |
| Room ticket | none | `READ` | `READ` | `WRITE` | `READ` | `WRITE` | `WRITE` |

## 4. Data model

The database is Postgres through Prisma (`prisma/schema.prisma`). User accounts live in Clerk; tables refer to users by their Clerk user id and copy display names and avatars where they need them.

| Model | What it stores | What it is for |
|---|---|---|
| `Note` | `id` (cuid, or `g` + 24 hex chars for imported guest notes), `userId` (owner), `title`, `content` (HTML), `tags` (JSON array of `{id, label, color}` as a string), `createdAt`, `updatedAt` (set by the database on every write) | The note itself. Deleting it cascades to its share links, collaborators, access requests and comments. |
| `Comment` | `noteId`, author `userId`, `userName`, `userAvatar`, `content`, `parentId` (null for a root comment), `commentId` (the id of the highlight mark in the note's HTML), `resolved`, `resolvedBy`, `resolvedAt`, timestamps | Comment threads. Replies point at their root with `parentId` and are deleted with it. |
| `NoteCollaborator` | `noteId`, `userId`, `username`, `displayName`, `avatarUrl`, `permission` (`READ` or `EDIT`), `invitedAt`; unique per note and user | Users the owner invited, or whose access request was accepted. |
| `ShareLink` | `token` (unique, 48 hex chars), `noteId`, `permission`, `createdAt`, `revokedAt` | Public links. Revoked links are kept with `revokedAt` set. |
| `SharedAccess` | `userId`, `noteId`, `noteTitle`, `token`, `permission`, `ownerName`, `lastSeen`; unique per user and note | A signed-in user's record of having opened a shared note, which feeds "Shared with me" and the owner's "opened" notifications. Not linked by a foreign key, so it is deleted by hand when a note is deleted. |
| `Notification` | `userId` (recipient), `type`, `noteId`, `noteTitle`, `message`, `fromUserId`, `fromName`, `fromAvatar`, `metadata` (JSON string), `read`, `readAt`, `createdAt` | Stored notifications (see 2.16). `metadata` holds ids such as `accessRequestId`, `commentId` and `markCommentId`, and the resolution of an access request. |
| `AccessRequest` | `noteId`, `requesterId`, `requesterName`, `requesterAvatar`, `status` (`pending`, `accepted`, `denied`), `resolvedBy`, `resolvedByName`, `grantedPermission`, `createdAt`, `resolvedAt`; unique per note and requester | Requests to join a note. Asking again resets the same row to `pending`. |

The Yjs document of each note is kept in the Worker's Durable Object storage under `ydoc`, with `dbUpdatedAt` (the database version it matches) and `deleted`. That is a cache, not a second copy of record.

## 5. API reference

All routes are Next.js route handlers under `app/api`. The middleware requires a Clerk session for every `/api/*` route except `/api/share/*` and `/api/realtime/ticket`, which check access themselves. A request without a session to a protected route is stopped by Clerk before the handler runs; the "401" entries below are the handlers' own checks. Errors are JSON `{ "error": "<message>" }`.

### Notes

| Method and path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/notes` | signed in | none | Array of owned notes, newest first: `{id, userId, title, content, tags[], createdAt, updatedAt, isShared}`. `no-store`. | 401 |
| `POST /api/notes` | signed in | Optional JSON `{title?, content?, tags?, guestId?}`. Without a body: an empty "Untitled" note. With `guestId`: the id is derived from the user and `guestId`, and an existing row is returned unchanged (idempotent import). Title cut to 200 chars. | The note, with `tags` as an array | 401 |
| `GET /api/notes/:id` | owner | none | `{id, userId}`; used to check that the note still exists and by the comment sidebar to know the owner | 401, 404 (missing or not yours) |
| `PATCH /api/notes/:id` | owner | `{title?, content?, tags?}`; missing fields are kept | The updated note. A changed title is pushed to the room as `title`. | 401, 403, 404 |
| `DELETE /api/notes/:id` | owner | none | `{success: true}`. Sends `delete` to the room first, deletes `SharedAccess` rows, then the note (cascades). | 401, 403, 404 |
| `GET /api/notes/:id/access` | signed in | none | `{access: true, permission: "OWNER" or "READ" or "EDIT", noteTitle}` or `{access: false, noteTitle, pendingRequest: {id, status, resolvedByName, grantedPermission} or null}` | 401, 404 |
| `GET /api/notes/mentionable?q=` | signed in (returns `[]` otherwise) | `q`: title filter | Up to 15 `{id, title, isOwner, ownerName?}` from 50 own notes and 50 collaborations | none |

### Sharing and collaborators

| Method and path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/notes/:id/share` | owner | none | Active share links `[{id, token, noteId, permission, createdAt, revokedAt}]` | 401, 403, 404 |
| `POST /api/notes/:id/share` | owner | `{permission: "READ" or "EDIT"}` (anything else means READ) | The new link. Any active link with the same permission is revoked first, and if one was, the room is kicked. | 401, 403, 404 |
| `GET /api/notes/:id/collaborators` | owner, collaborator or live-link visitor | none | Collaborators, newest first, with the owner added at the front as `{id: "owner-<userId>", permission: "OWNER", …}` for mention pickers | 401, 403, 404 |
| `POST /api/notes/:id/collaborators` | owner | `{targetUserId, permission?}` | The collaborator row (upserted, so inviting again updates the permission and profile) | 400 (`targetUserId required`, `Cannot invite yourself`), 401, 403, 404 (note, or `User not found` in Clerk) |
| `PATCH /api/notes/:id/collaborators/:userId` | owner | `{permission: "READ" or "EDIT"}` | `{success: true, permission}`; updates the collaborator's "Shared with me" entry and kicks the room | 400 (`Invalid permission`), 401, 403 (`Not found or forbidden`), 404 (`Not a collaborator`) |
| `DELETE /api/notes/:id/collaborators/:userId` | owner | none | `{success: true}`; removes the collaborator's "Shared with me" entry and kicks the room | 401, 403 |
| `GET /api/share/:token` | none for link tokens; signed in for `collab-<noteId>` | none | `{noteId, title, content, tags[], permission, updatedAt}`, `no-store`. A `collab-` token also records a `SharedAccess` row. | 401 (collab token without a session), 404 (revoked, unknown, or not a collaborator) |
| `PATCH /api/share/:token` | signed in with edit access through the link or as an edit collaborator (`collab-<noteId>`) | `{title?, content?, tags?}` | `{title, content, updatedAt}`. A changed title is pushed to the room. | 401, 403 (view-only), 404 |
| `DELETE /api/share/:token` | owner | none | `{success: true}`; sets `revokedAt` and kicks the room | 401, 403, 404 |
| `DELETE /api/share/:token/delete-note` | signed in with edit access (link or `collab-` token) | none | `{success: true}`. Sends `delete` to the room, deletes `SharedAccess` and collaborator rows, then the note. | 401, 403 (view-only), 404 |
| `GET /api/share/:token/links` | signed in, `:token` must be an active edit link or `collab-<noteId>` for an edit collaborator | none | Active links of that note | 401, 403, 404 |
| `GET /api/share/access-events` | signed in (returns `[]` otherwise) | none | `[{id: "<noteId>:<userId>", noteId, noteTitle, accessorName, accessedAt}]` for owned notes opened by users who are still collaborators | none |
| `GET /api/shared-notes` | signed in (returns `[]` otherwise) | none | "Shared with me": up to 50 `SharedAccess` records, then collaborations not already covered, as `[{id, noteId, noteTitle, token, permission, lastSeen, ownerName}]`. Collaborations use the token `collab-<noteId>`. `no-store`. | none |
| `DELETE /api/shared-notes` | signed in | `{noteId}` | `{ok: true}`; deletes your `SharedAccess` and collaborator rows for that note | 400, 401 |

### Comments

| Method and path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/notes/:id/comments` | owner, collaborator or live-link visitor | none | All comments, oldest first | 401, 403, 404 |
| `POST /api/notes/:id/comments` | owner, collaborator or live-link visitor | `{content, commentId?, parentId?, mentions?: userId[]}` | The new comment. Sends `comment`, `comment_reply` and `comment_mention` notifications as in 2.16. | 400 (`Content required`), 401, 403, 404 |
| `PATCH /api/notes/:id/comments/:commentId` | owner, collaborator or live-link visitor | `{resolved?, content?}` | The updated comment. Resolving someone else's comment notifies them (`comment_resolved`). | 401, 403, 404 |
| `DELETE /api/notes/:id/comments/:commentId` | comment author or note owner | none | `{ok: true}` (replies are deleted with a root) | 401, 403, 404 |

### Notifications and access requests

| Method and path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/notifications` | signed in (returns `[]` otherwise) | none | Deletes your read notifications older than 14 days, then returns up to 50, newest first: `{id, type, noteId, noteTitle, message, fromUserId, fromName, fromAvatar, metadata, read, readAt, timestamp}` | none |
| `PATCH /api/notifications` | signed in | none | `{ok: true}`; marks all as read | 401 |
| `DELETE /api/notifications` | signed in | none | `{ok: true}`; deletes all of yours | 401 |
| `PATCH /api/notifications/:id` | the recipient | none | `{ok: true}`; marks one as read | 401, 404 |
| `POST /api/notifications/mention` | owner, collaborator or live-link visitor of `noteId` | `{mentionedUserId, noteId}` | `{ok: true}`; stores and pushes a `mention` notification titled with the note's stored title (nothing if you mention yourself) | 400 (`Missing fields`), 401, 403, 404 |
| `POST /api/access-requests` | signed in | `{noteId}` | `{id, status}`. Creates or resets the request to `pending` and notifies the owner and edit collaborators. | 400 (`noteId required`, `You own this note`, `You already have access`), 401, 404 |
| `GET /api/access-requests` | signed in (returns `[]` otherwise) | none | Your requests: `{id, noteId, noteTitle, status, resolvedByName, grantedPermission, createdAt, resolvedAt}`. Not used by the UI today. | none |
| `PATCH /api/access-requests/:id` | owner or edit collaborator of the note | `{action: "accept" or "deny", permission?}` | `{ok: true, action, resolvedByName}`. Accepting upserts a collaborator. Notifies the requester (`access_response`), marks every related `access_request` notification read with the outcome, and pushes `notification_update` to each holder. | 400 (`action required`, `Already resolved`), 401, 403, 404 |
| `DELETE /api/access-requests/:id` | the requester | none | `{ok: true}`; deletes the request and its `access_request` notifications | 401, 403, 404 |

### Realtime, uploads and users

| Method and path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/realtime/ticket?room=&share=` | a share token, or a session | `room`: note id or `notif-<userId>`; `share`: a link token | `{ticket}` (see section 6); an empty string when `REALTIME_SECRET` is not set | 401 (no session and no link token), 403 (no access) |
| `POST /api/upload` | signed in | multipart form with `file` | `{url}` of the public Blob, stored at `notes/<userId>/<time>-<name>` with a random suffix | 400 (`No file provided`), 401, 413 (over 4 MB), 415 (HTML, SVG, XML or JavaScript type) |
| `GET /api/users/search?q=` | signed in | `q`, at least 2 characters | Up to 8 users other than you: `{id, username, displayName, imageUrl, email}` | 401; Clerk errors give `[]` |
| `PATCH /api/user/username` | signed in | `{username?, firstName?}` | `{ok: true}`; updates the Clerk profile from the server. Not used by the UI today. | 400, 401, 409 (username taken) |

## 6. Realtime protocol

The realtime server is a Cloudflare Worker (`realtime/index.ts`) using PartyServer on Durable Objects. The browser connects with `partysocket` and `y-partyserver`'s provider; the host comes from `NEXT_PUBLIC_REALTIME_HOST`.

### Rooms

| Room | Path | Class | Carries |
|---|---|---|---|
| Note room | `/parties/note-y/<noteId>` | `NoteYParty` (a `YServer`) | The note's Yjs doc, awareness (carets, presence) and custom messages |
| Notification room | `/parties/main/notif-<userId>` | `NoteParty` | Notifications pushed from the API to that user's open tabs |

Guest notes and notes still under a `temp-` id have no room. A shared note uses the real note id as its room, not the `shared-<token>` id it has in the editor.

### Tickets

A browser cannot open a room on its own. Before every connect and reconnect it calls `GET /api/realtime/ticket?room=<room>` (adding `&share=<token>` for a link that is not a `collab-` token). The route grants `WRITE` to the owner, to edit collaborators, to edit links and to the user's own notification room, and `READ` to view collaborators and view links. A link token only works for the note it belongs to.

The ticket is `<READ|WRITE>.<expiresMs>.<hmac>`, where the HMAC is SHA-256 over `<room>.<perm>.<expiresMs>` with `REALTIME_SECRET`, valid for ten minutes. It is passed as the `ticket` query parameter. The Worker checks it in `onBeforeConnect` and answers 403 without a valid one. A `READ` connection is marked read-only: its Yjs updates are dropped, and of the custom messages it may only send `comment-update`. Without `REALTIME_SECRET` (local `wrangler dev`) neither side checks tickets.

### Seeding the Yjs doc

The doc starts empty and must be filled from the database exactly once. When a tab has both its editor and the server's copy of the note, it sends `seed?` with the `updatedAt` it holds, repeating every 3 seconds until answered. The room answers `seed` with `grant: true` to one connection at a time, and only when the doc is empty or the database copy is newer than the version the room last recorded. The granted tab loads the HTML into the doc and sends `seeded`. A grant expires after 10 seconds if the tab goes away. After each successful save, the tab sends `saved` with the new `updatedAt`, and the room keeps the newest one as `dbUpdatedAt`. The doc is written to Durable Object storage at most once a second (at least every 5 seconds while updates keep coming).

### Custom messages

| Direction | Message | Fields | Effect |
|---|---|---|---|
| client to note room | `seed?` | `dbUpdatedAt` | Ask to seed (write access only) |
| client to note room | `seeded` | `dbUpdatedAt` | Seeding finished; records the version |
| client to note room | `saved` | `dbUpdatedAt` | A save reached the database; records the version if newer |
| client to note room | `tags` | `tags[]` | Relayed to the other clients (write access only) |
| client to note room | `title` | `title` | Relayed to the other clients (write access only) |
| client to note room | `comment-update` | `noteId` | Relayed to the other clients; allowed for `READ` too |
| note room to client | `seed` | `grant` | Answer to `seed?` |
| note room to client | `tags`, `title`, `comment-update` | as above | Other tabs update tags, the title in the sidebar, or refetch comments |
| note room to client | `delete` | none | The note was deleted. Also sent on connect to a room marked deleted, which then never serves the doc. |
| API to note room (HTTP POST) | `title` | `title` | Broadcast after a rename through the API |
| API to note room (HTTP POST) | `delete` | none | Marks the room deleted and broadcasts `delete` |
| API to note room (HTTP POST) | `kick` | none | Closes every connection with code 4001, reason `access changed` |
| API to notification room (HTTP POST) | `notification` | `notification: {id, type, noteId, noteTitle, message, fromUserId, fromName, fromAvatar, metadata, read, timestamp}` | Relayed to the user's tabs, which add it to the bell |
| API to notification room (HTTP POST) | `notification_update` | `notificationId`, `updates` | Relayed; the bell merges the updates into that notification |

HTTP pushes from the API must carry the `x-realtime-secret` header when the secret is configured, and get 403 without it. The API does not wait for push failures: they are caught and ignored.

### The kick message

`kick` is sent by the API whenever access to a note shrinks: when a link is revoked (`DELETE /api/share/:token`), when a link is regenerated and an older one of the same permission was revoked (`POST /api/notes/:id/share`), when a collaborator is removed and when a collaborator's permission changes. The Worker closes every socket in that note's room, including the owner's. The y-partyserver provider reconnects on its own and fetches a new ticket for the new connection. Someone who still has access is back within moments, with a `READ` or `WRITE` ticket that matches their current rights. Someone who lost access gets 403 from the ticket route, so their connection attempt carries an empty ticket and is refused by the Worker; the provider keeps retrying in the background. The client shows no message for a kick itself (see 2.13 for what each kind of user sees).

## 7. Test coverage map

The smoke tests in `e2e/` run against production with `npm run e2e` (or one at a time with `node e2e/<name>.mjs`) and print one PASS or FAIL line per check.

| Feature | Covered by | What is checked |
|---|---|---|
| Guest mode | `guest.mjs` | Guest stays on `/`, editor is editable, notes survive a reload, two notes stored, no sockets, no failing API calls, no page errors |
| Guest pill and storage warning | `guest.mjs` | "Local" label shown, no pill before an edit, pill after the first edit, dismiss remembered across reloads, storage-full warning appears and clears, label and pill fit a 375 px screen |
| Guest image shrinking | `guest.mjs` | A big PNG is stored as WebP at less than half its size |
| No comments for guests | `guest.mjs` | No Comments button and no Comment menu item for guests, Comments button present once signed in |
| Guest-to-account import | `guest.mjs` | Guest store emptied, both notes in the account, a reload during import makes no copies, two tabs do not double-import |
| Save indicator | `guest.mjs` | "Syncing" while saving, then "Saved" |
| 404 page | `guest.mjs` | Unknown URL gives 404 and "Nothing written here" |
| Cross-device sync | `sync.mjs` | A second browser lists and shows a new note without a reload, both devices' text survives, the socket goes to the Worker |
| Stale local cache | `stale-cache.mjs` | A device with an old cached copy shows the newer server copy before it can type, and the result keeps all edits |
| Live edits and carets | `realtime.mjs`, `crdt.mjs` | Typing appears live in another tab, a caret stays put when someone edits above it, concurrent typing in one paragraph merges, remote carets are drawn, the other person's avatar appears in the top bar and leads to their caret |
| Seeding and database authority | `crdt.mjs` | A fresh room is seeded exactly once, opening a note does not rename it, a newer database copy replaces the room doc |
| Room tickets and view-only writes | `realtime.mjs`, `crdt.mjs` | Note and notification sockets carry tickets, a view link gets `READ`, a viewer's title message and Yjs update are dropped, a socket without a ticket is refused, an anonymous ticket request without a link gets 401 |
| Public share page | `realtime.mjs` | Follows the owner's typing live and stays read-only |
| Edit links | `realtime.mjs` | A signed-in non-owner gets the note editable in the app, the owner sees the typing live, the edit reaches the database |
| Revocation (kick) | `realtime.mjs` | A revoked edit link's open editor is cut off at once |
| Access request push | `realtime.mjs` | The request reaches the owner's open tab without a reload |
| "Opened" notification | `opened.mjs` | The owner's bell shows "<name> opened …" after an invited collaborator opens the note |
| Editor formatting | `editor.mjs` | As a guest: list items spaced closer than blocks, a bullet list inside a task keeps its markers, a checked task does not strike its open child, rich paste with an image keeps its text, plain paste keeps lines and literal text, `# ` makes a heading, Normal Text leaves a quote, dark mode inline code has a chip and highlights keep dark text, the selection bar shows above selected text, applies bold and a highlight, has no Comment for guests, the color row expands to the full picker, the link box X cancels and keeps the selection, the bar hides when the selection collapses, `/todo` and Enter make a checklist, and the slash menu opens after a space and closes on Esc when the selection collapses |
| Fixes from the spec review | `fixes.mjs` | Mention refused from a note you can't open, owner id for comment deletes, share links for edit collaborators, PATCH on a non-collaborator is 404, a downgraded collaborator's editor locks without a reload, no Rename on view-only notes, Ctrl+K opens the link box, an HTML upload is refused with a message and nothing is embedded, closing an unposted comment with the sidebar's X drops its highlight |
| Phone | `phone.mjs` | Signed in on an iPhone-sized touch screen: no selection bar on a touch selection, the toolbar pinned to the bottom of the screen in one row, the toolbar's link box opens and its X closes it, a comment started from the toolbar and closed with X leaves no highlight |
| Attachments and uploads | `attach.mjs` | Attachment stored as a Blob URL, no base64 in the note, note stays small, download link forces a download, an HTML upload is refused with 415 |
| Voice memos | `attach.mjs` | Recording pill shown, memo saved as a Blob attachment |
| Mobile text style sheet | `attach.mjs` | The text style button opens a bottom sheet on a phone-sized screen |
| Polls | `poll.mjs` | Clicking away saves the form, poll text survives a reload, center and right alignment, the selection bar follows the poll, a vote shows as cast in a second browser of the same account and counts once |
| Offline | `offline.mjs` | The worker controls the page; a guest opens offline, edits, and keeps the edit across an offline reload; a signed-in user opens offline read-only and gets editing back with the network |
| Tags | `tags.mjs` | Add, rename and delete each reach the database |
| Switching during note creation | `tags.mjs` | Switching away while a new note is created stays on the note the user picked |

These features have **no automated test**: comments (create, reply, resolve, delete, orphan cleanup, comment notifications), `@` and `#` mentions and the mention notification, the notification bell's actions (mark read, delete all, accepting or denying an access request from the bell, the access request screen), the share dialog itself (generate, regenerate, QR, copy, inviting collaborators through the UI, changing or removing a collaborator), collaborator removal and downgrade, "Delete note for everyone" and "Remove from my list", note deletion reaching other tabs, renames reaching other tabs, the "shared", "deleted" and "permission_changed" browser notifications, export in any format, appearance settings, sidebar search and tag filtering, images through the toolbar for a signed-in user (only the guest data-URL path is tested), image resizing and the image menu, tables, footnotes, code blocks, lorem ipsum, spell check, the context menu, sign-in, sign-up and onboarding, the mobile sidebar drawer, the web manifest, offline behavior of a tab that loses the network while open, and the share link "no longer active" page.

## 8. Known gaps

The current list of what is missing or limited lives in [known-gaps.md](known-gaps.md).

### Findings from writing this spec

Writing this spec turned up a list of bugs. Most were fixed on 2026-10-17 and are covered by `e2e/fixes.mjs`; what is left is below.

Anyone signed in with an edit link can permanently delete the owner's note through "Delete note for everyone" (`app/api/share/[token]/delete-note/route.ts`). This may be intended, but it is a large power to hand to a link, and it is waiting on a product decision.

`GET /api/access-requests`, `PATCH /api/user/username` and `components/InfoPopover.tsx` are not used by the UI.

Writing this spec also found places where the other docs disagreed with the code (revocation, the share page's edit links, the old `?crdt` switch, framework versions, the notification type list, the test list). Those were corrected on 2026-10-17.

## 9. Browser storage keys

| Key | Holds |
|---|---|
| `barrapad_notes` | The signed-in user's owned notes, as a cache for instant paint |
| `bpad_guest_notes` | A guest's notes (the only copy) |
| `bpad_guest_pill_dismissed` | `1` once the guest pill was dismissed |
| `barrapad_manual_titles` | Ids of notes renamed by hand in this browser |
| `barrapad_tag_registry` | Every tag this browser has seen |
| `barrapad_appearance` | Appearance settings |
| `barrapad_known_shared` | Snapshot of "Shared with me" for the browser-only notifications |
| `barrapad_opened_notified` | "Opened" events already announced |
| `bpad_poll_vote_<first option id>` | The option a guest voted for in a poll |
