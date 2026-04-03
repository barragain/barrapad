import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

export interface FileAttachmentOptions {
  HTMLAttributes: Record<string, unknown>
}

export interface FileAttachmentAttrs {
  name: string
  size: number
  mimeType: string
  dataUrl: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileAttachment: {
      insertFileAttachment: (attrs: FileAttachmentAttrs) => ReturnType
    }
  }
}

export const FileAttachment = Node.create<FileAttachmentOptions>({
  name: 'fileAttachment',

  group: 'block',

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      name: { default: '' },
      size: { default: 0 },
      mimeType: { default: 'application/octet-stream' },
      dataUrl: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-file-attachment]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-file-attachment': '',
        'data-name': HTMLAttributes.name,
        'data-size': HTMLAttributes.size,
        'data-mime-type': HTMLAttributes.mimeType,
      }),
    ]
  },

  addNodeView() {
    // Dynamic import to avoid SSR issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: FileAttachmentView } = require('../components/FileAttachmentView')
    return ReactNodeViewRenderer(FileAttachmentView as Parameters<typeof ReactNodeViewRenderer>[0])
  },

  addCommands() {
    return {
      insertFileAttachment:
        (attrs: FileAttachmentAttrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
        },
    }
  },
})
