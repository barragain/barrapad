'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'

export default function OnboardingModal() {
  const { user } = useUser()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !user) return
    setSaving(true)
    try {
      await user.update({ firstName: trimmed })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 200 }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5"
        style={{ background: 'var(--editor-bg, #fff)' }}
      >
        <div className="flex flex-col gap-1">
          <img src="/logo.svg" alt="barraPAD" style={{ height: 28, width: 'auto', marginBottom: 8 }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>Welcome! What's your name?</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            This is how you'll appear to collaborators in shared notes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            maxLength={40}
            className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--editor-bg)',
              color: 'var(--ink)',
            }}
          />
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: '#D4550A' }}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
