import type { CanFrame } from './busmaster'
import { msToHMS } from '../utils/time'

/**
 * Parses a single SLCAN line into a CanFrame.
 *
 * SLCAN wire format — one line per frame, terminated by \r:
 *   t{III}{D}{data}        standard frame, 11-bit ID (3 hex digits)
 *   T{IIIIIIII}{D}{data}   extended frame, 29-bit ID (8 hex digits)
 *   r{III}{D}              standard remote frame (no data bytes)
 *   R{IIIIIIII}{D}         extended remote frame (no data bytes)
 *
 * {D}    = 1 hex digit, DLC 0–8
 * {data} = DLC × 2 hex digits
 *
 * Some adapters append a 4-digit hex hardware timestamp — we tolerate and ignore it.
 */
export function parseSlcanFrame(line: string, elapsedMs: number): CanFrame | null {
  if (!line) return null

  const type = line[0]
  let idLen: number
  let isRemote: boolean

  switch (type) {
    case 't': idLen = 3; isRemote = false; break
    case 'T': idLen = 8; isRemote = false; break
    case 'r': idLen = 3; isRemote = true;  break
    case 'R': idLen = 8; isRemote = true;  break
    default: return null
  }

  if (line.length < 1 + idLen + 1) return null

  const idHex = line.slice(1, 1 + idLen)
  const dlc   = parseInt(line[1 + idLen], 16)

  if (isNaN(dlc) || dlc < 0 || dlc > 8) return null
  if (!/^[0-9A-Fa-f]+$/.test(idHex)) return null

  const data: string[] = []

  if (!isRemote) {
    const dataStart = 1 + idLen + 1
    if (line.length < dataStart + dlc * 2) return null
    for (let i = 0; i < dlc; i++) {
      data.push(line.slice(dataStart + i * 2, dataStart + i * 2 + 2).toUpperCase())
    }
  }

  return {
    timestamp: msToHMS(elapsedMs),
    direction: 'Rx',
    channel:   1,
    id:        `0x${idHex.toUpperCase().replace(/^0+/, '') || '0'}`,
    dlc,
    data,
  }
}

/**
 * Processes a raw serial chunk incrementally.
 * Frames in SLCAN are separated by \r — a chunk may contain several frames
 * and end with an incomplete line that must be carried over to the next call.
 */
export function parseSlcanChunk(
  chunk: string,
  remainder: string,
  elapsedMs: number,
): { frames: CanFrame[]; remainder: string } {
  const raw   = remainder + chunk
  const lines = raw.split('\r')
  const frames: CanFrame[] = []

  // Every segment except the last is terminated by \r → complete frame
  for (let i = 0; i < lines.length - 1; i++) {
    const frame = parseSlcanFrame(lines[i].trim(), elapsedMs)
    if (frame) frames.push(frame)
  }

  return { frames, remainder: lines[lines.length - 1] }
}

// CAN bus speed options with their SLCAN Sn command
export const CAN_SPEEDS = [
  { label: '10 kbps',  cmd: 'S0' },
  { label: '20 kbps',  cmd: 'S1' },
  { label: '50 kbps',  cmd: 'S2' },
  { label: '100 kbps', cmd: 'S3' },
  { label: '125 kbps', cmd: 'S4' },
  { label: '250 kbps', cmd: 'S5' },
  { label: '500 kbps', cmd: 'S6' },
  { label: '800 kbps', cmd: 'S7' },
  { label: '1 Mbps',   cmd: 'S8' },
] as const

export type CanSpeed = typeof CAN_SPEEDS[number]
