import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'
import SharedNoteView from '@/components/SharedNoteView'

interface Props {
  params: { token: string }
}

async function getShareData(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { note: true },
  })
  if (!link || link.revokedAt) return null
  return link
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const link = await getShareData(params.token)
  if (!link) {
    return { title: 'Note not found — barraPAD' }
  }

  const title = link.note.title || 'Untitled'
  const snippet = stripHtml(link.note.content).slice(0, 200) || 'A note shared from barraPAD.'
  const fullTitle = `${title} — barraPAD`

  return {
    title: fullTitle,
    description: snippet,
    openGraph: {
      title: fullTitle,
      description: snippet,
      type: 'article',
      siteName: 'barraPAD',
    },
    twitter: {
      card: 'summary',
      title: fullTitle,
      description: snippet,
    },
  }
}

export default async function SharedNotePage({ params }: Props) {
  const link = await getShareData(params.token)
  if (!link) notFound()

  return (
    <SharedNoteView
      token={params.token}
      initialTitle={link.note.title}
      initialContent={link.note.content}
      permission={link.permission as 'READ' | 'EDIT'}
      updatedAt={link.note.updatedAt.toISOString()}
    />
  )
}
