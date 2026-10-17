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
const editor = () => page.locator('.ProseMirror').first()

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

// Promotion race: start a new note, switch back before its POST returns.
// The app must stay on the note the user picked, not jump to the new one.
let createdId
await page.route('**/api/notes', async (route) => {
  if (route.request().method() !== 'POST') return route.continue()
  await sleep(3_000)
  const res = await route.fetch()
  createdId = (await res.json().catch(() => ({}))).id
  await route.fulfill({ response: res })
})
await page.locator('button[title*="New note" i]').first().click()
await sleep(500)
await page.getByText(marker).first().click({ timeout: 10_000 })
  .catch((e) => check(false, `reopen the tagged note: ${e.message.split('\n')[0]}`))
await sleep(5_000)
await page.unroute('**/api/notes')
check(createdId && (await editor().textContent()).includes(marker), 'switching away during note creation stays on the picked note')
// Switching notes: the sheet stays put while the note loads (it used to sit
// one toolbar row higher until the note turned editable, then jump down).
{
  const tops = await page.evaluate(async () => {
    const rows = document.querySelector('.sidebar').querySelectorAll('.note-item:not(.active)')
    const target = rows[0]
    if (!target) return null
    target.click()
    const seen = []
    for (let i = 0; i < 60; i++) {
      const pm = document.querySelector('.ProseMirror')
      if (pm) seen.push(Math.round(pm.getBoundingClientRect().top))
      await new Promise((r) => setTimeout(r, 50))
    }
    return seen
  })
  const spread = tops ? Math.max(...tops) - Math.min(...tops) : -1
  check(tops && spread <= 2, `the sheet does not jump when switching notes (tops ${tops ? [...new Set(tops)].join(',') : 'no rows'})`)
}

if (createdId) await page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), createdId)

if (s.id) await page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), s.id)

// Import while signed in: the new note and its formatting reach the database.
const imp = `imp-${Date.now().toString(36)}`
await page.setInputFiles('[data-import-input]', {
  name: `${imp}.md`, mimeType: 'text/markdown', buffer: Buffer.from(['Some **bold** text.', '', '- one', '- two'].join(String.fromCharCode(10))),
})
await sleep(6_000)
const imported = (await page.evaluate(() => fetch('/api/notes', { cache: 'no-store' }).then((r) => r.json()))).find((n) => n.content?.includes(`<h1>${imp}</h1>`))
check(imported?.title === imp && imported.content.includes('<strong>bold</strong>') && imported.content.includes('<li>'), `an imported file is saved as a new note (${imported?.title}: ${imported?.content?.slice(0, 120)})`)
if (imported) await page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), imported.id)
await browser.close()
process.exit(failed ? 1 : 0)
