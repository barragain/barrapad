# Replacing PartyKit

Done on 2026-10-15. This file records why bpad's realtime moved from PartyKit (the hosted service at `*.partykit.dev`, which is going away) to a Cloudflare Worker, and what changed. How the rooms work today is in [architecture.md](architecture.md).

## Decision: PartyServer on Cloudflare Workers

PartyServer is the successor library from the same author, maintained inside the `cloudflare/partykit` repo. It runs on Cloudflare Durable Objects, which is what PartyKit used underneath. The API is the same shape (`onConnect`, `onMessage`, `onClose`, `onRequest`, `broadcast`, `getConnections`, per-room storage), and the `partysocket` client kept working unchanged.

Why not something else:

| Option | Why not |
|---|---|
| Liveblocks, Ably, Pusher | Paid per connection or message, and they replace the whole room model, so every socket handler gets rewritten. |
| Supabase Realtime | We are on Clerk and Postgres via Prisma already; adding Supabase just for broadcast is a second backend. |
| Yjs + Hocuspocus / y-sweet | A different sync model and a rewrite of the editor sync, too much for a hosting swap. Yjs came later on the same Worker through `y-partyserver`. |
| Plain WebSocket server on a VPS | Needs a box to run and watch. The app is otherwise serverless on Vercel. |

Cost: Durable Objects are on the Workers free plan (SQLite backed classes). Current traffic fits in it.

## What changed

The Worker is `realtime/index.ts` with its config in `realtime/wrangler.jsonc`, deployed at `barrapad-realtime.barra-ggez.workers.dev` with `npm run deploy:realtime` and run locally with `npm run dev:realtime` on `localhost:8787`. The app reads the host from `NEXT_PUBLIC_REALTIME_HOST` (renamed from `NEXT_PUBLIC_PARTYKIT_HOST`), and `lib/realtime.ts` is the one place that builds room URLs and push headers. `party/`, `partykit.json`, `.partykit/` and the `partykit` package are gone; `partysocket` stays.

Since the cutover, note content moved to Yjs in a second room class (`NoteYParty` at `/parties/note-y/<noteId>`), while notifications stay in `NoteParty` at `/parties/main/notif-<userId>`. Sockets need a signed room ticket, and HTTP pushes into rooms need the `x-realtime-secret` header (`REALTIME_SECRET` on both Vercel and the Worker).

## Behaviour notes

Both room classes hibernate (`static options = { hibernate: true }`, 2026-10-18). Without it every open tab kept its Durable Object awake and the account hit 90% of the free daily duration limit. y-partyserver keeps awareness ids in `connection.state`, so presence survives a wake-up, and the Y doc reloads from storage in `onLoad`.

Old PartyKit room storage was not migrated. A fresh room is filled from the database through the seed claim (see [architecture.md](architecture.md)).

PartyServer calls `onMessage(connection, message)`, while PartyKit called `onMessage(message, sender)`. The port handles it.
