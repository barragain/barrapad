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

const browser = await chromium.launch({ headless: true })
const c = await browser.newContext({ storageState: path.join(AUTH, 'state-demo1.json'), viewport: { width: 1400, height: 900 } })
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

const htmlStatus = await page.evaluate(async () => {
  const f = new FormData(); f.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html')
  return (await fetch('/api/upload', { method: 'POST', body: f })).status
})
check(htmlStatus === 415, `HTML upload refused (${htmlStatus})`)

if (note) await page.evaluate((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' }), note.id)
await browser.close()
process.exit(failed ? 1 : 0)
