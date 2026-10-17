// bpad service worker: lets the installed app open without a network.
// Hashed build files (/_next/static) never change, so they are cache-first.
// Pages, icons and the Clerk script are network-first, with the last good
// copy kept for offline. API calls, realtime sockets and uploads are never
// cached. A cached page holds the account's notes like the localStorage cache
// does; signing out loads '/' again, which replaces it with the guest page.
// ponytail: signing out and going offline before that load keeps the old copy.
const PAGES = 'bpad-pages-v1'
const ASSETS = 'bpad-assets-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== PAGES && k !== ASSETS) await caches.delete(k)
    await self.clients.claim()
  })())
})

async function networkFirst(req, cacheName, key) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    // Navigations come back as opaque redirects (not ok) during Clerk's
    // handshake, so only real pages are kept.
    if (res.ok) cache.put(key, res.clone())
    return res
  } catch {
    // An unseen page falls back to the app at '/'.
    return (await cache.match(key)) ?? (cacheName === PAGES ? await cache.match('/') : undefined) ?? Response.error()
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const sameOrigin = url.origin === self.location.origin

  if (req.mode === 'navigate' && sameOrigin) {
    // One copy per path, so query strings don't pile up.
    e.respondWith(networkFirst(req, PAGES, url.pathname))
  } else if (sameOrigin && url.pathname.startsWith('/_next/static/')) {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) cache.put(req, res.clone())
      return res
    })())
  } else if ((sameOrigin && /\.(png|svg|ico|webmanifest)$/.test(url.pathname)) || url.pathname.includes('/npm/@clerk/')) {
    e.respondWith(networkFirst(req, ASSETS, req.url))
  }
})
