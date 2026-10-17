// Production smoke test for the fixes that came out of writing docs/spec.md:
// mention access check, owner id for comment deletes, share links for edit
// collaborators, collaborator PATCH on a stranger, live downgrade to read-only,
// no Rename for view-only, refused uploads, Ctrl+K. Usage: node e2e/fixes.mjs
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
  await page.waitForTimeout(3_000)
  return page
}
const call = (page, method, url, body) => page.evaluate(({ method, url, body }) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) })), { method, url, body })

const stamp = Date.now().toString(36)
const A = await open('state-demo1.json')
const B = await open('state-demo2.json')
const made = []

try {
  const probe = await call(B, 'POST', '/api/notes', {})
  await call(B, 'DELETE', `/api/notes/${probe.json.id}`)
  const bId = probe.json.userId

  const shared = (await call(A, 'POST', '/api/notes', { title: `fixes-${stamp}`, content: `<p>fixes-${stamp}</p>` })).json
  const secret = (await call(A, 'POST', '/api/notes', { title: `secret-${stamp}`, content: '<p>secret</p>' })).json
  made.push(shared.id, secret.id)
  await call(A, 'POST', `/api/notes/${shared.id}/collaborators`, { targetUserId: bId, permission: 'EDIT' })

  const stranger = await call(B, 'POST', '/api/notifications/mention', { mentionedUserId: shared.userId, noteId: secret.id })
  check(stranger.status === 403, `mention from a note you can't open is refused (${stranger.status})`)
  const allowed = await call(B, 'POST', '/api/notifications/mention', { mentionedUserId: shared.userId, noteId: shared.id })
  check(allowed.status === 200, `collaborator can mention (${allowed.status})`)

  const owner = await call(A, 'GET', `/api/notes/${shared.id}`)
  check(owner.json?.userId === shared.userId, 'note GET returns the owner id (comment deletes)')

  const links = await call(B, 'GET', `/api/share/collab-${shared.id}/links`)
  check(links.status === 200 && Array.isArray(links.json), `edit collaborator can list share links (${links.status})`)

  const ghost = await call(A, 'PATCH', `/api/notes/${shared.id}/collaborators/user_nobody`, { permission: 'READ' })
  check(ghost.status === 404, `PATCH on a non-collaborator is 404, not 500 (${ghost.status})`)

  // B opens the note, then A downgrades B to view-only.
  await call(B, 'GET', `/api/share/collab-${shared.id}`)
  await B.reload({ waitUntil: 'domcontentloaded' })
  await B.waitForTimeout(4_000)
  const item = B.getByText(`fixes-${stamp}`).first()
  await item.click()
  const editable = await B.locator('.ProseMirror[contenteditable="true"]').first()
    .waitFor({ timeout: 20_000 }).then(() => true).catch(() => false)
  check(editable, 'edit collaborator gets an editable note')
  await call(A, 'PATCH', `/api/notes/${shared.id}/collaborators/${bId}`, { permission: 'READ' })
  const locked = await B.locator('.ProseMirror[contenteditable="false"]').first()
    .waitFor({ timeout: 25_000 }).then(() => true).catch(() => false)
  check(locked, 'downgraded collaborator turns read-only without a reload')

  // The context menu reads the "Shared with me" list, which polls every 10 s.
  await B.waitForTimeout(11_000)
  await item.click({ button: 'right' })
  await B.waitForTimeout(500)
  const menuOpen = await B.getByText('Remove from my list', { exact: true }).count()
  const rename = await B.getByText('Rename', { exact: true }).count()
  check(menuOpen > 0 && rename === 0, `view-only shared note's menu has no Rename (menu open ${menuOpen}, rename ${rename})`)
  await B.keyboard.press('Escape')

  // Owner side: refused upload and Ctrl+K.
  await A.reload({ waitUntil: 'domcontentloaded' })
  await A.waitForTimeout(4_000)
  await A.getByText(`fixes-${stamp}`).first().click()
  const ed = A.locator('.ProseMirror[contenteditable="true"]').first()
  await ed.waitFor({ timeout: 20_000 })
  await ed.click()
  await A.keyboard.press('Control+k')
  const linkBox = await A.locator('input[placeholder="https://example.com"]')
    .waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
  check(linkBox, 'Ctrl+K opens the link box')
  await A.keyboard.press('Escape')

  let alerted = ''
  A.on('dialog', (d) => { alerted = d.message(); d.dismiss().catch(() => {}) })
  const uploads = []
  A.on('request', (r) => { if (r.url().includes('/api/upload')) uploads.push(r.url()) })
  await A.locator('input[type="file"]:not([accept])').first()
    .setInputFiles({ name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<h1>hi</h1>') })
  await A.waitForTimeout(2_000)
  const attached = await A.locator('.ProseMirror').getByText('page.html').count()
  check(/isn't allowed/.test(alerted) && attached === 0 && uploads.length === 0,
    `HTML upload refused with a message, nothing embedded (alert "${alerted}", attached ${attached})`)
} finally {
  for (const id of made) await call(A, 'DELETE', `/api/notes/${id}`).catch(() => {})
  await browser.close()
}
process.exit(failed ? 1 : 0)
