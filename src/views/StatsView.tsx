import { useMemo, useState } from 'react'
import type { ImportedFile } from '../types'
import type { DbcData } from '../parsers/dbc'
import { parseTimestampToMs } from '../utils/time'
import { getMessageName } from '../utils/dbc'

interface StatsViewProps {
  importedFile: ImportedFile | null
  dbcData: DbcData | null
}

interface MessageStat {
  id:        string
  name:      string
  count:     number
  periodMs:  number
  avgDtMs:   number
  minDtMs:   number
  maxDtMs:   number
}

type SortKey = Exclude<keyof MessageStat, 'id' | 'name'>

function fmtDt(ms: number): string {
  if (ms <= 0)    return '—'
  if (ms < 1)     return `${(ms * 1000).toFixed(0)} µs`
  if (ms < 1000)  return `${ms.toFixed(1)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s.toFixed(2)} s`
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}m ${sec}s`
}

export default function StatsView({ importedFile, dbcData }: StatsViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('count')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search,  setSearch]  = useState('')

  // ── Compute all stats in one pass ────────────────────────────────────────────
  const stats = useMemo(() => {
    const frames = importedFile?.result.frames
    if (!frames?.length) return null

    const t0abs   = parseTimestampToMs(frames[0].timestamp)
    const tEndAbs = parseTimestampToMs(frames[frames.length - 1].timestamp)
    const duration = Math.max((tEndAbs - t0abs) / 1000, 0.001)

    const byId = new Map<string, number[]>()   // id → timestamps (ms)
    for (const f of frames) {
      if (!byId.has(f.id)) byId.set(f.id, [])
      byId.get(f.id)!.push(parseTimestampToMs(f.timestamp))
    }

    const rows: MessageStat[] = []
    for (const [id, times] of byId) {
      const count  = times.length
      const deltas = times.slice(1).map((t, i) => t - times[i])
      const avgDtMs = deltas.length
        ? deltas.reduce((a, b) => a + b, 0) / deltas.length
        : 0
      const minDtMs = deltas.length ? Math.min(...deltas) : 0
      const maxDtMs = deltas.length ? Math.max(...deltas) : 0

      rows.push({
        id,
        name:    getMessageName(id, dbcData),
        count,
        periodMs: duration > 0 ? (duration * 1000) / count : 0,
        avgDtMs,
        minDtMs,
        maxDtMs,
      })
    }

    return {
      rows,
      totalFrames: frames.length,
      duration,
      uniqueIds:   byId.size,
      avgRate:     frames.length / duration,
    }
  }, [importedFile, dbcData])

  // ── Sort + filter ────────────────────────────────────────────────────────────
  const displayRows = useMemo(() => {
    if (!stats) return []
    const q = search.trim().toLowerCase()
    const filtered = q
      ? stats.rows.filter(r => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      : stats.rows
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] as number
      const vb = b[sortKey] as number
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [stats, sortKey, sortDir, search])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="stats-sort-icon stats-sort-idle">⇅</span>
    return <span className="stats-sort-icon">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  if (!importedFile) {
    return <p className="main-placeholder">Import a CAN log file to get started</p>
  }

  return (
    <div className="stats-view">

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="stats-summary">
        <div className="stats-card">
          <span className="stats-card-value">{stats?.totalFrames.toLocaleString() ?? '—'}</span>
          <span className="stats-card-label">Total frames</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-value">{stats ? fmtDuration(stats.duration) : '—'}</span>
          <span className="stats-card-label">Duration</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-value">{stats?.uniqueIds ?? '—'}</span>
          <span className="stats-card-label">Unique IDs</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-value">{stats ? `${stats.avgRate.toFixed(1)} Hz` : '—'}</span>
          <span className="stats-card-label">Avg bus rate</span>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <input
        className="stats-search"
        placeholder="Filter by ID or name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th className="stats-th">ID</th>
              <th className="stats-th">Name</th>
              <th className="stats-th stats-th-sort stats-th-right" onClick={() => handleSort('count')}>
                Frames <SortIcon col="count" />
              </th>
              <th className="stats-th stats-th-sort stats-th-right" onClick={() => handleSort('periodMs')}>
                Period <SortIcon col="periodMs" />
              </th>
              <th className="stats-th stats-th-sort stats-th-right" onClick={() => handleSort('avgDtMs')}>
                Avg Δt <SortIcon col="avgDtMs" />
              </th>
              <th className="stats-th stats-th-sort stats-th-right" onClick={() => handleSort('minDtMs')}>
                Min Δt <SortIcon col="minDtMs" />
              </th>
              <th className="stats-th stats-th-sort stats-th-right" onClick={() => handleSort('maxDtMs')}>
                Max Δt <SortIcon col="maxDtMs" />
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map(row => (
              <tr key={row.id} className="stats-row">
                <td className="stats-td stats-td-id">{row.id}</td>
                <td className="stats-td stats-td-name">{row.name !== row.id ? row.name : <span className="stats-no-name">—</span>}</td>
                <td className="stats-td stats-td-num">{row.count.toLocaleString()}</td>
                <td className="stats-td stats-td-num">{fmtDt(row.periodMs)}</td>
                <td className="stats-td stats-td-num">{fmtDt(row.avgDtMs)}</td>
                <td className="stats-td stats-td-num">{fmtDt(row.minDtMs)}</td>
                <td className="stats-td stats-td-num">{fmtDt(row.maxDtMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}
