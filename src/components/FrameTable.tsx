import { useState, useMemo, useRef, useEffect } from 'react'
import type { CanFrame } from '../parsers/busmaster'
import type { DbcData } from '../parsers/dbc'
import { parseTimestampToMs, formatDelta } from '../utils/time'
import { getMessageLabel, getMessageName } from '../utils/dbc'

interface FrameTableProps {
  frames: CanFrame[]
  filename: string
  skippedLines: number
  dbcData: DbcData | null
}

type SortColumn = 'timestamp' | 'direction' | 'id' | 'dlc'
type SortDirection = 'asc' | 'desc'

interface SortConfig {
  column: SortColumn
  direction: SortDirection
}

interface IndexedFrame {
  frame: CanFrame
  originalIndex: number
}


const MAX_DISPLAYED_FRAMES = 2000

function FrameTable({ frames, filename, skippedLines, dbcData }: FrameTableProps) {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => new Set(frames.map(f => f.id))
  )
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedA, setSelectedA] = useState<number | null>(null)
  const [selectedB, setSelectedB] = useState<number | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // Close filter panel when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { uniqueIds, idCounts } = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const frame of frames) {
      counts[frame.id] = (counts[frame.id] ?? 0) + 1
    }
    return { uniqueIds: Object.keys(counts).sort(), idCounts: counts }
  }, [frames])

  const displayedFrames = useMemo<IndexedFrame[]>(() => {
    let result: IndexedFrame[] = frames
      .map((frame, originalIndex) => ({ frame, originalIndex }))
      .filter(({ frame }) => visibleIds.has(frame.id))

    if (sortConfig) {
      const { column, direction } = sortConfig
      const mul = direction === 'asc' ? 1 : -1
      result = [...result].sort((a, b) => {
        switch (column) {
          case 'timestamp':
            return mul * (parseTimestampToMs(a.frame.timestamp) - parseTimestampToMs(b.frame.timestamp))
          case 'direction':
            return mul * a.frame.direction.localeCompare(b.frame.direction)
          case 'id':
            return mul * a.frame.id.localeCompare(b.frame.id)
          case 'dlc':
            return mul * (a.frame.dlc - b.frame.dlc)
          default:
            return 0
        }
      })
    }

    return result.slice(0, MAX_DISPLAYED_FRAMES)
  }, [frames, visibleIds, sortConfig])

  const delta = useMemo(() => {
    if (selectedA === null || selectedB === null) return null
    const frameA = frames[selectedA]
    const frameB = frames[selectedB]
    if (!frameA || !frameB) return null
    const msA = parseTimestampToMs(frameA.timestamp)
    const msB = parseTimestampToMs(frameB.timestamp)
    return {
      formatted: formatDelta(msB - msA),
      tsA: frameA.timestamp,
      tsB: frameB.timestamp,
    }
  }, [selectedA, selectedB, frames])

  function toggleSort(column: SortColumn) {
    setSortConfig(prev => {
      if (prev?.column === column) {
        return prev.direction === 'asc' ? { column, direction: 'desc' } : null
      }
      return { column, direction: 'asc' }
    })
  }

  function handleRowClick(originalIndex: number) {
    if (selectedA === originalIndex) {
      setSelectedA(selectedB)
      setSelectedB(null)
      return
    }
    if (selectedB === originalIndex) {
      setSelectedB(null)
      return
    }
    if (selectedA === null) {
      setSelectedA(originalIndex)
      return
    }
    if (selectedB === null) {
      setSelectedB(originalIndex)
      return
    }
    setSelectedA(selectedB)
    setSelectedB(originalIndex)
  }

  function getSortIcon(column: SortColumn) {
    if (sortConfig?.column !== column) return <span className="sort-icon inactive">⇅</span>
    return <span className="sort-icon">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
  }

  const totalFiltered = frames.filter(f => visibleIds.has(f.id)).length
  const truncated = totalFiltered > MAX_DISPLAYED_FRAMES

  return (
    <div className="frame-table-wrapper">

      <div className="frame-table-topbar">
        <div className="frame-table-meta">
          <span className="frame-table-filename">{filename}</span>
          <span className="frame-table-stats">
            {totalFiltered.toLocaleString()} / {frames.length.toLocaleString()} frames
            {skippedLines > 0 && ` · ${skippedLines} skipped`}
            {truncated && ` · showing first ${MAX_DISPLAYED_FRAMES.toLocaleString()}`}
          </span>
        </div>

        <div className="frame-table-controls" ref={filterRef}>
          <button className="btn-filter" onClick={() => setFilterOpen(o => !o)}>
            IDs ({visibleIds.size}/{uniqueIds.length}) ▾
          </button>
          {filterOpen && (
            <div className="filter-panel">
              <div className="filter-panel-actions">
                <button onClick={() => setVisibleIds(new Set(uniqueIds))}>All</button>
                <button onClick={() => setVisibleIds(new Set())}>None</button>
              </div>
              <ul className="filter-id-list">
                {uniqueIds.map(id => (
                  <li key={id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={visibleIds.has(id)}
                        onChange={() => setVisibleIds(prev => {
                          const next = new Set(prev)
                          next.has(id) ? next.delete(id) : next.add(id)
                          return next
                        })}
                      />
                      <span className="filter-id-value">{getMessageLabel(id, dbcData)}</span>
                      <span className="filter-id-count">{idCounts[id]}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {delta && (
        <div className="delta-bar">
          <span className="delta-label">Δt</span>
          <span className="delta-ts">{delta.tsA}</span>
          <span className="delta-arrow">→</span>
          <span className="delta-ts">{delta.tsB}</span>
          <span className="delta-value">{delta.formatted}</span>
          <button
            className="delta-close"
            onClick={() => { setSelectedA(null); setSelectedB(null) }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="frame-table-scroll">
        <table className="frame-table">
          <thead>
            <tr>
              <th className="th-sortable" onClick={() => toggleSort('timestamp')}>
                Timestamp {getSortIcon('timestamp')}
              </th>
              <th className="th-sortable" onClick={() => toggleSort('direction')}>
                Dir {getSortIcon('direction')}
              </th>
              <th>Ch</th>
              <th className="th-sortable" onClick={() => toggleSort('id')}>
                CAN ID {getSortIcon('id')}
              </th>
              <th className="th-sortable" onClick={() => toggleSort('dlc')}>
                DLC {getSortIcon('dlc')}
              </th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {displayedFrames.map(({ frame, originalIndex }) => {
              const isA = selectedA === originalIndex
              const isB = selectedB === originalIndex
              return (
                <tr
                  key={originalIndex}
                  onClick={() => handleRowClick(originalIndex)}
                  className={isA ? 'row-selected-a' : isB ? 'row-selected-b' : ''}
                >
                  <td className="cell-mono">{frame.timestamp}</td>
                  <td className={frame.direction === 'Rx' ? 'cell-rx' : 'cell-tx'}>
                    {frame.direction}
                  </td>
                  <td>{frame.channel}</td>
                  <td className="cell-mono cell-id" title={frame.id}>{getMessageName(frame.id, dbcData)}</td>
                  <td>{frame.dlc}</td>
                  <td className="cell-mono cell-data">{frame.data.join(' ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default FrameTable
