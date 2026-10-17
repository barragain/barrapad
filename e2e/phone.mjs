// Production smoke test on an iPhone-sized touch screen, signed in: no
// selection bar on touch, the toolbar pinned to the bottom in one row, the toolbar link box closes with its X, and a
// comment started from the toolbar and closed with X leaves no highlight.
// Usage: node e2e/phone.mjs
import { chromium, devices } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.E2E_AUTH ?? path.join(HERE, '.auth')
const BASE = process.env.BASE ?? 'https://www.bpad.cc'
let failed = false
const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${m}`); if (!ok) failed = true }
const b = await chromium.launch()
const c = await b.newContext({ ...devices['iPhone 13'], storageState: path.join(AUTH, 'state-demo1.json') })
const p = await c.newPage()
await p.goto(BASE + '/'); await p.waitForTimeout(5000)
const sweep = () => p.evaluate(async () => {
  const list = await fetch('/api/notes').then((r) => r.json())
  const notes = Array.isArray(list) ? list : list.notes ?? []
  for (const n of notes) if (/^mobile(-x| words here)/.test(n.title ?? '')) await fetch(`/api/notes/${n.id}`, { method: 'DELETE' })
  return notes.filter((n) => /^mobile(-x| words here)/.test(n.title ?? '')).length
})
await sweep()
try {
  await p.evaluate(() => fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'mobile-x', content: '<p>mobile words here</p>' }) }).then((r) => r.json()).then((j) => j.id))
  await p.reload(); await p.waitForTimeout(5000)
  await p.locator('button[aria-label="Open notes"]').tap()
  await p.waitForTimeout(800)
  await p.getByText('mobile-x').filter({ visible: true }).first().tap(); await p.waitForTimeout(2000)
  const ed = p.locator('.ProseMirror[contenteditable="true"]').first()
  await ed.tap(); await p.keyboard.press('End'); await p.keyboard.press('Shift+Home'); await p.waitForTimeout(800)
  check(await p.locator('[data-selection-bar]').count() === 0, 'no selection bar on touch')
  const bar = await p.locator('.toolbar-pinned').evaluate((el) => { const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), height: Math.round(r.height), vh: innerHeight } })
  check(Math.abs(bar.bottom - bar.vh) <= 1 && bar.height < 64, `phone toolbar pinned to the bottom in one row (${JSON.stringify(bar)})`)
  await p.locator('.tbtn-wrapper', { hasText: 'Link' }).locator('button').first().tap()
  await p.waitForTimeout(500)
  const opened = await p.locator('input[placeholder="https://example.com"]').count()
  await p.locator('button[aria-label="Cancel"]').tap()
  await p.waitForTimeout(500)
  check(opened === 1 && await p.locator('input[placeholder="https://example.com"]').count() === 0, 'phone link box opens and its X closes it')
  await ed.tap(); await p.keyboard.press('End'); await p.keyboard.press('Shift+Home'); await p.waitForTimeout(500)
  await p.locator('button[title="Comments"]').first().tap()
  await p.waitForTimeout(800)
  const marked = await p.locator('.ProseMirror .comment-highlight').count()
  await p.locator('button[aria-label="Close comments"]').tap()
  await p.waitForTimeout(800)
  check(marked === 1 && await p.locator('.ProseMirror .comment-highlight').count() === 0, `phone: closing an unposted comment drops its highlight (before ${marked})`)
} finally { await sweep(); await b.close() }
process.exit(failed ? 1 : 0)
