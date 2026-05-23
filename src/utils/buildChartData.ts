import type uPlot from 'uplot'
import type { CanFrame } from '../parsers/busmaster'
import type { DbcSignal } from '../parsers/dbc'
import type { Signal } from '../types'
import { parseTimestampToMs } from './time'
import { decodeSignal } from './decodeSignal'

const MAX_POINTS_PER_SIGNAL = 2000

function downsample(frames: CanFrame[], maxPoints: number): CanFrame[] {
  if (frames.length <= maxPoints) return frames
  const step = Math.ceil(frames.length / maxPoints)
  return frames.filter((_, i) => i % step === 0)
}

export function buildUPlotData(
  frames: CanFrame[],
  signals: Signal[],
): uPlot.AlignedData {
  if (signals.length === 0) return [[], []]

  // For each unique ID, downsample and build a timestamp → frame map
  const frameMapById = new Map<string, Map<number, CanFrame>>()
  for (const signal of signals) {
    if (frameMapById.has(signal.id)) continue
    const idFrames = frames.filter(f => f.id === signal.id)
    const sampled = downsample(idFrames, MAX_POINTS_PER_SIGNAL)
    const tsMap = new Map<number, CanFrame>()
    for (const f of sampled) tsMap.set(parseTimestampToMs(f.timestamp), f)
    frameMapById.set(signal.id, tsMap)
  }

  // Merge all timestamps into a single sorted timeline
  const allTs = new Set<number>()
  for (const tsMap of frameMapById.values()) {
    for (const ts of tsMap.keys()) allTs.add(ts)
  }
  const sortedTs = Array.from(allTs).sort((a, b) => a - b)

  const t0 = sortedTs[0] ?? 0
  const xAxis = sortedTs.map(ts => (ts - t0) / 1000)

  const series = signals.map(signal => {
    const tsMap = frameMapById.get(signal.id) ?? new Map()
    return sortedTs.map(ts => {
      const frame = tsMap.get(ts)
      if (!frame || frame.data[signal.byteIndex] === undefined) return null
      return parseInt(frame.data[signal.byteIndex], 16)
    })
  })

  return [xAxis, ...series]
}

export function buildDbcSignalData(
  frames: CanFrame[],
  canId: string,
  signal: DbcSignal,
): uPlot.AlignedData {
  const relevant = frames.filter(f => f.id === canId)
  const sampled  = downsample(relevant, MAX_POINTS_PER_SIGNAL)
  if (sampled.length === 0) return [[], []]

  const t0     = parseTimestampToMs(sampled[0].timestamp)
  const xAxis  = sampled.map(f => (parseTimestampToMs(f.timestamp) - t0) / 1000)
  const values = sampled.map(f => decodeSignal(f.data.map(b => parseInt(b, 16)), signal))

  return [xAxis, values]
}
