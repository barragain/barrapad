# barraPAD

A notepad that syncs between your devices and lets you share a note with someone else, who can read or edit it live. Live site: https://www.bpad.cc

## Stack

Next.js 14, React 18, Tiptap, Clerk, Prisma on Postgres, Vercel Blob, Cloudflare Workers + Durable Objects (PartyServer) for realtime, Tailwind 4.

## Run locally

```bash
npm install
vercel env pull            # writes .env.local
npm run dev                # http://localhost:3000
npm run dev:realtime       # Worker on http://localhost:8787
```

Set `NEXT_PUBLIC_PARTYKIT_HOST=localhost:8787` in `.env.local` to use the local Worker. Clerk runs a production instance, so sign-in needs the deployed site or a Clerk dev instance of your own.

## Deploy

Vercel builds from `main`. The Worker deploys with `npm run deploy:realtime`. `REALTIME_SECRET` must match between Vercel and the Worker (`wrangler secret put REALTIME_SECRET`).

`docs/architecture.md` explains saving, sync and who can join a realtime room. `docs/known-gaps.md` lists what is still missing, and `docs/action-list.md` is the cleanup plan with its progress notes.
