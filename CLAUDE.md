# barraPAD (bpad)

Collaborative notepad. Next.js 15 app router on Vercel, Clerk auth, Postgres via Prisma, Tiptap editor, Vercel Blob for images. Realtime (live edits merged with Yjs, carets, presence, notifications) runs on a Cloudflare Worker with Durable Objects (PartyServer) in `realtime/`; the browser talks to it with `partysocket`.

## Run

```bash
npm install
npm run dev            # Next.js on :3000
npm run dev:realtime   # Worker on :8787 (set NEXT_PUBLIC_REALTIME_HOST=localhost:8787)
npm run typecheck      # app + Worker
npm run build
npm run deploy:realtime
```

Env (see `.env.local`, pulled with `vercel env pull`): `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_REALTIME_HOST` (realtime host, no protocol), `REALTIME_SECRET` (shared with the Worker, set there with `wrangler secret put REALTIME_SECRET`).

Production uses the Clerk production instance (`pk_live`), which only works on bpad.cc. `npm run dev` reads `.env.development.local` (gitignored, not in Vercel), which swaps in the Clerk development instance (`ins_3BqDL15FTxQpMl1hsWCpbg6bByf`, `pk_test`/`sk_test`) and the Neon branch `dev` (project `broad-cherry-69412900`, a copy of `production`), so local dev signs in and never writes to the production database. Dev test user: `dev+clerk_test@bpad.cc` / `bpad-local-dev-2026`; the new-device email code is always `424242`. To run an e2e test locally, sign in once and save a storage state as `state-demo1.json`, then `BASE=http://localhost:3000 E2E_AUTH=<dir> node e2e/<name>.mjs`.

## Rules

- Push after every change. The user reviews on the live site, not locally.
- The database is the source of truth for note content. The Yjs room is a cache: a doc is only filled from the database through the seed claim (see docs/architecture.md), the newer database copy wins, and the editor stays read-only until the first `/api/notes` fetch of the session returns. Do not reintroduce client-clock `updatedAt` values; they must stay server-issued so `fetchNotes` can compare them.
- Writing that users read (copy, docs, brand) goes through the `humanizer` skill. No lists in prose, no em dashes.
- Never commit `.env*` files.
- Docs move with the code, in the same commit: `docs/spec.md` (what the site does, permissions, API, realtime protocol, test map), `docs/architecture.md` (how sync and rooms work), `docs/known-gaps.md`, and the test list below.

## Testing

Test every change in a real browser before calling it done; typecheck and build are not enough. `npm run e2e` runs every smoke test in `e2e/` against www.bpad.cc and prints one line per test: `guest` (guest mode, guest-to-account import, sync indicator, 404), `sync` (cross-device sync), `stale-cache`, `realtime` (live edits, caret stability, room tickets, view-only writes dropped, share pages live and editable, access-request push, revoked link cut off live), `attach` (Blob uploads, voice memo, mobile text style sheet), `poll` (save on click away, alignment, one vote per account across browsers), `tags` (add, rename, delete reach the database; switching away during note creation), `opened` ("X opened your note" in the owner's bell), `offline` (service worker: guest edits offline, signed-in opens read-only offline), `crdt` (Yjs: concurrent typing merges, one seed per room, newer database wins, view-only Y writes dropped), `editor` (as a guest: list and block spacing, checklist nesting, rich and plain paste, `# ` headings, Normal Text leaving a quote, dark mode inline code and highlights, selection bar, slash menu), `phone` (signed in on an iPhone-sized touch screen: no selection bar on touch, link box X, closing an unposted comment drops its highlight), `fixes` (mention access check, owner comment deletes, share links for edit collaborators, live downgrade, no Rename on view-only, Ctrl+K, refused uploads, closing an unposted comment drops its highlight). Run one with `node e2e/<name>.mjs`. `node e2e/visual-audit.mjs` is not a test: it screenshots every editor format at desktop and phone size in light and dark mode and writes spacing metrics to `e2e/out/visual/`. They log in with the demo states in `e2e/.auth/` (gitignored; copies live in `../portfolio-handoff/capture/`). The app shell is server-rendered, so tests wait about 3 s for hydration before clicking.

Localhost is only good for logic, not layout: on this Windows machine `next build` drops the global CSS from the root layout (Linux builds on Vercel are fine), and Clerk's live keys don't load off bpad.cc. Vercel previews can't run either, because the Clerk keys are Production-only and the middleware fails without them. To test layout before shipping, deploy a production build without the domain (`npx vercel deploy --prod --skip-domain --yes`), get a bypass link with the Vercel MCP `get_access_to_vercel_url`, and run `BASE=<url> SHARE=<_vercel_share token> node e2e/guest.mjs`. Signed-in checks only pass on www.bpad.cc, so run the full suite again after the push.

Clerk settings: use the Clerk MCP (`clerk`, user scope). The workspace also holds El Mercado and leDASH; only touch barraPAD (`app_3BqDKztvEAWWt2OPqFuGKWV9zwY`, production `ins_3BqJGIRRR6IyIKirD265ds2ePfY`).

## Layout

`app/` routes and API handlers, `components/` (AppShell is the shell and state owner, Editor wires the room, NoteEditorCore is the Tiptap instance), `extensions/` Tiptap extensions, `lib/` server helpers (`realtime.ts` has the room host, push headers and the browser's ticket query; `roomTicket.ts` signs room tickets), `docs/spec.md` for what every feature does (permissions, API, realtime protocol, test map), `docs/design-audit.md` (the approved editor redesign plan, steps 1 to 4) and `docs/design-research.md` (all research behind it and where the work stopped), `docs/architecture.md` for the sync and room-auth design, `prisma/` schema, `realtime/` the Worker, `docs/` plans and the action list.
