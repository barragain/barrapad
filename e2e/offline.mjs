// Production smoke test for offline support (public/sw.js): a guest opens and
// edits bpad with no network; a signed-in user opens their cached notes
// read-only, and editing comes back with the network. Usage: node e2e/offline.mjs
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
{
  const c = await browser.newContext({ storageState: path.join(AUTH, 'state-demo1.json'), viewport: { width: 1400, height: 900 } })
  const page = await warm(c)
  const note = await page.evaluate(() => fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'offline test', content: '<p>offline test</p>' }) }).then((r) => r.json()))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(editable, null, { timeout: 20_000 }).catch(() => {})
  await c.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  const shell = await page.waitForFunction(() => document.querySelector('button[title="New note"]'), null, { timeout: 20_000 }).then(() => true).catch(() => false)
  check(shell, 'signed in: app opens offline')
  await sleep(3_000)
  check(!(await page.evaluate(editable)), 'signed in: offline copy is read-only')
  await c.setOffline(false)
  // The page reloads on 'online', which ends this evaluate.
  await page.evaluate(() => window.dispatchEvent(new Event('online'))).catch(() => {})
  const back = await page.waitForFunction(editable, null, { timeout: 30_000 }).then(() => true).catch(() => false)
  check(back, 'signed in: editing comes back with the network')
  await page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), note.id)
  await c.close()
}

await browser.close()
process.exit(failed ? 1 : 0)
