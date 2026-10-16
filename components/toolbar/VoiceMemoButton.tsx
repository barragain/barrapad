'use client'

import { useState, useLayoutEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { Mic, Square } from 'lucide-react'
import { uploadFile } from '@/lib/upload-image'
import { TBtn } from './parts'

export function VoiceMemoButton({ editor, iconSize, isMobile }: { editor: Editor; iconSize: number; isMobile: boolean }) {
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const micBtnRef = useRef<HTMLDivElement>(null)
  const [pillPos, setPillPos] = useState<{ x: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (isRecording && micBtnRef.current) {
      const rect = micBtnRef.current.getBoundingClientRect()
      // Desktop: toolbar is at top → pill goes below the button
      // Mobile: toolbar is at bottom → pill goes above the button
      const top = isMobile ? rect.top - 32 : rect.bottom + 6
      setPillPos({ x: rect.left + rect.width / 2, top })
    } else {
      setPillPos(null)
    }
  }, [isRecording, isMobile])

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        const ext = recorder.mimeType.split('/')[1]?.split(';')[0] || 'webm'
        const name = `Voice memo ${new Date().toLocaleString()}.${ext}`
        uploadFile(blob, name).then((dataUrl) => {
          const sel = editor.state.selection
          if ('node' in sel && sel.node) editor.commands.setTextSelection(sel.to)
          editor.chain().focus().insertFileAttachment({
            name, size: blob.size, mimeType: recorder.mimeType, dataUrl,
          }).run()
        })
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch {
      // microphone permission denied or not available
    }
  }

  return (
    <div ref={micBtnRef}>
      <TBtn
        onClick={toggleRecording}
        active={isRecording}
        label={isRecording ? 'Stop recording' : 'Voice memo'}
      >
        {isRecording ? <Square size={iconSize} fill="currentColor" /> : <Mic size={iconSize} />}
      </TBtn>
      {isRecording && pillPos && (
        <span
          style={{
            position: 'fixed',
            top: pillPos.top,
            left: pillPos.x,
            transform: 'translateX(-50%)',
            background: '#D4550A',
            color: 'white',
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: 99,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(212,85,10,0.35)',
            zIndex: 9999,
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'white',
              animation: 'pulse 1.2s ease-in-out infinite',
            }}
          />
          Recording
        </span>
      )}
    </div>
  )
}
