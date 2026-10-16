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
  // Fallback: convert to data URL so the image still works (just larger).
  // Images are shrunk first because the data URL lands in localStorage for guests.
  return toDataURL(await shrinkImage(file))
}

const toDataURL = (file: Blob) => new Promise<string>((resolve) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as string)
  reader.readAsDataURL(file)
})

const MAX_SIDE = 1600

/** Re-encode a raster image as WebP no larger than MAX_SIDE; keep the original if that isn't smaller. GIFs keep their animation. */
export async function shrinkImage(file: Blob): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp|bmp)$/.test(file.type)) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.82))
    return out && out.size < file.size ? out : file
  } catch {
    return file
  }
}

export const uploadImage = uploadFile
