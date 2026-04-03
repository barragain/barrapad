'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Copy, Share2, Download, Link2, Trash2, RefreshCw } from 'lucide-react'
import type { Note } from '@/types'

interface ShareLink {
  id: string
  token: string
  permission: string
  createdAt: string
}

interface ShareModalProps {
  note: Note
  onClose: () => void
}

export default function ShareModal({ note, onClose }: ShareModalProps) {
  const [links, setLinks] = useState<{ READ: ShareLink | null; EDIT: ShareLink | null }>({ READ: null, EDIT: null })
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<'READ' | 'EDIT' | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [copied, setCopied] = useState<'READ' | 'EDIT' | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [activeQr, setActiveQr] = useState<'READ' | 'EDIT' | null>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const shareUrl = (token: string) => `${origin}/s/${token}`

  // Load existing share links
  const loadLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes/${note.id}/share`)
      if (!res.ok) return
      const data = (await res.json()) as ShareLink[]
      const read = data.find((l) => l.permission === 'READ') ?? null
      const edit = data.find((l) => l.permission === 'EDIT') ?? null
      setLinks({ READ: read, EDIT: edit })
    } finally {
      setLoading(false)
    }
  }, [note.id])

  useEffect(() => { loadLinks() }, [loadLinks])

  // Regenerate QR when active link changes
  useEffect(() => {
    if (!activeQr) { setQrDataUrl(''); return }
    const token = links[activeQr]?.token
    if (!token) { setQrDataUrl(''); return }
    const url = shareUrl(token)
    const generate = async () => {
      try {
        const QRCode = (await import('qrcode')).default
        const dataUrl = await QRCode.toDataURL(url, { width: 260, margin: 2 })
        setQrDataUrl(dataUrl)
      } catch {}
    }
    generate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, activeQr])

  const handleGenerate = async (permission: 'READ' | 'EDIT') => {
    setGenerating(permission)
    try {
      const res = await fetch(`/api/notes/${note.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission }),
      })
      if (!res.ok) return
      const link = (await res.json()) as ShareLink
      setLinks((prev) => ({ ...prev, [permission]: link }))
    } finally {
      setGenerating(null)
    }
  }

  const handleRevoke = async (permission: 'READ' | 'EDIT') => {
    const link = links[permission]
    if (!link) return
    setRevoking(link.token)
    try {
      await fetch(`/api/share/${link.token}`, { method: 'DELETE' })
      setLinks((prev) => ({ ...prev, [permission]: null }))
      if (activeQr === permission) setActiveQr(null)
    } finally {
      setRevoking(null)
    }
  }

  const handleCopy = async (permission: 'READ' | 'EDIT') => {
    const token = links[permission]?.token
    if (!token) return
    await navigator.clipboard.writeText(shareUrl(token))
    setCopied(permission)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleNativeShare = async (permission: 'READ' | 'EDIT') => {
    const token = links[permission]?.token
    if (!token) return
    const url = shareUrl(token)
    if (navigator.share) {
      await navigator.share({ title: note.title || 'Untitled', url })
    } else {
      handleCopy(permission)
    }
  }

  const handleDownloadQR = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `barrapad-${note.id}.png`
    a.click()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4"
        style={{ background: 'var(--editor-bg, #fff)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E0D8]">
          <div>
            <h2 className="font-semibold text-[#1A1A1A]">Share Note</h2>
            <p className="text-xs text-[#C4BFB6] mt-0.5 truncate max-w-[280px]">{note.title || 'Untitled'}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-[#D4550A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* View-only link */}
              <LinkRow
                label="View only"
                description="Anyone with this link can read"
                permission="READ"
                link={links.READ}
                generating={generating === 'READ'}
                revoking={revoking === links.READ?.token}
                copied={copied === 'READ'}
                isActiveQr={activeQr === 'READ'}
                onGenerate={() => handleGenerate('READ')}
                onRevoke={() => handleRevoke('READ')}
                onCopy={() => handleCopy('READ')}
                onShare={() => handleNativeShare('READ')}
                onSelectQr={() => { if (links.READ) setActiveQr((p) => p === 'READ' ? null : 'READ') }}
                shareUrl={links.READ ? shareUrl(links.READ.token) : ''}
              />

              <div className="border-t border-[#E5E0D8]" />

              {/* Edit link */}
              <LinkRow
                label="Can edit"
                description="Signed-in users can make changes"
                permission="EDIT"
                link={links.EDIT}
                generating={generating === 'EDIT'}
                revoking={revoking === links.EDIT?.token}
                copied={copied === 'EDIT'}
                isActiveQr={activeQr === 'EDIT'}
                onGenerate={() => handleGenerate('EDIT')}
                onRevoke={() => handleRevoke('EDIT')}
                onCopy={() => handleCopy('EDIT')}
                onShare={() => handleNativeShare('EDIT')}
                onSelectQr={() => { if (links.EDIT) setActiveQr((p) => p === 'EDIT' ? null : 'EDIT') }}
                shareUrl={links.EDIT ? shareUrl(links.EDIT.token) : ''}
              />

              {/* QR code — only shown when a link's URL bar is clicked */}
              {activeQr && links[activeQr] && (
                <>
                  <div className="border-t border-[#E5E0D8]" />
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-xs text-[#C4BFB6] self-start">
                      QR Code — {activeQr === 'READ' ? 'View only' : 'Can edit'}
                    </p>
                    <div className="bg-white border border-[#E5E0D8] rounded-xl p-4 flex items-center justify-center" style={{ width: 268, height: 268 }}>
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="QR code" style={{ width: 236, height: 236 }} />
                      ) : (
                        <div className="w-full h-full bg-[#F5F2ED] rounded-lg animate-pulse" />
                      )}
                    </div>
                    <button
                      onClick={handleDownloadQR}
                      disabled={!qrDataUrl}
                      className="flex items-center gap-1.5 text-sm px-4 py-2 border border-[#E5E0D8] rounded-lg hover:bg-[#F5F2ED] transition-colors disabled:opacity-40"
                    >
                      <Download size={14} />
                      Download QR
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface LinkRowProps {
  label: string
  description: string
  permission: 'READ' | 'EDIT'
  link: ShareLink | null
  generating: boolean
  revoking: boolean
  copied: boolean
  isActiveQr: boolean
  onGenerate: () => void
  onRevoke: () => void
  onCopy: () => void
  onShare: () => void
  onSelectQr: () => void
  shareUrl: string
}

function LinkRow({
  label, description, link, generating, revoking, copied,
  isActiveQr, onGenerate, onRevoke, onCopy, onShare, onSelectQr, shareUrl,
}: LinkRowProps) {
  const urlRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
          <p className="text-xs text-[#C4BFB6]">{description}</p>
        </div>
        {!link ? (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#D4550A] text-white hover:bg-[#B84208] transition-colors disabled:opacity-60"
          >
            {generating ? (
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Link2 size={12} />
            )}
            Generate link
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={onGenerate}
              disabled={generating}
              title="Regenerate link"
              className="p-1.5 rounded-lg hover:bg-black/5 text-[#8A8178] transition-colors disabled:opacity-40"
            >
              <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onRevoke}
              disabled={revoking}
              title="Revoke link"
              className="p-1.5 rounded-lg hover:bg-red-50 text-[#C4BFB6] hover:text-red-500 transition-colors disabled:opacity-40"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {link && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-[#F5F2ED] border border-[#E5E0D8] rounded-lg px-3 py-2">
            <input
              ref={urlRef}
              type="text"
              readOnly
              value={shareUrl}
              onClick={() => urlRef.current?.select()}
              className="flex-1 text-xs bg-transparent outline-none text-[#1A1A1A] cursor-text min-w-0"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCopy}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 border border-[#E5E0D8] rounded-lg hover:bg-[#F5F2ED] transition-colors font-medium"
            >
              <Copy size={12} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={onShare}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 border border-[#E5E0D8] rounded-lg hover:bg-[#F5F2ED] transition-colors font-medium"
            >
              <Share2 size={12} />
              Share
            </button>
            <button
              onClick={onSelectQr}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 border rounded-lg transition-colors font-medium"
              style={isActiveQr
                ? { background: '#D4550A1A', borderColor: '#D4550A', color: '#D4550A' }
                : { borderColor: '#E5E0D8', color: '#1A1A1A' }
              }
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
                <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/>
              </svg>
              QR
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
