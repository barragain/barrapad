// Production smoke test for Yjs live merging (the per-browser CRDT switch).
// Two signed-in tabs with the switch on type into the same paragraph at the
// same moment and both edits survive; two tabs opening a fresh note at once do
// not double its content; a database edit made while no tab was open wins; a
// view-only ticket cannot write to the Y doc.
// Usage: node e2e/crdt.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Y from 'yjs'
import YProvider from 'y-partyserver/provider'

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
const text = async (page) => (await editor(page).innerText()).replace(/\n/g, ' / ')

async function open() {
  const c = await browser.newContext({ storageState: STATE, viewport: { width: 1400, height: 900 } })
  await c.addInitScript(() => { try { localStorage.setItem('bpad_crdt', '1') } catch {} })
  const page = await c.newPage()
  const sockets = []
  page.on('websocket', (ws) => sockets.push(ws.url()))
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('button[title="New note"]') && !document.body.innerText.includes('Syncing'), null, { timeout: 30_000 })
  await sleep(3_000) // the shell is server-rendered: wait for hydration before clicking
  return { c, page, sockets }
}
async function openNote(tab, marker) {
  await tab.page.getByText(marker, { exact: false }).first().click()
  await tab.page.waitForFunction(editableEditor, null, { timeout: 15_000 })
  await sleep(1_500)
}
const api = (page, url, init) => page.evaluate(({ url, init }) => fetch(url, init).then((r) => r.json()), { url, init })
const createNote = (page, content) => api(page, '/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: content, content: `<p>${content}</p>` }) })

const stamp = Date.now().toString(36)
const created = []

// 1. Same paragraph, same moment, both edits survive.
const A = await open()
const m1 = `crdt-${stamp}-merge`
created.push((await createNote(A.page, m1)).id)
await A.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4_000)
const B = await open()
await openNote(A, m1)
await openNote(B, m1)
check(B.sockets.some((u) => u.includes(`/parties/note-y/${created[0]}`) && /ticket=WRITE\./.test(u)), 'switch on: note joins the note-y room with a ticket')
await editor(A.page).click(); await A.page.keyboard.press('Control+End')
await editor(B.page).click(); await B.page.keyboard.press('Control+Home')
await Promise.all([A.page.keyboard.type(' AAAA', { delay: 30 }), B.page.keyboard.type('BBBB ', { delay: 30 })])
await sleep(2_000)
const [ta, tb] = [await text(A.page), await text(B.page)]
check(ta === tb && ta.includes('AAAA') && ta.includes('BBBB') && ta.includes(m1), `concurrent edits in one paragraph merge (A: ${ta} | B: ${tb})`)
const caretSeen = await A.page.locator('.ProseMirror span[style*="border-left:2px solid"]').count()
check(caretSeen > 0, 'remote caret drawn through Yjs awareness')
await sleep(2_500) // autosave
const list = await api(A.page, '/api/notes')
const saved = (Array.isArray(list) ? list : list.notes ?? []).find((n) => n.id === created[0]) ?? {}
check(saved.content?.includes('AAAA') && saved.content?.includes('BBBB'), 'merged text reaches the database')
await A.c.close(); await B.c.close()

// 2. Two tabs open a note whose room is empty: the database copy is loaded once.
const S = await open()
const m2 = `crdt-${stamp}-seed`
created.push((await createNote(S.page, m2)).id)
await S.c.close()
const [P, Q] = await Promise.all([open(), open()])
await Promise.all([openNote(P, m2), openNote(Q, m2)])
await sleep(1_500)
const count = (t) => t.split(m2).length - 1
const [tp, tq] = [await text(P.page), await text(Q.page)]
check(count(tp) === 1 && count(tq) === 1, `fresh room seeded exactly once (P: ${tp} | Q: ${tq})`)

// 3. The database changes while no tab has the note open: the database wins.
await P.page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '<p>edited elsewhere</p>' }) }), created[1])
await P.c.close(); await Q.c.close()
await sleep(1_000)
const R = await open()
await openNote(R, m2) // the list title is still the marker
await sleep(1_500)
check((await text(R.page)).includes('edited elsewhere'), `newer database copy replaces the room doc (${await text(R.page)})`)

// 4. A view-only ticket joins the Y room but its writes are dropped.
const link = await api(R.page, `/api/notes/${created[1]}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permission: 'READ' }) })
const anon = await browser.newContext()
const V = await anon.newPage()
await V.goto(`${BASE}/s/${link.token}`, { waitUntil: 'domcontentloaded' })
const { ticket } = await V.evaluate(({ id, token }) => fetch(`/api/realtime/ticket?room=${id}&share=${token}`).then((r) => r.json()), { id: created[1], token: link.token })
const rtHost = R.sockets.find((u) => u.includes('/parties/note-y/'))?.split('/parties/')[0].replace(/^wss?:\/\//, '')
const doc = new Y.Doc()
const prov = new YProvider(rtHost, created[1], doc, { party: 'note-y', params: { ticket } })
await new Promise((r) => { prov.on('synced', (s) => s && r()); setTimeout(r, 8_000) })
check(prov.synced && doc.getXmlFragment('default').toString().includes('edited elsewhere'), 'view-only ticket can read the doc')
const para = new Y.XmlElement('paragraph'); para.insert(0, [new Y.XmlText('HACKED by viewer')])
doc.getXmlFragment('default').insert(0, [para])
await sleep(2_000)
check(!(await text(R.page)).includes('HACKED'), "viewer's Y update is dropped, owner's note unchanged")
prov.destroy()

for (const id of created) await R.page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), id)
console.log('test notes deleted')
await browser.close()
process.exit(failed ? 1 : 0)
