import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'barraPAD - A notepad for whatever',
  description: 'A rich text notepad for whatever. Cloud sync, rich formatting, and more.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'barraPAD - A notepad for whatever',
    description: 'A rich text notepad for whatever. Cloud sync, rich formatting, and more.',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'barraPAD - A notepad for whatever',
    description: 'A rich text notepad for whatever. Cloud sync, rich formatting, and more.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
