'use client'

import { useState, useEffect } from 'react'
import { Lock, ArrowLeft, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'

interface Props {
  noteId: string
  onBack: () => void
}

export default function AccessDeniedView({ noteId, onBack }: Props) {
  const [noteTitle, setNoteTitle] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'has_pending' | 'accepted' | 'denied'>('loading')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [resolvedByName, setResolvedByName] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Check access status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/notes/${noteId}/access`)
        if (!res.ok) {
          setStatus('idle')
          return
        }
        const data = await res.json() as {
          access: boolean
          noteTitle: string
          pendingRequest?: { id: string; status: string; resolvedByName?: string }
        }
        setNoteTitle(data.noteTitle)
        if (data.pendingRequest) {
          setRequestId(data.pendingRequest.id)
          if (data.pendingRequest.status === 'pending') {
            setStatus('has_pending')
          } else if (data.pendingRequest.status === 'accepted') {
            setStatus('accepted')
            setResolvedByName(data.pendingRequest.resolvedByName ?? null)
          } else if (data.pendingRequest.status === 'denied') {
            setStatus('denied')
            setResolvedByName(data.pendingRequest.resolvedByName ?? null)
          }
        } else {
          setStatus('idle')
        }
      } catch {
        setStatus('idle')
      }
    })()
  }, [noteId])

  const handleRequestAccess = async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      })
      if (res.ok) {
        const data = await res.json() as { id: string }
        setRequestId(data.id)
        setStatus('sent')
      } else {
        setStatus('idle')
      }
    } catch {
      setStatus('idle')
    }
  }

  const handleCancel = async () => {
    if (!requestId) return
    setCancelling(true)
    try {
      await fetch(`/api/access-requests/${requestId}`, { method: 'DELETE' })
      setRequestId(null)
      setStatus('idle')
    } catch {}
    setCancelling(false)
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--editor-bg)',
      gap: 12,
      textAlign: 'center',
      padding: '0 2rem',
    }}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 360 }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(212, 85, 10, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={24} style={{ color: '#D4550A' }} />
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          You don't have access
        </h2>
        {noteTitle && (
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
            "{noteTitle}"
          </p>
        )}
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          This note is private. You can request access from the owner.
        </p>

        {/* Action area */}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {status === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Loading...
            </div>
          )}

          {status === 'idle' && (
            <button
              onClick={handleRequestAccess}
              style={{
                fontSize: 14, fontWeight: 600,
                padding: '10px 24px', borderRadius: 10,
                background: '#D4550A', color: '#fff',
                border: 'none', cursor: 'pointer',
              }}
            >
              Request Access
            </button>
          )}

          {(status === 'sent' || status === 'has_pending') && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#f59e0b', fontWeight: 500 }}>
                <CheckCircle size={14} /> Request sent
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                The owner and editors have been notified.
              </p>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{
                  fontSize: 12, fontWeight: 500,
                  padding: '6px 16px', borderRadius: 8,
                  background: 'transparent', color: '#ef4444',
                  border: '1px solid var(--border)', cursor: 'pointer',
                  opacity: cancelling ? 0.5 : 1,
                }}
              >
                {cancelling ? 'Cancelling...' : 'Cancel request'}
              </button>
            </>
          )}

          {status === 'accepted' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#22c55e', fontWeight: 500 }}>
              <CheckCircle size={14} /> Access granted{resolvedByName ? ` by ${resolvedByName}` : ''}
            </div>
          )}

          {status === 'denied' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#ef4444', fontWeight: 500 }}>
                <XCircle size={14} /> Access denied{resolvedByName ? ` by ${resolvedByName}` : ''}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onBack}
          style={{
            marginTop: 12, fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 4,
            color: '#D4550A', background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <ArrowLeft size={13} /> Back to my notes
        </button>
      </motion.div>
    </div>
  )
}
