'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { hsvToHex, hexToHsv, isValidHex } from '@/lib/color-utils'

interface ColorPickerProps {
  value: string
  onChange: (value: string) => void
  mode?: 'color' | 'gradient'
  onModeChange?: (mode: 'color' | 'gradient') => void
}

const PRESET_SWATCHES = [
  ['#000000', '#ffffff', '#D4550A', '#3b82f6', '#16a34a', '#dc2626', '#9333ea', '#f59e0b'],
  ['#1a1a2e', '#F5F0E8', '#84cc16', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'],
]

// A compact color board (no tabs, just the picker core)
interface ColorBoardProps {
  color: string
  onChange: (hex: string) => void
}

function ColorBoard({ color, onChange }: ColorBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const isDraggingBoard = useRef(false)
  const isDraggingHue = useRef(false)

  const safeHex = isValidHex(color) ? color : '#D4550A'
  const [h, s, v] = hexToHsv(safeHex)

  const [hue, setHue] = useState(h)
  const [sat, setSat] = useState(s)
  const [val, setVal] = useState(v)
  const [hexInput, setHexInput] = useState(safeHex)

  // Sync from external color changes (only when not dragging)
  useEffect(() => {
    if (!isDraggingBoard.current && !isDraggingHue.current) {
      const safe = isValidHex(color) ? color : '#D4550A'
      const [nh, ns, nv] = hexToHsv(safe)
      setHue(nh)
      setSat(ns)
      setVal(nv)
      setHexInput(safe)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color])

  const emitColor = useCallback(
    (nh: number, ns: number, nv: number) => {
      const hex = hsvToHex(nh, ns, nv)
      setHexInput(hex)
      onChange(hex)
    },
    [onChange]
  )

  // Board drag
  const getBoardCoords = useCallback((clientX: number, clientY: number) => {
    if (!boardRef.current) return
    const rect = boardRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    return { x, y }
  }, [])

  const onBoardMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingBoard.current = true
      const coords = getBoardCoords(e.clientX, e.clientY)
      if (!coords) return
      const ns = Math.round(coords.x * 100)
      const nv = Math.round((1 - coords.y) * 100)
      setSat(ns)
      setVal(nv)
      emitColor(hue, ns, nv)

      const onMove = (me: MouseEvent) => {
        const c = getBoardCoords(me.clientX, me.clientY)
        if (!c) return
        const ms = Math.round(c.x * 100)
        const mv = Math.round((1 - c.y) * 100)
        setSat(ms)
        setVal(mv)
        emitColor(hue, ms, mv)
      }
      const onUp = () => {
        isDraggingBoard.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [hue, getBoardCoords, emitColor]
  )

  // Hue drag
  const getHueFromX = useCallback((clientX: number) => {
    if (!hueRef.current) return 0
    const rect = hueRef.current.getBoundingClientRect()
    return Math.round(Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360)))
  }, [])

  const onHueMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingHue.current = true
      const nh = getHueFromX(e.clientX)
      setHue(nh)
      emitColor(nh, sat, val)

      const onMove = (me: MouseEvent) => {
        const mh = getHueFromX(me.clientX)
        setHue(mh)
        emitColor(mh, sat, val)
      }
      const onUp = () => {
        isDraggingHue.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [sat, val, getHueFromX, emitColor]
  )

  const onHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setHexInput(raw)
    const full = raw.startsWith('#') ? raw : `#${raw}`
    if (isValidHex(full)) {
      const [nh, ns, nv] = hexToHsv(full)
      setHue(nh)
      setSat(ns)
      setVal(nv)
      onChange(full)
    }
  }

  const onHexBlur = () => {
    const full = hexInput.startsWith('#') ? hexInput : `#${hexInput}`
    if (!isValidHex(full)) {
      setHexInput(hsvToHex(hue, sat, val))
    }
  }

  const hueColor = hsvToHex(hue, 100, 100)
  const cursorX = sat // 0-100 → percentage
  const cursorY = 100 - val // 0-100 → percentage

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Color board */}
      <div
        ref={boardRef}
        onMouseDown={onBoardMouseDown}
        style={{
          width: '100%',
          height: 160,
          borderRadius: 8,
          cursor: 'crosshair',
          position: 'relative',
          background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, hsl(${hue}deg 100% 50%))`,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${cursorX}%`,
            top: `${cursorY}%`,
            transform: 'translate(-50%, -50%)',
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            background: hsvToHex(hue, sat, val),
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        onMouseDown={onHueMouseDown}
        style={{
          width: '100%',
          height: 12,
          borderRadius: 6,
          cursor: 'pointer',
          position: 'relative',
          background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${(hue / 360) * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
            background: hueColor,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Hex input + swatch */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: hsvToHex(hue, sat, val),
            border: '1px solid #E5E0D8',
            flexShrink: 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid #E5E0D8',
            borderRadius: 6,
            overflow: 'hidden',
            flex: 1,
          }}
        >
          <span
            style={{
              padding: '4px 6px',
              fontSize: 12,
              color: '#9b9b9b',
              background: '#F9F7F4',
              borderRight: '1px solid #E5E0D8',
              userSelect: 'none',
            }}
          >
            #
          </span>
          <input
            value={hexInput.replace('#', '')}
            onChange={(e) => onHexChange({ ...e, target: { ...e.target, value: e.target.value } } as React.ChangeEvent<HTMLInputElement>)}
            onBlur={onHexBlur}
            maxLength={6}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              padding: '4px 6px',
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#1A1A1A',
              background: 'transparent',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// Angle picker widget
interface AnglePickerProps {
  angle: number
  onChange: (angle: number) => void
}

function AnglePicker({ angle, onChange }: AnglePickerProps) {
  const circleRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const update = (clientX: number, clientY: number) => {
      if (!circleRef.current) return
      const rect = circleRef.current.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = clientX - cx
      const dy = clientY - cy
      let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 90
      if (deg < 0) deg += 360
      onChange(deg % 360)
    }
    update(e.clientX, e.clientY)
    const onMove = (me: MouseEvent) => update(me.clientX, me.clientY)
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const rad = ((angle - 90) * Math.PI) / 180
  const cx = 16
  const cy = 16
  const r = 10
  const lx = cx + r * Math.cos(rad)
  const ly = cy + r * Math.sin(rad)

  return (
    <div
      ref={circleRef}
      onMouseDown={handleMouseDown}
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '1px solid #E5E0D8',
        background: '#F9F7F4',
        position: 'relative',
        cursor: 'pointer',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <svg width="32" height="32" style={{ position: 'absolute', top: 0, left: 0 }}>
        <line
          x1={cx}
          y1={cy}
          x2={lx}
          y2={ly}
          stroke="#D4550A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx={lx} cy={ly} r="3" fill="#D4550A" />
      </svg>
    </div>
  )
}

export default function ColorPicker({ value, onChange, mode = 'color', onModeChange }: ColorPickerProps) {
  const [activeTab, setActiveTab] = useState<'color' | 'gradient'>(mode)

  // Gradient state
  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear')
  const [gradientAngle, setGradientAngle] = useState(90)
  const [gradientStart, setGradientStart] = useState('#D4550A')
  const [gradientEnd, setGradientEnd] = useState('#3b82f6')

  // Parse incoming value to init gradient state
  useEffect(() => {
    if (value.startsWith('linear-gradient') || value.startsWith('radial-gradient')) {
      setActiveTab('gradient')
      const isRadial = value.startsWith('radial-gradient')
      setGradientType(isRadial ? 'radial' : 'linear')
      // Try to extract angle and colors
      const angleMatch = value.match(/(\d+)deg/)
      if (angleMatch) setGradientAngle(parseInt(angleMatch[1]))
      const hexMatches = value.match(/#[0-9a-fA-F]{6}/g)
      if (hexMatches && hexMatches.length >= 2) {
        setGradientStart(hexMatches[0])
        setGradientEnd(hexMatches[1])
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildGradient = useCallback(
    (type: 'linear' | 'radial', angle: number, start: string, end: string) => {
      if (type === 'radial') return `radial-gradient(circle, ${start}, ${end})`
      return `linear-gradient(${angle}deg, ${start}, ${end})`
    },
    []
  )

  const emitGradient = useCallback(
    (type: 'linear' | 'radial', angle: number, start: string, end: string) => {
      onChange(buildGradient(type, angle, start, end))
    },
    [onChange, buildGradient]
  )

  const handleTabChange = (tab: 'color' | 'gradient') => {
    setActiveTab(tab)
    onModeChange?.(tab)
  }

  const currentColor = isValidHex(value) ? value : '#D4550A'

  const gradient = buildGradient(gradientType, gradientAngle, gradientStart, gradientEnd)

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 320,
        margin: '0 auto',
        background: '#fff',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          background: '#F5F0E8',
          borderRadius: 8,
          padding: 3,
        }}
      >
        {(['color', 'gradient'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            style={{
              flex: 1,
              padding: '4px 0',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              background: activeTab === tab ? '#fff' : 'transparent',
              color: activeTab === tab ? '#1A1A1A' : '#9b9b9b',
              boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Color tab */}
      {activeTab === 'color' && (
        <>
          <ColorBoard color={currentColor} onChange={onChange} />

          {/* Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PRESET_SWATCHES.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 4 }}>
                {row.map((c) => (
                  <button
                    key={c}
                    onClick={() => onChange(c)}
                    title={c}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: c,
                      border: c === '#ffffff' ? '1px solid #E5E0D8' : '2px solid #fff',
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
                      cursor: 'pointer',
                      transition: 'transform 150ms ease',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.2)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Gradient tab */}
      {activeTab === 'gradient' && (
        <>
          {/* Preview strip */}
          <div
            style={{
              height: 32,
              borderRadius: 8,
              background: gradient,
              border: '1px solid #E5E0D8',
            }}
          />

          {/* Gradient type toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b6b6b', width: 60, flexShrink: 0 }}>Type</span>
            <div style={{ display: 'flex', gap: 2, background: '#F5F0E8', borderRadius: 6, padding: 2 }}>
              {(['linear', 'radial'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setGradientType(t)
                    emitGradient(t, gradientAngle, gradientStart, gradientEnd)
                  }}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                    background: gradientType === t ? '#fff' : 'transparent',
                    color: gradientType === t ? '#1A1A1A' : '#9b9b9b',
                    boxShadow: gradientType === t ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Direction (only for linear) */}
          {gradientType === 'linear' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6b6b6b', width: 60, flexShrink: 0 }}>Angle</span>
              <input
                type="number"
                min={0}
                max={360}
                value={gradientAngle}
                onChange={(e) => {
                  const a = Math.max(0, Math.min(360, parseInt(e.target.value) || 0))
                  setGradientAngle(a)
                  emitGradient(gradientType, a, gradientStart, gradientEnd)
                }}
                style={{
                  width: 56,
                  padding: '3px 6px',
                  fontSize: 12,
                  border: '1px solid #E5E0D8',
                  borderRadius: 6,
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 12, color: '#9b9b9b' }}>deg</span>
              <AnglePicker
                angle={gradientAngle}
                onChange={(a) => {
                  setGradientAngle(a)
                  emitGradient(gradientType, a, gradientStart, gradientEnd)
                }}
              />
            </div>
          )}

          {/* Start color */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b6b6b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Start color
            </div>
            <ColorBoard
              color={gradientStart}
              onChange={(c) => {
                setGradientStart(c)
                emitGradient(gradientType, gradientAngle, c, gradientEnd)
              }}
            />
          </div>

          {/* End color */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b6b6b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              End color
            </div>
            <ColorBoard
              color={gradientEnd}
              onChange={(c) => {
                setGradientEnd(c)
                emitGradient(gradientType, gradientAngle, gradientStart, c)
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
