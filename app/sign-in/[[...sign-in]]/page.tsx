import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-[#F5F2ED]">
      <div className="flex flex-col items-center gap-3">
        <img src="/logo.svg" alt="barraPAD" style={{ height: 36, width: 'auto' }} />
        <p className="text-sm text-[#9b9b9b] max-w-xs text-center">
          A rich text notepad for whatever. Cloud sync, rich formatting, and more.
        </p>
      </div>
      <SignIn />
    </div>
  )
}
