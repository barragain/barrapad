import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'

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
      setFileAttachmentAlign: (align: 'left' | 'center' | 'right') => ReturnType
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
      align: { default: 'left' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-file-attachment]',
        getAttrs: (el) => {
          const div = el as HTMLDivElement
          return {
            name: div.getAttribute('data-name') ?? '',
            size: parseInt(div.getAttribute('data-size') ?? '0', 10),
            mimeType: div.getAttribute('data-mime-type') ?? 'application/octet-stream',
            dataUrl: div.getAttribute('data-url') ?? '',
            align: (div.getAttribute('data-align') as 'left' | 'center' | 'right') ?? 'left',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-file-attachment': '',
        'data-name': HTMLAttributes.name,
        'data-size': HTMLAttributes.size,
        'data-mime-type': HTMLAttributes.mimeType,
        'data-url': HTMLAttributes.dataUrl,
        ...(HTMLAttributes.align && HTMLAttributes.align !== 'left' ? { 'data-align': HTMLAttributes.align } : {}),
      }),
    ]
  },

  addNodeView() {
    // Dynamic import to avoid SSR issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: FileAttachmentView } = require('../components/FileAttachmentView')
    return ReactNodeViewRenderer(FileAttachmentView as Parameters<typeof ReactNodeViewRenderer>[0], {
      // fit-content keeps the wrapper tight around the attachment for clean drag ghosts,
      // while still being block-level so margin auto alignment works.
      attrs: { style: 'width: fit-content; max-width: 100%' },
    })
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
      setFileAttachmentAlign:
        (align: 'left' | 'center' | 'right') =>
        ({ tr, state, dispatch }) => {
          const { selection } = state
          if (selection instanceof NodeSelection && selection.node.type.name === 'fileAttachment') {
            if (dispatch) {
              tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, align })
              dispatch(tr)
            }
            return true
          }
          return false
        },
    }
  },
})
