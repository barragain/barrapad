import { Mark, mergeAttributes } from '@tiptap/core'

export interface GradientTextOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    gradientText: {
      setGradientText: (gradient: string) => ReturnType
      unsetGradientText: () => ReturnType
    }
  }
}

export const GradientText = Mark.create<GradientTextOptions>({
  name: 'gradientText',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      gradient: {
        default: null,
        parseHTML: (element) => element.style.backgroundImage || null,
        renderHTML: (attributes) => {
          if (!attributes.gradient) return {}
          return {
            style: `background-image: ${attributes.gradient as string}; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (node) => {
          const el = node as HTMLElement
          const style = el.style
          if (
            style.backgroundImage &&
            (style.webkitBackgroundClip === 'text' || style.backgroundClip === 'text')
          ) {
            return { gradient: style.backgroundImage }
          }
          return false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setGradientText:
        (gradient: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { gradient })
        },
      unsetGradientText:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})
