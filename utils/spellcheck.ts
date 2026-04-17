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
    'AI', 'ML', 'LLM', 'LLMs', 'GPT', 'NLP', 'AGI', 'ASI', 'RAG',
    'deepfake', 'deepfakes', 'deeplearning',
    'algorithm', 'algorithms', 'algorithmic',

    // ── Newer internet slang & Gen Alpha terms ──
    'rizz', 'rizzler', 'gyatt', 'sigma', 'skibidi', 'fanum', 'ohio', 'Ohio',
    'goated', 'mewing', 'looksmaxxing', 'looksmaxing', 'mogging', 'mogged',
    'bussin', 'bussing', 'slaps', 'lowkey', 'highkey', 'deadass',
    'fr', 'frfr', 'ong', 'ngl', 'istg', 'imo', 'tbf', 'iykyk',
    'tmi', 'afaik', 'imho', 'rofl', 'afk', 'ftw', 'icymi', 'lmk',
    'jk', 'jkjk', 'fml', 'omfg', 'lmaooo', 'lmfao', 'bruhh',
    'copium', 'hopium', 'cope', 'coping', 'cringe', 'cringing',
    'cheugy', 'delulu', 'salty', 'sus', 'sussy', 'yeet', 'yeeted',
    'mid', 'peak', 'based', 'ratio', 'ratioed', 'touchgrass', 'touch grass',
    'chad', 'GigaChad', 'virgin', 'beta', 'alpha', 'sigma',
    'npc', 'NPC', 'mainchar', 'maincharacter', 'mainprotag',
    'bop', 'slay', 'slayed', 'ate', 'eating', 'understood',
    'unserious', 'unhinged', 'feral', 'iconic', 'legend', 'legendary',
    'vibing', 'vibes', 'vibey', 'moodboard', 'aesthetic',
    'baddie', 'baddies', 'bestie', 'besties', 'bff', 'fam',
    'glowup', 'glow up', 'glowed', 'glowing',
    'flex', 'humblebrag', 'flexing', 'flexed',
    'bet', 'nocap', 'cap', 'capping', 'facts',
    'periodt', 'period', 'purr', 'purrr',
    'sksksk', 'oop', 'oopsie', 'yikes',
    'gotit', 'ight', 'aight', 'aiight', 'nah', 'nahh', 'nope', 'nvm',
    'yup', 'yep', 'yepp', 'yup', 'yuh', 'ya', 'yea', 'yeah',
    'vibe check', 'vibe', 'vibez', 'vibing', 'vibed',
    'lore', 'lores', 'arc', 'era', 'eras', 'core',
    'parasocial', 'stans', 'stanned',

    // ── Tech / dev words (extended) ──
    'Next.js', 'NextJS', 'nextjs', 'React', 'Vue', 'Vue.js', 'Svelte',
    'SvelteKit', 'Solid', 'Astro', 'Remix', 'Nuxt', 'Gatsby', 'Expo',
    'Prisma', 'Drizzle', 'Supabase', 'Firebase', 'Firestore',
    'MongoDB', 'PostgreSQL', 'Postgres', 'MySQL', 'MariaDB', 'SQLite',
    'Redis', 'Upstash', 'Elasticsearch', 'Kafka', 'RabbitMQ',
    'Cloudflare', 'Wasm', 'WASM', 'gRPC', 'tRPC', 'GraphQL', 'REST',
    'oauth', 'OAuth2', 'JWT', 'SAML',
    'Clerk', 'Auth0', 'NextAuth', 'Lucia', 'Ory',
    'Tailwind', 'shadcn', 'Radix', 'Headless', 'DaisyUI',
    'TypeScript', 'Rustlang', 'Golang', 'Kotlin', 'Swift',
    'monorepo', 'polyrepo', 'workspace', 'workspaces',
    'devcontainer', 'codespace', 'codespaces',
    'rollout', 'rollouts', 'canary', 'feature flag', 'featureflag',
    'observability', 'telemetry', 'tracing',
    'serverless', 'edge', 'CDN', 'CDNs', 'ISR', 'SSR', 'SSG', 'CSR', 'RSC',
    'webhook', 'webhooks', 'websocket', 'websockets', 'SSE',
    'prompt', 'prompts', 'prompting', 'tokenize', 'tokenizer',
    'embedding', 'embeddings', 'vectorize', 'vectorization',
    'fine-tune', 'finetuning', 'finetuned', 'pretrained',
    'quantize', 'quantized', 'inference', 'hallucination', 'hallucinate',
    'agentic', 'agent', 'agents', 'multi-agent', 'multiagent',
    'reasoning', 'reasoner', 'CoT', 'ReAct',

    // ── Extra brands & product names ──
    'Cursor', 'Cody', 'Codeium', 'Windsurf', 'Replit', 'Perplexity',
    'Mistral', 'Llama', 'Gemma', 'Qwen', 'Grok', 'DeepSeek',
    'Midjourney', 'Runway', 'ElevenLabs', 'Suno', 'Udio',
    'HeyGen', 'Synthesia', 'Pika', 'Sora',
    'Notion', 'Linear', 'Height', 'Superhuman',
    'Raycast', 'Arc', 'Brave', 'DuckDuckGo',
    'Substack', 'Medium', 'Ghost',
    'Threads', 'Bluesky', 'Mastodon', 'Lemmy',
    'Patreon', 'Gumroad', 'Lemonsqueezy', 'Whop',
    'OnlyFans', 'Kofi', 'Ko-fi', 'BuyMeACoffee',

    // ── Contemporary nouns & verbs ──
    'doomscroll', 'doomscrolling', 'doomscroller',
    'hatewatch', 'hatewatched', 'hatewatching',
    'livestream', 'livestreamer', 'livestreaming',
    'cottagecore', 'darkacademia', 'y2k', 'Y2K',
    'soft launch', 'hard launch', 'softlaunch', 'hardlaunch',
    'red flag', 'redflag', 'green flag', 'greenflag',
    'gaslight', 'gaslighting', 'gaslit',
    'girlboss', 'boyfail', 'himbo',
    'situationship', 'entanglement', 'breadcrumbing', 'benching',
    'ghost', 'ghosting', 'ghosted', 'orbit', 'orbiting',
    'love bomb', 'lovebombing', 'lovebomb',

    // ── Food / drink / lifestyle ──
    'mocktail', 'mocktails', 'kombucha', 'turmeric', 'adaptogen',
    'dirty soda', 'dirtysoda', 'cloudbread', 'whippedcoffee',
    'plantbased', 'plant-based', 'flexitarian', 'pescatarian',
    'tempeh', 'seitan', 'jackfruit', 'halloumi',

    // ── Money / work ──
    'quiet quit', 'quietquit', 'quietquitting', 'bareminimum',
    'sidehustle', 'sidehustles', 'passiveincome',
    'layoff', 'layoffs', 'rif', 'RIFs', 'downsize', 'downsized',
    'rto', 'RTO', 'wfh', 'WFH', 'hybrid', 'remotework',
    'creator economy', 'creatoreconomy',

    // ── Gen Z / internet texting shortcuts ──
    'k', 'kk', 'kthx', 'kthxbye', 'thx', 'thnx', 'ty', 'tysm',
    'np', 'nps', 'yw', 'ily', 'ilysm', 'ik', 'idc', 'ic',
    'ofc', 'oml', 'omfg', 'omw', 'ppl', 'pls', 'plz', 'plzz',
    'rly', 'rlly', 'tbd', 'tbc', 'tba', 'tho', 'thru', 'til',
    'wyd', 'hbu', 'wbu', 'hru', 'idek', 'idky', 'idgi',
    'hmu', 'imu', 'fml', 'gg', 'ggs', 'ez', 'gl', 'glhf',
  ]
  for (const w of modernWords) spell.add(w)

  // Add British English spellings so they're not flagged as misspelled
  const britishWords = [
    'colour', 'colours', 'coloured', 'colouring', 'colourful',
    'favour', 'favours', 'favourite', 'favourites', 'favoured',
    'honour', 'honours', 'honoured', 'honouring', 'honourable',
    'labour', 'labours', 'laboured', 'labouring',
    'neighbour', 'neighbours', 'neighbourhood', 'neighbouring',
    'behaviour', 'behaviours', 'behavioural',
    'humour', 'humours', 'humoured', 'humorous',
    'rumour', 'rumours', 'rumoured',
    'savour', 'savours', 'savoury',
    'vapour', 'vapours',
    'centre', 'centres', 'centred',
    'metre', 'metres', 'litre', 'litres',
    'theatre', 'theatres', 'fibre', 'fibres',
    'analyse', 'analysed', 'analysing', 'analyses',
    'organise', 'organised', 'organising', 'organisation',
    'realise', 'realised', 'realising',
    'recognise', 'recognised', 'recognising',
    'specialise', 'specialised', 'specialising',
    'apologise', 'apologised', 'apologising',
    'criticise', 'criticised', 'criticising',
    'minimise', 'maximise', 'optimise', 'prioritise', 'summarise', 'customise',
    'licence', 'defence', 'offence', 'practise', 'pretence',
    'catalogue', 'dialogue', 'prologue',
    'cheque', 'cheques', 'grey', 'tyre', 'tyres',
    'programme', 'programmes', 'judgement', 'acknowledgement',
    'ageing', 'aeroplane', 'aluminium', 'jewellery',
    'maths', 'plough', 'sceptical', 'sceptic',
    'whilst', 'amongst', 'towards', 'forwards', 'backwards', 'afterwards',
    'learnt', 'spelt', 'dreamt', 'burnt', 'leapt', 'smelt',
  ]
  for (const w of britishWords) spell.add(w)

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
  // Always flag known "missing apostrophe" contractions (dont, cant, wont, etc.)
  // even if the base dictionary happens to accept them — the right form is the
  // apostrophed one, and we want the suggestion to surface on right-click.
  if (CONTRACTION_MAP[word.toLowerCase()]) return false
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

  // ── British → American English ──
  colour: "color", colours: "colors", coloured: "colored", colouring: "coloring",
  favour: "favor", favours: "favors", favourite: "favorite", favourites: "favorites",
  honour: "honor", honours: "honors", honoured: "honored", honouring: "honoring",
  labour: "labor", labours: "labors", laboured: "labored", labouring: "laboring",
  neighbour: "neighbor", neighbours: "neighbors", neighbourhood: "neighborhood",
  behaviour: "behavior", behaviours: "behaviors",
  humour: "humor", humours: "humors", humoured: "humored",
  rumour: "rumor", rumours: "rumors",
  savour: "savor", savours: "savors",
  vapour: "vapor", vapours: "vapors",
  centre: "center", centres: "centers",
  metre: "meter", metres: "meters",
  litre: "liter", litres: "liters",
  theatre: "theater", theatres: "theaters",
  fibre: "fiber", fibres: "fibers",
  analyse: "analyze", analysed: "analyzed", analysing: "analyzing",
  organise: "organize", organised: "organized", organising: "organizing",
  realise: "realize", realised: "realized", realising: "realizing",
  recognise: "recognize", recognised: "recognized", recognising: "recognizing",
  specialise: "specialize", specialised: "specialized",
  apologise: "apologize", apologised: "apologized",
  criticise: "criticize", criticised: "criticized",
  minimise: "minimize", maximise: "maximize",
  optimise: "optimize", prioritise: "prioritize",
  summarise: "summarize", customise: "customize",
  licence: "license", defence: "defense", offence: "offense",
  practise: "practice", pretence: "pretense",
  catalogue: "catalog", dialogue: "dialog", prologue: "prolog",
  cheque: "check", grey: "gray", tyre: "tire", tyres: "tires",
  programme: "program", programmes: "programs",
  judgement: "judgment", acknowledgement: "acknowledgment",
  ageing: "aging", aeroplane: "airplane",
  aluminium: "aluminum", jewellery: "jewelry",
  maths: "math", plough: "plow",
  sceptical: "skeptical", sceptic: "skeptic",
  whilst: "while", amongst: "among", towards: "toward",
  learnt: "learned", spelt: "spelled", dreamt: "dreamed",
  burnt: "burned", leapt: "leaped", smelt: "smelled",

  // ── Extra missing-apostrophe contractions (extended) ──
  howve: "how've", howdve: "how'd've",
  whatve: "what've", whodve: "who'd've",
  itdve: "it'd've", thatdve: "that'd've", theredve: "there'd've",
  yallre: "y'all're", yallve: "y'all've", yalld: "y'all'd",
  yalldve: "y'all'd've",
  mustntve: "mustn't've", mightntve: "mightn't've",

  // ── Run-together compounds ──
  alot: "a lot", aswell: "as well", atleast: "at least",
  everytime: "every time", eachother: "each other",
  infact: "in fact", inorder: "in order", inspite: "in spite",
  ofcourse: "of course", ontop: "on top",
  alltogether: "altogether", anyways: "anyway",
  thankyou: "thank you", thanku: "thank you",
  eventhough: "even though",

  // ── Extended misspellings ──
  mischevious: "mischievous", mischevous: "mischievous",
  pronounciation: "pronunciation", prespective: "perspective",
  rememeber: "remember", remmember: "remember",
  thiers: "theirs", thiere: "there",
  expresso: "espresso", sherbert: "sherbet",
  heighth: "height",
  irregardless: "regardless", supposably: "supposedly",

  // ── Doubled-letter errors ──
  begining: "beginning", commited: "committed", commiting: "committing",
  occuring: "occurring",
  preffer: "prefer", prefered: "preferred", prefering: "preferring",
  refering: "referring",
  stoped: "stopped", stoping: "stopping",
  plannig: "planning", planed: "planned",
  forgeting: "forgetting", runing: "running", swiming: "swimming",
  geting: "getting", puting: "putting", seting: "setting",
  biger: "bigger", hoter: "hotter", fater: "fatter",

  // ── "ie/ei" errors ──
  recieving: "receiving", recieved: "received", reciept: "receipt",
  acheived: "achieved", acheiving: "achieving", acheivement: "achievement",
  beleived: "believed", beleiving: "believing", beleiver: "believer",
  freind: "friend", freinds: "friends", freindly: "friendly",
  peice: "piece", peices: "pieces",
  niether: "neither", wierder: "weirder",
  cieling: "ceiling", peirce: "pierce",
  decieve: "deceive", concieve: "conceive", percieve: "perceive",
  releif: "relief", beleif: "belief",

  // ── Tech / modern typos ──
  jaascript: "javascript", javscript: "javascript",
  tyepscript: "typescript", tyescript: "typescript",
  postgressql: "PostgreSQL", postgress: "Postgres",
  kubernets: "Kubernetes", kubenetes: "Kubernetes",
  dokcer: "Docker", dcoker: "Docker",
  vercell: "Vercel", verecel: "Vercel",

  // ── Modern shorthand → full word ──
  omw: "on my way", brb: "be right back",
  ttyl: "talk to you later", gtg: "got to go",
  tmrw: "tomorrow", tmrrw: "tomorrow", tmw: "tomorrow",
  ystdy: "yesterday", yday: "yesterday",
  msg: "message", msgs: "messages", convo: "conversation",
  smtg: "something", smth: "something", smn: "someone",
  probs: "probably", probly: "probably", probabaly: "probably",
  defo: "definitely", deffo: "definitely",
  actully: "actually", actaully: "actually",
  nvr: "never",
  becuz: "because", bcoz: "because", bcz: "because", bcuz: "because",
  altho: "although", altough: "although",

  // ── Hyphenated compounds commonly run-together ──
  longterm: "long-term", shortterm: "short-term",
  wellknown: "well-known", uptodate: "up-to-date",
  followup: "follow-up", checkin: "check-in",
  realtime: "real-time", fulltime: "full-time", parttime: "part-time",

  // ── Number/letter confusions ──
  fisrt: "first", frist: "first",
  secondry: "secondary", thrid: "third", thrity: "thirty",
  nineth: "ninth", twelth: "twelfth",
  foward: "forward", towrds: "towards",
  fourtteen: "fourteen",

  // ── Dropped-g verbs (informal) ──
  everythin: "everything", somethin: "something", nothin: "nothing",
  anythin: "anything",
  workin: "working", goin: "going", comin: "coming",
  doin: "doing", sayin: "saying", lookin: "looking",
  makin: "making", takin: "taking",
  runnin: "running", sittin: "sitting", standin: "standing",
  eatin: "eating", drinkin: "drinking", sleepin: "sleeping",
  talkin: "talking", walkin: "walking", playin: "playing",
  thinkin: "thinking",

  // ── Extra informal forms ──
  ure: "you're", youres: "yours",
  itsself: "itself",
}

/** Returns up to 5 suggestions, or null if dict not loaded yet */
export function suggestSync(word: string): string[] | null {
  if (!spell) return null

  // Check for contraction match first — these are the most intuitive fixes
  const lower = word.toLowerCase()
  const contraction = CONTRACTION_MAP[lower]

  const suggestions = spell.suggest(word)
  const base = suggestions.length ? suggestions : spell.suggest(lower)

  // Always promote the contraction to the front of the suggestion list —
  // if nspell already includes it but ranks it beyond the top 5, slice(0,5)
  // would drop it (the exact bug behind "dont" never showing "don't").
  if (contraction) {
    return [contraction, ...base.filter(s => s !== contraction)].slice(0, 5)
  }
  return base.slice(0, 5)
}
