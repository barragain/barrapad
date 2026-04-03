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

  const handleClick = () => {
    if (hovered.rows > 0 && hovered.cols > 0) {
      onSelect(hovered.rows, hovered.cols)
      onClose()
    }
  }

  return (
    <div className="p-3 select-none">
      <p className="text-[10px] text-[#C4BFB6] mb-2 font-medium text-center">
        {hovered.rows > 0 && hovered.cols > 0
          ? `${hovered.cols} × ${hovered.rows} table`
          : 'Hover to select size'}
      </p>
      <div
        className="flex flex-col gap-1"
        onMouseLeave={() => setHovered({ rows: 0, cols: 0 })}
      >
        {Array.from({ length: MAX_ROWS }, (_, r) => (
          <div key={r} className="flex gap-1">
            {Array.from({ length: MAX_COLS }, (_, c) => {
              const isActive = r < hovered.rows && c < hovered.cols
              return (
                <div
                  key={c}
                  onMouseEnter={() => setHovered({ rows: r + 1, cols: c + 1 })}
                  onClick={handleClick}
                  className="cursor-pointer"
                  style={{ width: 18, height: 18 }}
                >
                  <div
                    className="w-full h-full rounded-sm border transition-all duration-75"
                    style={{
                      background: isActive ? 'rgba(212, 85, 10, 0.15)' : 'transparent',
                      borderColor: isActive ? '#D4550A' : '#E5E0D8',
                      transform: isActive ? 'scale(1.1)' : 'scale(1)',
                    }}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
