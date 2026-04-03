import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sidebar: '#F5F2ED',
        accent: '#D4550A',
        border: '#E5E0D8',
        muted: '#C4BFB6',
        ink: '#1A1A1A',
      },
      fontFamily: {
        mono: ['DM Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
