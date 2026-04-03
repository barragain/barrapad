export default function SharedNotNotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      fontFamily: 'sans-serif',
      background: '#F9F7F4',
      color: '#1A1A1A',
    }}>
      <img src="/logo.svg" alt="barraPAD" style={{ height: 28, marginBottom: 8 }} />
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>This link is no longer active</h1>
      <p style={{ fontSize: 14, color: '#8A8178', margin: 0 }}>The note may have been deleted or the share link was revoked.</p>
      <a href="/" style={{ marginTop: 8, fontSize: 13, color: '#D4550A', textDecoration: 'none', fontWeight: 500 }}>
        Go to barraPAD →
      </a>
    </div>
  )
}
