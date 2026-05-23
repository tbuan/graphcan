export interface CanFrame {
  timestamp: string
  direction: 'Rx' | 'Tx'
  channel: number
  id: string
  dlc: number
  data: string[]
}

export interface ParseResult {
  frames: CanFrame[]
  skippedLines: number
}

// Matches lines like: 09:34:26:2872 Rx 1 0x142406E4 x 8 00 00 FF ...
const FRAME_REGEX =
  /^(\d{2}:\d{2}:\d{2}:\d+)\s+(Rx|Tx)\s+(\d+)\s+(0x[0-9A-Fa-f]+)\s+\w+\s+(\d+)\s*(.*)$/

export function parseBusmasterLog(content: string): ParseResult {
  const lines = content.split('\n')
  const frames: CanFrame[] = []
  let skippedLines = 0

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('***')) continue

    const match = FRAME_REGEX.exec(trimmed)
    if (!match) {
      skippedLines++
      continue
    }

    const [, timestamp, direction, channel, id, dlc, dataStr] = match
    const data = dataStr.trim().split(/\s+/).filter(Boolean)

    frames.push({
      timestamp,
      direction: direction as 'Rx' | 'Tx',
      channel: parseInt(channel, 10),
      id: id.toUpperCase(),
      dlc: parseInt(dlc, 10),
      data,
    })
  }

  return { frames, skippedLines }
}
