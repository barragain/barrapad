// Production smoke test for cross-device sync on bpad (www.bpad.cc).
// Simulates two computers with the same account: two browser contexts that
// share nothing but the login. Usage: node e2e/sync.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
const STATE = path.join(AUTH, 'state-demo1.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
const sockets = []
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }

const editableEditor = () => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true'

async function open() {
  const c = await browser.newContext({ storageState: STATE, viewport: { width: 1400, height: 900 } })
  const page = await c.newPage()
  page.on('websocket', (ws) => sockets.push(ws.url()))
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('button[title="New note"]') && !document.body.innerText.includes('Syncing'), null, { timeout: 30_000 })
  await sleep(3_000) // the shell is server-rendered: wait for hydration before clicking
  return { c, page }
}

const editor = (page) => page.locator('.ProseMirror').first()
const marker = `sync-${Date.now().toString(36)}`

// Computer A: new note, type a marker, let autosave run.
const A = await open()
const t0 = Date.now()
await A.page.locator('button[title*="New note" i], button[aria-label*="New note" i]').first().click()
await A.page.waitForFunction(editableEditor, null, { timeout: 15_000 })
await editor(A.page).click()
await A.page.keyboard.type(`${marker} from A`)
await sleep(3_000)
console.log(`A ready+typed in ${Date.now() - t0} ms`)

// Computer B: fresh context (empty localStorage). Must see A's note without a reload.
const B = await open()
const sidebarHit = B.page.getByText(marker, { exact: false }).first()
check(await sidebarHit.isVisible({ timeout: 10_000 }).catch(() => false), 'B lists the note A just created')
await sidebarHit.click()
await sleep(1_500)
check((await editor(B.page).innerText()).includes(`${marker} from A`), "B shows A's text")

// B types more; A must not lose B's text and B must not lose A's text.
await editor(B.page).click()
await B.page.keyboard.press('Control+End')
await B.page.keyboard.type(' and from B')
await sleep(3_000)

await A.page.reload({ waitUntil: 'domcontentloaded' })
await A.page.waitForFunction(editableEditor, null, { timeout: 30_000 })
await A.page.getByText(marker, { exact: false }).first().click().catch(() => {})
await sleep(1_500)
const finalA = await editor(A.page).innerText()
check(finalA.includes(`${marker} from A`) && finalA.includes('and from B'), 'A after reload has both A and B text')

const rtHost = process.env.RT_HOST ?? 'barrapad-realtime'
check(sockets.some((u) => u.includes(rtHost)), `realtime socket goes to the Cloudflare Worker (${sockets.find((u) => u.includes('parties')) ?? 'no room socket seen'})`)

// Cleanup: delete the test note from A so demo data stays tidy.
try {
  const item = A.page.getByText(marker, { exact: false }).first()
  await item.hover()
  await item.locator('xpath=ancestor::*[.//button[@title="Delete note"]][1]//button[@title="Delete note"]').first().click({ timeout: 3_000 })
  await A.page.getByRole('button', { name: /delete|confirm/i }).first().click({ timeout: 3_000 }).catch(() => {})
  await sleep(1_000)
  console.log('test note deleted')
} catch { console.log('note cleanup skipped (delete flow not found)') }

await browser.close()
process.exit(failed ? 1 : 0)
