// Production smoke test for realtime room auth (signed tickets) on www.bpad.cc.
// Two signed-in tabs see each other's typing live; a view-only share link joins
// the room but its writes are dropped; a socket without a ticket is refused.
// Usage: node e2e/realtime.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
const STATE = path.join(AUTH, 'state-demo1.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }
const editableEditor = () => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true'
const editor = (page) => page.locator('.ProseMirror').first()

async function open(state) {
  const c = await browser.newContext({ storageState: state, viewport: { width: 1400, height: 900 } })
  const page = await c.newPage()
  const sockets = []
  const frames = []
  page.on('websocket', (ws) => { sockets.push(ws.url()); ws.on('framereceived', (f) => frames.push(String(f.payload))) })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('button[title="New note"]') && !document.body.innerText.includes('Syncing'), null, { timeout: 30_000 })
  await sleep(3_000) // the shell is server-rendered: wait for hydration before clicking
  return { c, page, sockets, frames }
}

const marker = `rt-${Date.now().toString(36)}`
const A = await open(STATE)
await A.page.locator('button[title*="New note" i]').first().click()
await A.page.waitForFunction(editableEditor, null, { timeout: 15_000 })
await editor(A.page).click()
await A.page.keyboard.type(`${marker} start`)
await sleep(3_000)

const notes = await A.page.evaluate(() => fetch('/api/notes').then((r) => r.json()))
const noteId = (Array.isArray(notes) ? notes : notes.notes ?? []).find((n) => n.content?.includes(marker))?.id
check(!!noteId, `note saved (${noteId})`)

const B = await open(STATE)
await B.page.getByText(marker, { exact: false }).first().click()
await B.page.waitForFunction(editableEditor, null, { timeout: 15_000 })
await sleep(2_000)

// Live edit A -> B, no reload, no focus change.
await editor(A.page).click()
await A.page.keyboard.press('Control+End')
await A.page.keyboard.type(' live-A')
const sawLive = await B.page.waitForFunction((m) => document.querySelector('.ProseMirror')?.textContent?.includes(m), `${marker} start live-A`, { timeout: 8_000 }).then(() => true).catch(() => false)
check(sawLive, 'B sees A typing live through the room')
// B's caret sits at the end; A adds a paragraph at the top. B's next keystroke
// must still land at the end (positions are mapped, not kept absolute).
await editor(B.page).click()
await B.page.keyboard.press('Control+End')
await sleep(500)
await A.page.keyboard.press('Control+Home')
await A.page.keyboard.type('TOP LINE')
await A.page.keyboard.press('Enter')
await B.page.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent?.startsWith('TOP LINE'), null, { timeout: 8_000 }).catch(() => {})
await sleep(500)
await B.page.keyboard.type('Z')
check((await editor(B.page).innerText()).trim().endsWith('live-AZ'), `B's caret stays put when A edits above (${(await editor(B.page).innerText()).replace(/\n/g, ' / ')})`)

check(B.sockets.some((u) => u.includes(`/parties/main/${noteId}`) && /ticket=(READ|WRITE)\./.test(u)), 'note socket carries a signed ticket')
check(A.sockets.some((u) => u.includes('/parties/main/notif-') && /ticket=WRITE\./.test(u)), 'notification socket carries a signed ticket')

// View-only share link: gets a READ ticket; its update is dropped by the Worker.
const link = await A.page.evaluate((id) => fetch(`/api/notes/${id}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permission: 'READ' }) }).then((r) => r.json()), noteId)
const anon = await browser.newContext()
const V = await anon.newPage()
await V.goto(`${BASE}/s/${link.token}`, { waitUntil: 'domcontentloaded' })
const rtHost = A.sockets.find((u) => u.includes('/parties/'))?.split('/parties/')[0]
const forged = await V.evaluate(async ({ noteId, token, rtHost }) => {
  const { ticket } = await fetch(`/api/realtime/ticket?room=${noteId}&share=${token}`).then((r) => r.json())
  const ws = new WebSocket(`${rtHost}/parties/main/${noteId}?ticket=${ticket}`)
  const opened = await new Promise((r) => { ws.onopen = () => r(true); ws.onerror = () => r(false) })
  if (opened) ws.send(JSON.stringify({ type: 'update', content: '<p>HACKED by viewer</p>', title: 'x' }))
  await new Promise((r) => setTimeout(r, 1500))
  ws.close()
  const noTicket = await new Promise((r) => { const w = new WebSocket(`${rtHost}/parties/main/${noteId}`); w.onopen = () => { w.close(); r(true) }; w.onerror = () => r(false) })
  return { ticketPerm: ticket.split('.')[0], opened, noTicket }
}, { noteId, token: link.token, rtHost })
check(forged.ticketPerm === 'READ' && forged.opened, `view-only link joins with a READ ticket (${forged.ticketPerm})`)
await sleep(1_500)
check(!(await editor(A.page).innerText()).includes('HACKED'), "viewer's update is dropped, owner's note unchanged")
check(forged.noTicket === false, 'socket without a ticket is refused')

const denied = await V.evaluate((id) => fetch(`/api/realtime/ticket?room=${id}`).then((r) => r.status), noteId)
check(denied === 401, `anonymous ticket without share token refused (${denied})`)

// Access request from the second demo account reaches A's open tab without a reload.
const G = await open(path.join(AUTH, 'state-demo2.json'))
const reqStatus = await G.page.evaluate((id) => fetch('/api/access-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noteId: id }) }).then((r) => r.status), noteId)
await sleep(4_000)
check(A.frames.some((f) => f.includes('"notification"') && f.includes(noteId)), `access request pushed live to the owner's tab (POST ${reqStatus})`)

// Cleanup: delete the test note (cascades the share link).
await A.page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), noteId)
console.log('test note deleted')

await browser.close()
process.exit(failed ? 1 : 0)
