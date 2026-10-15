# Replacing PartyKit

PartyKit (the hosted service at `*.partykit.dev`) is going away. The code under `party/` depends on it, and so do four client files and three API routes that talk to `barrapad.barragain.partykit.dev`.

## Decision: PartyServer on Cloudflare Workers

PartyServer is the successor library from the same author, maintained inside the `cloudflare/partykit` repo. It runs on Cloudflare Durable Objects, which is what PartyKit used underneath. The API is the same shape (`onConnect`, `onMessage`, `onClose`, `onRequest`, `broadcast`, `getConnections`, per-room storage), and the `partysocket` client we already ship keeps working unchanged.

Why not something else:

| Option | Why not |
|---|---|
| Liveblocks, Ably, Pusher | Paid per connection or message, and they replace the whole room model, so every socket handler gets rewritten. |
| Supabase Realtime | We are on Clerk and Postgres via Prisma already; adding Supabase just for broadcast is a second backend. |
| Yjs + Hocuspocus / y-sweet | Real CRDT merging would fix the last-write-wins editing, but it is a different sync model and a rewrite of the editor sync. Worth it later, not as a hosting swap. |
| Plain WebSocket server on a VPS | Needs a box to run and watch. The app is otherwise serverless on Vercel. |

Cost: Durable Objects are on the Workers free plan (SQLite backed classes). Current traffic fits in it.

## What is already done

- `realtime/index.ts`: the server, ported from `party/index.ts`. Same rooms (`<noteId>` and `notif-<userId>`), same messages, same HTTP POST hooks.
- `realtime/wrangler.jsonc`: Worker config. The Durable Object binding is named `Main`, so the routes stay `/parties/main/<room>` and no client URL changes.

## Cutover steps

1. Install and deploy the Worker (one-off, from the repo root):

   ```bash
   npm i partyserver
   npx wrangler deploy -c realtime/wrangler.jsonc
   ```

   Wrangler prints the Worker URL, something like `barrapad-realtime.<account>.workers.dev`. Optional: add a custom domain such as `rt.bpad.cc` under the Worker's settings.

2. Point the app at it. Only one setting changes, `NEXT_PUBLIC_PARTYKIT_HOST`, used in:

   - `components/AppShell.tsx`
   - `components/Editor.tsx`
   - `components/SharedNoteView.tsx`
   - `lib/notifications.ts`
   - `app/api/notes/[id]/route.ts`
   - `app/api/share/[token]/route.ts`

   Set it on Vercel (production and preview) and in `.env.local` to the new host without protocol, for example `barrapad-realtime.<account>.workers.dev`. The code builds `https://` and `wss://` from it already.

3. Also change the fallback string in those six files from `barrapad.barragain.partykit.dev` to the new host, or better, make the env var required and drop the fallback.

4. Local development: `npx wrangler dev -c realtime/wrangler.jsonc` serves on `localhost:8787`. Set `NEXT_PUBLIC_PARTYKIT_HOST=localhost:8787`; the code already switches to `http`/`ws` for localhost.

5. Remove PartyKit: delete `party/`, `partykit.json`, `.partykit/`, the `dev:party` script, and `npm rm partykit`. Keep `partysocket`.

6. Rename `NEXT_PUBLIC_PARTYKIT_HOST` to `NEXT_PUBLIC_REALTIME_HOST` once everything is green. Not required, but the old name will confuse people later.

## Behaviour notes

- Rooms do not hibernate. Cursor state is kept in memory per room, as before. If idle rooms become a cost problem, enable `static options = { hibernate: true }` and move `cursors` into `connection.state`.
- Room storage (content, title, deleted flag) is per Durable Object. Old PartyKit room storage is not migrated; the first client to open a note after cutover seeds the room from the database via its normal autosave path. Notes that were deleted before cutover will not carry the `deleted` flag, but the API returns 404 for them and the client's 404 polling already handles that.
- Argument order differs in one place: PartyServer calls `onMessage(connection, message)`, PartyKit called `onMessage(message, sender)`. The port handles it.
- The rooms still accept any connection. Anyone with a note id can join its room. That was true on PartyKit too; see the action list for the fix (verify the Clerk session in `onBeforeConnect`).

## Verify after cutover

- Open one note in two browsers, type in one, see it in the other, see the remote cursor.
- Share a note, open the public link, check the presence count.
- Have the collaborator comment and mention you; the bell should update without a reload.
- Delete a shared note; the collaborator's editor should switch to "This note has been deleted".

## Status (2026-10-15)

Done. The Worker is deployed at `barrapad-realtime.barra-ggez.workers.dev`, `NEXT_PUBLIC_PARTYKIT_HOST` points to it on Vercel (production, preview, development) and in `.env.local`, the host and push headers live in `lib/realtime.ts`, and `party/`, `partykit.json`, `.partykit/` and the `partykit` package are gone. HTTP pushes into rooms now require the `x-realtime-secret` header (`REALTIME_SECRET` on both Vercel and the Worker). The env var keeps its old name for now (step 6 not done).
