function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function downloadTxt(title: string, html: string) {
  const text = stripHtml(html)
  triggerDownload(new Blob([text], { type: 'text/plain' }), `${title}.txt`)
}

export async function downloadMd(title: string, html: string) {
  const { default: TurndownService } = await import('turndown')
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })
  const markdown = td.turndown(html)
  triggerDownload(new Blob([markdown], { type: 'text/markdown' }), `${title}.md`)
}

export async function downloadPdf(title: string, html: string) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const text = stripHtml(html)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 18
  const lines = doc.splitTextToSize(text, pageWidth - margin * 2)
  const lineH = 6
  let y = margin
  for (const line of lines) {
    if (y + lineH > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      y = margin
    }
    doc.text(line, margin, y)
    y += lineH
  }
  doc.save(`${title}.pdf`)
}

export async function downloadDocx(title: string, html: string) {
  // html-docx-js expects a full HTML document string
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const htmlDocx = await import('html-docx-js') as any
  const convert = htmlDocx.default ?? htmlDocx
  const blob: Blob = convert.asBlob(fullHtml)
  triggerDownload(blob, `${title}.docx`)
}
