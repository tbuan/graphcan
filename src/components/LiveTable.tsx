import { useEffect, useRef, useState } from 'react'
import type { CanFrame } from '../parsers/busmaster'
import type { DbcData }  from '../parsers/dbc'
import { parseTimestampToMs } from '../utils/time'
import { getMessageName } from '../utils/dbc'

function getMsgLabel(hexId: string, dbc: DbcData | null): string {
  if (!dbc) return ''
  // DBC keys use uppercase "0X…"; live frame IDs use lowercase "0x…"
  const key  = '0X' + hexId.slice(2).toUpperCase()
  const name = getMessageName(key, dbc)
  return name !== key ? name : ''
}

export type LiveViewMode = 'trace' | 'unique'

interface Props {
  frames:     CanFrame[]
  dbcData:    DbcData | null
  mode:       LiveViewMode
  autoScroll: boolean
}

interface UniqueRow {
  frame:   CanFrame
  count:   number
  cycleMs: number | null
  prevTs:  number
}

const TRACE_MAX = 500

export default function LiveTable({ frames, dbcData, mode, autoScroll }: Props) {
  const showName = dbcData !== null

  // ── Trace: auto-scroll ───────────────────────────────────────────────────
  const traceWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode !== 'trace' || !autoScroll) return
    const el = traceWrapRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [frames, mode, autoScroll])

  // ── Unique: incremental map (only processes new frames each tick) ─────────
  const uniqueMapRef = useRef(new Map<string, UniqueRow>())
  const prevLenRef   = useRef(0)
  const [uniqueRows, setUniqueRows] = useState<UniqueRow[]>([])

  useEffect(() => {
    // Reset when frames are cleared
    if (frames.length === 0) {
      uniqueMapRef.current.clear()
      prevLenRef.current = 0
      setUniqueRows([])
      return
    }

    const newFrames = frames.slice(prevLenRef.current)
    prevLenRef.current = frames.length
    if (newFrames.length === 0) return

    const map = uniqueMapRef.current
    for (const frame of newFrames) {
      const ts       = parseTimestampToMs(frame.timestamp)
      const existing = map.get(frame.id)
      if (!existing) {
        map.set(frame.id, { frame, count: 1, cycleMs: null, prevTs: ts })
      } else {
        const dt      = ts - existing.prevTs
        // Exponential moving average — smooths jitter without storing all timestamps
        const cycleMs = existing.cycleMs === null ? dt : existing.cycleMs * 0.85 + dt * 0.15
        map.set(frame.id, { frame, count: existing.count + 1, cycleMs, prevTs: ts })
      }
    }
    setUniqueRows(Array.from(map.values()))
  }, [frames])

  // ── Unique view ──────────────────────────────────────────────────────────
  if (mode === 'unique') {
    return (
      <div className="live-table-wrap">
        <table className="live-table">
          <thead>
            <tr>
              <th className="lt-id">ID</th>
              {showName && <th className="lt-name">Name</th>}
              <th className="lt-count">Count</th>
              <th className="lt-cycle">Cycle&nbsp;(ms)</th>
              <th className="lt-dlc">DLC</th>
              <th className="lt-data">Data</th>
            </tr>
          </thead>
          <tbody>
            {uniqueRows.map(({ frame, count, cycleMs }) => (
              <tr key={frame.id}>
                <td className="lt-id lt-mono">{frame.id}</td>
                {showName && <td className="lt-name">{getMsgLabel(frame.id, dbcData)}</td>}
                <td className="lt-count">{count.toLocaleString()}</td>
                <td className="lt-cycle">{cycleMs !== null ? cycleMs.toFixed(1) : '—'}</td>
                <td className="lt-dlc">{frame.dlc}</td>
                <td className="lt-data lt-mono">{frame.data.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Trace view ───────────────────────────────────────────────────────────
  const visible    = frames.slice(-TRACE_MAX)
  const baseIndex  = frames.length - visible.length

  return (
    <div className="live-table-wrap" ref={traceWrapRef}>
      {frames.length > TRACE_MAX && (
        <div className="live-table-notice">
          Showing last {TRACE_MAX.toLocaleString()} of {frames.length.toLocaleString()} frames
        </div>
      )}
      <table className="live-table">
        <thead>
          <tr>
            <th className="lt-time">Time</th>
            <th className="lt-id">ID</th>
            {showName && <th className="lt-name">Name</th>}
            <th className="lt-dir">Dir</th>
            <th className="lt-dlc">DLC</th>
            <th className="lt-data">Data</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((frame, i) => (
            <tr key={baseIndex + i}>
              <td className="lt-time lt-mono">{frame.timestamp}</td>
              <td className="lt-id  lt-mono">{frame.id}</td>
              {showName && <td className="lt-name">{getMsgLabel(frame.id, dbcData)}</td>}
              <td className="lt-dir">{frame.direction}</td>
              <td className="lt-dlc">{frame.dlc}</td>
              <td className="lt-data lt-mono">{frame.data.join(' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
