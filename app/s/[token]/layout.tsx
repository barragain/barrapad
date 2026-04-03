import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import '@/app/globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://barrapad.barragan.com.py'),
  title: 'barraPAD',
}

export default function SharedNoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
