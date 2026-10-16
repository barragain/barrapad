// Production smoke test: add, rename and delete a tag; each step reaches the database.
// Usage: node e2e/tags.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }

const browser = await chromium.launch({ headless: true })
const c = await browser.newContext({ storageState: path.join(AUTH, 'state-demo1.json'), viewport: { width: 1400, height: 900 } })
const page = await c.newPage()
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('button[title="New note"]') && !document.body.innerText.includes('Syncing'), null, { timeout: 30_000 })
await sleep(3_000)

const marker = `tag-${Date.now().toString(36)}`
await page.locator('button[title*="New note" i]').first().click()
await page.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true', null, { timeout: 15_000 })
await page.locator('.ProseMirror').first().click()
await page.keyboard.type(marker)
await sleep(3_000)

const serverTags = async () => {
  const notes = await page.evaluate(() => fetch('/api/notes', { cache: 'no-store' }).then((r) => r.json()))
  const note = notes.find((n) => n.content?.includes(marker))
  return { id: note?.id, labels: (note?.tags ?? []).map((t) => t.label) }
}

const label = `t${Date.now().toString(36)}`
await page.locator('button[title="Add tag"]').first().click()
await page.locator('.barrapad-tag-popover input.barrapad-tag-input').fill(label)
await page.keyboard.press('Enter')
await page.keyboard.press('Escape')
await sleep(2_500)
let s = await serverTags()
check(s.labels.includes(label), `tag added and saved (${s.labels})`)

const renamed = label + '-r'
await page.locator('.barrapad-tag-pill', { hasText: label }).first().click({ button: 'right' })
await page.getByText('Edit tag', { exact: true }).last().click()
await page.locator('.barrapad-tag-popover input.barrapad-tag-input').fill(renamed)
await page.locator('.barrapad-tag-popover button', { hasText: 'Save' }).click()
await sleep(2_500)
s = await serverTags()
check(s.labels.includes(renamed) && !s.labels.includes(label), `tag renamed everywhere (${s.labels})`)

await page.locator('.barrapad-tag-pill', { hasText: renamed }).first().click({ button: 'right' })
await page.getByText('Delete tag everywhere').click()
await sleep(2_500)
s = await serverTags()
check(s.id && s.labels.length === 0, `tag deleted everywhere (${s.labels})`)

if (s.id) await page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), s.id)
await browser.close()
process.exit(failed ? 1 : 0)
