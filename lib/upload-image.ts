/**
 * Upload a file (image, attachment, voice memo) to Vercel Blob and return the
 * public URL. Falls back to a base64 data URL if the upload fails (offline,
 * guest without an account, etc.).
 */
export async function uploadFile(file: Blob, name = (file as File).name ?? 'file'): Promise<string> {
  try {
    const form = new FormData()
    form.append('file', file, name)
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

export const uploadImage = uploadFile
