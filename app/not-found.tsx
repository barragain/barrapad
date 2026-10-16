import Link from 'next/link'

export const metadata = { title: 'Page not found | bpad' }

// Styled as a blank note: ruled lines, a margin rule, a blinking cursor.
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: '#F5F2ED',
        color: '#1A1A1A',
        fontFamily: "'DM Mono', monospace",
      }}
    >
      <style>{`
        @keyframes bpad-blink { 50% { opacity: 0 } }
        .bpad-404-cursor { animation: bpad-blink 1s steps(1) infinite }
        @media (prefers-reduced-motion: reduce) { .bpad-404-cursor { animation: none } }
      `}</style>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <Link href="/" aria-label="bpad home" style={{ display: 'inline-block', marginBottom: 20 }}>
          <img src="/logo.svg" alt="bpad" style={{ height: 28 }} />
        </Link>
        <div
          style={{
            position: 'relative',
            background: '#fff',
            border: '1px solid #E5E0D8',
            borderRadius: 14,
            padding: '28px 28px 32px 56px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -12px rgba(0,0,0,0.12)',
            backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #F0EBE3 31px, #F0EBE3 32px)',
            backgroundPosition: '0 20px',
          }}
        >
          <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 40, width: 1, background: '#D4550A33' }} />
          <p style={{ margin: 0, fontSize: 12, color: '#8A8178', lineHeight: '32px' }}>Untitled · 404</p>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500, lineHeight: '32px', letterSpacing: '-0.01em' }}>
            Nothing written here
            <span className="bpad-404-cursor" aria-hidden style={{ color: '#D4550A', marginLeft: 2 }}>|</span>
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#5C564F', lineHeight: '32px' }}>
            This page doesn&apos;t exist, or the link has a typo.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#5C564F', lineHeight: '32px' }}>
            Your notes are fine. They&apos;re one click away.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 8,
              background: '#1A1A1A',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Back to my notes
          </Link>
        </div>
      </div>
    </main>
  )
}
