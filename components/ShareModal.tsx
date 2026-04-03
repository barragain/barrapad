'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Copy, Share2, Mail, Download } from 'lucide-react'
import type { Note } from '@/types'

interface ShareModalProps {
  note: Note
  onClose: () => void
}

export default function ShareModal({ note, onClose }: ShareModalProps) {
  const [allowEditing, setAllowEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const urlRef = useRef<HTMLInputElement>(null)
  const url = typeof window !== 'undefined' ? window.location.href : ''

  useEffect(() => {
    const generateQR = async () => {
      try {
        const QRCode = (await import('qrcode')).default
        const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 })
        setQrDataUrl(dataUrl)
      } catch (e) {
        console.error(e)
      }
    }
    generateQR()
  }, [url])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: note.title, url })
    }
  }

  const handleEmail = () => {
    window.open(`mailto:?subject=${encodeURIComponent(note.title)}&body=${encodeURIComponent(url)}`)
  }

  const handleDownloadQR = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = 'barrapad-qr.png'
    a.click()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E0D8]">
          <h2 className="font-semibold text-[#1A1A1A]">Share Note</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Allow editing toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#1A1A1A]">Allow Editing</span>
            <button
              onClick={() => setAllowEditing(!allowEditing)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                allowEditing ? 'bg-[#D4550A]' : 'bg-[#C4BFB6]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  allowEditing ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* URL input */}
          <div className="flex gap-2">
            <input
              ref={urlRef}
              type="text"
              readOnly
              value={url}
              onClick={() => urlRef.current?.select()}
              className="flex-1 text-xs bg-[#F5F2ED] border border-[#E5E0D8] rounded-lg px-3 py-2 text-[#1A1A1A] cursor-pointer"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2 border border-[#E5E0D8] rounded-lg hover:bg-[#F5F2ED] transition-colors"
            >
              <Copy size={14} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2 border border-[#E5E0D8] rounded-lg hover:bg-[#F5F2ED] transition-colors"
            >
              <Share2 size={14} />
              Share
            </button>
            <button
              onClick={handleEmail}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2 border border-[#E5E0D8] rounded-lg hover:bg-[#F5F2ED] transition-colors"
            >
              <Mail size={14} />
              Email
            </button>
          </div>

          {/* Caption */}
          <p className="text-xs text-[#C4BFB6]">
            {allowEditing
              ? 'Anyone with this link can view and edit this note.'
              : 'Anyone you share this link with can view only.'}
          </p>

          <hr className="border-[#E5E0D8]" />

          {/* QR code */}
          <div className="flex flex-col items-center gap-3">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code" className="rounded-lg border border-[#E5E0D8]" />
            ) : (
              <div className="w-[200px] h-[200px] bg-[#F5F2ED] rounded-lg animate-pulse" />
            )}
            <button
              onClick={handleDownloadQR}
              className="flex items-center gap-1.5 text-sm px-4 py-2 border border-[#E5E0D8] rounded-lg hover:bg-[#F5F2ED] transition-colors"
            >
              <Download size={14} />
              Download QR
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
