export interface DbcSignal {
  name: string
  startBit: number
  length: number
  isLittleEndian: boolean
  isSigned: boolean
  factor: number
  offset: number
  unit: string
}

export interface DbcMessage {
  id: number
  name: string
  signals: DbcSignal[]
}

// Keyed by normalized hex ID matching busmaster format: "0X142406E4"
export type DbcData = Record<string, DbcMessage>

// BO_ 2228388068 MessageName: 8 Sender
const BO_REGEX = /^BO_ (\d+) (\w+)\s*:\s*(\d+)/

// SG_ SignalName : 0|16@1+ (0.01,-40) [0|0] "km/h" Receivers
// @1 = Intel/little-endian, @0 = Motorola/big-endian
const SG_REGEX =
  /^\s+SG_ (\w+)\s*:\s*(\d+)\|(\d+)@(\d)([+-])\s*\(([^,]+),([^)]+)\)\s*\[[^\]]+\]\s*"([^"]*)"/

function normalizeId(rawId: number): string {
  // Bit 31 is used by some tools to mark extended (29-bit) frames — strip it
  const id = rawId & 0x1fffffff
  return `0X${id.toString(16).toUpperCase()}`
}

export function parseDbcFile(content: string): DbcData {
  const data: DbcData = {}
  let currentKey: string | null = null

  for (const line of content.split('\n')) {
    const boMatch = BO_REGEX.exec(line)
    if (boMatch) {
      currentKey = normalizeId(parseInt(boMatch[1], 10))
      data[currentKey] = {
        id: parseInt(boMatch[1], 10) & 0x1fffffff,
        name: boMatch[2],
        signals: [],
      }
      continue
    }

    if (currentKey) {
      const sgMatch = SG_REGEX.exec(line)
      if (sgMatch) {
        data[currentKey].signals.push({
          name:           sgMatch[1],
          startBit:       parseInt(sgMatch[2], 10),
          length:         parseInt(sgMatch[3], 10),
          isLittleEndian: sgMatch[4] === '1',
          isSigned:       sgMatch[5] === '-',
          factor:         parseFloat(sgMatch[6]),
          offset:         parseFloat(sgMatch[7]),
          unit:           sgMatch[8],
        })
      }
    }
  }

  return data
}
