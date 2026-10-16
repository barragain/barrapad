// Production smoke test for guest mode and the sync indicator on bpad.
// 1. Fresh browser, no account: app opens, editor works, notes survive a
//    reload, no realtime socket, no failing API calls, sign-up hint shown.
// 2. Signed-in demo account with guest notes in localStorage: the notes are
//    moved into the account and the guest store is emptied.
// 3. Signed-in typing shows "Syncing" then "Saved".
// Usage: node e2e/guest.mjs   (preview: BASE=<deployment url> SHARE=<_vercel_share token>)
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
const STATE = path.join(AUTH, 'state-demo1.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }
const editableEditor = () => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true'

const browser = await chromium.launch({ headless: true })
const marker = `guest-${Date.now().toString(36)}`

// ── 1. Guest ────────────────────────────────────────────────────────────────
{
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  if (process.env.SHARE) await (await c.newPage()).goto(BASE + '/?_vercel_share=' + process.env.SHARE)
  const page = await c.newPage()
  const sockets = []
  const badApi = []
  const errors = []
  page.on('websocket', (ws) => sockets.push(ws.url()))
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) badApi.push(`${r.status()} ${r.url()}`) })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  check(!page.url().includes('sign-in'), `guest stays on / (url ${page.url()})`)
  await page.waitForFunction(editableEditor, null, { timeout: 30_000 }).catch(() => {})
  check(await page.evaluate(editableEditor), 'guest editor is editable')
  await page.getByText('Saved on this device only').waitFor({ timeout: 5_000 }).catch(() => {})
  check(await page.getByText('Saved on this device only').isVisible(), 'guest pill visible')
  const share = page.locator('a[href="/sign-up"]', { hasText: 'Share' })
  check(await share.count() === 1, 'Share links to sign-up')

  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type(`${marker} first line`)
  await sleep(1_500)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(editableEditor, null, { timeout: 30_000 })
  await sleep(500)
  check((await page.locator('.ProseMirror').first().innerText()).includes(marker), 'guest note survives reload')

  await page.locator('button[title*="New note" i], button[aria-label*="New note" i]').first().click()
  await sleep(500)
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type(`${marker} second note`)
  await sleep(17_000) // Editor's 404 poll would flag a deleted note after 15 s
  check(!(await page.getByText('Remove from my view').isVisible().catch(() => false)), 'local note not shown as deleted')

  const guestNotes = await page.evaluate(() => JSON.parse(localStorage.getItem('bpad_guest_notes') ?? '[]'))
  check(guestNotes.length === 2, `two guest notes stored (got ${guestNotes.length})`)
  check(sockets.length === 0, `no realtime sockets (got ${sockets.join(', ') || 'none'})`)
  check(badApi.length === 0, `no failing API calls (${badApi.join('; ') || 'none'})`)
  check(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`)
  await page.screenshot({ path: path.join(HERE, 'out', 'guest-smoke.png') })

  // Comments need an account: no toolbar button, no context-menu item.
  check(await page.locator('button[title="Comments"]').count() === 0, 'no Comments button for guests')
  await page.locator('.ProseMirror').first().dblclick()
  await page.locator('.ProseMirror').first().click({ button: 'right' })
  await sleep(300)
  check(await page.getByText('Comment', { exact: true }).count() === 0, 'no Comment item in context menu')
  await page.keyboard.press('Escape')

  // Full browser storage shows a warning; freeing space clears it.
  await page.evaluate(() => {
    // Keep adding chunks, halving the size on each failure, until nothing fits.
    let i = 0
    for (let s = 256 * 1024; s >= 8; ) {
      try { localStorage.setItem(`fill-${i++}`, 'x'.repeat(s)) } catch { s = Math.floor(s / 2) }
    }
  })
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' this edit will not fit '.repeat(20))
  const warned = await page.getByText('Browser storage full', { exact: false }).waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
  check(warned, 'storage-full warning shown')
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fill-')).forEach((k) => localStorage.removeItem(k)))
  await page.keyboard.type(' ok')
  const cleared = await page.getByText('Browser storage full', { exact: false }).waitFor({ state: 'hidden', timeout: 5_000 }).then(() => true).catch(() => false)
  check(cleared, 'warning clears once space is free')

  // Pill: dismiss sticks across reloads; mobile layout fits the screen.
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await sleep(500)
  check(!(await page.getByText('Saved on this device only').isVisible()), 'pill dismissed')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(2_000)
  check(!(await page.getByText('Saved on this device only').isVisible()), 'pill stays dismissed after reload')
  const m = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true })
  if (process.env.SHARE) await (await m.newPage()).goto(BASE + '/?_vercel_share=' + process.env.SHARE)
  const mp = await m.newPage()
  await mp.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await mp.getByText('Local only').waitFor({ timeout: 10_000 }).catch(() => {})
  const box = await mp.locator('[role="status"]', { hasText: 'Local only' }).boundingBox()
  check(!!box && box.x >= 0 && box.x + box.width <= 375, `mobile pill fits (${box ? Math.round(box.x) + '..' + Math.round(box.x + box.width) : 'missing'})`)
  await mp.screenshot({ path: path.join(HERE, 'out', 'guest-smoke-mobile.png') })
  await m.close()

  // 404 page for signed-out visitors (used to bounce to sign-in).
  const nf = await page.goto(BASE + '/no-such-page-' + marker)
  check(nf?.status() === 404 && (await page.getByText('Nothing written here').isVisible()), '404 page shown for unknown URL')
  await page.screenshot({ path: path.join(HERE, 'out', 'guest-smoke-404.png') })

  // ── 2. Import on sign-in ──────────────────────────────────────────────────
  const s = await browser.newContext({ storageState: STATE, viewport: { width: 1400, height: 900 } })
  const sp = await s.newPage()
  // Seed guest storage from a page without the app, then open two tabs at once:
  // both see the guest notes, the Web Lock lets only one import them.
  await sp.goto(BASE + '/manifest.webmanifest', { waitUntil: 'domcontentloaded' })
  await sp.evaluate((notes) => localStorage.setItem('bpad_guest_notes', JSON.stringify(notes)), guestNotes)
  const sp2 = await s.newPage()
  await Promise.all([sp, sp2].map((p) => p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })))
  await sp.waitForFunction(editableEditor, null, { timeout: 30_000 })
  await sleep(4_000)
  await sp2.close()
  const left = await sp.evaluate(() => JSON.parse(localStorage.getItem('bpad_guest_notes') ?? '[]').length)
  check(left === 0, `guest store emptied after sign-in (left ${left})`)
  const owned = await sp.evaluate(() => fetch('/api/notes').then((r) => r.json()))
  const imported = owned.filter((n) => n.content.includes(marker))
  check(imported.length === 2, `both guest notes now in the account (got ${imported.length})`)
  check(await sp.locator('button[title="Comments"]').count() === 1, 'signed-in user still has Comments')

  // ── 3. Sync indicator ────────────────────────────────────────────────────
  const target = imported[0]
  if (target) {
    await sp.getByText(target.title).first().click().catch(() => {})
    await sleep(800)
    await sp.locator('.ProseMirror').first().click()
    await sp.keyboard.press('End')
    await sp.keyboard.type(' indicator')
    const sawSyncing = await sp.getByText('Syncing', { exact: true }).waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)
    check(sawSyncing, 'indicator shows "Syncing" while saving')
    const sawSaved = await sp.getByText('Saved', { exact: true }).waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)
    check(sawSaved, 'indicator shows "Saved" after the save')
  }

  // Clean up the test notes.
  for (const n of imported) await sp.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), n.id)
  await s.close()
  await c.close()
}

await browser.close()
console.log(failed ? 'FAILED' : 'ALL PASS')
process.exit(failed ? 1 : 0)
