'use client'

import { useState, useRef } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { FileText, Archive, File, GripVertical, Mic, Play, Pause, Download } from 'lucide-react'

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

function AudioPlayer({ name, size, dataUrl }: { name: string; size: number; dataUrl: string }) {
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
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        minWidth: 260,
        maxWidth: 340,
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
          <span
            style={{
              display: 'block', fontSize: 13, fontWeight: 500,
              color: 'var(--ink)', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={name}
          >
            {name}
          </span>
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

export default function FileAttachmentView({ node }: NodeViewProps) {
  const { name, size, mimeType, dataUrl } = node.attrs as {
    name: string
    size: number
    mimeType: string
    dataUrl: string
  }

  const isAudio = mimeType.startsWith('audio/')

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
      contentEditable={false}
      style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}
    >
      <div
        data-drag-handle
        style={{
          cursor: 'grab',
          color: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          padding: '2px',
        }}
      >
        <GripVertical size={16} />
      </div>

      {isAudio ? (
        <AudioPlayer name={name} size={size} dataUrl={dataUrl} />
      ) : (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 14px',
            background: 'var(--editor-bg)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            maxWidth: '320px',
          }}
        >
          {getIcon(mimeType)}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                color: '#1A1A1A',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '180px',
              }}
              title={name}
            >
              {name}
            </span>
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
