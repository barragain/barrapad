// Production smoke test for offline support (public/sw.js): a guest opens and
// edits bpad with no network; a signed-in user edits notes opened on this
// device before, offline after a reload and offline mid-session, and the
// edits reach the database after the reconnect. Usage: node e2e/offline.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }
const editable = () => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true'

const browser = await chromium.launch({ headless: true })

// Loads the app, waits for the worker, loads again so the worker caches the
// page and its scripts.
async function warm(c) {
  const page = await c.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(3_000)
  return page
}

// ── Guest ──────────────────────────────────────────────────────────────────
{
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await warm(c)
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page')
  const marker = `offline-${Date.now().toString(36)}`
  await page.waitForFunction(editable, null, { timeout: 20_000 })
  await c.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  const opened = await page.waitForFunction(editable, null, { timeout: 20_000 }).then(() => true).catch(() => false)
  check(opened, 'guest: app opens offline and is editable')
  if (opened) {
    await page.locator('.ProseMirror').first().click()
    await page.keyboard.type(marker)
    await sleep(1_500)
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForFunction(editable, null, { timeout: 20_000 }).catch(() => {})
    await sleep(1_500)
    check((await page.locator('.ProseMirror').first().innerText()).includes(marker), 'guest: offline edit survives an offline reload')
  }
  await c.close()
}

// ── Signed in ──────────────────────────────────────────────────────────────
// A note opened online keeps its Yjs doc in IndexedDB, so it is editable
// offline, and the edit reaches the database after the reconnect.
{
  const c = await browser.newContext({ storageState: path.join(AUTH, 'state-demo1.json'), viewport: { width: 1400, height: 900 } })
  const page = await warm(c)
  const stamp = Date.now().toString(36)
  const api = (method, url, body) => page.evaluate(({ method, url, body }) =>
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json().catch(() => null)), { method, url, body })
  const make = (t) => api('POST', '/api/notes', { title: t, content: `<p>${t}</p>` })
  const open = async (t) => {
    await page.getByText(t, { exact: true }).first().click()
    await page.waitForFunction((t) => document.querySelector('.ProseMirror')?.textContent.includes(t) && document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true', t, { timeout: 20_000 })
  }
  const typeAtEnd = async (text) => {
    await page.locator('.ProseMirror').first().click()
    await page.keyboard.press('Control+End')
    // A new line, so the title (the first line) stays findable in the sidebar.
    await page.keyboard.press('Enter')
    await page.keyboard.type(text)
  }
  const dbHas = async (id, text) => {
    for (let i = 0; i < 20; i++) {
      const list = await api('GET', '/api/notes').catch(() => null)
      if (list?.find?.((n) => n.id === id)?.content?.includes(text)) return true
      await sleep(1_500)
    }
    return false
  }

  // 1. Offline page load: the note opened before is editable.
  const t1 = `offline-a-${stamp}`
  const n1 = await make(t1)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(3_000)
  await open(t1)
  await sleep(1_500)
  await c.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  const shell = await page.waitForFunction(() => document.querySelector('button[title="New note"]'), null, { timeout: 20_000 }).then(() => true).catch(() => false)
  check(shell, 'signed in: app opens offline')
  await sleep(3_000)
  const offlineOpen = await open(t1).then(() => true).catch(() => false)
  check(offlineOpen, 'signed in: a note opened here before is editable offline')
  check(await page.getByText('Offline', { exact: true }).isVisible(), 'signed in: top bar says Offline')
  if (offlineOpen) {
    await typeAtEnd('typed-offline-1')
    await sleep(1_500)
  }
  await c.setOffline(false)
  // The page reloads on 'online', which ends this evaluate.
  await page.evaluate(() => window.dispatchEvent(new Event('online'))).catch(() => {})
  const back = await page.waitForFunction(editable, null, { timeout: 30_000 }).then(() => true).catch(() => false)
  check(back, 'signed in: editing comes back with the network')
  check(await dbHas(n1.id, 'typed-offline-1'), 'signed in: the offline edit reaches the database after the reload')

  // 2. Offline mid-session: edit a note, switch to another and edit it too.
  // On reconnect the open one saves from the editor, the other in the background.
  const t2 = `offline-b-${stamp}`, t3 = `offline-c-${stamp}`
  const n2 = await make(t2), n3 = await make(t3)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(3_000)
  await open(t2); await sleep(1_000)
  await open(t3); await sleep(1_000)
  await c.setOffline(true)
  await sleep(500)
  await open(t2)
  await typeAtEnd('typed-offline-2')
  await sleep(1_500)
  const switched = await open(t3).then(() => true).catch(() => false)
  check(switched, 'signed in: switching notes offline keeps them editable')
  await typeAtEnd('typed-offline-3')
  await sleep(1_500)
  const dirty = await page.evaluate(() => JSON.parse(localStorage.getItem('bpad_offline_dirty') ?? '[]'))
  check(dirty.includes(n2.id) && dirty.includes(n3.id), `signed in: both notes wait for a save (${dirty.length})`)
  await c.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online'))).catch(() => {})
  check(await dbHas(n3.id, 'typed-offline-3'), 'signed in: the open note saves on reconnect')
  check(await dbHas(n2.id, 'typed-offline-2'), 'signed in: the other note saves in the background on reconnect')
  // The database can have the copy a moment before the save's answer clears the list.
  const cleared = await page.waitForFunction((ids) => !ids.some((id) => (localStorage.getItem('bpad_offline_dirty') ?? '').includes(id)), [n2.id, n3.id], { timeout: 10_000 }).then(() => true).catch(() => false)
  check(cleared, 'signed in: nothing left to save')

  for (const n of [n1, n2, n3]) await api('DELETE', `/api/notes/${n.id}`)
  await c.close()
}

await browser.close()
process.exit(failed ? 1 : 0)
