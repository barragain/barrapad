import type { AppearanceSettings } from '@/types'

// Appearance settings shared by the app and the public share page, saved per
// browser in `barrapad_appearance`.

export const DEFAULT_APPEARANCE: AppearanceSettings = { mode: 'light', font: 'mono', zoom: 16, theme: 'barrapad' }

// Only these themes have a dark version. The others carry their own colors,
// so light, dark and system do nothing for them.
export const themeHasModes = (theme: AppearanceSettings['theme']) => theme === 'barrapad' || theme === 'default'

const FONTS: AppearanceSettings['font'][] = ['mono', 'sans', 'serif']

export function loadAppearance(): AppearanceSettings {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = localStorage.getItem('barrapad_appearance')
    if (raw) {
      const s = { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) } as AppearanceSettings
      // Comic was removed; anyone who had it gets the default font.
      if (!FONTS.includes(s.font)) s.font = DEFAULT_APPEARANCE.font
      return s
    }
  } catch {}
  return DEFAULT_APPEARANCE
}

export function applyAppearance(s: AppearanceSettings) {
  const root = document.documentElement
  root.setAttribute('data-theme', s.theme)
  root.setAttribute('data-font', s.font)
  const dark = themeHasModes(s.theme) && (s.mode === 'dark' || (s.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches))
  root.classList.toggle('dark', dark)
  root.style.setProperty('--editor-size', `${s.zoom}px`)
}
