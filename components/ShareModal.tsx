'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Copy, Share2, Download, Link2, Trash2, RefreshCw, Search, UserPlus } from 'lucide-react'
import type { Note } from '@/types'

interface Collaborator {
  id: string
  userId: string
  username: string
  displayName: string
  permission: string
}

interface UserResult {
  id: string
  username: string
  displayName: string
  imageUrl: string
  email: string
}

interface ShareLink {
  id: string
  token: string
  permission: string
  createdAt: string
}

interface ShareModalProps {
  note: Note
  onClose: () => void
  onIsSharedChange?: (hasLinks: boolean) => void
}

export default function ShareModal({ note, onClose, onIsSharedChange }: ShareModalProps) {
  const [links, setLinks] = useState<{ READ: ShareLink | null; EDIT: ShareLink | null }>({ READ: null, EDIT: null })
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<'READ' | 'EDIT' | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [copied, setCopied] = useState<'READ' | 'EDIT' | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [activeQr, setActiveQr] = useState<'READ' | 'EDIT' | null>(null)

  // Collaborator state
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [collabQuery, setCollabQuery] = useState('')
  const [collabResults, setCollabResults] = useState<UserResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [invitePermission, setInvitePermission] = useState<'READ' | 'EDIT'>('READ')
  const [inviting, setInviting] = useState<string | null>(null)
  const [removingCollab, setRemovingCollab] = useState<string | null>(null)
  const [updatingPermission, setUpdatingPermission] = useState<string | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const shareUrl = (token: string) => `${origin}/s/${token}`

  // true when the current user accessed this note via a share link (not the owner)
  const isSharedView = !!note.sharedToken

  // Load existing share links
  const loadLinks = useCallback(async () => {
    try {
      const url = isSharedView
        ? `/api/share/${note.sharedToken}/links`
        : `/api/notes/${note.id}/share`
      const res = await fetch(url)
      if (!res.ok) return
      const data = (await res.json()) as ShareLink[]
      const read = data.find((l) => l.permission === 'READ') ?? null
      const edit = data.find((l) => l.permission === 'EDIT') ?? null
      setLinks({ READ: read, EDIT: edit })
    } finally {
      setLoading(false)
    }
  }, [note.id, note.sharedToken, isSharedView])

  useEffect(() => { loadLinks() }, [loadLinks])

  // Load collaborators (owner only)
  const loadCollaborators = useCallback(async () => {
    if (isSharedView) return
    try {
      const res = await fetch(`/api/notes/${note.id}/collaborators`)
      if (!res.ok) return
      setCollaborators((await res.json()) as Collaborator[])
    } catch {}
  }, [note.id, isSharedView])

  useEffect(() => { loadCollaborators() }, [loadCollaborators])

  // Debounced user search
  useEffect(() => {
    if (collabQuery.length < 2) { setCollabResults([]); return }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(collabQuery)}`)
        if (!res.ok) return
        const all = (await res.json()) as UserResult[]
        // Filter out already-invited users
        const invitedIds = new Set(collaborators.map((c) => c.userId))
        setCollabResults(all.filter((u) => !invitedIds.has(u.id)))
      } catch {} finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [collabQuery, collaborators])

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setCollabResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInvite = async (targetUserId: string) => {
    setInviting(targetUserId)
    try {
      const res = await fetch(`/api/notes/${note.id}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, permission: invitePermission }),
      })
      if (!res.ok) return
      const collab = (await res.json()) as Collaborator
      setCollaborators((prev) => {
        const without = prev.filter((c) => c.userId !== collab.userId)
        return [collab, ...without]
      })
      setCollabResults((prev) => prev.filter((u) => u.id !== targetUserId))
      setCollabQuery('')
    } finally {
      setInviting(null)
    }
  }

  const handleChangePermission = async (collabUserId: string, permission: 'READ' | 'EDIT') => {
    setUpdatingPermission(collabUserId)
    try {
      const res = await fetch(`/api/notes/${note.id}/collaborators/${collabUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission }),
      })
      if (!res.ok) return
      setCollaborators((prev) =>
        prev.map((c) => (c.userId === collabUserId ? { ...c, permission } : c))
      )
    } finally {
      setUpdatingPermission(null)
    }
  }

  const handleRemoveCollab = async (collabUserId: string) => {
    setRemovingCollab(collabUserId)
    try {
      await fetch(`/api/notes/${note.id}/collaborators/${collabUserId}`, { method: 'DELETE' })
      setCollaborators((prev) => prev.filter((c) => c.userId !== collabUserId))
    } finally {
      setRemovingCollab(null)
    }
  }

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
      setLinks((prev) => {
        const next = { ...prev, [permission]: link }
        onIsSharedChange?.(!!next.READ || !!next.EDIT)
        return next
      })
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
      setLinks((prev) => {
        const next = { ...prev, [permission]: null }
        onIsSharedChange?.(!!next.READ || !!next.EDIT)
        return next
      })
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
              {isSharedView && (
                <p className="text-xs text-[#8A8178] bg-[#F5F2ED] rounded-lg px-3 py-2">
                  You can share these links. Only the note owner can generate or revoke them.
                </p>
              )}

              {/* View-only link */}
              <LinkRow
                label="View only"
                description="Anyone with this link can read"
                permission="READ"
                link={links.READ}
                readOnly={isSharedView}
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
                readOnly={isSharedView}
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

              {/* Invite people — owner only */}
              {!isSharedView && (
                <>
                  <div className="border-t border-[#E5E0D8]" />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#1A1A1A]">Invite people</p>
                        <p className="text-xs text-[#C4BFB6]">Share directly with barraPAD users</p>
                      </div>
                      {/* Permission toggle */}
                      <div className="flex items-center border border-[#E5E0D8] rounded-lg overflow-hidden text-xs font-medium">
                        <button
                          onClick={() => setInvitePermission('READ')}
                          className="px-2.5 py-1 transition-colors"
                          style={invitePermission === 'READ'
                            ? { background: '#D4550A', color: '#fff' }
                            : { background: 'transparent', color: '#8A8178' }}
                        >
                          View
                        </button>
                        <button
                          onClick={() => setInvitePermission('EDIT')}
                          className="px-2.5 py-1 transition-colors"
                          style={invitePermission === 'EDIT'
                            ? { background: '#D4550A', color: '#fff' }
                            : { background: 'transparent', color: '#8A8178' }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    {/* Search input */}
                    <div className="relative" ref={searchRef}>
                      <div className="flex items-center gap-2 bg-[#F5F2ED] border border-[#E5E0D8] rounded-lg px-3 py-2 focus-within:border-[#D4550A] transition-colors">
                        {searchLoading
                          ? <div className="w-3 h-3 border border-[#C4BFB6] border-t-transparent rounded-full animate-spin shrink-0" />
                          : <Search size={12} className="text-[#C4BFB6] shrink-0" />
                        }
                        <input
                          type="text"
                          value={collabQuery}
                          onChange={(e) => setCollabQuery(e.target.value)}
                          placeholder="Search by name, username or email..."
                          className="flex-1 text-xs bg-transparent outline-none text-[#1A1A1A] min-w-0"
                        />
                        {collabQuery && (
                          <button onClick={() => { setCollabQuery(''); setCollabResults([]) }} className="text-[#C4BFB6] hover:text-[#1A1A1A]">
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      {/* Results dropdown */}
                      {collabResults.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-[#E5E0D8] rounded-xl shadow-lg overflow-hidden">
                          {collabResults.map((user) => (
                            <div key={user.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#F5F2ED] transition-colors">
                              {user.imageUrl ? (
                                <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-[#E5E0D8] shrink-0 flex items-center justify-center text-xs font-medium text-[#8A8178]">
                                  {(user.displayName || user.username || '?')[0].toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-[#1A1A1A] truncate">{user.displayName}</p>
                                <p className="text-[10px] text-[#C4BFB6] truncate">
                                  {user.username ? `@${user.username}` : user.email}
                                </p>
                              </div>
                              <button
                                onClick={() => handleInvite(user.id)}
                                disabled={inviting === user.id}
                                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#D4550A] text-white hover:bg-[#B84208] transition-colors disabled:opacity-60 shrink-0"
                              >
                                {inviting === user.id
                                  ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                                  : <><UserPlus size={11} /> Invite</>
                                }
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {collabQuery.length >= 2 && !searchLoading && collabResults.length === 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-[#E5E0D8] rounded-xl shadow-lg px-3 py-3">
                          <p className="text-xs text-[#C4BFB6] text-center">No users found</p>
                        </div>
                      )}
                    </div>

                    {/* Existing collaborators */}
                    {collaborators.length > 0 && (
                      <div className="space-y-1 pt-1">
                        {collaborators.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#F5F2ED]">
                            <div className="w-6 h-6 rounded-full bg-[#E5E0D8] shrink-0 flex items-center justify-center text-[10px] font-medium text-[#8A8178]">
                              {(c.displayName || c.username || '?')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-[#1A1A1A] truncate">{c.displayName || c.username || 'Unknown'}</p>
                              {c.username && <p className="text-[10px] text-[#C4BFB6]">@{c.username}</p>}
                            </div>
                            {/* Inline permission toggle */}
                            <div className="flex items-center border border-[#E5E0D8] rounded-md overflow-hidden text-[10px] font-semibold shrink-0">
                              {updatingPermission === c.userId ? (
                                <div className="px-2 py-1">
                                  <div className="w-3 h-3 border border-[#C4BFB6] border-t-transparent rounded-full animate-spin" />
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => c.permission !== 'READ' && handleChangePermission(c.userId, 'READ')}
                                    className="px-2 py-1 transition-colors"
                                    style={c.permission === 'READ'
                                      ? { background: '#D4550A', color: '#fff' }
                                      : { background: 'transparent', color: '#8A8178' }}
                                  >
                                    View
                                  </button>
                                  <button
                                    onClick={() => c.permission !== 'EDIT' && handleChangePermission(c.userId, 'EDIT')}
                                    className="px-2 py-1 transition-colors"
                                    style={c.permission === 'EDIT'
                                      ? { background: '#D4550A', color: '#fff' }
                                      : { background: 'transparent', color: '#8A8178' }}
                                  >
                                    Edit
                                  </button>
                                </>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveCollab(c.userId)}
                              disabled={removingCollab === c.userId}
                              title="Remove"
                              className="p-1 rounded hover:bg-red-50 text-[#C4BFB6] hover:text-red-500 transition-colors disabled:opacity-40"
                            >
                              {removingCollab === c.userId
                                ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                : <X size={12} />
                              }
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
  readOnly?: boolean
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
  label, description, link, readOnly, generating, revoking, copied,
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
        {!readOnly && !link && (
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
        )}
        {!readOnly && link && (
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
