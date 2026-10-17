// Production smoke test for editor formatting (docs/design-audit.md steps 1
// and 2), run as a guest: spacing between list items and blocks, checklist
// nesting, rich and plain paste, "# " headings, Normal Text leaving a quote,
// dark mode colors for inline code and highlights, the selection bar and the
// slash menu.
// Usage: node e2e/editor.mjs
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'https://www.bpad.cc'
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }

const browser = await chromium.launch({ headless: true })
async function open(mode = 'light') {
  const c = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await c.addInitScript((m) => { try { localStorage.setItem('barrapad_appearance', JSON.stringify({ mode: m })) } catch {} }, mode)
  const page = await c.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror[contenteditable="true"]', { timeout: 30_000 })
  await page.waitForTimeout(3_000)
  await page.click('.ProseMirror')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  return page
}
const paste = (page, html, text = 'x') => page.evaluate(({ html, text }) => {
  const el = document.querySelector('.ProseMirror'); el.focus()
  const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', text)
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
}, { html, text })

try {
  const page = await open()

  // Spacing: items closer together than blocks, both above 0.
  await paste(page, '<p>Intro</p><ul><li><p>One</p></li><li><p>Two</p></li></ul><p>After</p>')
  await page.waitForTimeout(500)
  const gaps = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror'); const ul = pm.querySelector(':scope > ul')
    const b = (e) => e.getBoundingClientRect(); const [a, c] = ul.children
    return { item: b(c).top - b(a).bottom, before: b(ul).top - b(ul.previousElementSibling).bottom }
  })
  check(gaps.item > 2 && gaps.before > gaps.item, `list items spaced, smaller than the block gap (item ${gaps.item.toFixed(1)}, block ${gaps.before.toFixed(1)})`)

  // Checklist nesting: a bullet list inside a task keeps its markers; a checked
  // task does not strike its unchecked child.
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await paste(page, '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Child open</p></li></ul><ul><li><p>Bullet in task</p></li></ul></li></ul>')
  await page.waitForTimeout(500)
  const nest = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror')
    const bullet = [...pm.querySelectorAll('li')].find((l) => l.textContent === 'Bullet in task')
    const child = [...pm.querySelectorAll('li[data-checked="false"] p')].find((p) => p.textContent === 'Child open')
    return { display: bullet && getComputedStyle(bullet).display, deco: child && getComputedStyle(child).textDecorationLine }
  })
  check(nest.display === 'list-item', `bullet list inside a task keeps its markers (${nest.display})`)
  check(nest.deco === 'none', `checked task does not strike its open child (${nest.deco})`)

  // Rich paste with an image keeps the text around it.
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await paste(page, `<p>before words</p><img src="${BASE}/icon.png"><p>after words</p>`)
  await page.waitForTimeout(1_000)
  const rich = await page.locator('.ProseMirror').innerText()
  check(rich.includes('before words') && rich.includes('after words'), 'rich paste with an image keeps its text')

  // Plain paste keeps line breaks and does not read markup.
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await page.evaluate(() => navigator.clipboard.writeText('line one\n<b>two</b>'))
  await page.keyboard.press('Control+Shift+v')
  await page.waitForTimeout(800)
  const plain = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror')
    return { ps: [...pm.querySelectorAll('p')].map((p) => p.textContent), bold: !!pm.querySelector('strong, b') }
  })
  check(plain.ps.includes('line one') && plain.ps.includes('<b>two</b>') && !plain.bold, `plain paste keeps lines and literal text (${JSON.stringify(plain.ps)})`)

  // "# " at the start of a line still makes a heading.
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await page.keyboard.type('# Big title')
  await page.waitForTimeout(500)
  check(await page.locator('.ProseMirror h1').count() === 1, '"# " makes a heading')

  // Normal Text turns a quote back into a paragraph.
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await page.keyboard.type('> quoted line')
  await page.waitForTimeout(300)
  const quoted = await page.locator('.ProseMirror blockquote').count()
  await page.locator('.toolbar button', { hasText: /Normal Text|Quote/ }).first().click()
  await page.getByText('Normal Text', { exact: true }).last().click()
  await page.waitForTimeout(300)
  const left = await page.locator('.ProseMirror blockquote').count()
  check(quoted === 1 && left === 0, `Normal Text leaves a quote (before ${quoted}, after ${left})`)

  // Selection bar: appears over selected text, formats it, has no Comment for guests.
  await page.click('.ProseMirror')
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await page.keyboard.type('pick this word')
  await page.keyboard.press('Shift+Home')
  await page.waitForTimeout(300)
  const bar = page.locator('[data-selection-bar]')
  check(await bar.isVisible(), 'selection bar shows on a text selection')
  const barBox = await bar.boundingBox(); const pBox = await page.locator('.ProseMirror p').first().boundingBox()
  check(!!barBox && !!pBox && barBox.y + barBox.height <= pBox.y + 2, 'selection bar sits above the text')
  await bar.locator('.tbtn-wrapper', { hasText: 'Bold' }).locator('button').click()
  await bar.locator('.tbtn-wrapper', { hasText: 'Highlight' }).locator('button').click()
  await bar.locator('button[aria-label="#fef08a"]').click()
  await page.waitForTimeout(300)
  const formatted = await page.evaluate(() => document.querySelector('.ProseMirror p').innerHTML)
  check(formatted.includes('<strong>') && formatted.includes('<mark'), `bar applies bold and highlight (${formatted.slice(0, 120)})`)
  await bar.locator('.tbtn-wrapper', { hasText: 'Text color' }).locator('button').click()
  await bar.locator('button[aria-label="More colors"]').click()
  await page.waitForTimeout(300)
  const morePicker = await page.locator('[data-color-more]').isVisible()
  await bar.locator('button[aria-label="#3b82f6"]').first().click()
  await page.waitForTimeout(300)
  const blue = await page.evaluate(() => document.querySelector('.ProseMirror p').innerHTML.includes('#3b82f6') || document.querySelector('.ProseMirror p').innerHTML.includes('59, 130, 246'))
  check(morePicker && blue, `color row expands to the full picker and applies a color (${morePicker}, ${blue})`)
  check(await bar.locator('.tbtn-wrapper', { hasText: 'Comment' }).count() === 0, 'no Comment in the bar for guests')
  await bar.locator('.tbtn-wrapper', { hasText: 'Link' }).locator('button').click()
  await page.locator('button[aria-label="Cancel"]').click()
  await page.waitForTimeout(300)
  const linkGone = await page.locator('input[placeholder="https://example.com"]').count() === 0
  const kept = await page.evaluate(() => getSelection().toString())
  check(linkGone && kept === 'pick this word' && await bar.isVisible(), `link box X cancels and keeps the selection ("${kept}")`)
  await page.keyboard.press('End')
  await page.waitForTimeout(300)
  check(await bar.count() === 0, 'selection bar hides when the selection collapses')

  // Slash menu: "/" opens it, typing filters, Enter inserts, Esc closes.
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await page.keyboard.type('/')
  await page.waitForTimeout(300)
  const menuCount = await page.locator('[data-slash-menu] button').count()
  await page.keyboard.type('todo')
  await page.waitForTimeout(300)
  const filtered = await page.locator('[data-slash-menu] button').allInnerTexts()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  const task = await page.locator('.ProseMirror ul[data-type="taskList"]').count()
  const leftover = await page.evaluate(() => document.querySelector('.ProseMirror').textContent)
  check(menuCount > 10 && filtered.join() === 'Checklist' && task === 1 && !leftover.includes('/'), `"/todo" Enter makes a checklist (menu ${menuCount}, filtered ${filtered}, text "${leftover}")`)
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await page.keyboard.type('a/b /')
  await page.waitForTimeout(300)
  const afterSpace = await page.locator('[data-slash-menu]').count()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check(afterSpace === 1 && await page.locator('[data-slash-menu]').isVisible().catch(() => false) === false, 'slash menu opens after a space and Esc closes it')
  await page.context().close()

  // Dark mode: inline code has a visible chip, highlights keep dark text.
  const dark = await open('dark')
  await paste(dark, '<p>Some <code>code</code> and <mark data-color="#fde68a" style="background-color:#fde68a; color: inherit">marked</mark> text.</p>')
  await dark.waitForTimeout(500)
  const colors = await dark.evaluate(() => {
    const pm = document.querySelector('.ProseMirror')
    return { code: getComputedStyle(pm.querySelector('code')).backgroundColor, mark: getComputedStyle(pm.querySelector('mark')).color, dark: document.documentElement.classList.contains('dark') }
  })
  check(colors.dark && colors.code !== 'rgba(0, 0, 0, 0)' && !colors.code.startsWith('rgba(0, 0, 0,'), `dark mode inline code has a background (${colors.code})`)
  check(colors.mark === 'rgb(31, 31, 31)', `dark mode highlight keeps dark text (${colors.mark})`)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
