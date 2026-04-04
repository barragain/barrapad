// eslint-disable-next-line @typescript-eslint/no-explicit-any
let spell: any = null
let loading = false
let queue: Array<() => void> = []

async function load(): Promise<typeof spell> {
  if (spell) return spell

  if (loading) {
    return new Promise((resolve) => {
      queue.push(() => resolve(spell))
    })
  }

  loading = true

  const [{ default: nspell }, aff, dic] = await Promise.all([
    import('nspell'),
    fetch('/dict/en.aff').then((r) => r.text()),
    fetch('/dict/en.dic').then((r) => r.text()),
  ])

  spell = nspell({ aff, dic })
  loading = false
  queue.forEach((fn) => fn())
  queue = []
  return spell
}

// Kick off loading eagerly so it's ready before the first right-click
if (typeof window !== 'undefined') {
  load().catch(() => {})
}

/** Returns false if misspelled, true if correct, null if dict not loaded yet */
export function isCorrectSync(word: string): boolean | null {
  if (!spell) return null
  // Try exact word first, then lowercase (handles sentence-start capitalisation)
  return spell.correct(word) || spell.correct(word.toLowerCase())
}

/** Returns up to 5 suggestions, or null if dict not loaded yet */
export function suggestSync(word: string): string[] | null {
  if (!spell) return null
  const suggestions = spell.suggest(word)
  if (!suggestions.length) {
    // Try lowercase if exact had no results
    return spell.suggest(word.toLowerCase()).slice(0, 5)
  }
  return suggestions.slice(0, 5)
}
