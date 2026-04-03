'use client'

import { useState } from 'react'

interface TablePickerProps {
  onSelect: (rows: number, cols: number) => void
  onClose: () => void
}

const MAX_ROWS = 8
const MAX_COLS = 10

export default function TablePicker({ onSelect, onClose }: TablePickerProps) {
  const [hovered, setHovered] = useState({ rows: 0, cols: 0 })

  return (
    <div className="p-3 select-none">
      <p className="text-[10px] text-[#C4BFB6] mb-2 font-medium text-center">
        {hovered.rows > 0 && hovered.cols > 0
          ? `${hovered.cols} × ${hovered.rows} table`
          : 'Hover to select size'}
      </p>
      {/* Single grid container — mouseLeave only fires when leaving the whole grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${MAX_COLS}, 18px)`,
          gridTemplateRows: `repeat(${MAX_ROWS}, 18px)`,
          gap: 3,
        }}
        onMouseLeave={() => setHovered({ rows: 0, cols: 0 })}
      >
        {Array.from({ length: MAX_ROWS * MAX_COLS }, (_, i) => {
          const r = Math.floor(i / MAX_COLS)
          const c = i % MAX_COLS
          const isActive = r < hovered.rows && c < hovered.cols
          return (
            <div
              key={i}
              onMouseEnter={() => setHovered({ rows: r + 1, cols: c + 1 })}
              onClick={() => {
                if (hovered.rows > 0 && hovered.cols > 0) {
                  onSelect(hovered.rows, hovered.cols)
                  onClose()
                }
              }}
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                border: `1px solid ${isActive ? '#D4550A' : '#E5E0D8'}`,
                background: isActive ? 'rgba(212, 85, 10, 0.18)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 60ms ease, border-color 60ms ease',
                transform: isActive ? 'scale(1.1)' : 'scale(1)',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
