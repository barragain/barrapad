/** Caret plus name label for remote carets (CollaborationCaret render). */
export function buildWidget(name: string, color: string): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = 'bpad-caret'
  wrap.style.cssText =
    'display:inline-block;position:relative;width:0;overflow:visible;pointer-events:none;vertical-align:text-bottom;'

  const caret = document.createElement('span')
  caret.style.cssText = `position:absolute;top:-2px;bottom:-2px;left:-1px;border-left:2px solid ${color};`
  wrap.appendChild(caret)

  const label = document.createElement('span')
  label.textContent = name
  label.style.cssText = [
    'position:absolute',
    'bottom:100%',
    'left:-1px',
    'margin-bottom:3px',
    `background:${color}`,
    'color:#fff',
    'font-size:10px',
    'font-weight:600',
    'line-height:1.2',
    'padding:2px 6px',
    'border-radius:4px',
    'white-space:nowrap',
    'pointer-events:none',
    'user-select:none',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  ].join(';')
  wrap.appendChild(label)

  return wrap
}

export const CURSOR_COLORS = [
  '#2563EB', '#16A34A', '#9333EA', '#0891B2',
  '#BE185D', '#D97706', '#DC2626', '#0D9488',
]

export function pickColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}
