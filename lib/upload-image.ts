/**
 * Upload an image file to Vercel Blob and return the public URL.
 * Falls back to a base64 data URL if the upload fails (offline, etc.).
 */
export async function uploadImage(file: File): Promise<string> {
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    if (res.ok) {
      const { url } = (await res.json()) as { url: string }
      return url
    }
  } catch {
    // Network error — fall back to data URL
  }
  // Fallback: convert to data URL so the image still works (just larger)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}
