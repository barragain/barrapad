// Spelling suggestions for the bpad right-click menu. The browser draws the
// red underlines, but pages can't read its suggestions, so we make our own:
// words within two edits of the clicked word, closest first, then most
// common first. Word list: SymSpell's English 80k list (MIT, Wolf Garbe),
// one word per line, most common first. Loaded once, in the background.

let rank: Map<string, number> | null = null
let loading: Promise<void> | null = null

export function preloadSpelling() {
  loading ??= fetch('/dict/words-en.txt')
    .then((r) => r.text())
    .then((t) => { rank = new Map(t.split('\n').map((w, i) => [w, i])) })
    .catch(() => { loading = null })
  return loading
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz'"

function edits(w: string): string[] {
  const out: string[] = []
  for (let i = 0; i <= w.length; i++) {
    const a = w.slice(0, i), b = w.slice(i)
    if (b) out.push(a + b.slice(1))
    if (b.length > 1) out.push(a + b[1] + b[0] + b.slice(2))
    for (const c of LETTERS) {
      if (b) out.push(a + c + b.slice(1))
      out.push(a + c + b)
    }
  }
  return out
}

/**
 * Up to 5 suggestions for a misspelled word, [] for a known word (or one
 * with digits), or null while the list is still loading. Keeps a leading capital.
 */
export function suggestSpelling(word: string): string[] | null {
  if (!rank) { preloadSpelling(); return null }
  const r = rank
  const w = word.replace(/’/g, "'")
  const lower = w.toLowerCase()
  if (r.has(lower) || /\d/.test(w)) return []
  const byRank = (a: string, b: string) => r.get(a)! - r.get(b)!
  const one = edits(lower)
  // One edit away: a missing apostrophe first ("dont"), then fixes that keep
  // every typed letter ("realy" gives "really" before "real"), then by how common.
  const kind = (e: string) => (e.replace("'", '') === lower ? 0 : e.length < lower.length ? 2 : 1)
  let found = [...new Set(one.filter((e) => r.has(e)))].sort((a, b) => kind(a) - kind(b) || byRank(a, b))
  // ponytail: edit distance 2 is a brute-force scan (~300k strings for a long word), fine for one right-click.
  if (found.length < 5) {
    const seen = new Set(found)
    const two: string[] = []
    for (const e of one) for (const e2 of edits(e)) if (r.has(e2) && !seen.has(e2)) { seen.add(e2); two.push(e2) }
    found = [...found, ...two.sort(byRank)]
  }
  // A very common short word run into another word ("alot", "infront",
  // "thankyou") comes first. The other half must be a real word of 3+ letters,
  // so fragments like "un" + "till" don't count.
  for (let i = 1; i < lower.length; i++) {
    const x = lower.slice(0, i), y = lower.slice(i)
    const rx = r.get(x) ?? 1e9, ry = r.get(y) ?? 1e9
    if ((rx < 50 && y.length > 2 && ry < 5000) || (ry < 50 && x.length > 2 && rx < 5000)) { found = [`${x} ${y}`, ...found]; break }
  }
  const cap = w[0] !== lower[0]
  return found.slice(0, 5).map((s) => (cap ? s[0].toUpperCase() + s.slice(1) : s))
}
