import type { DbcSignal } from '../parsers/dbc'

export function decodeSignal(data: number[], signal: DbcSignal): number {
  let rawValue = 0

  // Default to Intel/little-endian if the field is missing (e.g. stale cached data)
  if (signal.isLittleEndian ?? true) {
    // Intel: startBit is the LSB position, bits increment linearly
    for (let i = 0; i < signal.length; i++) {
      const bitPos = signal.startBit + i
      const byteIdx = bitPos >> 3
      const bitIdx  = bitPos & 7
      if (byteIdx < data.length && (data[byteIdx] >> bitIdx) & 1) {
        rawValue += 2 ** i
      }
    }
  } else {
    // Motorola: startBit is the MSB position
    // Within a byte bits decrease (MSB→LSB), then jump to MSB of the next byte
    let bitPos = signal.startBit
    for (let i = signal.length - 1; i >= 0; i--) {
      const byteIdx = bitPos >> 3
      const bitIdx  = bitPos & 7
      if (byteIdx < data.length && (data[byteIdx] >> bitIdx) & 1) {
        rawValue += 2 ** i
      }
      bitPos = bitIdx === 0 ? bitPos + 15 : bitPos - 1
    }
  }

  // Two's complement for signed values
  if (signal.isSigned && rawValue >= 2 ** (signal.length - 1)) {
    rawValue -= 2 ** signal.length
  }

  return rawValue * signal.factor + signal.offset
}

// Returns the raw integer value (before factor/offset) — used to read mux switch IDs.
export function decodeRawInt(data: number[], signal: DbcSignal): number {
  let rawValue = 0

  if (signal.isLittleEndian ?? true) {
    for (let i = 0; i < signal.length; i++) {
      const bitPos = signal.startBit + i
      const byteIdx = bitPos >> 3
      const bitIdx  = bitPos & 7
      if (byteIdx < data.length && (data[byteIdx] >> bitIdx) & 1) {
        rawValue += 2 ** i
      }
    }
  } else {
    let bitPos = signal.startBit
    for (let i = signal.length - 1; i >= 0; i--) {
      const byteIdx = bitPos >> 3
      const bitIdx  = bitPos & 7
      if (byteIdx < data.length && (data[byteIdx] >> bitIdx) & 1) {
        rawValue += 2 ** i
      }
      bitPos = bitIdx === 0 ? bitPos + 15 : bitPos - 1
    }
  }

  if (signal.isSigned && rawValue >= 2 ** (signal.length - 1)) {
    rawValue -= 2 ** signal.length
  }

  return rawValue
}
