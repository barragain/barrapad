'use client'

import dynamic from 'next/dynamic'
import type { Note, Tag } from '@/types'

const Editor = dynamic(() => import('./Editor'), { ssr: false })

interface EditorWrapperProps {
  note: Note
  allTags: Tag[]
  serverFetchVersion: number
  onLocalChange: (title: string, content: string) => void
  onAutoSave: (title: string, content: string) => void
  onManualSave: (title: string, content: string) => void
  onTagsChange: (tags: Tag[]) => void
  onNoteDeleted?: (noteId: string) => void
  onNoteMentionClick?: (noteId: string) => void
}

export default function EditorWrapper(props: EditorWrapperProps) {
  return <Editor {...props} />
}
