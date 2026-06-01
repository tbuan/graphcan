import { useMemo, useState } from 'react'
import type { DbcSignal } from '../parsers/dbc'

interface BitLayoutProps {
  dlc: number
  signals: DbcSignal[]
  colors: string[]
  muxLabels?: Record<number, string>  // mux id → value name from switch signal
}

// Returns grid[byte][col] = signal index (-1 = unused).
// col 0 = bit 7 (MSB displayed on left), col 7 = bit 0 (LSB on right).
function buildGrid(dlc: number, signals: DbcSignal[]): number[][] {
  const grid: number[][] = Array.from({ length: dlc }, () => Array(8).fill(-1))

  for (let si = 0; si < signals.length; si++) {
    const sig = signals[si]
    if (sig.isLittleEndian ?? true) {
      for (let i = 0; i < sig.length; i++) {
        const bitPos  = sig.startBit + i
        const byteRow = bitPos >> 3
        const col     = 7 - (bitPos & 7)
        if (byteRow >= 0 && byteRow < dlc) grid[byteRow][col] = si
      }
    } else {
      let bitPos = sig.startBit
      for (let i = 0; i < sig.length; i++) {
        const byteRow = bitPos >> 3
        const bitIdx  = bitPos & 7
        const col     = 7 - bitIdx
        if (byteRow >= 0 && byteRow < dlc) grid[byteRow][col] = si
        bitPos = bitIdx === 0 ? bitPos + 15 : bitPos - 1
      }
    }
  }

  return grid
}

// Smart abbreviation: uses initials from underscore parts or CamelCase capitals
function abbrev(name: string): string {
  const parts = name.split('_').filter(Boolean)
  if (parts.length >= 2) return parts.map(p => p[0] ?? '').join('').slice(0, 3).toUpperCase()
  const caps = name.replace(/[^A-Z0-9]/g, '')
  if (caps.length >= 2) return caps.slice(0, 3)
  return name.slice(0, 3).toUpperCase()
}

export default function BitLayout({ dlc, signals, colors }: BitLayoutProps) {
  const grid = useMemo(() => buildGrid(dlc, signals), [dlc, signals])
  const [hoveredSig, setHoveredSig] = useState<number | null>(null)

  return (
    <div className="bit-layout">
      <div className="bit-grid">
        {/* Column headers */}
        <div className="bit-row">
          <div className="bit-byte-label" />
          {[7, 6, 5, 4, 3, 2, 1, 0].map(b => (
            <div key={b} className="bit-col-header">{b}</div>
          ))}
        </div>

        {/* Data rows */}
        {grid.map((row, byteIdx) => {
          return (
          <div key={byteIdx} className="bit-row">
            <div className="bit-byte-label">B{byteIdx}</div>
            {row.map((si, col) => {
              const sig     = si >= 0 ? signals[si] : null
              const color   = sig ? colors[si] : undefined
              const isHov   = si === hoveredSig
              const ab      = sig ? abbrev(sig.name) : ''
              const tooltip = sig
                ? `${sig.name}  |  bit ${sig.startBit}  len ${sig.length}  |  ×${sig.factor} +${sig.offset}${sig.unit ? '  ' + sig.unit : ''}  |  ${sig.isLittleEndian ? 'Intel LE' : 'Motorola BE'}`
                : ''

              const cellStyle = sig
                ? {
                    background:  isHov ? color + 'AA' : color + '28',
                    borderColor: isHov ? color         : color + 'BB',
                  }
                : {}

              return (
                <div
                  key={col}
                  className={`bit-cell ${sig ? 'bit-cell-used' : 'bit-cell-free'}`}
                  style={cellStyle}
                  title={tooltip}
                  onMouseEnter={() => setHoveredSig(si >= 0 ? si : null)}
                  onMouseLeave={() => setHoveredSig(null)}
                >
                  {ab}
                </div>
              )
            })}
          </div>
          )
        })}
      </div>

      {/* Legend */}
      {signals.length > 0 && (
        <div className="bit-legend">
          {signals.map((sig, i) => (
            <div
              key={sig.name}
              className={`bit-legend-item ${hoveredSig === i ? 'bit-legend-item-hov' : ''}`}
              onMouseEnter={() => setHoveredSig(i)}
              onMouseLeave={() => setHoveredSig(null)}
            >
              <span className="bit-legend-swatch" style={{ background: colors[i] }} />
              <span className="bit-legend-name">{sig.name}</span>
              {sig.unit && <span className="bit-legend-unit">({sig.unit})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
