// Visual audit of every editor format (not a pass/fail test; run.mjs skips it).
// Pastes a sample note as a guest, saves screenshots at desktop and phone size
// in light and dark mode, and writes computed spacing to metrics.json.
// Usage: node e2e/visual-audit.mjs   (output in e2e/out/visual/)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'visual') + path.sep
fs.mkdirSync(DIR, { recursive: true })
const BASE = process.env.BASE ?? 'https://www.bpad.cc'

const HTML = `
<h1>Heading one sample</h1>
<p>An opening paragraph with <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>strike</s>, <a href="https://example.com">a link</a>, <mark data-color="#fde68a" style="background-color:#fde68a">highlighted text</mark>, <span style="color:#d4550a">colored text</span> and <code>inline code</code>.</p>
<h2>Heading two sample</h2>
<p>This paragraph is followed directly by a bullet list with no gap in the markup:</p>
<ul>
<li><p>Short item one</p></li>
<li><p>Second item is a longer one that should wrap over two or three lines on a phone and maybe on desktop too, so we can see the line-height inside a single item versus the gap between items.</p></li>
<li><p>Third item</p></li>
<li><p>Fourth item also wraps across multiple lines because it carries a lot of words, enough words to fill the width of the editor column and spill over again onto the next line.</p></li>
</ul>
<h3>Heading three sample</h3>
<ol><li><p>First numbered</p></li><li><p>Second numbered</p></li><li><p>Third numbered</p></li></ol>
<ul><li><p>Parent item</p><ul><li><p>Nested child A</p></li><li><p>Nested child B</p><ul><li><p>Grandchild</p></li></ul></li></ul></li><li><p>Parent two</p></li></ul>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Checked task</p></li><li data-type="taskItem" data-checked="false"><p>Open task</p></li><li data-type="taskItem" data-checked="false"><p>Another open task</p></li></ul>
<blockquote><p>A quote block with a sentence of reasonable length to see padding and border.</p></blockquote>
<pre><code>function hello() {
  return 'code block'
}</code></pre>
<hr>
<table><tbody><tr><th><p>Col A</p></th><th><p>Col B</p></th></tr><tr><td><p>Cell 1</p></td><td><p>Cell 2</p></td></tr><tr><td><p>Cell 3</p></td><td><p>Cell 4</p></td></tr></tbody></table>
<p>Closing paragraph after the table.</p>`

const sels = ['p', 'li', 'li>p', 'ul', 'ol', 'ul[data-type=taskList]', 'ul ul', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'hr', 'table', 'table td', 'table th', 'td>p', 'code']
const out = {}

const browser = await chromium.launch()
for (const [vw, vh, tag] of [[1400, 900, 'desktop'], [390, 844, 'mobile']]) {
  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: mode, isMobile: tag === 'mobile', hasTouch: tag === 'mobile', deviceScaleFactor: tag === 'mobile' ? 2 : 1 })
    await ctx.addInitScript(m => { try { localStorage.setItem('barrapad_appearance', JSON.stringify({ mode: m })) } catch {} }, mode)
    const page = await ctx.newPage()
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    try { await page.waitForSelector('button[title="New note"]', { timeout: 30000, state: 'attached' }) } catch (e) { console.log('no New note btn', tag) }
    await page.waitForTimeout(3000)
    await page.waitForSelector('.ProseMirror[contenteditable=true]', { timeout: 20000 })
    await page.click('.ProseMirror')
    await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
    await page.evaluate(html => {
      const el = document.querySelector('.ProseMirror'); el.focus()
      const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', 'x')
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, HTML)
    await page.waitForTimeout(1500)
    await page.evaluate(() => { document.activeElement?.blur(); let n = document.querySelector('.ProseMirror'); while (n) { n.scrollTop = 0; n = n.parentElement } window.scrollTo(0, 0) })
    await page.waitForTimeout(400)
    const key = `${tag}-${mode}`
    await page.screenshot({ path: `${DIR}${key}-viewport.png` })
    await page.screenshot({ path: `${DIR}${key}-full.png`, fullPage: true })
    // scroll editor container to capture lower parts if it scrolls internally
    const scrolled = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror'); let n = pm
      while (n && n !== document.body) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) { return n.scrollHeight - n.clientHeight } n = n.parentElement }
      return 0
    })
    if (scrolled) {
      let i = 0
      for (let y = 600; ; y += 600) {
        const done = await page.evaluate(y => { const pm = document.querySelector('.ProseMirror'); let n = pm
          while (n && n !== document.body) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) { n.scrollTop = y; return n.scrollTop + n.clientHeight >= n.scrollHeight - 2 } n = n.parentElement } return true }, y)
        await page.waitForTimeout(300)
        await page.screenshot({ path: `${DIR}${key}-scroll${++i}.png` })
        if (done || i > 6) break
      }
    }
    if (mode === 'light') {
      out[tag] = await page.evaluate(sels => {
        const pm = document.querySelector('.ProseMirror')
        const r = { pmPadding: getComputedStyle(pm).padding, pmFont: getComputedStyle(pm).fontFamily.slice(0, 60), pmSize: getComputedStyle(pm).fontSize, pmLH: getComputedStyle(pm).lineHeight, pmWidth: pm.getBoundingClientRect().width }
        for (const s of sels) {
          const el = pm.querySelector(s); if (!el) { r[s] = 'missing'; continue }
          const c = getComputedStyle(el)
          r[s] = { mt: c.marginTop, mb: c.marginBottom, lh: c.lineHeight, pl: c.paddingLeft, pt: c.paddingTop, pb: c.paddingBottom, fs: c.fontSize, fw: c.fontWeight, border: c.borderLeftWidth + ' ' + c.borderTopWidth }
        }
        // gaps
        const box = e => e.getBoundingClientRect()
        const ul = pm.querySelector(':scope > ul:not([data-type])')
        const prev = ul.previousElementSibling
        r.gap_p_to_ul = box(ul).top - box(prev).bottom
        r.gap_ul_to_next = box(ul.nextElementSibling).top - box(ul).bottom
        const lis = [...ul.children]
        r.li_heights = lis.map(l => Math.round(box(l).height))
        r.li_gaps = lis.slice(1).map((l, i) => +(box(l).top - box(lis[i]).bottom).toFixed(1))
        r.li_textline_gap = (() => { const p = lis[1].querySelector('p'); const rects = [...(() => { const rg = document.createRange(); rg.selectNodeContents(p); return rg.getClientRects() })()]; return rects.length })()
        const ol = pm.querySelector(':scope > ol'); r.gap_h3_to_ol = box(ol).top - box(ol.previousElementSibling).bottom
        const ps = [...pm.querySelectorAll(':scope > p')]; r.gap_p_p = ps.length > 1 ? 'n/a' : 'n/a'
        const h1 = pm.querySelector('h1'); r.gap_h1_to_p = box(h1.nextElementSibling).top - box(h1).bottom
        const h2 = pm.querySelector('h2'); r.gap_p_to_h2 = box(h2).top - box(h2.previousElementSibling).bottom; r.gap_h2_to_p = box(h2.nextElementSibling).top - box(h2).bottom
        const nested = pm.querySelector('li ul'); r.gap_parent_to_nested = box(nested).top - box(nested.previousElementSibling).bottom
        const task = pm.querySelector('ul[data-type=taskList]'); const tl = [...task.children]; r.task_gaps = tl.slice(1).map((l, i) => +(box(l).top - box(tl[i]).bottom).toFixed(1)); r.task_li_display = getComputedStyle(tl[0]).display + ' gap:' + getComputedStyle(tl[0]).gap
        const bq = pm.querySelector('blockquote'); r.gap_around_bq = [box(bq).top - box(bq.previousElementSibling).bottom, box(bq.nextElementSibling).top - box(bq).bottom]
        const hr = pm.querySelector('hr'); r.gap_around_hr = [box(hr).top - box(hr.previousElementSibling).bottom, box(hr.nextElementSibling).top - box(hr).bottom]
        r.blocks = [...pm.children].map(e => e.tagName + (e.dataset.type ? '[' + e.dataset.type + ']' : ''))
        r.marks = { mark: !!pm.querySelector('mark'), color: !!pm.querySelector('span[style*=color]'), u: !!pm.querySelector('u'), s: !!pm.querySelector('s'), a: !!pm.querySelector('a'), checked: pm.querySelector('li[data-checked=true]') ? 'yes' : 'no' }
        return r
      }, sels)
    }
    await ctx.close()
  }
}
await browser.close()
fs.writeFileSync(DIR + 'metrics.json', JSON.stringify(out, null, 1))
console.log('done')
