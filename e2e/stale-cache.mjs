// Stale-cache scenario: computer B holds an old localStorage copy of a note,
// computer A edits it meanwhile, then B comes back and types. B must first
// show A's version and the final result must contain both edits.
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
const STATE = path.join(AUTH, 'state-demo1.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const editable = () => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true'
const browser = await chromium.launch({ headless: true })
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }
async function open() {
  const c = await browser.newContext({ storageState: STATE, viewport: { width: 1400, height: 900 } })
  const page = await c.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('button[title="New note"]') && !document.body.innerText.includes('Syncing'), null, { timeout: 30_000 })
  return { c, page }
}
const ed = (p) => p.locator('.ProseMirror').first()
const m = `stale-${Date.now().toString(36)}`

// B creates the note and types v1, so B's localStorage holds v1.
const B = await open()
await B.page.locator('button[title="New note"]').first().click()
await B.page.waitForFunction(editable, null, { timeout: 15_000 })
await ed(B.page).click(); await B.page.keyboard.type(`${m} v1`); await sleep(3_000)
await B.page.close()  // tab closed, cache keeps v1

// A edits the same note to v2.
const A = await open()
await A.page.getByText(m, { exact: false }).first().click(); await sleep(1_000)
await ed(A.page).click(); await A.page.keyboard.press('Control+End'); await A.page.keyboard.type(' v2-from-A'); await sleep(3_000)

// B reopens (same context, so same localStorage with v1), waits for unlock, types.
const B2 = await B.c.newPage()
await B2.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
const cachedFirst = await B2.evaluate(() => JSON.parse(localStorage.getItem('barrapad_notes') || '[]').some((n) => n.content.includes('v2-from-A')))
check(!cachedFirst, 'B started from a stale cache (v1 only)')
await B2.waitForFunction(editable, null, { timeout: 30_000 })
await B2.getByText(m, { exact: false }).first().click(); await sleep(1_500)
check((await ed(B2).innerText()).includes('v2-from-A'), 'B shows A\'s v2 before it can type')
await ed(B2).click(); await B2.keyboard.press('Control+End'); await B2.keyboard.type(' v3-from-B'); await sleep(3_000)

await A.page.reload({ waitUntil: 'domcontentloaded' })
await A.page.waitForFunction(editable, null, { timeout: 30_000 })
await A.page.getByText(m, { exact: false }).first().click(); await sleep(1_500)
const final = await ed(A.page).innerText()
check(final.includes('v1') && final.includes('v2-from-A') && final.includes('v3-from-B'), `final content has v1, v2 and v3: "${final.trim().slice(0, 80)}"`)

try {
  const item = A.page.getByText(m, { exact: false }).first(); await item.hover()
  await item.locator('xpath=ancestor::*[.//button[@title="Delete note"]][1]//button[@title="Delete note"]').first().click({ timeout: 3_000 })
  await A.page.getByRole('button', { name: /delete|confirm/i }).first().click({ timeout: 3_000 }).catch(() => {})
  await sleep(1_000); console.log('test note deleted')
} catch { console.log('cleanup skipped') }
await browser.close(); process.exit(failed ? 1 : 0)
