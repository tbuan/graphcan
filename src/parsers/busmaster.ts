export interface CanFrame {
  timestamp: string
  direction: 'Rx' | 'Tx'
  channel: number
  id: string
  dlc: number
  data: string[]
}

export interface FileMetadata {
  baudrate: string | null
  startDate: string | null
}

export interface ParseResult {
  frames: CanFrame[]
  skippedLines: number
  metadata: FileMetadata
}

// Matches lines like: 09:34:26:2872 Rx 1 0x142406E4 x 8 00 00 FF ...
const FRAME_REGEX =
  /^(\d{2}:\d{2}:\d{2}:\d+)\s+(Rx|Tx)\s+(\d+)\s+(0x[0-9A-Fa-f]+)\s+\w+\s+(\d+)\s*(.*)$/

// ***CHANNEL 1 - PCAN-USB Driver Id 16 - 250000 bps***
const BAUDRATE_REGEX = /CHANNEL \d+ .+ - (\d+) bps/

// ***START DATE AND TIME 13:2:2026 9:31:4:985***
const DATE_REGEX = /START DATE AND TIME (\d+:\d+:\d+) (\d+:\d+:\d+)/

function parseMetadata(lines: string[]): FileMetadata {
  let baudrate: string | null = null
  let startDate: string | null = null

  for (const line of lines) {
    if (!line.startsWith('***')) continue

    if (!baudrate) {
      const m = BAUDRATE_REGEX.exec(line)
      if (m) baudrate = `${parseInt(m[1], 10).toLocaleString()} bps`
    }
    if (!startDate) {
      const m = DATE_REGEX.exec(line)
      if (m) startDate = `${m[1]} ${m[2]}`
    }
    if (baudrate && startDate) break
  }

  return { baudrate, startDate }
}

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

  return { frames, skippedLines, metadata: parseMetadata(lines) }
}
