import type { ParseResult, CanFrame } from './busmaster'
import { msToHMS } from '../utils/time'

// Standard:  (1616000000.000000) vcan0 001#0102030405060708
// Extended:  (1616000000.001000) can0  18FF50E5#AABBCCDDEE
// CAN FD:    (1616000000.002000) vcan0 123##3AABBCC  (## + 1 flags byte + data)
const FRAME_REGEX =
  /^\((\d+\.\d+)\)\s+(\S+)\s+([0-9A-Fa-f]+)##?[0-9A-Fa-f]?([0-9A-Fa-f]*)/

function normalizeId(hex: string): string {
  return `0X${(parseInt(hex, 16) & 0x1fffffff).toString(16).toUpperCase()}`
}

function splitBytes(hex: string): string[] {
  const out: string[] = []
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out.push(hex.slice(i, i + 2).toUpperCase())
  }
  return out
}

export function parseCandumpLog(content: string): ParseResult {
  const lines   = content.split('\n')
  const frames: CanFrame[] = []
  let skippedLines = 0
  let t0: number | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = FRAME_REGEX.exec(trimmed)
    if (!match) { skippedLines++; continue }

    const epoch = parseFloat(match[1])
    if (t0 === null) t0 = epoch

    const data = splitBytes(match[4])

    frames.push({
      timestamp: msToHMS((epoch - t0) * 1000),
      direction: 'Rx',  // candump does not record direction
      channel:   1,
      id:        normalizeId(match[3]),
      dlc:       data.length,
      data,
    })
  }

  return { frames, skippedLines, metadata: { baudrate: null, startDate: null } }
}
