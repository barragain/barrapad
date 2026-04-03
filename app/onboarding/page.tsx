'use client'

import { useState, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Camera, ArrowRight } from 'lucide-react'

export default function OnboardingPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<string | null>(user?.imageUrl ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!isLoaded) return null

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const handleContinue = async () => {
    if (!user) return
    setSaving(true)
    try {
      await user.update({ firstName: firstName.trim() })
      if (imageFile) {
        await user.setProfileImage({ file: imageFile })
      }
    } catch (e) {
      console.error(e)
    }
    router.push('/')
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
            What should we call you?
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

        {/* Continue */}
        <button
          onClick={handleContinue}
          disabled={saving || !firstName.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1A1A1A] text-white rounded-lg text-sm font-medium hover:bg-black/80 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Continue'}
          {!saving && <ArrowRight size={14} />}
        </button>

        <button
          onClick={() => router.push('/')}
          className="text-xs text-[#C4BFB6] hover:text-[#1A1A1A] transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
