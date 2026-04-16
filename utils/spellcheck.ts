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

  // Add modern/tech words missing from the base English dictionary
  const modernWords = [
    'wordpress', 'WordPress', 'github', 'GitHub', 'gmail', 'Gmail',
    'javascript', 'JavaScript', 'typescript', 'TypeScript', 'nodejs', 'npm',
    'api', 'APIs', 'url', 'URLs', 'html', 'css', 'json', 'yaml', 'svg',
    'emoji', 'emojis', 'hashtag', 'hashtags', 'selfie', 'selfies',
    'wifi', 'WiFi', 'bluetooth', 'Bluetooth', 'iPhone', 'iPad', 'Android',
    'google', 'Google', 'youtube', 'YouTube', 'instagram', 'Instagram',
    'tiktok', 'TikTok', 'snapchat', 'Snapchat', 'whatsapp', 'WhatsApp',
    'spotify', 'Spotify', 'netflix', 'Netflix', 'uber', 'Uber',
    'crypto', 'bitcoin', 'Bitcoin', 'blockchain', 'cryptocurrency',
    'startup', 'startups', 'fintech', 'edtech', 'biotech', 'SaaS',
    'podcast', 'podcasts', 'livestream', 'livestreams', 'vlog', 'vlogs',
    'signup', 'login', 'logout', 'username', 'usernames', 'dropdown',
    'backend', 'frontend', 'fullstack', 'devops', 'webhook', 'webhooks',
    'plugin', 'plugins', 'app', 'apps', 'chatbot', 'chatbots',
    'todo', 'todos', 'async', 'sync', 'navbar', 'sidebar',
    'gmail', 'outlook', 'Outlook', 'figma', 'Figma', 'canva', 'Canva',
    'vercel', 'Vercel', 'heroku', 'Heroku', 'netlify', 'Netlify',
    'favicon', 'dropdown', 'tooltip', 'popup', 'modal', 'dialog',
    'clickbait', 'unfriend', 'unfollow', 'retweet', 'vibe', 'vibes',
    'binge', 'binged', 'ghosting', 'ghosted', 'lowkey', 'highkey',
    'meme', 'memes', 'GIF', 'GIFs', 'influencer', 'influencers',
    'mindset', 'skillset', 'workflow', 'workflows', 'onboarding',
    'timestamp', 'timestamps', 'screenshot', 'screenshots',
    'crowdfund', 'crowdfunding', 'paywall', 'freemium', 'upsell',
    'nocode', 'lowcode', 'sandbox', 'sandboxes', 'middleware',
  ]
  for (const w of modernWords) spell.add(w)

  // Add common contractions — many Hunspell dictionaries don't include them
  const contractions = [
    "doesn't", "don't", "won't", "can't", "isn't", "wasn't", "weren't",
    "aren't", "hasn't", "haven't", "hadn't", "wouldn't", "couldn't",
    "shouldn't", "didn't", "mustn't", "needn't",
    "I've", "you've", "we've", "they've",
    "you're", "they're", "we're",
    "I'll", "you'll", "we'll", "they'll", "he'll", "she'll", "it'll",
    "I'd", "you'd", "we'd", "they'd", "he'd", "she'd", "it'd",
    "he's", "she's", "it's", "that's", "who's", "what's", "where's",
    "how's", "there's", "here's", "let's", "ain't", "o'clock",
    "I'm", "would've", "could've", "should've", "might've", "must've",
    "who've", "that'll", "there'll", "who'll", "what'll",
    "wasn't", "weren't", "hasn't", "haven't",
    "y'all", "ma'am", "ne'er", "e'er", "ol'",
  ]
  for (const w of contractions) spell.add(w)

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

/** Resolves once the dictionary is fully loaded */
export function ensureLoaded(): Promise<void> {
  return load().then(() => {})
}

// Common contraction patterns — when nspell doesn't suggest the apostrophe form,
// we prepend it so "doesn" → "doesn't", "cant" → "can't", etc.
const CONTRACTION_MAP: Record<string, string> = {
  doesnt: "doesn't", dont: "don't", wont: "won't", cant: "can't",
  isnt: "isn't", wasnt: "wasn't", werent: "weren't", arent: "aren't",
  hasnt: "hasn't", havent: "haven't", hadnt: "hadn't",
  wouldnt: "wouldn't", couldnt: "couldn't", shouldnt: "shouldn't",
  didnt: "didn't", mustnt: "mustn't", neednt: "needn't",
  ive: "I've", youve: "you've", weve: "we've", theyve: "they've",
  youre: "you're", theyre: "they're", were: "we're",
  ill: "I'll", youll: "you'll", well: "we'll", theyll: "they'll",
  hed: "he'd", shed: "she'd", youd: "you'd", theyd: "they'd", wed: "we'd",
  hes: "he's", shes: "she's", thats: "that's", whos: "who's",
  whats: "what's", wheres: "where's", hows: "how's",
  lets: "let's", its: "it's", theres: "there's", heres: "here's",
  im: "I'm", aint: "ain't", oclock: "o'clock",
  wouldve: "would've", couldve: "could've", shouldve: "should've",
}

/** Returns up to 5 suggestions, or null if dict not loaded yet */
export function suggestSync(word: string): string[] | null {
  if (!spell) return null

  // Check for contraction match first — these are the most intuitive fixes
  const lower = word.toLowerCase()
  const contraction = CONTRACTION_MAP[lower]

  const suggestions = spell.suggest(word)
  const base = suggestions.length ? suggestions : spell.suggest(lower)

  // Prepend the contraction if it's not already in the list
  if (contraction && !base.includes(contraction)) {
    return [contraction, ...base.filter(s => s !== contraction)].slice(0, 5)
  }
  return base.slice(0, 5)
}
