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
  check(await page.getByText('Local', { exact: true }).isVisible(), 'quiet "Local" label in the top bar')
  const share = page.locator('a[href="/sign-up"]', { hasText: 'Share' })
  check(await share.count() === 1, 'Share links to sign-up')
  check((await page.locator('.ProseMirror').first().innerText()).startsWith('Welcome to barraPAD'), 'first visit opens the welcome note')
  const welcome = await page.evaluate(() => JSON.parse(localStorage.getItem('bpad_guest_notes') ?? '[]')[0])

  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type(`${marker} first line`)
  await page.getByText('Want this note on your other devices?').waitFor({ timeout: 5_000 }).catch(() => {})
  check(await page.getByText('Want this note on your other devices?').isVisible(), 'sign-up pill appears after the first edit')
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

  // A big photo-like PNG is shrunk before it lands in localStorage.
  const pngSize = await page.evaluate(async () => {
    const cv = Object.assign(document.createElement('canvas'), { width: 3000, height: 2000 })
    const ctx = cv.getContext('2d')
    const img = ctx.createImageData(3000, 2000)
    for (let i = 0; i < img.data.length; i += 4) {
      const x = (i / 4) % 3000
      img.data[i] = x / 12; img.data[i + 1] = (i / 4 / 3000) / 8; img.data[i + 2] = Math.random() * 60; img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
    const dt = new DataTransfer()
    dt.items.add(new File([blob], 'big.png', { type: 'image/png' }))
    const input = document.querySelector('input[type="file"][accept="image/*"]')
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return blob.size
  })
  await page.waitForSelector('.ProseMirror img[src^="data:"]', { timeout: 15_000 }).catch(() => {})
  await sleep(1500)
  const stored = await page.evaluate(() => {
    const m = (localStorage.getItem('bpad_guest_notes') ?? '').match(/data:image\/(\w+);base64,[A-Za-z0-9+/=]+/)
    return m ? { type: m[1], len: m[0].length } : null
  })
  check(!!stored && stored.type === 'webp' && stored.len < pngSize / 2,
    `guest image shrunk before storing (png ${Math.round(pngSize / 1024)} KB, stored ${stored ? stored.type + ' ' + Math.round(stored.len / 1024) + ' KB' : 'none'})`)

  // Pill: dismiss sticks across reloads; mobile layout fits the screen.
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await sleep(500)
  check(!(await page.getByText('Want this note on your other devices?').isVisible()), 'pill dismissed')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(2_000)
  check(!(await page.getByText('Want this note on your other devices?').isVisible()), 'pill stays dismissed after reload')
  const m = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true })
  if (process.env.SHARE) await (await m.newPage()).goto(BASE + '/?_vercel_share=' + process.env.SHARE)
  const mp = await m.newPage()
  await mp.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  // Calm UI: a quiet "Local" label in the top bar, and the sign-up pill only after the first edit.
  await mp.getByText('Local', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => {})
  const lbox = await mp.getByText('Local', { exact: true }).boundingBox()
  check(!!lbox && lbox.x >= 0 && lbox.x + lbox.width <= 375, `mobile "Local" label fits (${lbox ? Math.round(lbox.x) + '..' + Math.round(lbox.x + lbox.width) : 'missing'})`)
  await mp.waitForTimeout(3000)
  check(!(await mp.locator('[role="status"]', { hasText: 'Sign up' }).isVisible()), 'no sign-up pill before an edit')
  await mp.locator('.ProseMirror').first().click()
  await mp.keyboard.type(' x')
  await mp.locator('[role="status"]', { hasText: 'Sign up' }).waitFor({ timeout: 5_000 }).catch(() => {})
  const box = await mp.locator('[role="status"]', { hasText: 'Sign up' }).boundingBox()
  check(!!box && box.x >= 0 && box.x + box.width <= 375, `mobile pill after first edit fits (${box ? Math.round(box.x) + '..' + Math.round(box.x + box.width) : 'missing'})`)
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
  // An untouched welcome note rides along and must not reach the account.
  await sp.evaluate((notes) => localStorage.setItem('bpad_guest_notes', JSON.stringify(notes)), [...guestNotes, { ...welcome, id: 'local-welcome-' + marker }])
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
  check(!owned.some((n) => n.content === welcome.content), 'untouched welcome note not imported')
  // A reload mid-import leaves notes in the guest store that the server already
  // has. Importing them again must not make copies.
  await sp.evaluate((notes) => localStorage.setItem('bpad_guest_notes', JSON.stringify(notes)), guestNotes)
  await sp.reload({ waitUntil: 'domcontentloaded' })
  await sp.waitForFunction(editableEditor, null, { timeout: 30_000 })
  await sleep(4_000)
  const again = (await sp.evaluate(() => fetch('/api/notes').then((r) => r.json()))).filter((n) => n.content.includes(marker))
  check(again.length === 2, `re-import after a reload makes no copies (got ${again.length})`)
  check(await sp.locator('button[title="Comments"]').count() === 1, 'signed-in user still has Comments')

  // ── 3. Sync indicator ────────────────────────────────────────────────────
  const target = imported[0]
  if (target) {
    await sp.getByText(target.title).first().click().catch(() => {})
    await sleep(800)
    await sp.waitForFunction(editableEditor, null, { timeout: 15_000 }) // Yjs mode: preview until the doc arrives
    await sp.locator('.ProseMirror').first().click()
    await sp.keyboard.press('End')
    await sp.keyboard.type(' indicator')
    const sawSyncing = await sp.getByText('Syncing', { exact: true }).waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)
    check(sawSyncing, 'indicator shows "Syncing" while saving')
    const sawSaved = await sp.getByText('Saved', { exact: true }).waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)
    check(sawSaved, 'indicator shows "Saved" after the save')
  }

  // Clean up the test notes.
  for (const n of again) await sp.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), n.id)
  await s.close()
  await c.close()
}

await browser.close()
console.log(failed ? 'FAILED' : 'ALL PASS')
process.exit(failed ? 1 : 0)
