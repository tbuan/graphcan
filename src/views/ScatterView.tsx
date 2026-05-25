import { useMemo, useState } from 'react'
import type { ImportedFile } from '../types'
import type { DbcData } from '../parsers/dbc'
import type { CanFrame } from '../parsers/busmaster'
import { parseTimestampToMs } from '../utils/time'
import { decodeSignal } from '../utils/decodeSignal'
import ScatterPlot from '../components/ScatterPlot'

interface ScatterViewProps {
  importedFile: ImportedFile | null
  dbcData: DbcData | null
  themeKey: string
}

interface SignalOption {
  key: string
  label: string
  kind: 'byte' | 'signal'
  id: string
  byteIndex?: number
  signalName?: string
}

// Returns [timestamp_ms, value] pairs for a given signal option
function extractSeries(
  frames: CanFrame[],
  option: SignalOption,
  dbcData: DbcData | null,
): [number, number][] {
  const relevant = frames.filter(f => f.id === option.id)

  const result: [number, number][] = []
  for (const f of relevant) {
    const ts = parseTimestampToMs(f.timestamp)
    let val: number
    if (option.kind === 'byte') {
      const raw = f.data[option.byteIndex!]
      if (raw === undefined) continue
      val = parseInt(raw, 16)
    } else {
      const sig = dbcData?.[option.id]?.signals.find(s => s.name === option.signalName)
      if (!sig) continue
      val = decodeSignal(f.data.map(b => parseInt(b, 16)), sig)
    }
    result.push([ts, val])
  }
  return result
}

// Nearest-neighbor interpolation: for each point in seriesA, find the closest
// timestamp in seriesB. Only pairs within `toleranceMs` are kept.
function buildScatterPoints(
  seriesA: [number, number][],
  seriesB: [number, number][],
  maxPoints = 3000,
): [number, number][] {
  if (!seriesA.length || !seriesB.length) return []

  // Estimate a reasonable tolerance: half the median period of the sparser series
  const sparser = seriesA.length <= seriesB.length ? seriesA : seriesB
  const diffs: number[] = []
  for (let i = 1; i < Math.min(sparser.length, 101); i++) {
    diffs.push(sparser[i][0] - sparser[i - 1][0])
  }
  diffs.sort((a, b) => a - b)
  const medianPeriod = diffs[Math.floor(diffs.length / 2)] ?? 100
  const toleranceMs  = medianPeriod * 2

  // Binary search helper: index of the entry in arr closest in time to `ts`
  function nearest(arr: [number, number][], ts: number): number {
    let lo = 0, hi = arr.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid][0] < ts) lo = mid + 1
      else hi = mid
    }
    if (lo > 0 && Math.abs(arr[lo - 1][0] - ts) < Math.abs(arr[lo][0] - ts)) lo--
    return lo
  }

  // Downsample A if needed so we don't exceed maxPoints
  let sourceA = seriesA
  if (seriesA.length > maxPoints) {
    const step = Math.ceil(seriesA.length / maxPoints)
    sourceA = seriesA.filter((_, i) => i % step === 0)
  }

  const result: [number, number][] = []
  for (const [tsA, valA] of sourceA) {
    const idx  = nearest(seriesB, tsA)
    const [tsB, valB] = seriesB[idx]
    if (Math.abs(tsA - tsB) <= toleranceMs) {
      result.push([valA, valB])
    }
  }
  return result
}

export default function ScatterView({ importedFile, dbcData, themeKey }: ScatterViewProps) {
  const [selectedA, setSelectedA] = useState('')
  const [selectedB, setSelectedB] = useState('')

  // Build the list of selectable signals
  const signalOptions = useMemo((): SignalOption[] => {
    const frames = importedFile?.result.frames
    if (!frames?.length) return []

    const options: SignalOption[] = []

    // DBC-decoded signals first (if a DBC is loaded)
    if (dbcData) {
      for (const [canId, msg] of Object.entries(dbcData)) {
        const hasFrames = frames.some(f => f.id === canId)
        if (!hasFrames) continue
        for (const sig of msg.signals) {
          options.push({
            key:        `signal:${canId}:${sig.name}`,
            label:      `${msg.name} › ${sig.name}${sig.unit ? ` (${sig.unit})` : ''}`,
            kind:       'signal',
            id:         canId,
            signalName: sig.name,
          })
        }
      }
    }

    // Raw bytes for every observed (id, byteIndex) pair
    const seen = new Map<string, number>() // id → max byte count observed
    for (const f of frames) {
      const cur = seen.get(f.id) ?? 0
      if (f.data.length > cur) seen.set(f.id, f.data.length)
    }
    for (const [canId, byteCount] of seen) {
      for (let b = 0; b < byteCount; b++) {
        options.push({
          key:       `byte:${canId}:${b}`,
          label:     `${canId} — Byte ${b}`,
          kind:      'byte',
          id:        canId,
          byteIndex: b,
        })
      }
    }

    return options
  }, [importedFile, dbcData])

  const optionMap = useMemo(
    () => new Map(signalOptions.map(o => [o.key, o])),
    [signalOptions],
  )

  // Extract the two time-series and compute scatter pairs
  const scatterPoints = useMemo((): [number, number][] => {
    const frames = importedFile?.result.frames
    if (!frames?.length || !selectedA || !selectedB) return []
    const optA = optionMap.get(selectedA)
    const optB = optionMap.get(selectedB)
    if (!optA || !optB) return []

    const seriesA = extractSeries(frames, optA, dbcData)
    const seriesB = extractSeries(frames, optB, dbcData)
    return buildScatterPoints(seriesA, seriesB)
  }, [importedFile, selectedA, selectedB, optionMap, dbcData])

  const labelA = optionMap.get(selectedA)?.label ?? 'Signal A'
  const labelB = optionMap.get(selectedB)?.label ?? 'Signal B'

  // Split options into DBC signals and raw bytes for <optgroup>
  const dbcOptions = signalOptions.filter(o => o.kind === 'signal')
  const byteOptions = signalOptions.filter(o => o.kind === 'byte')

  function renderOptions() {
    return (
      <>
        <option value="">— Select a signal —</option>
        {dbcOptions.length > 0 && (
          <optgroup label="DBC Signals">
            {dbcOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </optgroup>
        )}
        {byteOptions.length > 0 && (
          <optgroup label="Raw Bytes">
            {byteOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </optgroup>
        )}
      </>
    )
  }

  if (!importedFile) {
    return <p className="main-placeholder">Import a CAN log file to get started</p>
  }

  return (
    <div className="scatter-view">
      <div className="scatter-selectors">
        <div className="scatter-selector-group">
          <label className="scatter-label">X axis (Signal A)</label>
          <select
            className="scatter-select"
            value={selectedA}
            onChange={e => setSelectedA(e.target.value)}
          >
            {renderOptions()}
          </select>
        </div>

        <button
          className="scatter-swap"
          title="Swap A and B"
          onClick={() => { setSelectedA(selectedB); setSelectedB(selectedA) }}
          disabled={!selectedA && !selectedB}
        >
          ⇄
        </button>

        <div className="scatter-selector-group">
          <label className="scatter-label">Y axis (Signal B)</label>
          <select
            className="scatter-select"
            value={selectedB}
            onChange={e => setSelectedB(e.target.value)}
          >
            {renderOptions()}
          </select>
        </div>

        {scatterPoints.length > 0 && (
          <span className="scatter-count">{scatterPoints.length.toLocaleString()} points</span>
        )}
      </div>

      <div className="scatter-plot-wrap">
        <ScatterPlot
          points={scatterPoints}
          xLabel={labelA}
          yLabel={labelB}
          themeKey={themeKey}
        />
      </div>
    </div>
  )
}
