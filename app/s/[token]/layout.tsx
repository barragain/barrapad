import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import '@/app/globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.bpad.cc'),
  title: 'barraPAD',
}

export default function SharedNoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
