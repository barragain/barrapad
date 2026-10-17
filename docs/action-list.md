# bpad action list

Open work only, checked against the code on 2026-10-18. What is missing or limited by design lives in [known-gaps.md](known-gaps.md).

## Open

1. **Google sign-in.** Disabled in Clerk because it never had production OAuth credentials (the button failed with "Missing client_id"). To bring it back, create a Google Cloud OAuth client with redirect URI `https://clerk.bpad.cc/v1/oauth_callback`, add the ID and secret in Clerk, and re-enable the connection. Needs the user.
2. **Check the phone toolbar on real phones.** `e2e/phone.mjs` cannot open a real on-screen keyboard. On 2026-10-18 the user saw the toolbar vanish behind the keyboard on Android, now fixed by `interactiveWidget: resizes-content` in `app/layout.tsx`, `h-dvh` on the shell and a `clientHeight`-based `useKeyboardInset`. Needs a check on Android and on an iPhone. An Android emulator driven by Playwright would test it with a real keyboard.
3. **Unused API routes.** `GET /api/access-requests` and `PATCH /api/user/username` are not called by the UI. Use them or delete them.
4. **Editor follow-ups from the redesign.** Voice memo and tags in the slash menu, an X on the old toolbar's color and highlight dropdowns to match the selection bar, and the open question of slimming the top toolbar now that the selection bar and slash menu exist (the user said keeping both feels fine).
5. **Tests for what has none.** `docs/spec.md` section 7 lists the features with no automated test. Comments, mentions, the share dialog and export are the ones most worth covering.

## Done

Repo cleanup (junk files, claude-flow scaffolding, a real `CLAUDE.md` and `README.md`, `reference/` moved to `docs/reference/`, `generated/` untracked), the docs split, the move from PartyKit to a Cloudflare Worker, room auth with HMAC tickets and the push secret (2026-10-16), server-side upload checks, devDependencies sorted and TypeScript on 5.9, Prisma 6, Next 15 with React 19, `hooks/useNotes.ts`, `useSharedNotes.ts`, `useNotifications.ts` and `useTags.ts` split out of AppShell, `lib/realtime.ts` as the one place for the room host, `components/toolbar/` split out of `Toolbar.tsx`, every bug from the spec review, Yjs live merging, the web manifest, offline editing, a Clerk development instance for local dev, the e2e suite in `e2e/`, the editor redesign in [design-audit.md](design-audit.md), and hibernation for both Worker room classes (2026-10-18). The history of each round is in git.
