import { uploadImage } from './upload-image'

// Import a file as a new note. The file becomes HTML here, AppShell creates the
// note, and the editor of that note takes the HTML once it can be edited, so
// it saves and syncs like any other edit. Parsers load only when used.

export const IMPORT_ACCEPT = '.md,.markdown,.txt,.docx,.html,.htm'

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function fileToHtml(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  let html: string
  if (ext === 'docx') {
    const mammoth = await import('mammoth')
    html = (await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value
  } else if (ext === 'md' || ext === 'markdown') {
    const { marked } = await import('marked')
    html = await marked.parse(await file.text(), { gfm: true })
  } else if (ext === 'html' || ext === 'htm') {
    html = new DOMParser().parseFromString(await file.text(), 'text/html').body.innerHTML
  } else if (ext === 'txt') {
    html = (await file.text()).split(/\r?\n/).map((l) => `<p>${escape(l)}</p>`).join('')
  } else {
    throw new Error(`${file.name} can't be imported. Use a .md, .txt, .docx or .html file.`)
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Embedded images (docx always embeds them) go through the normal upload,
  // so the note holds a short URL instead of a huge data URL.
  await Promise.all([...doc.querySelectorAll('img')].map(async (img) => {
    const src = img.getAttribute('src') ?? ''
    if (!src.startsWith('data:')) return
    try {
      const blob = await (await fetch(src)).blob()
      img.setAttribute('src', await uploadImage(new File([blob], 'imported-image', { type: blob.type })))
    } catch { img.remove() }
  }))
  // The note title comes from the first line, so start with the file name
  // when the file has no heading of its own up top.
  const first = doc.body.firstElementChild
  if (!first || !/^H[1-3]$/.test(first.tagName)) {
    const h = doc.createElement('h1')
    h.textContent = file.name.replace(/\.[^.]+$/, '')
    doc.body.prepend(h)
  }
  return doc.body.innerHTML
}

let pending: { noteId: string; html: string } | null = null
export const setPendingImport = (noteId: string, html: string) => { pending = { noteId, html } }
export function takePendingImport(noteId: string): string | null {
  if (pending?.noteId !== noteId) return null
  const { html } = pending
  pending = null
  return html
}
