import type { ParseResult, CanFrame } from './busmaster'
import { msToHMS } from '../utils/time'

// TRC v1: timestamp is milliseconds from start
//       1)         0.000  Rx    0001  8  FF FF FF FF FF FF FF FF
const TRC_V1_FRAME =
  /^\s*\d+\)\s+([\d.]+)\s+(Rx|Tx)\s+([0-9A-Fa-f]+)\s+(\d+)((?:\s+[0-9A-Fa-f]{1,2})*)/

// TRC v2: timestamp is HH:MM:SS.mmm, message type is DT/RT/ER/ST
//       1) 00:00:00.000  DT  00000001  8  FF FF FF FF FF FF FF FF
const TRC_V2_FRAME =
  /^\s*\d+\)\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+(DT|RT|ER|ST)\s+([0-9A-Fa-f]+)\s+(\d+)((?:\s+[0-9A-Fa-f]{1,2})*)/

function normalizeId(hex: string): string {
  return `0X${(parseInt(hex, 16) & 0x1fffffff).toString(16).toUpperCase()}`
}

function isV2(content: string): boolean {
  return /;\s*[Vv]ersion\s*2/i.test(content)
      || /\d{2}:\d{2}:\d{2}\.\d{3}/.test(content.slice(0, 2000))
}

function hmsToMs(ts: string): number {
  const [h, m, secFrac] = ts.split(':')
  const [s, f = '0'] = secFrac.split('.')
  return (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s)) * 1000
       + parseInt(f.padEnd(3, '0').slice(0, 3))
}

export function parseTrcFile(content: string): ParseResult {
  const lines   = content.split('\n')
  const frames: CanFrame[] = []
  let skippedLines = 0
  const v2 = isV2(content)

  const dateMatch = /;\s*Start.?[Tt]ime:\s*(.+)/m.exec(content)
  const startDate = dateMatch ? dateMatch[1].trim() : null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(';')) continue

    if (v2) {
      const match = TRC_V2_FRAME.exec(trimmed)
      if (!match) { skippedLines++; continue }
      if (match[2] !== 'DT') continue  // skip remote / error / status frames

      frames.push({
        timestamp: msToHMS(hmsToMs(match[1])),
        direction: 'Rx',  // TRC v2 does not record Rx/Tx
        channel:   1,
        id:        normalizeId(match[3]),
        dlc:       parseInt(match[4], 10),
        data:      match[5].trim().split(/\s+/).filter(Boolean).map(b => b.toUpperCase()),
      })
    } else {
      const match = TRC_V1_FRAME.exec(trimmed)
      if (!match) { skippedLines++; continue }

      frames.push({
        timestamp: msToHMS(parseFloat(match[1])),  // already in ms
        direction: match[2] as 'Rx' | 'Tx',
        channel:   1,
        id:        normalizeId(match[3]),
        dlc:       parseInt(match[4], 10),
        data:      match[5].trim().split(/\s+/).filter(Boolean).map(b => b.toUpperCase()),
      })
    }
  }

  return { frames, skippedLines, metadata: { baudrate: null, startDate } }
}
