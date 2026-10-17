// Production smoke test: when an invited collaborator opens a note, the owner's
// bell shows "<name> opened <title>". Usage: node e2e/opened.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }

const browser = await chromium.launch({ headless: true })
async function open(state) {
  const c = await browser.newContext({ storageState: path.join(AUTH, state), viewport: { width: 1400, height: 900 } })
  const page = await c.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('button[title="New note"]'), null, { timeout: 30_000 })
  return page
}
const post = (page, url, body) => page.evaluate(({ url, body }) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()), { url, body })

const title = `opened-${Date.now().toString(36)}`
const A = await open('state-demo1.json')
const B = await open('state-demo2.json')

// demo2's user id: the owner of a throwaway note it creates.
const probe = await post(B, '/api/notes', {})
await B.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), probe.id)

const note = await post(A, '/api/notes', { title, content: `<p>${title}</p>` })
const invite = await post(A, `/api/notes/${note.id}/collaborators`, { targetUserId: probe.userId, permission: 'READ' })
check(invite.userId === probe.userId, 'collaborator invited')

const status = await B.evaluate((id) => fetch(`/api/share/collab-${id}`).then((r) => r.status), note.id)
check(status === 200, `collaborator opens the note (${status})`)

// The owner's tab polls every 10 s.
await A.locator('button[title^="Notifications"]').click()
const shown = await A.getByText(new RegExp(`opened "${title}"`)).first()
  .waitFor({ timeout: 25_000 }).then(() => true).catch(() => false)
check(shown, 'owner sees "opened" notification')

await A.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), note.id)
await browser.close()
process.exit(failed ? 1 : 0)
