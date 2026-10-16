// Production smoke test: file attachments go to Vercel Blob, not base64 in the note.
// Usage: node e2e/attach.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }

const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const c = await browser.newContext({ permissions: ['microphone'], storageState: path.join(AUTH, 'state-demo1.json'), viewport: { width: 1400, height: 900 } })
const page = await c.newPage()
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('button[title="New note"]') && !document.body.innerText.includes('Syncing'), null, { timeout: 30_000 })
await sleep(3_000)

const marker = `att-${Date.now().toString(36)}`
await page.locator('button[title*="New note" i]').first().click()
await page.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true', null, { timeout: 15_000 })
await page.locator('.ProseMirror').first().click()
await page.keyboard.type(marker)
await page.locator('input[type="file"]:not([accept])').first().setInputFiles({
  name: 'memo test.webm', mimeType: 'audio/webm', buffer: Buffer.alloc(600_000, 1),
})
await sleep(6_000)

const notes = await page.evaluate(() => fetch('/api/notes').then((r) => r.json()))
const note = (Array.isArray(notes) ? notes : notes.notes ?? []).find((n) => n.content?.includes(marker))
const url = note?.content.match(/data-url="([^"]+)"/)?.[1] ?? ''
check(url.startsWith('https://') && url.includes('blob.vercel-storage.com'), `attachment stored as Blob URL (${url.slice(0, 70)})`)
check(!note?.content.includes('data:audio'), 'no base64 in the note')
check((note?.content.length ?? 1e9) < 5_000, `note stays small (${note?.content.length} chars)`)

const head = await fetch(`${url}?download=1`, { method: 'HEAD' })
check(/attachment/i.test(head.headers.get('content-disposition') ?? ''), `download link forces a download (${head.headers.get('content-disposition')})`)

// Voice memo: record two seconds from the fake mic, it lands as a Blob attachment.
await page.locator('.ProseMirror').first().press('End')
await page.locator('button:has(svg.lucide-mic)').first().click()
await page.waitForSelector('text=Recording', { timeout: 5_000 }).catch(() => {})
check(await page.locator('text=Recording').count() > 0, 'voice memo shows the recording pill')
await sleep(2_000)
await page.locator('button:has(svg.lucide-square)').first().click()
await sleep(6_000)
const notes2 = await page.evaluate(() => fetch('/api/notes').then((r) => r.json()))
const note2 = (Array.isArray(notes2) ? notes2 : notes2.notes ?? []).find((n) => n.content?.includes(marker))
check((note2?.content.match(/blob.vercel-storage.com/g) ?? []).length >= 2 && /Voice memo/.test(note2?.content ?? ''), 'voice memo saved as a Blob attachment')

// Mobile: the text style button opens a bottom sheet.
const m = await browser.newContext({ storageState: path.join(AUTH, 'state-demo1.json'), viewport: { width: 390, height: 844 }, hasTouch: true })
const mp = await m.newPage()
await mp.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await sleep(5_000)
const create = mp.locator('button:has-text("Create a note")')
if (await create.count()) await create.first().click()
await mp.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true', null, { timeout: 15_000 })
const mMarker = marker + '-m'
await mp.locator('.ProseMirror').first().click()
await mp.keyboard.type(mMarker)
await mp.locator('.toolbar button:has-text("Normal Text"), .toolbar button:has-text("Heading")').first().click().catch(() => {})
await sleep(500)
check(await mp.locator('p:text-is("Text style")').count() > 0, 'mobile text style sheet opens')
await sleep(2_000)
const mNotes = await mp.evaluate(() => fetch('/api/notes').then((r) => r.json()))
const mNote = (Array.isArray(mNotes) ? mNotes : mNotes.notes ?? []).find((n) => n.content?.includes(mMarker))
if (mNote) await mp.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), mNote.id)
await m.close()

const htmlStatus = await page.evaluate(async () => {
  const f = new FormData(); f.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html')
  return (await fetch('/api/upload', { method: 'POST', body: f })).status
})
check(htmlStatus === 415, `HTML upload refused (${htmlStatus})`)

if (note) await page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), note.id)
await browser.close()
process.exit(failed ? 1 : 0)
