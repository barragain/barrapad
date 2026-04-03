declare module '*.css' {
  const content: string
  export default content
}

declare module 'html-docx-js/dist/html-docx' {
  const htmlDocx: {
    asBlob(html: string, options?: Record<string, unknown>): Blob
  }
  export default htmlDocx
}
