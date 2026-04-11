'use client'

import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setCommentMark: (commentId: string) => ReturnType
      unsetCommentMark: (commentId: string) => ReturnType
    }
  }
}

export const CommentMark = Mark.create({
  name: 'commentMark',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => {
          if (!attrs.commentId) return {}
          return { 'data-comment-id': attrs.commentId }
        },
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-comment-resolved') === 'true',
        renderHTML: (attrs) => {
          if (!attrs.resolved) return {}
          return { 'data-comment-resolved': 'true' }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const resolved = HTMLAttributes['data-comment-resolved'] === 'true'
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: resolved ? 'comment-highlight comment-resolved' : 'comment-highlight',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setCommentMark:
        (commentId: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { commentId, resolved: false })
        },
      unsetCommentMark:
        (commentId: string) =>
        ({ tr, state }) => {
          const { doc } = state
          doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                tr.removeMark(pos, pos + node.nodeSize, mark)
              }
            })
          })
          return true
        },
    }
  },
})
