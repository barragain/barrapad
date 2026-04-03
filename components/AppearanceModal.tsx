'use client'

import { X, Plus, Minus, RotateCcw } from 'lucide-react'
import type { AppearanceSettings } from '@/types'

interface AppearanceModalProps {
  settings: AppearanceSettings
  onChange: (settings: AppearanceSettings) => void
  onClose: () => void
}

const ZOOM_OPTIONS = [12, 14, 16, 18, 20, 24]

const THEMES: Array<{
  id: AppearanceSettings['theme']
  label: string
  sidebar: string
  editor: string
  accent: string
}> = [
  { id: 'default', label: 'Default', sidebar: '#F5F2ED', editor: '#ffffff', accent: '#3b82f6' },
  { id: 'calm', label: 'Calm', sidebar: '#EDE8E0', editor: '#F5F0E8', accent: '#9B7D5E' },
  { id: 'synthwave', label: 'Synthwave', sidebar: '#12122a', editor: '#1a1a2e', accent: '#a855f7' },
  { id: 'earth', label: 'Earth', sidebar: '#8b9e7e', editor: '#c8d4c0', accent: '#7a6450' },
  { id: 'barrapad', label: 'barraPAD', sidebar: '#F5F2ED', editor: '#ffffff', accent: '#D4550A' },
  { id: 'midnight', label: 'Midnight', sidebar: '#0d1b2e', editor: '#0a1628', accent: '#a0aec0' },
]

const FONTS: Array<{ id: AppearanceSettings['font']; label: string; preview: string; style: string }> = [
  { id: 'sans', label: 'Sans', preview: 'Ag', style: '-apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'serif', label: 'Serif', preview: 'Ag', style: 'Georgia, serif' },
  { id: 'mono', label: 'Mono', preview: 'Ag', style: "'DM Mono', monospace" },
  { id: 'comic', label: 'Comic', preview: 'Ag', style: "'Comic Sans MS', cursive" },
]

export default function AppearanceModal({ settings, onChange, onClose }: AppearanceModalProps) {
  const update = (partial: Partial<AppearanceSettings>) => onChange({ ...settings, ...partial })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E0D8]">
          <h2 className="font-semibold text-[#1A1A1A]">Appearance</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Mode */}
          <div>
            <label className="text-xs font-medium text-[#C4BFB6] uppercase tracking-wider mb-2 block">Mode</label>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => update({ mode: m })}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-colors capitalize ${
                    settings.mode === m
                      ? 'border-[#D4550A] bg-[#D4550A]/10 text-[#D4550A]'
                      : 'border-[#E5E0D8] hover:bg-[#F5F2ED] text-[#1A1A1A]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Font */}
          <div>
            <label className="text-xs font-medium text-[#C4BFB6] uppercase tracking-wider mb-2 block">Font</label>
            <div className="flex gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => update({ font: f.id })}
                  className={`flex-1 py-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                    settings.font === f.id
                      ? 'border-[#D4550A] bg-[#D4550A]/10'
                      : 'border-[#E5E0D8] hover:bg-[#F5F2ED]'
                  }`}
                >
                  <span style={{ fontFamily: f.style }} className="text-lg font-semibold text-[#1A1A1A]">
                    {f.preview}
                  </span>
                  <span className="text-xs text-[#C4BFB6]">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Zoom */}
          <div>
            <label className="text-xs font-medium text-[#C4BFB6] uppercase tracking-wider mb-2 block">Zoom</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const idx = ZOOM_OPTIONS.indexOf(settings.zoom)
                  if (idx > 0) update({ zoom: ZOOM_OPTIONS[idx - 1] })
                }}
                className="p-1.5 rounded border border-[#E5E0D8] hover:bg-[#F5F2ED] transition-colors"
              >
                <Minus size={14} />
              </button>
              <select
                value={settings.zoom}
                onChange={(e) => update({ zoom: Number(e.target.value) })}
                className="flex-1 py-2 px-3 text-sm border border-[#E5E0D8] rounded-lg bg-white text-[#1A1A1A]"
              >
                {ZOOM_OPTIONS.map((z) => (
                  <option key={z} value={z}>{z}px</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const idx = ZOOM_OPTIONS.indexOf(settings.zoom)
                  if (idx < ZOOM_OPTIONS.length - 1) update({ zoom: ZOOM_OPTIONS[idx + 1] })
                }}
                className="p-1.5 rounded border border-[#E5E0D8] hover:bg-[#F5F2ED] transition-colors"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => update({ zoom: 16 })}
                className="p-1.5 rounded border border-[#E5E0D8] hover:bg-[#F5F2ED] transition-colors"
                title="Reset"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          {/* Themes */}
          <div>
            <label className="text-xs font-medium text-[#C4BFB6] uppercase tracking-wider mb-2 block">Theme</label>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => update({ theme: t.id })}
                  className={`rounded-lg border-2 overflow-hidden transition-all ${
                    settings.theme === t.id ? 'border-[#D4550A]' : 'border-transparent'
                  }`}
                >
                  {/* Mini preview */}
                  <div className="flex h-14">
                    <div className="w-8 flex-shrink-0" style={{ background: t.sidebar }} />
                    <div className="flex-1 p-2 flex flex-col gap-1" style={{ background: t.editor }}>
                      <div className="h-1.5 w-3/4 rounded-full" style={{ background: t.accent }} />
                      <div className="h-1 w-full rounded-full opacity-30" style={{ background: '#000' }} />
                      <div className="h-1 w-2/3 rounded-full opacity-20" style={{ background: '#000' }} />
                    </div>
                  </div>
                  <div
                    className="text-xs py-1 text-center font-medium"
                    style={{
                      background: settings.theme === t.id ? '#D4550A' : '#F5F2ED',
                      color: settings.theme === t.id ? '#fff' : '#1A1A1A',
                    }}
                  >
                    {t.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
