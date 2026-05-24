import { Fragment, useEffect, useRef, useState } from 'react'
import type { CanFrame } from '../parsers/busmaster'
import type { DbcData, DbcSignal } from '../parsers/dbc'
import { parseTimestampToMs } from '../utils/time'
import { getMessageName }     from '../utils/dbc'
import { decodeSignal, formatSignalValue } from '../utils/decodeSignal'

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

// Normalize "0x0C0000E4" → "0XC0000E4" to match DBC parser key format
function normalizeId(hexId: string): string {
  const num = parseInt(hexId, 16)
  return '0X' + (num & 0x1fffffff).toString(16).toUpperCase()
}

function getMsgLabel(hexId: string, dbc: DbcData | null): string {
  if (!dbc) return ''
  const key  = normalizeId(hexId)
  const name = getMessageName(key, dbc)
  return name !== key ? name : ''
}

function getMsgSignals(hexId: string, dbc: DbcData | null): DbcSignal[] {
  if (!dbc) return []
  return dbc[normalizeId(hexId)]?.signals ?? []
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

  // ── Unique: incremental map ──────────────────────────────────────────────
  const uniqueMapRef = useRef(new Map<string, UniqueRow>())
  const prevLenRef   = useRef(0)
  const [uniqueRows, setUniqueRows] = useState<UniqueRow[]>([])

  useEffect(() => {
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
        const cycleMs = existing.cycleMs === null ? dt : existing.cycleMs * 0.85 + dt * 0.15
        map.set(frame.id, { frame, count: existing.count + 1, cycleMs, prevTs: ts })
      }
    }
    setUniqueRows(Array.from(map.values()))
  }, [frames])

  // ── Unique: expand state ─────────────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Unique view ──────────────────────────────────────────────────────────
  if (mode === 'unique') {
    const colCount = 6 + (showName ? 1 : 0)

    return (
      <div className="live-table-wrap">
        <table className="live-table">
          <thead>
            <tr>
              <th className="lt-expand" />
              <th className="lt-id">ID</th>
              {showName && <th className="lt-name">Name</th>}
              <th className="lt-count">Count</th>
              <th className="lt-cycle">Cycle&nbsp;(ms)</th>
              <th className="lt-dlc">DLC</th>
              <th className="lt-data">Data</th>
            </tr>
          </thead>
          <tbody>
            {uniqueRows.map(({ frame, count, cycleMs }) => {
              const isExpanded = expandedIds.has(frame.id)
              const signals    = getMsgSignals(frame.id, dbcData)

              return (
                <Fragment key={frame.id}>
                  <tr
                    className={isExpanded ? 'lt-row-expanded' : ''}
                    onClick={() => toggleExpand(frame.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="lt-expand">
                      <span className={`lt-arrow ${isExpanded ? 'lt-arrow-open' : ''}`}>▶</span>
                    </td>
                    <td className="lt-id lt-mono">{frame.id}</td>
                    {showName && <td className="lt-name">{getMsgLabel(frame.id, dbcData)}</td>}
                    <td className="lt-count">{count.toLocaleString()}</td>
                    <td className="lt-cycle">{cycleMs !== null ? cycleMs.toFixed(1) : '—'}</td>
                    <td className="lt-dlc">{frame.dlc}</td>
                    <td className="lt-data lt-mono">{frame.data.join(' ')}</td>
                  </tr>

                  {isExpanded && (
                    <tr className="lt-signal-row">
                      <td colSpan={colCount}>
                        {signals.length === 0 ? (
                          <span className="lt-signal-empty">No signals in DBC for this message</span>
                        ) : (
                          <div className="lt-signal-grid">
                            {signals.map(signal => {
                              const dataBytes = frame.data.map(h => parseInt(h, 16))
                              const value     = decodeSignal(dataBytes, signal)
                              const label     = formatSignalValue(value, signal)
                              return (
                                <div key={signal.name} className="lt-signal-item">
                                  <span className="lt-signal-name">{signal.name}</span>
                                  <span className="lt-signal-val">{label}</span>
                                  {signal.unit && (
                                    <span className="lt-signal-unit">{signal.unit}</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Trace view ───────────────────────────────────────────────────────────
  const visible   = frames.slice(-TRACE_MAX)
  const baseIndex = frames.length - visible.length

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
