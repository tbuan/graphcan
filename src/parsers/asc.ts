import type { ParseResult, CanFrame } from './busmaster'
import { msToHMS } from '../utils/time'

// Data frame line (standard and extended, optional CAN FD "fd" keyword):
//   0.001234 1  001       Rx   d 8 01 02 03 04 05 06 07 08
//   0.001234 1  18FF50E5x Rx   d 8 01 02 03 04 05 06 07 08
const FRAME_REGEX =
  /^\s*([\d.]+)\s+(\d+)\s+([0-9A-Fa-f]+)x?\s+(Rx|Tx)\s+(?:fd\s+)?d\s+(\d+)((?:\s+[0-9A-Fa-f]{1,2})*)/

function normalizeId(hex: string): string {
  return `0X${(parseInt(hex, 16) & 0x1fffffff).toString(16).toUpperCase()}`
}

export function parseAscFile(content: string): ParseResult {
  const lines   = content.split('\n')
  const frames: CanFrame[] = []
  let skippedLines = 0
  let t0: number | null = null

  const dateMatch = /^date\s+(.+)$/m.exec(content)
  const startDate = dateMatch ? dateMatch[1].trim() : null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('date')
        || trimmed.startsWith('base') || trimmed.startsWith('no ')) continue

    const match = FRAME_REGEX.exec(trimmed)
    if (!match) {
      if (!trimmed.startsWith('Begin') && !trimmed.startsWith('End')
          && !trimmed.includes('Start of measurement')) {
        skippedLines++
      }
      continue
    }

    const relSec = parseFloat(match[1])
    if (t0 === null) t0 = relSec

    frames.push({
      timestamp: msToHMS((relSec - t0) * 1000),
      direction: match[4] as 'Rx' | 'Tx',
      channel:   parseInt(match[2], 10),
      id:        normalizeId(match[3]),
      dlc:       parseInt(match[5], 10),
      data:      match[6].trim().split(/\s+/).filter(Boolean).map(b => b.toUpperCase()),
    })
  }

  return { frames, skippedLines, metadata: { baudrate: null, startDate } }
}
