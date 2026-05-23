import { unzlibSync } from 'fflate'
import type { ParseResult, CanFrame } from './busmaster'
import { msToHMS } from '../utils/time'

const LOGG_SIG = 0x47474f4c  // 'LOGG' in little-endian
const LOBJ_SIG = 0x4a424f4c  // 'LOBJ' in little-endian

const TYPE_LOG_CONTAINER = 10
const TYPE_CAN_MESSAGE   = 1
const TYPE_CAN_FD        = 86

// Outer and inner object padding: next = pos + size + (size % 4)
function next(pos: number, size: number): number {
  return pos + size + (size % 4)
}

function readSystemTime(view: DataView, offset: number): string | null {
  const year  = view.getUint16(offset,      true)
  const month = view.getUint16(offset + 2,  true)
  const day   = view.getUint16(offset + 6,  true)
  const hour  = view.getUint16(offset + 8,  true)
  const min   = view.getUint16(offset + 10, true)
  const sec   = view.getUint16(offset + 12, true)
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ` +
         `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out   = new Uint8Array(total)
  let offset  = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

function readU32(arr: Uint8Array, pos: number): number {
  return (arr[pos] | arr[pos+1] << 8 | arr[pos+2] << 16 | arr[pos+3] << 24) >>> 0
}
function readU16(arr: Uint8Array, pos: number): number {
  return arr[pos] | arr[pos+1] << 8
}
// Timestamp is uint64 in 100ns units; we only need the low 32 bits for relative offsets
// (a 32-bit 100ns counter overflows after ~429 seconds, which may be too short)
// Use full BigInt for accuracy.
function readU64(arr: Uint8Array, pos: number): bigint {
  const lo = BigInt(readU32(arr, pos))
  const hi = BigInt(readU32(arr, pos + 4))
  return (hi << 32n) | lo
}

function normalizeId(arbId: number): string {
  return `0X${((arbId & 0x1fffffff) >>> 0).toString(16).toUpperCase()}`
}

export function parseBlf(buffer: Uint8Array): ParseResult {
  if (readU32(buffer, 0) !== LOGG_SIG) {
    return { frames: [], skippedLines: 0, metadata: { baudrate: null, startDate: null } }
  }

  const headerSize = readU32(buffer, 4)
  const view       = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const startDate  = readSystemTime(view, 0x28)

  // ── Pass 1: decompress all LOG_CONTAINERs into a unified byte stream ──────────
  const chunks: Uint8Array[] = []
  for (let pos = headerSize; pos + 16 < buffer.length;) {
    if (readU32(buffer, pos) !== LOBJ_SIG) break
    const objSize = readU32(buffer, pos + 8)
    const objType = readU32(buffer, pos + 12)

    if (objType === TYPE_LOG_CONTAINER) {
      const compression = readU16(buffer, pos + 16)
      const dataStart   = pos + 32
      const dataLen     = objSize - 32
      const compressed  = buffer.slice(dataStart, dataStart + dataLen)
      try {
        chunks.push(compression === 2 ? unzlibSync(compressed) : compressed)
      } catch { /* skip corrupt container */ }
    }

    pos = next(pos, objSize)
  }

  const stream = concat(chunks)

  // ── Pass 2: walk the unified stream and decode CAN frames ─────────────────────
  const frames: CanFrame[] = []
  let t0: bigint | null = null

  for (let pos = 0; pos + 16 < stream.length;) {
    if (readU32(stream, pos) !== LOBJ_SIG) break

    const hdrSz  = readU16(stream, pos + 4)
    const objSize = readU32(stream, pos + 8)
    const objType = readU32(stream, pos + 12)
    const ts      = readU64(stream, pos + 16)  // 100ns from start of measurement

    if (objType === TYPE_CAN_MESSAGE || objType === TYPE_CAN_FD) {
      if (t0 === null) t0 = ts
      const relMs = Number(ts - t0) / 10_000  // 100ns → ms

      const base    = pos + hdrSz
      const channel = readU16(stream, base)
      const flags   = stream[base + 3]
      const arbId   = readU32(stream, base + 4)

      // Data starts after: channel(2)+dlc(1)+flags(1)+arbId(4)+frameLen(4)+reserved(4) = 16 bytes
      // Actual data byte count derived from object size (most reliable source)
      const metaLen = objType === TYPE_CAN_FD ? 16 : 8
      const dataLen = Math.max(0, objSize - hdrSz - metaLen)
      const dataStart = base + metaLen

      if (dataStart + dataLen <= stream.length) {
        const data = Array.from(stream.slice(dataStart, dataStart + dataLen))
          .map(b => b.toString(16).padStart(2, '0').toUpperCase())

        frames.push({
          timestamp: msToHMS(relMs),
          direction: (flags & 0x10) ? 'Tx' : 'Rx',
          channel,
          id:  normalizeId(arbId),
          dlc: dataLen,
          data,
        })
      }
    }

    pos = next(pos, objSize)
  }

  return {
    frames,
    skippedLines: 0,
    metadata: { baudrate: null, startDate },
  }
}
