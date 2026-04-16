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

  // Add modern/tech/slang words missing from the base English dictionary
  const modernWords = [
    // ── Tech & Software ──
    'wordpress', 'WordPress', 'github', 'GitHub', 'gitlab', 'GitLab',
    'gmail', 'Gmail', 'javascript', 'JavaScript', 'typescript', 'TypeScript',
    'nodejs', 'npm', 'npx', 'pnpm', 'yarn', 'webpack', 'vite', 'eslint',
    'prettier', 'dockerfile', 'kubernetes', 'docker', 'nginx', 'apache',
    'api', 'APIs', 'url', 'URLs', 'html', 'HTML', 'css', 'CSS',
    'json', 'JSON', 'yaml', 'YAML', 'svg', 'SVG', 'xml', 'XML',
    'regex', 'cron', 'webhook', 'webhooks', 'websocket', 'websockets',
    'backend', 'frontend', 'fullstack', 'devops', 'DevOps', 'sysadmin',
    'plugin', 'plugins', 'addon', 'addons', 'middleware', 'microservice',
    'microservices', 'monorepo', 'codebase', 'refactor', 'refactored',
    'refactoring', 'deploy', 'deployed', 'deploying', 'deployment',
    'deployments', 'rollback', 'rollbacks', 'hotfix', 'hotfixes',
    'changelog', 'readme', 'README', 'config', 'configs',
    'signup', 'login', 'logout', 'username', 'usernames', 'dropdown',
    'dropdowns', 'navbar', 'sidebar', 'tooltip', 'tooltips', 'popup',
    'popups', 'modal', 'modals', 'dialog', 'dialogs', 'carousel',
    'favicon', 'sitemap', 'breadcrumb', 'breadcrumbs', 'pagination',
    'todo', 'todos', 'async', 'sync', 'callback', 'callbacks',
    'chatbot', 'chatbots', 'automate', 'automated', 'automating',
    'sandbox', 'sandboxes', 'localhost', 'admin', 'dashboard',
    'analytics', 'metadata', 'endpoint', 'endpoints', 'payload',
    'boolean', 'string', 'integer', 'float', 'array', 'hashtable',
    'localhost', 'DNS', 'SSL', 'HTTPS', 'HTTP', 'SSH', 'FTP',
    'OAuth', 'JWT', 'auth', 'SSO', 'MFA', 'OTP',
    'IDE', 'SDK', 'CLI', 'GUI', 'UI', 'UX', 'QA',
    'repo', 'repos', 'PR', 'PRs', 'CI', 'CD',

    // ── Brands & Products ──
    'google', 'Google', 'youtube', 'YouTube', 'instagram', 'Instagram',
    'tiktok', 'TikTok', 'snapchat', 'Snapchat', 'whatsapp', 'WhatsApp',
    'spotify', 'Spotify', 'netflix', 'Netflix', 'uber', 'Uber',
    'lyft', 'Lyft', 'airbnb', 'Airbnb', 'pinterest', 'Pinterest',
    'linkedin', 'LinkedIn', 'reddit', 'Reddit', 'discord', 'Discord',
    'slack', 'Slack', 'zoom', 'Zoom', 'teams', 'Teams', 'skype', 'Skype',
    'twitch', 'Twitch', 'paypal', 'PayPal', 'venmo', 'Venmo',
    'stripe', 'Stripe', 'shopify', 'Shopify', 'squarespace', 'Squarespace',
    'wix', 'Wix', 'wordpress', 'WordPress', 'drupal', 'Drupal',
    'figma', 'Figma', 'canva', 'Canva', 'adobe', 'Adobe', 'photoshop',
    'outlook', 'Outlook', 'notion', 'Notion', 'trello', 'Trello',
    'asana', 'Asana', 'jira', 'Jira', 'clickup', 'ClickUp',
    'vercel', 'Vercel', 'heroku', 'Heroku', 'netlify', 'Netlify',
    'aws', 'AWS', 'azure', 'Azure', 'GCP',
    'iPhone', 'iPad', 'MacBook', 'iMac', 'AirPods', 'Apple',
    'Android', 'Samsung', 'Pixel', 'Tesla', 'SpaceX',
    'ChatGPT', 'OpenAI', 'Anthropic', 'Claude', 'Gemini', 'Copilot',
    'Alexa', 'Siri', 'Cortana', 'Xbox', 'PlayStation', 'Nintendo',
    'Fortnite', 'Minecraft', 'Roblox', 'Twitch',

    // ── Social Media & Internet ──
    'emoji', 'emojis', 'hashtag', 'hashtags', 'selfie', 'selfies',
    'meme', 'memes', 'GIF', 'GIFs', 'viral', 'trending',
    'influencer', 'influencers', 'content creator', 'streamer', 'streamers',
    'follower', 'followers', 'subscriber', 'subscribers', 'unsubscribe',
    'clickbait', 'unfriend', 'unfollow', 'retweet', 'repost', 'reshare',
    'livestream', 'livestreams', 'livestreaming', 'livestreamed',
    'vlog', 'vlogs', 'vlogger', 'vloggers', 'podcast', 'podcasts',
    'podcaster', 'podcasters', 'podcasting',
    'blog', 'blogs', 'blogging', 'blogger', 'bloggers', 'blogpost',
    'DM', 'DMs', 'PM', 'PMs', 'inbox', 'outbox',
    'spam', 'spammy', 'phishing', 'scam', 'scams', 'scammer',
    'troll', 'trolls', 'trolling', 'cyberbully', 'cyberbullying',
    'doxxing', 'doxxed', 'catfish', 'catfishing',
    'paywall', 'freemium', 'upsell', 'upselling',
    'crowdfund', 'crowdfunding', 'crowdsource', 'crowdsourcing',

    // ── Business & Finance ──
    'startup', 'startups', 'fintech', 'edtech', 'biotech', 'healthtech',
    'proptech', 'insurtech', 'regtech', 'legaltech', 'agritech',
    'SaaS', 'PaaS', 'IaaS', 'B2B', 'B2C', 'D2C', 'KPI', 'KPIs',
    'ROI', 'MVP', 'PMF', 'IPO', 'VC', 'PE', 'CEO', 'CTO', 'CFO',
    'COO', 'CMO', 'CPO', 'VP', 'SVP', 'EVP', 'OKR', 'OKRs',
    'crypto', 'bitcoin', 'Bitcoin', 'ethereum', 'Ethereum',
    'blockchain', 'cryptocurrency', 'NFT', 'NFTs', 'DeFi',
    'scalable', 'scalability', 'monetize', 'monetization', 'monetizing',
    'onboard', 'onboarding', 'offboard', 'offboarding',
    'upskill', 'upskilling', 'reskill', 'reskilling',
    'solopreneur', 'intrapreneur', 'bootstrapped', 'bootstrapping',
    'pivot', 'pivoting', 'pivoted', 'iterate', 'iterating',
    'synergy', 'synergies', 'bandwidth', 'deliverable', 'deliverables',
    'stakeholder', 'stakeholders', 'touchpoint', 'touchpoints',
    'ecommerce', 'eCommerce', 'omnichannel', 'multichannel',
    'dropship', 'dropshipping', 'fulfillment',

    // ── Modern Slang & Informal ──
    'vibe', 'vibes', 'vibing', 'aesthetic', 'aesthetics',
    'binge', 'binged', 'bingeing', 'bingewatch', 'bingewatching',
    'ghosting', 'ghosted', 'lowkey', 'highkey',
    'salty', 'sus', 'sussy', 'lit', 'fam', 'bruh', 'bro', 'sis',
    'bestie', 'bestie', 'bff', 'BFF', 'simp', 'simping',
    'flex', 'flexing', 'flexed', 'slay', 'slayed', 'slaying',
    'stan', 'stanning', 'stanned', 'fandom', 'fandoms',
    'cringe', 'cringy', 'cringey', 'yikes', 'oof', 'ick',
    'chillax', 'adulting', 'hangry', 'fomo', 'FOMO', 'jomo', 'JOMO',
    'YOLO', 'yolo', 'GOAT', 'goat', 'ASAP', 'asap',
    'bougie', 'boujee', 'extra', 'snatched', 'fire',
    'woke', 'canceled', 'canceling', 'cancel culture',
    'gaslight', 'gaslighting', 'gaslighted',
    'gatekeep', 'gatekeeping', 'gatekeeper',
    'clout', 'drip', 'cap', 'nocap', 'bussin', 'bet',
    'rizz', 'sigma', 'gyatt', 'skibidi', 'Ohio',
    'ratio', 'ratioed', 'based', 'mid', 'peak', 'rent free',
    'delulu', 'situationship', 'entanglement',
    'unhinged', 'chaotic', 'iconic', 'era',
    'periodt', 'purr', 'ate', 'understood the assignment',
    'maincharacter', 'NPC', 'sidequest',
    'doomscroll', 'doomscrolling', 'doomscrolled',
    'doom', 'gloom', 'doomer', 'zoomer', 'boomer', 'millennial',
    'Gen Z', 'GenZ', 'Gen X', 'GenX', 'Gen Alpha',
    'OK', 'ok', 'okay', 'nah', 'yeah', 'yep', 'nope', 'yup',
    'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'lemme',
    'dunno', 'gimme', 'gotcha', 'whatcha', 'shoulda', 'coulda', 'woulda',
    'cuz', 'coz', 'tho', 'thru', 'til', 'tryna', 'prolly',
    'pls', 'plz', 'thx', 'ty', 'np', 'yw', 'imo', 'IMO',
    'tbh', 'TBH', 'smh', 'SMH', 'lol', 'LOL', 'lmao', 'LMAO',
    'omg', 'OMG', 'wtf', 'WTF', 'idk', 'IDK', 'irl', 'IRL',
    'btw', 'BTW', 'fyi', 'FYI', 'aka', 'AKA', 'etc',
    'TLDR', 'tldr', 'NSFW', 'nsfw', 'TL;DR',

    // ── Health & Wellness ──
    'covid', 'COVID', 'coronavirus', 'pandemic', 'lockdown', 'lockdowns',
    'quarantine', 'quarantined', 'PCR', 'antigen', 'booster', 'boosters',
    'telehealth', 'telemedicine', 'mindfulness', 'selfcare', 'wellness',
    'burnout', 'overthink', 'overthinking', 'overthought',
    'workout', 'workouts', 'cardio', 'HIIT', 'CrossFit', 'yoga',
    'vegan', 'veganism', 'keto', 'paleo', 'gluten free', 'superfood',
    'probiotic', 'probiotics', 'prebiotic', 'prebiotics',
    'melatonin', 'serotonin', 'dopamine', 'cortisol', 'adrenaline',
    'ADHD', 'OCD', 'PTSD', 'anxiety', 'neurodivergent', 'neurotypical',

    // ── Food & Drink ──
    'matcha', 'kombucha', 'acai', 'quinoa', 'avocado', 'sriracha',
    'ramen', 'sushi', 'boba', 'chai', 'latte', 'espresso', 'cappuccino',
    'croissant', 'macaron', 'macarons', 'gelato', 'tiramisu',
    'hummus', 'falafel', 'tzatziki', 'guacamole', 'pesto',
    'brunch', 'foodie', 'foodies',

    // ── General modern vocabulary ──
    'wifi', 'WiFi', 'bluetooth', 'Bluetooth', 'USB', 'HDMI', 'VPN',
    'screenshot', 'screenshots', 'screenshare', 'screensharing',
    'timestamp', 'timestamps', 'username', 'usernames', 'password',
    'passwords', 'passcode', 'biometric', 'biometrics', 'fingerprint',
    'app', 'apps', 'appstore', 'download', 'downloaded', 'uploading',
    'uploaded', 'upload', 'uploads', 'downloadable',
    'walkthrough', 'workaround', 'workarounds', 'gameplay',
    'skillset', 'mindset', 'toolset', 'dataset', 'datasets',
    'workflow', 'workflows', 'timeline', 'timelines',
    'nocode', 'lowcode', 'no code', 'low code',
    'AI', 'ML', 'LLM', 'GPT', 'NLP', 'AGI', 'ASI',
    'deepfake', 'deepfakes', 'deeplearning',
    'algorithm', 'algorithms', 'algorithmic',
  ]
  for (const w of modernWords) spell.add(w)

  // Add ALL contractions, possessives, and informal shortenings
  const contractions = [
    // ── Standard negatives ──
    "doesn't", "don't", "won't", "can't", "isn't", "wasn't", "weren't",
    "aren't", "hasn't", "haven't", "hadn't", "wouldn't", "couldn't",
    "shouldn't", "didn't", "mustn't", "needn't", "shan't", "mightn't",
    "daren't", "oughtn't", "usedn't",

    // ── Pronoun + verb ──
    "I'm", "I've", "I'd", "I'll",
    "you're", "you've", "you'd", "you'll",
    "he's", "he'd", "he'll",
    "she's", "she'd", "she'll",
    "it's", "it'd", "it'll",
    "we're", "we've", "we'd", "we'll",
    "they're", "they've", "they'd", "they'll",

    // ── Question words ──
    "who's", "who'd", "who'll", "who've",
    "what's", "what'd", "what'll", "what're", "what've",
    "where's", "where'd", "where'll", "where've",
    "when's", "when'd", "when'll",
    "why's", "why'd", "why'll",
    "how's", "how'd", "how'll",

    // ── Demonstratives / other ──
    "that's", "that'd", "that'll",
    "there's", "there'd", "there'll", "there've",
    "here's", "here'd", "here'll",
    "let's", "ain't", "o'clock",
    "one's", "someone's", "everyone's", "anyone's", "nobody's",
    "somebody's", "everybody's", "anybody's",
    "nothing's", "something's", "everything's", "anything's",

    // ── Have contractions ──
    "would've", "could've", "should've", "might've", "must've",
    "may've", "need've", "ought've",
    "would'nt've", "couldn't've", "shouldn't've",

    // ── Double contractions / informal ──
    "y'all", "y'all's", "ma'am", "ne'er", "e'er", "ol'",
    "it'd've", "who'd've", "that'd've",
    "'twas", "'tis", "'til", "'em", "'cause", "'bout", "'round",

    // ── Informal verb contractions ──
    "gonna", "wanna", "gotta", "kinda", "sorta", "oughta",
    "coulda", "woulda", "shoulda", "musta", "mighta",
    "hafta", "hasta", "oughtta", "supposta", "useta",
    "lemme", "gimme", "gotcha", "getcha", "betcha",
    "dunno", "doncha", "dontcha", "didja", "wouldja", "couldja",
    "whatcha", "howdy", "innit", "init",
    "c'mon", "c'mere", "s'pose", "s'more", "s'mores",
    "ma'am", "cap'n", "gov'nor",

    // ── Possessive 's (common proper nouns people type) ──
    "it's", "that's", "what's", "who's", "there's",
    "today's", "tomorrow's", "yesterday's",
    "Monday's", "Tuesday's", "Wednesday's", "Thursday's",
    "Friday's", "Saturday's", "Sunday's",
    "January's", "February's", "March's",
    "mom's", "dad's", "brother's", "sister's",
    "friend's", "friends'", "teacher's", "boss's",
    "company's", "team's", "world's", "year's", "month's", "week's",
    "day's", "night's", "morning's", "evening's",
    "life's", "child's", "children's", "people's", "women's", "men's",
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
  // ── Negatives (missing apostrophe) ──
  doesnt: "doesn't", dont: "don't", wont: "won't", cant: "can't",
  isnt: "isn't", wasnt: "wasn't", werent: "weren't", arent: "aren't",
  hasnt: "hasn't", havent: "haven't", hadnt: "hadn't",
  wouldnt: "wouldn't", couldnt: "couldn't", shouldnt: "shouldn't",
  didnt: "didn't", mustnt: "mustn't", neednt: "needn't",
  shant: "shan't", mightnt: "mightn't", darent: "daren't",
  oughtnt: "oughtn't",

  // ── Pronoun + am/is/are/have/had/will/would ──
  im: "I'm", ive: "I've", id: "I'd", ill: "I'll",
  youre: "you're", youve: "you've", youd: "you'd", youll: "you'll",
  hes: "he's", hed: "he'd", hell: "he'll",
  shes: "she's", shed: "she'd", shell: "she'll",
  its: "it's", itd: "it'd", itll: "it'll",
  were: "we're", weve: "we've", wed: "we'd", well: "we'll",
  theyre: "they're", theyve: "they've", theyd: "they'd", theyll: "they'll",

  // ── Question words ──
  whos: "who's", whod: "who'd", wholl: "who'll", whove: "who've",
  whats: "what's", whatd: "what'd", whatll: "what'll", whatre: "what're",
  wheres: "where's", whered: "where'd", wherell: "where'll",
  whens: "when's", whend: "when'd", whenll: "when'll",
  whys: "why's", whyd: "why'd", whyll: "why'll",
  hows: "how's", howd: "how'd", howll: "how'll",

  // ── Demonstratives / other ──
  thats: "that's", thatd: "that'd", thatll: "that'll",
  theres: "there's", thered: "there'd", therell: "there'll", thereve: "there've",
  heres: "here's", hered: "here'd", herell: "here'll",
  lets: "let's", aint: "ain't", oclock: "o'clock",
  everyones: "everyone's", someones: "someone's", anyones: "anyone's",
  nobodys: "nobody's", somethings: "something's", everythings: "everything's",
  nothings: "nothing's", anythings: "anything's",

  // ── Have contractions ──
  wouldve: "would've", couldve: "could've", shouldve: "should've",
  mightve: "might've", mustve: "must've", mayve: "may've",

  // ── Double negatives (missing apostrophes) ──
  wouldntve: "wouldn't've", couldntve: "couldn't've", shouldntve: "shouldn't've",

  // ── Informal (no apostrophe typed) ──
  yall: "y'all", cmon: "c'mon", cmere: "c'mere",
  twas: "'twas", tis: "'tis", til: "'til",
  bout: "'bout", cause: "'cause", round: "'round",
  spose: "s'pose", smore: "s'more", smores: "s'mores",

  // ── Common typos → intended word ──
  teh: "the", adn: "and", ahve: "have", hte: "the",
  taht: "that", waht: "what", wiht: "with", thier: "their",
  recieve: "receive", acheive: "achieve", beleive: "believe",
  occurence: "occurrence", occured: "occurred", seperate: "separate",
  definately: "definitely", definatly: "definitely", defintely: "definitely",
  accomodate: "accommodate", calender: "calendar", cemetary: "cemetery",
  concious: "conscious", embarass: "embarrass", enviroment: "environment",
  goverment: "government", harrass: "harass", independant: "independent",
  neccessary: "necessary", priviledge: "privilege", refered: "referred",
  succesful: "successful", tommorow: "tomorrow", tommorrow: "tomorrow",
  untill: "until", wierd: "weird", wich: "which", becuase: "because",
  becasue: "because", beacuse: "because", enought: "enough",
  throught: "through", thougt: "thought", togheter: "together",
  togther: "together", knowlege: "knowledge", langugage: "language",
  necesary: "necessary", occassion: "occasion", posession: "possession",
  profesional: "professional", recomend: "recommend", remeber: "remember",
  rember: "remember", shedule: "schedule", strenght: "strength",
  suprise: "surprise", truely: "truly", vaccum: "vacuum",
  writting: "writing", writen: "written",
  hacve: "have", hav: "have", ahd: "had", nad: "and",
  thn: "then", whne: "when", jsut: "just", liek: "like",
  form: "from", frome: "from", ot: "to", fo: "of", si: "is",
  nto: "not", nit: "not", aer: "are", wsa: "was", cna: "can",
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
