'use client'

import dynamic from 'next/dynamic'
import type { Note } from '@/types'

const Editor = dynamic(() => import('./Editor'), { ssr: false })

interface EditorWrapperProps {
  note: Note
  onSave: (title: string, content: string) => void
  onWordCountChange: (words: number, chars: number) => void
}

export default function EditorWrapper(props: EditorWrapperProps) {
  return <Editor {...props} />
}
