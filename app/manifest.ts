import type { MetadataRoute } from 'next'

// Lets phones install bpad to the home screen. public/sw.js makes the
// installed app open offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'bpad',
    short_name: 'bpad',
    description: 'A notepad for whatever.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3efe4',
    theme_color: '#f3efe4',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
