'use client'

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { FileText, Archive, File, GripVertical } from 'lucide-react'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / 1024).toFixed(1)} KB`
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

export default function FileAttachmentView({ node }: NodeViewProps) {
  const { name, size, mimeType, dataUrl } = node.attrs as {
    name: string
    size: number
    mimeType: string
    dataUrl: string
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
    </NodeViewWrapper>
  )
}
