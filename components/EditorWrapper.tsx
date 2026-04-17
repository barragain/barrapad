'use client'

import dynamic from 'next/dynamic'
import type { Note, Tag } from '@/types'

const Editor = dynamic(() => import('./Editor'), { ssr: false })

interface EditorWrapperProps {
  note: Note
  allTags: Tag[]
  serverFetchVersion: number
  onLocalChange: (noteId: string, title: string, content: string) => void
  onAutoSave: (noteId: string, title: string, content: string) => void
  onManualSave: (noteId: string, title: string, content: string) => void
  onTagsChange: (tags: Tag[]) => void
  onNoteDeleted?: (noteId: string) => void
  onNoteMentionClick?: (noteId: string) => void
  onRenameTag?: (oldLabel: string, newLabel: string, newColor: string) => void
  onDeleteTag?: (label: string) => void
}

export default function EditorWrapper(props: EditorWrapperProps) {
  return <Editor {...props} />
}
