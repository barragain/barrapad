import type { MetadataRoute } from 'next'

// Lets phones install bpad to the home screen. No service worker: the app
// needs the network for sign-in and sync anyway (see docs/known-gaps.md).
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
