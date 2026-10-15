# barraPAD (bpad)

Collaborative notepad. Next.js 14 app router on Vercel, Clerk auth, Postgres via Prisma, Tiptap editor, Vercel Blob for images. Realtime (live edits, cursors, presence, notifications) runs on a Cloudflare Worker with Durable Objects (PartyServer) in `realtime/`; the browser talks to it with `partysocket`.

## Run

```bash
npm install
npm run dev            # Next.js on :3000
npm run dev:realtime   # Worker on :8787 (set NEXT_PUBLIC_PARTYKIT_HOST=localhost:8787)
npm run typecheck      # app + Worker
npm run build
npm run deploy:realtime
```

Env (see `.env.local`, pulled with `vercel env pull`): `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_PARTYKIT_HOST` (realtime host, no protocol), `REALTIME_SECRET` (shared with the Worker, set there with `wrangler secret put REALTIME_SECRET`).

Clerk is a production instance (`pk_live`), so sign-in only works on the deployed site. Test on production with the demo accounts, not on localhost.

## Rules

- Push after every change. The user reviews on the live site, not locally.
- The database is the source of truth for note content. The realtime room is a cache: clients only accept its initial `sync` when its `updatedAt` is newer than what they hold, and the editor stays read-only until the first `/api/notes` fetch of the session returns. Do not reintroduce client-clock `updatedAt` values; they must stay server-issued so `fetchNotes` can compare them.
- Writing that users read (copy, docs, brand) goes through the `humanizer` skill. No lists in prose, no em dashes.
- Never commit `.env*` files.

## Layout

`app/` routes and API handlers, `components/` (AppShell is the shell and state owner, Editor wires the room, NoteEditorCore is the Tiptap instance), `extensions/` Tiptap extensions, `lib/` server helpers (`realtime.ts` has the room host and push headers), `prisma/` schema, `realtime/` the Worker, `docs/` plans and the action list.
