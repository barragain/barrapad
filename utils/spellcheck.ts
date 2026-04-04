import type nspellType from 'nspell'

type Spell = ReturnType<typeof nspellType>

let spell: Spell | null = null
let loading = false
const queue: Array<() => void> = []

async function load(): Promise<Spell> {
  if (spell) return spell

  if (loading) {
    return new Promise((resolve) => {
      queue.push(() => resolve(spell!))
    })
  }

  loading = true

  const [nspell, aff, dic] = await Promise.all([
    import('nspell').then((m) => m.default ?? m),
    fetch('/dict/en.aff').then((r) => r.text()),
    fetch('/dict/en.dic').then((r) => r.text()),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spell = (nspell as any)({ aff, dic }) as Spell
  loading = false
  queue.forEach((fn) => fn())
  return spell
}

// Kick off loading eagerly so it's ready before the first right-click
if (typeof window !== 'undefined') {
  load().catch(() => {})
}

/** Returns false if misspelled, true if correct, null if dict not loaded yet */
export function isCorrectSync(word: string): boolean | null {
  if (!spell) return null
  return spell.correct(word) || spell.correct(word.toLowerCase())
}

/** Returns up to 5 suggestions, or null if dict not loaded yet */
export function suggestSync(word: string): string[] | null {
  if (!spell) return null
  const suggestions = spell.suggest(word)
  if (!suggestions.length) {
    return spell.suggest(word.toLowerCase()).slice(0, 5)
  }
  return suggestions.slice(0, 5)
}
