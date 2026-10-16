// Production smoke test for polls: text typed in the form survives a reload
// without pressing Save Poll, and the toolbar align buttons move the poll.
// Usage: node e2e/poll.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }
const tbtn = (page, label) => page.locator('.tbtn-wrapper', { hasText: label }).locator('button').first()

const browser = await chromium.launch({ headless: true })
const c = await browser.newContext({ storageState: path.join(AUTH, 'state-demo1.json'), viewport: { width: 1400, height: 900 } })
const page = await c.newPage()
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('button[title="New note"]') && !document.body.innerText.includes('Syncing'), null, { timeout: 30_000 })
await sleep(3_000)

const marker = `poll-${Date.now().toString(36)}`
await page.locator('button[title*="New note" i]').first().click()
await page.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true', null, { timeout: 15_000 })
await page.locator('.ProseMirror').first().click()
await page.keyboard.type(marker)
await page.keyboard.press('Enter')
await tbtn(page, 'Poll').click()
await sleep(800)
await page.locator('.barrapad-poll-q-input').fill('Lunch?')
await page.locator('.barrapad-poll-opt-input').nth(0).fill('Pizza')
await page.locator('.barrapad-poll-opt-input').nth(1).fill('Sushi')
// Click away instead of pressing Save Poll.
await page.locator('.ProseMirror p').first().click()
await sleep(1_000)
check(await page.locator('.barrapad-poll-q-input').count() === 0, 'clicking away closes the form')

// Select the poll and center it.
await page.locator('.barrapad-poll-head').first().click()
await sleep(300)
await tbtn(page, 'Align center').click()
await sleep(4_000)

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('button[title="New note"]'), null, { timeout: 30_000 })
await sleep(3_000)
await page.getByText(marker, { exact: false }).first().click()
await sleep(2_000)
const text = await page.locator('.barrapad-poll').first().innerText().catch(() => '')
check(text.includes('Lunch?') && text.includes('Pizza') && text.includes('Sushi'), `poll text survives reload (${text.replace(/\n/g, ' / ').slice(0, 60)})`)
const box = await page.locator('.barrapad-poll').first().boundingBox()
const ed = await page.locator('.ProseMirror').first().boundingBox()
const centered = box && ed && Math.abs((box.x + box.width / 2) - (ed.x + ed.width / 2)) < 20
check(!!centered, `poll is centered after reload (poll mid ${box && Math.round(box.x + box.width / 2)}, editor mid ${ed && Math.round(ed.x + ed.width / 2)})`)

await page.locator('.barrapad-poll-head').first().click()
await tbtn(page, 'Align right').click()
await sleep(500)
const box2 = await page.locator('.barrapad-poll').first().boundingBox()
check(!!box2 && !!ed && Math.abs((box2.x + box2.width) - (ed.x + ed.width)) < 40, 'poll moves right')

const notes = await page.evaluate(() => fetch('/api/notes').then((r) => r.json()))
const note = (Array.isArray(notes) ? notes : notes.notes ?? []).find((n) => n.content?.includes(marker))
if (note) await page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), note.id)
await browser.close()
process.exit(failed ? 1 : 0)
