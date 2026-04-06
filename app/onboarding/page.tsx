'use client'

import { useState, useRef, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Camera, ArrowRight } from 'lucide-react'

export default function OnboardingPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Populate fields once Clerk user is ready
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '')
      setUsername(user.username ?? '')
      setPreview(user.imageUrl ?? null)
    }
  }, [user])

  if (!isLoaded) return null

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const handleUsernameChange = (value: string) => {
    // Only allow lowercase letters, numbers, underscores, hyphens
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
    setUsername(sanitized)
    setUsernameError('')
  }

  const handleContinue = async () => {
    if (!user) return
    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      setUsernameError('Username is required')
      return
    }
    if (trimmedUsername.length < 3) {
      setUsernameError('Username must be at least 3 characters')
      return
    }
    setSaving(true)
    try {
      // All profile updates go through the backend to avoid Clerk's session step-up requirement
      const res = await fetch('/api/user/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, firstName: firstName.trim() || undefined }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        const msg = (data.error ?? '').toLowerCase()
        if (msg.includes('taken') || msg.includes('unique') || res.status === 409) {
          setUsernameError('That username is already taken')
        } else {
          setUsernameError(data.error ?? 'Failed to save username')
        }
        return
      }

      if (imageFile) {
        await user.setProfileImage({ file: imageFile })
      }
      router.push('/')
    } catch {
      setUsernameError('Something went wrong, please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F2ED]">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-8 flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="text-center">
          <span className="text-2xl font-bold text-[#D4550A] tracking-tight">barraPAD</span>
          <p className="text-sm text-[#C4BFB6] mt-1">Set up your profile</p>
        </div>

        {/* Avatar picker */}
        <div className="relative">
          <div
            className="w-20 h-20 rounded-full overflow-hidden bg-[#F5F2ED] border-2 border-[#E5E0D8] cursor-pointer flex items-center justify-center"
            onClick={() => fileRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <Camera size={24} className="text-[#C4BFB6]" />
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#D4550A] flex items-center justify-center shadow"
          >
            <Camera size={12} className="text-white" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>

        {/* Name field */}
        <div className="w-full">
          <label className="text-xs font-medium text-[#C4BFB6] uppercase tracking-wider block mb-1">
            Display name
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Your name or nickname..."
            className="w-full px-3 py-2 text-sm border border-[#E5E0D8] rounded-lg outline-none focus:border-[#D4550A] transition-colors text-[#1A1A1A]"
            autoFocus
          />
        </div>

        {/* Username field */}
        <div className="w-full">
          <label className="text-xs font-medium text-[#C4BFB6] uppercase tracking-wider block mb-1">
            Username <span className="text-[#D4550A]">*</span>
          </label>
          <div className="flex items-center border border-[#E5E0D8] rounded-lg overflow-hidden focus-within:border-[#D4550A] transition-colors">
            <span className="px-3 py-2 text-sm text-[#C4BFB6] bg-[#F5F2ED] border-r border-[#E5E0D8] select-none">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="your_username"
              maxLength={32}
              className="flex-1 px-3 py-2 text-sm outline-none bg-transparent text-[#1A1A1A]"
            />
          </div>
          {usernameError ? (
            <p className="text-xs text-red-500 mt-1">{usernameError}</p>
          ) : (
            <p className="text-xs text-[#C4BFB6] mt-1">Used when others search for you to share notes</p>
          )}
        </div>

        {/* Continue */}
        <button
          onClick={handleContinue}
          disabled={saving || !username.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1A1A1A] text-white rounded-lg text-sm font-medium hover:bg-black/80 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Continue'}
          {!saving && <ArrowRight size={14} />}
        </button>
      </div>
    </div>
  )
}
