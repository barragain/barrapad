# barraPAD action list

Ordered by what to do first. Each item says why and what "done" looks like. The first two groups are housekeeping and can be one commit each; the rest are real work.

## 1. Repo housekeeping (one afternoon)

1. Delete the junk files in the repo root. There are 22 zero-byte files with names like `{,`, `0)`, `n.id`, `c.commentId`, `.items-center.swp`, `.table-drag-handle`. They came from shell redirects gone wrong. None are tracked.
2. Remove the claude-flow scaffolding that was never used by the app: `.claude-flow/`, `.claude/agents/`, `.claude/commands/`, `.claude/helpers/`, `.claude/skills/` (2.7 MB, 30 skills about swarms and AgentDB), `.claude/scheduled_tasks.lock`, `.mcp.json`, `memory/`. Keep `.claude/settings.local.json` if it holds permissions you want.
3. Replace `CLAUDE.md`. The current one is the claude-flow template (swarms, hive-mind, 15 agents) and says nothing about this app. Write a short one: what the app is, `npm run dev` needs `NEXT_PUBLIC_PARTYKIT_HOST` and the Clerk keys, Clerk is a production instance so localhost dev needs a dev instance or the deployed site, push after every change (your rule from `memory/feedback_git_push.md`), writing goes through `humanizer`.
4. Add a real `README.md` (the current one is empty): one paragraph, stack list, env vars, how to run, link to `docs/`.
5. `.gitignore` already has an uncommitted line for `.env*.local`; commit it. Also add `portfolio-handoff/capture/node_modules`, `capture/raw`, `capture/.env` and `capture/state-*.json` if the hand-off folder ever moves inside this repo.
6. Move `reference/` (hypernotepad screenshots, 348 KB) out of the repo or into `docs/reference/`; it is design inspiration, not code.
7. `generated/prisma` is in `.gitignore` but a `generated/` folder exists; make sure it is not tracked.

## 2. Documentation (split, shorten)

Target: no doc longer than a screen, each with one job.

- `README.md`: run it, deploy it, where things are.
- `docs/architecture.md`: the sync pipeline (localStorage, 50 ms broadcast, 1 s PATCH, dirty counter) and the realtime message table. Both are in `portfolio-handoff/spec.md` already; lift them from there.
- `docs/partykit-migration.md`: already written, follow it.
- `docs/known-gaps.md`: the list at the bottom of `spec.md`, so it stops living only in someone's head.
- Delete inline essays in code where they repeat the architecture doc (there are 20 to 40 line comment blocks in `AppShell.tsx` and `Editor.tsx` explaining the save pipeline; keep one line and point to the doc).

## 3. Realtime: move off PartyKit (before it shuts down)

Follow `docs/partykit-migration.md`. Worker code and config are in `realtime/`; `partyserver` is installed and the bundle builds. Remaining: deploy, flip `NEXT_PUBLIC_PARTYKIT_HOST`, remove the `partykit` package.

## 4. Security (do before telling anyone about the app)

1. Rooms have no auth. Anyone with a note id can connect to its room, read the full content and push updates; anyone with a user id can listen to `notif-<userId>` and POST fake notifications. Fix in the new Worker: pass the Clerk session token as a query param from `partysocket`, verify it in `onBeforeConnect` and `onBeforeRequest` (Clerk's `verifyToken` works in Workers), and check the note's owner, collaborators and share links through a small internal API route (`/api/notes/[id]/access` exists already).
2. The HTTP POST hooks into rooms (title, delete, notification push) should require a shared secret header set on both Vercel and the Worker.
3. `app/api/upload/route.ts`: check file size and type server side, not only in the browser.
4. Share tokens are fine (48 hex chars, revocable). Collab tokens (`collab-<noteId>`) are guessable from the note id, but every handler checks the collaborator table, so they are an alias, not a secret. Leave them.

## 5. Dependencies and build

1. `partykit` goes away with step 3. `partysocket` stays.
2. `typescript` is pinned to `^6.0.2` while Next 14 expects 5.x; `npm run build` works today but `next lint` and type checks may drift. Pin to the version Next 14 supports, or upgrade Next first.
3. `@types/*`, `typescript`, `prisma`, `autoprefixer`, `postcss` are in `dependencies`; move them to `devDependencies`.
4. `html2canvas`, `jspdf`, `html-docx-js`, `turndown` are already loaded lazily; `nspell` and the 1 MB `en.dic` are loaded eagerly on every page. Load the dictionary after first paint, or only when the editor gets focus.
5. Upgrade path: Next 14 to 15 (the Portfolio is on 16, so you know the drill), React 18 to 19, Prisma 5 to 6. Do it after the realtime move, one at a time.
6. The `.next` cache warning on `npm run dev` (`Restoring pack ... hasStartTime`) is a stale webpack cache. `rm -rf .next` fixes it.

## 6. Code: split the big files

`AppShell.tsx` is 1,351 lines and owns notes state, shared notes, notifications, polling, export, share, appearance and the layout. `NoteEditorCore.tsx` is 1,092, `CommentSidebar.tsx` 884, `Toolbar.tsx` 820.

Suggested cuts, each a pure move with no behaviour change:

- `hooks/useNotes.ts`: notes list, cache, dirty counter, save pipeline (from `AppShell.tsx`).
- `hooks/useSharedNotes.ts`: shared list, 10 s polls, access events.
- `hooks/useNotifications.ts`: fetch, socket, local snapshot diffing.
- `lib/realtime.ts`: one place that builds the room URL and opens the socket. Today the host and protocol logic is copied in six files.
- `components/toolbar/`: split `Toolbar.tsx` into the button groups it already has.

Do the hooks first; the rest can wait.

## 7. Correctness bugs found while writing the spec

1. The Share modal lists the note owner as a collaborator, with a Remove button. The collaborators API includes the owner for @mentions; the modal should filter the owner out.
2. The bell footer says "Read notifications disappear after 14 days" but nothing deletes them. Either add a cleanup in the GET (delete read rows older than 14 days) or change the copy.
3. `/onboarding` page exists but nothing links to it; the onboarding modal does the same job. Delete the page.
4. Poll votes are in memory; a reload lets you vote again. Store votes in the note JSON or drop the vote count.
5. The "Close" X in the bottom strip of the app shell has no click handler.
6. Attachments and voice memos are base64 inside the note HTML. A 5 MB voice memo makes a 7 MB note that goes through PartyKit on every keystroke. Upload them to Blob like images.
7. The remote cursor sometimes lands one paragraph above where the collaborator is typing (seen while recording the demo). Probably a position mapping issue when the remote update and the cursor message arrive out of order; apply cursor positions after the document update, not before.
8. Creating a note from the sidebar button sometimes leaves "No note selected" (seen in headless Chromium, three runs out of ten). The optimistic `temp-` id is probably replaced before `setActiveNoteId` runs. Select the note after the server answers.
9. Access-request notifications did not reach the owner's open tab until a reload (seen while recording). The push goes to `notif-<userId>` over HTTP; check that the room id the API posts to matches the one the client joins, and that the POST is not swallowed by the `.catch(() => {})`.

## 8. Nice to have, later

- CRDT sync (Yjs) once more than two people edit the same note at once.
- PWA manifest so it can be installed on phones.
- A Clerk development instance so `npm run dev` works on localhost without touching production.
- Playwright smoke test from `portfolio-handoff/capture/capture.mjs`: it already drives sign in, note creation, sharing, live edits, comments and access requests. Trim it into `e2e/` and run it before deploys.

## Progress (2026-10-15)

Done: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 3 (all of it), 4.2. Also fixed outside this list: cross-device sync. The room's initial `sync` is applied only when newer than the database copy (it used to overwrite and re-save stale room content), `updatedAt` is server-issued everywhere so `fetchNotes` can merge by timestamp, the editor is read-only until the first `/api/notes` answer of the session, and the app re-fetches on window focus and reconnect, not only on tab visibility.

Smoke tests for the sync fix live in `portfolio-handoff/capture/` (`sync-smoke.mjs`, `stale-cache-smoke.mjs`); run them with `node` from that folder after a deploy. 5.1 and 5.3 done (devDependencies moved); 5.4 was already lazy.

## Speed (2026-10-15)

Measured on production with `portfolio-handoff/capture/perf-probe.mjs`: the page was usable 2.3 to 2.8 s after navigation. The waterfall was document (0.6 s TTFB, Clerk handshake) then Clerk JS boot then `/api/notes` (0.8 to 1.0 s). Two causes for the API time: Vercel functions ran in `iad1` (US east) while the Neon database sits in `ap-southeast-1` and the user connects from Asia, so each call crossed the Pacific twice; and Neon's compute suspends when idle, so the first query after a pause takes an extra second or two.

Done: `app/page.tsx` loads notes server-side and seeds `AppShell`, so the editor is usable at first paint; `vercel.json` pins functions to `sin1`. ilovenote.net, the reference for "fast", is a plain localStorage notepad with no account and no sync; its own TTFB is 1.1 s, it only feels instant because nothing is fetched after load.

Done too: the Worker pings `/api/health` every 4 minutes (cron trigger) so Neon stays awake. After pinning: usable at about 1.2 s warm (was 2.3 s). Open: the 0.4 s Clerk handshake redirect on each cold document, and the 370 KB of script.

## Guest mode and sign-in (2026-10-16)

Done: bpad works without an account. Guest notes stay in the browser (`bpad_guest_notes`, `local-` ids) with no API or realtime calls, and a small dismissible pill in the bottom strip offers sign-up. It turns red and stays up when browser storage is full. Comments are hidden for guests. On sign-in the guest notes are moved into the account. The top bar has a sync indicator (spinning cloud, then "Saved"). There is a 404 page, and the middleware now only protects `/api`, so unknown URLs reach it instead of sign-in.

Clerk: sessions last 90 days, passkeys are on, and Google sign-in is disabled because it never had production OAuth credentials (the button failed with "Missing client_id"). To bring Google back, create a Google Cloud OAuth client with redirect URI `https://clerk.bpad.cc/v1/oauth_callback`, add the ID and secret in Clerk, and re-enable the connection.

Open from this round: guest images are base64 inside the note, so a few big images fill localStorage (the pill warns, but nothing shrinks them). Local Windows builds lose the root CSS (see CLAUDE.md, Testing); worth a look if it ever affects Vercel.

## Security, bugs and docs (2026-10-16)

Room auth (4.1) is done with signed tickets in place of Clerk tokens in the Worker. `/api/realtime/ticket` checks access and signs `<READ|WRITE>.<expiresMs>.<hmac>` with `REALTIME_SECRET`, the Worker verifies it in `onBeforeConnect`, and view-only connections can no longer push content. Upload checks (4.3) were already server side; the route now takes attachments and voice memos too and refuses HTML, SVG, XML and script types.

From section 7, attachments and voice memos go to Blob (7.6), poll votes are remembered per browser (7.4), and remote content is applied as a minimal diff so carets and remote cursors no longer drift when someone edits above them (7.7). Items 7.1, 7.2, 7.3, 7.5 and 7.8 were already fixed in earlier rounds, and 7.9 tested fine on the Worker (an access request reaches the owner's open tab live). TypeScript is pinned to 5.9 (5.2). Section 2 is done: `docs/architecture.md` and `docs/known-gaps.md` exist and the long comment blocks were already gone.

New smoke tests (now in `e2e/`): `realtime` (live edits, caret stability, tickets, view-only writes dropped, access-request push) and `attach` (Blob uploads, download link, HTML refused).


## Upgrades, refactor, extras (2026-10-16, later)

5.5 is done: Prisma 6, then Next 15 with React 19 (async route params via the codemod, `serverExternalPackages`). From section 6, the bell notifications and the "opened your note" poll moved into `hooks/useNotifications.ts`, and the room host logic was already in `lib/realtime.ts`. The notes list and save pipeline (`useNotes`) and the shared-notes poll stay in AppShell on purpose: they share most of their state and refs with the editor callbacks, so splitting them is a large move with real regression risk and no user-facing change. From section 8, the web manifest is in (phones can install bpad) and the smoke tests live in `e2e/` with `npm run e2e`. Polls also save when you click away from the form and follow the toolbar's align buttons.

Still open: `useNotes` / `useSharedNotes` split and the `Toolbar.tsx` split (6), CRDT sync and a Clerk development instance (8). The env rename is done (`NEXT_PUBLIC_REALTIME_HOST`).

## Round 3 (2026-10-16, evening)

The realtime host variable is now `NEXT_PUBLIC_REALTIME_HOST`; the old name is gone from Vercel. `Toolbar.tsx` went from 815 to about 500 lines: its helpers, `TBtn`, `MobileSheet` and the voice memo button live in `components/toolbar/`. The button groups stay in `Toolbar.tsx` because they share the dropdown state and `closeAll`, so splitting them would only move props around. Tags moved out of AppShell into `hooks/useTags.ts`, and rename and delete no longer read the affected notes from inside a `setNotes` updater, which React can run late.

A flaky guest test turned out to be a real race. Two signed-in tabs that both saw guest notes would both import them, so one note landed twice. A Web Lock now lets only one tab import, and the guest test opens two tabs at once to cover it. New checks: `tags` (add, rename, delete reach the database), and `attach` also records a voice memo and opens the mobile text style sheet. The suite is 7 files and 55 checks.

Local dev now signs in: `npm run dev` uses the Clerk development instance and the Neon branch `dev` through `.env.development.local` (see CLAUDE.md). The comment bubble also follows a selected poll when it is aligned.

Still open: `useNotes` / `useSharedNotes` (the save pipeline and shared-notes poll share refs with the editor callbacks) and CRDT sync.
