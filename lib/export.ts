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

export async function downloadPdf(title: string, html: string, editorEl?: HTMLElement | null) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  if (editorEl) {
    // Capture the editor exactly as rendered on screen
    const canvas = await html2canvas(editorEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })

    const imgW = pageW
    const totalImgH = (canvas.height / canvas.width) * imgW
    const pageCanvasH = (pageH / totalImgH) * canvas.height

    let srcY = 0
    let firstPage = true

    while (srcY < canvas.height) {
      if (!firstPage) doc.addPage()
      firstPage = false

      const sliceH = Math.min(pageCanvasH, canvas.height - srcY)
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceH
      const ctx = slice.getContext('2d')!
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH)

      const sliceImgH = (sliceH / canvas.height) * totalImgH
      doc.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, imgW, sliceImgH)
      srcY += sliceH
    }

    // Invisible text layer so the PDF is searchable/copyable
    const plainText = editorEl.innerText || stripHtml(html)
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255) // white — invisible on white bg
    const lines = doc.splitTextToSize(plainText, pageW - 20)
    // Spread text across pages roughly matching the visual layout
    const linesPerPage = Math.floor(pageH / 5)
    for (let i = 0; i < lines.length; i++) {
      const pageIndex = Math.floor(i / linesPerPage)
      const lineOnPage = i % linesPerPage
      if (pageIndex > 0 && lineOnPage === 0) {
        // already added pages above, just reference correct page
      }
      // jsPDF page indexing starts at 1
      const targetPage = pageIndex + 1
      if (targetPage <= doc.getNumberOfPages()) {
        doc.setPage(targetPage)
        doc.text(lines[i], 10, 10 + lineOnPage * 5, { renderingMode: 'invisible' })
      }
    }
  } else {
    // Fallback: plain text PDF
    const text = stripHtml(html)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    const margin = 18
    const lines = doc.splitTextToSize(text, pageW - margin * 2)
    const lineH = 6
    let y = margin
    for (const line of lines) {
      if (y + lineH > pageH - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin, y)
      y += lineH
    }
  }

  doc.save(`${title}.pdf`)
}

export async function downloadDocx(title: string, html: string) {
  // html-docx-js expects a full HTML document string
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`
  // Use the pre-built browser bundle — the main entry uses Node's 'fs' module
  const { default: htmlDocx } = await import('html-docx-js/dist/html-docx')
  const blob: Blob = htmlDocx.asBlob(fullHtml)
  triggerDownload(blob, `${title}.docx`)
}
