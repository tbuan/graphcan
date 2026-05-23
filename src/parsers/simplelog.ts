import type { ParseResult, CanFrame } from './busmaster'
import { msToHMS } from '../utils/time'

// Format: <epoch_seconds> <channel> <hex_id> <Rx|Tx> <dlc>  <byte1> <byte2> ...
// Example: 1779372755.614 1 142406e4 Rx 8   00 00 00 00 FF FF 0A 26
const FRAME_REGEX =
  /^([\d.]+)\s+(\d+)\s+([0-9A-Fa-f]+)\s+(Rx|Tx)\s+\d+\s*((?:[0-9A-Fa-f]{1,2}\s*)*)/

function normalizeId(hex: string): string {
  return `0X${(parseInt(hex, 16) & 0x1fffffff).toString(16).toUpperCase()}`
}

export function parseSimpleLog(content: string): ParseResult {
  const lines   = content.split('\n')
  const frames: CanFrame[] = []
  let skippedLines = 0
  let t0: number | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const match = FRAME_REGEX.exec(trimmed)
    if (!match) { skippedLines++; continue }

    const epoch = parseFloat(match[1])
    if (t0 === null) t0 = epoch

    const data = match[5].trim().split(/\s+/).filter(Boolean).map(b => b.toUpperCase())

    frames.push({
      timestamp: msToHMS((epoch - t0) * 1000),
      direction: match[4] as 'Rx' | 'Tx',
      channel:   parseInt(match[2], 10),
      id:        normalizeId(match[3]),
      dlc:       data.length,
      data,
    })
  }

  return { frames, skippedLines, metadata: { baudrate: null, startDate: null } }
}

export function isSimpleLog(content: string): boolean {
  const firstLine = content.trimStart().split('\n')[0] ?? ''
  return FRAME_REGEX.test(firstLine.trim())
}
