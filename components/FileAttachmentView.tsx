'use client'

import { useState, useRef, useEffect } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { FileText, Archive, File, Mic, Play, Pause, Download, Pencil } from 'lucide-react'

function makeDragGhost(label: string): HTMLElement {
  const el = document.createElement('div')
  el.textContent = label.length > 28 ? label.slice(0, 28) + '…' : label
  el.style.cssText = [
    // Must be in viewport for offsetHeight to compute and setDragImage to work
    'position:fixed', 'top:0', 'left:-9999px',
    'background:#D4550A', 'color:white',
    'font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'padding:5px 10px', 'border-radius:99px',
    'white-space:nowrap', 'pointer-events:none',
    'box-shadow:0 2px 8px rgba(212,85,10,0.35)',
  ].join(';')
  document.body.appendChild(el)
  return el
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function getIcon(mimeType: string) {
  if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
    return <FileText size={20} className="text-[#D4550A] flex-shrink-0" />
  }
  if (
    mimeType.includes('zip') ||
    mimeType.includes('compressed') ||
    mimeType.includes('tar') ||
    mimeType.includes('gzip') ||
    mimeType.includes('rar') ||
    mimeType.includes('7z')
  ) {
    return <Archive size={20} className="text-[#6b6b6b] flex-shrink-0" />
  }
  return <File size={20} className="text-[#6b6b6b] flex-shrink-0" />
}

function InlineNameEditor({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) onRename(trimmed)
    else setDraft(name)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(name); setEditing(false) }
        }}
        autoFocus
        style={{
          fontSize: 13, fontWeight: 500, color: 'var(--ink)',
          border: '1px solid #D4550A', borderRadius: 4,
          padding: '1px 4px', outline: 'none', width: '100%',
          background: 'var(--editor-bg)',
        }}
      />
    )
  }

  return (
    <span
      onDoubleClick={() => { setDraft(name); setEditing(true) }}
      title="Double-click to rename"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        cursor: 'text', overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: 13, fontWeight: 500, color: 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      <Pencil size={10} style={{ color: 'var(--muted)', flexShrink: 0, opacity: 0.5 }} />
    </span>
  )
}

function AudioPlayer({ name, size, dataUrl, onRename, selected }: { name: string; size: number; dataUrl: string; onRename: (n: string) => void; selected?: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 14px',
        background: 'var(--editor-bg)',
        border: selected ? '1px solid #D4550A' : '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: selected ? '0 0 0 3px rgba(212,85,10,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
        minWidth: 260,
        maxWidth: 340,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <audio
        ref={audioRef}
        src={dataUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0) }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />

      {/* Header row */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: '#FFF0EB', border: '1px solid #F5D5C8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Mic size={14} style={{ color: '#D4550A' }} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <InlineNameEditor name={name} onRename={onRename} />
          <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {formatSize(size)}
          </span>
        </span>
        <button
          onClick={handleDownload}
          title="Download"
          style={{
            flexShrink: 0, padding: '4px', borderRadius: 6, border: 'none',
            background: 'transparent', cursor: 'pointer', color: 'var(--muted)',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#D4550A')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)')}
        >
          <Download size={13} />
        </button>
      </span>

      {/* Player row */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={togglePlay}
          style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: '#D4550A', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#c04009')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#D4550A')}
        >
          {playing
            ? <Pause size={13} style={{ color: 'white' }} />
            : <Play size={13} style={{ color: 'white', marginLeft: 1 }} />
          }
        </button>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => {
            const t = Number(e.target.value)
            setCurrentTime(t)
            if (audioRef.current) audioRef.current.currentTime = t
          }}
          style={{ flex: 1, accentColor: '#D4550A', height: 3, cursor: 'pointer' }}
        />
        <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </span>
    </span>
  )
}

export default function FileAttachmentView({ node, updateAttributes, selected }: NodeViewProps) {
  const { name, size, mimeType, dataUrl, align } = node.attrs as {
    name: string
    size: number
    mimeType: string
    dataUrl: string
    align: 'left' | 'center' | 'right'
  }

  const isAudio = mimeType.startsWith('audio/')
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Apply alignment margins on the OUTER TipTap wrapper (the one with fit-content).
  // No dependency array — must run on every render because drag/drop recreates
  // the parent element without changing `align`, so [align]-only would miss it.
  useEffect(() => {
    const outer = wrapperRef.current?.parentElement
    if (!outer) return
    outer.style.marginLeft = align === 'right' || align === 'center' ? 'auto' : ''
    outer.style.marginRight = align === 'center' ? 'auto' : ''
  })

  // Custom drag ghost + drag animations
  useEffect(() => {
    const onStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      const nodeEl = target?.closest<HTMLElement>('[data-file-attachment-view]')
      if (!nodeEl) return
      const fileName = nodeEl.dataset.fileName ?? 'File'
      const ghost = makeDragGhost(fileName)
      e.dataTransfer?.setDragImage(ghost, 0, Math.max(ghost.offsetHeight / 2, 8))
      setTimeout(() => ghost.remove(), 0)
      nodeEl.classList.add('barrapad-dragging')
    }
    const onEnd = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      const nodeEl = target?.closest<HTMLElement>('[data-file-attachment-view]')
      if (!nodeEl) return
      nodeEl.classList.remove('barrapad-dragging')
      nodeEl.classList.add('barrapad-dropped')
      nodeEl.addEventListener('animationend', () => nodeEl.classList.remove('barrapad-dropped'), { once: true })
    }
    document.addEventListener('dragstart', onStart)
    document.addEventListener('dragend', onEnd)
    return () => {
      document.removeEventListener('dragstart', onStart)
      document.removeEventListener('dragend', onEnd)
    }
  }, [])

  const handleRename = (newName: string) => updateAttributes({ name: newName })

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapperRef}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...({ 'data-drag-handle': true, 'data-file-attachment-view': true, 'data-file-name': name } as any)}
      contentEditable={false}
      style={{
        display: 'flex',
        alignItems: 'center',
        margin: '4px 0',
        cursor: 'grab',
        width: 'fit-content',
        maxWidth: '100%',
      }}
    >
      {isAudio ? (
        <AudioPlayer name={name} size={size} dataUrl={dataUrl} onRename={handleRename} selected={selected} />
      ) : (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 14px',
            background: 'var(--editor-bg)',
            border: selected ? '1px solid #D4550A' : '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: selected ? '0 0 0 3px rgba(212,85,10,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
            maxWidth: '320px',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          {getIcon(mimeType)}
          <span style={{ flex: 1, minWidth: 0 }}>
            <InlineNameEditor name={name} onRename={handleRename} />
            <span style={{ display: 'block', fontSize: '11px', color: '#9b9b9b', marginTop: '1px' }}>
              {formatSize(size)}
            </span>
          </span>
          <button
            onClick={handleDownload}
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#D4550A',
              background: '#FFF6F2',
              border: '1px solid #F5D5C8',
              borderRadius: '6px',
              padding: '3px 8px',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 150ms ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = '#FFE8DF'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = '#FFF6F2'
            }}
          >
            Download
          </button>
        </span>
      )}
    </NodeViewWrapper>
  )
}
