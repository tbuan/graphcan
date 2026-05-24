import { useState, useMemo, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CanFrame } from '../parsers/busmaster'
import type { DbcData } from '../parsers/dbc'
import { parseTimestampToMs, formatDelta } from '../utils/time'
import { getMessageLabel, getMessageName } from '../utils/dbc'
import { decodeSignal, decodeRawInt } from '../utils/decodeSignal'

interface FrameTableProps {
  frames: CanFrame[]
  filename: string
  skippedLines: number
  dbcData: DbcData | null
}

type SortColumn   = 'timestamp' | 'direction' | 'id' | 'dlc'
type SearchField  = 'id' | 'time' | 'data'

const SEARCH_FIELD_LABELS: Record<SearchField, string> = { id: 'ID', time: 'Time', data: 'Data' }
const ALL_SEARCH_FIELDS: SearchField[] = ['id', 'time', 'data']
type SortDirection = 'asc' | 'desc'

interface SortConfig {
  column: SortColumn
  direction: SortDirection
}

interface IndexedFrame {
  frame: CanFrame
  originalIndex: number
}

// Each virtual row is either a frame row or its expanded signal sub-row
type FlatItem =
  | { type: 'frame';   indexed: IndexedFrame }
  | { type: 'signals'; indexed: IndexedFrame }

function loadTablePrefs() {
  try {
    return {
      displayHex:  JSON.parse(localStorage.getItem('graphcan-table-displayhex') ?? 'true') as boolean,
      sortConfig:  JSON.parse(localStorage.getItem('graphcan-table-sort') ?? 'null') as SortConfig | null,
    }
  } catch { return { displayHex: true, sortConfig: null } }
}

function loadSavedVisibleIds(allIds: Set<string>, filename: string): Set<string> {
  try {
    const raw = localStorage.getItem('graphcan-table-filter')
    if (!raw) return allIds
    const { filename: savedName, hiddenIds } = JSON.parse(raw) as { filename: string; hiddenIds: string[] }
    if (savedName !== filename) return allIds
    const hidden = new Set(hiddenIds)
    return new Set([...allIds].filter(id => !hidden.has(id)))
  } catch { return allIds }
}

function FrameTable({ frames, filename, skippedLines, dbcData }: FrameTableProps) {
  const allIds = useMemo(() => new Set(frames.map(f => f.id)), [frames])

  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => loadSavedVisibleIds(new Set(frames.map(f => f.id)), filename)
  )
  const [sortConfig, setSortConfig]   = useState<SortConfig | null>(() => loadTablePrefs().sortConfig)
  const [filterOpen, setFilterOpen]   = useState(false)
  const [selectedA, setSelectedA]     = useState<number | null>(null)
  const [selectedB, setSelectedB]     = useState<number | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [displayHex, setDisplayHex]   = useState(() => loadTablePrefs().displayHex)
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchFields, setSearchFields]   = useState<Set<SearchField>>(
    () => new Set<SearchField>(ALL_SEARCH_FIELDS)
  )

  const filterRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    localStorage.setItem('graphcan-table-displayhex', JSON.stringify(displayHex))
    localStorage.setItem('graphcan-table-sort', JSON.stringify(sortConfig))
  }, [displayHex, sortConfig])

  useEffect(() => {
    const hiddenIds = [...allIds].filter(id => !visibleIds.has(id))
    localStorage.setItem('graphcan-table-filter', JSON.stringify({ filename, hiddenIds }))
  }, [visibleIds, allIds, filename])

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
          case 'timestamp': return mul * (parseTimestampToMs(a.frame.timestamp) - parseTimestampToMs(b.frame.timestamp))
          case 'direction': return mul * a.frame.direction.localeCompare(b.frame.direction)
          case 'id':        return mul * a.frame.id.localeCompare(b.frame.id)
          case 'dlc':       return mul * (a.frame.dlc - b.frame.dlc)
          default:          return 0
        }
      })
    }

    if (searchQuery.trim() && searchFields.size > 0) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(({ frame }) => {
        if (searchFields.has('id') && (
          frame.id.toLowerCase().includes(q) ||
          getMessageName(frame.id, dbcData).toLowerCase().includes(q)
        )) return true
        if (searchFields.has('time') && frame.timestamp.toLowerCase().includes(q)) return true
        if (searchFields.has('data') && frame.data.join(' ').toLowerCase().includes(q)) return true
        return false
      })
    }

    return result
  }, [frames, visibleIds, sortConfig, searchQuery, searchFields, dbcData])

  // Flatten frames + expanded signal sub-rows into a single list for the virtualizer
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = []
    for (const indexed of displayedFrames) {
      items.push({ type: 'frame', indexed })
      if (expandedRows.has(indexed.originalIndex)) {
        items.push({ type: 'signals', indexed })
      }
    }
    return items
  }, [displayedFrames, expandedRows])

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => flatItems[i].type === 'frame' ? 33 : 88,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 10,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize    = virtualizer.getTotalSize()
  const topPadding    = virtualItems.length > 0 ? virtualItems[0].start : 0
  const bottomPadding = virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0

  const delta = useMemo(() => {
    if (selectedA === null || selectedB === null) return null
    const frameA = frames[selectedA]
    const frameB = frames[selectedB]
    if (!frameA || !frameB) return null
    const msA = parseTimestampToMs(frameA.timestamp)
    const msB = parseTimestampToMs(frameB.timestamp)
    return { formatted: formatDelta(msB - msA), tsA: frameA.timestamp, tsB: frameB.timestamp }
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
    if (selectedA === originalIndex) { setSelectedA(selectedB); setSelectedB(null); return }
    if (selectedB === originalIndex) { setSelectedB(null); return }
    if (selectedA === null)          { setSelectedA(originalIndex); return }
    if (selectedB === null)          { setSelectedB(originalIndex); return }
    setSelectedA(selectedB)
    setSelectedB(originalIndex)
  }

  function toggleExpand(originalIndex: number) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(originalIndex) ? next.delete(originalIndex) : next.add(originalIndex)
      return next
    })
  }

  function getSortIcon(column: SortColumn) {
    if (sortConfig?.column !== column) return <span className="sort-icon inactive">⇅</span>
    return <span className="sort-icon">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
  }

  const totalFiltered = displayedFrames.length

  return (
    <div className="frame-table-wrapper">

      <div className="frame-table-topbar">
        <div className="frame-table-meta">
          <span className="frame-table-filename">{filename}</span>
          <span className="frame-table-stats">
            {totalFiltered.toLocaleString()} / {frames.length.toLocaleString()} frames
            {skippedLines > 0 && ` · ${skippedLines} skipped`}
          </span>
        </div>

        <div className="frame-table-search-group">
          <input
            className="frame-table-search"
            type="search"
            placeholder="Search…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <div className="search-field-toggles">
            {ALL_SEARCH_FIELDS.map(field => (
              <button
                key={field}
                className={`btn-search-field ${searchFields.has(field) ? 'active' : ''}`}
                onClick={() => setSearchFields(prev => {
                  const next = new Set(prev)
                  if (next.has(field) && next.size > 1) next.delete(field)
                  else next.add(field)
                  return next
                })}
              >
                {SEARCH_FIELD_LABELS[field]}
              </button>
            ))}
          </div>
        </div>

        <div className="frame-table-right-controls">
          <button
            className={`btn-hex-toggle ${displayHex ? 'active' : ''}`}
            onClick={() => setDisplayHex(v => !v)}
            title="Toggle hex / decimal display"
          >
            {displayHex ? 'HEX' : 'DEC'}
          </button>

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
      </div>

      {delta && (
        <div className="delta-bar">
          <span className="delta-label">Δt</span>
          <span className="delta-ts">{delta.tsA}</span>
          <span className="delta-arrow">→</span>
          <span className="delta-ts">{delta.tsB}</span>
          <span className="delta-value">{delta.formatted}</span>
          <button className="delta-close" onClick={() => { setSelectedA(null); setSelectedB(null) }}>✕</button>
        </div>
      )}

      <div className="frame-table-scroll" ref={scrollRef}>
        <table className="frame-table">
          <thead>
            <tr>
              <th className="th-expand"></th>
              <th className="th-sortable" onClick={() => toggleSort('timestamp')}>Timestamp {getSortIcon('timestamp')}</th>
              <th className="th-sortable" onClick={() => toggleSort('direction')}>Dir {getSortIcon('direction')}</th>
              <th>Ch</th>
              <th className="th-sortable" onClick={() => toggleSort('id')}>CAN ID {getSortIcon('id')}</th>
              <th className="th-sortable" onClick={() => toggleSort('dlc')}>DLC {getSortIcon('dlc')}</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {topPadding > 0 && (
              <tr><td colSpan={7} style={{ height: topPadding, padding: 0 }} /></tr>
            )}

            {virtualItems.map(vItem => {
              const item = flatItems[vItem.index]

              if (item.type === 'frame') {
                const { frame, originalIndex } = item.indexed
                const isA = selectedA === originalIndex
                const isB = selectedB === originalIndex
                const message   = dbcData?.[frame.id]
                const hasSignals = (message?.signals.length ?? 0) > 0
                const isExpanded = expandedRows.has(originalIndex)
                return (
                  <tr
                    key={`f-${originalIndex}`}
                    data-index={vItem.index}
                    ref={virtualizer.measureElement}
                    onClick={() => handleRowClick(originalIndex)}
                    className={isA ? 'row-selected-a' : isB ? 'row-selected-b' : ''}
                  >
                    <td className="cell-expand">
                      {hasSignals && (
                        <button
                          className="btn-expand"
                          onClick={e => { e.stopPropagation(); toggleExpand(originalIndex) }}
                          aria-label={isExpanded ? 'Collapse signals' : 'Expand signals'}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      )}
                    </td>
                    <td className="cell-mono">{frame.timestamp}</td>
                    <td className={frame.direction === 'Rx' ? 'cell-rx' : 'cell-tx'}>{frame.direction}</td>
                    <td>{frame.channel}</td>
                    <td className="cell-mono cell-id" title={frame.id}>{getMessageName(frame.id, dbcData)}</td>
                    <td>{frame.dlc}</td>
                    <td className="cell-mono cell-data">
                      {displayHex
                        ? frame.data.join(' ')
                        : frame.data.map(b => parseInt(b, 16)).join(' ')}
                    </td>
                  </tr>
                )
              }

              // type === 'signals'
              const { frame, originalIndex } = item.indexed
              const message = dbcData![frame.id]
              const bytes = frame.data.map(b => parseInt(b, 16))
              const switchSignal = message.signals.find(s => s.mux?.kind === 'switch')
              const activeMuxId  = switchSignal ? decodeRawInt(bytes, switchSignal) : null
              const visibleSignals = message.signals.filter(s => {
                if (!s.mux) return true
                if (s.mux.kind === 'switch') return true
                return activeMuxId !== null && s.mux.id === activeMuxId
              })
              return (
                <tr
                  key={`s-${originalIndex}`}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  className="row-signals"
                >
                  <td colSpan={7}>
                    <div className="signal-decode-grid">
                      {visibleSignals.map(signal => {
                        const raw   = decodeRawInt(bytes, signal)
                        const label = signal.values?.[raw]
                        let formatted: string
                        let unit: string | null = null

                        if (displayHex) {
                          formatted = `0x${raw.toString(16).toUpperCase()}`
                        } else if (label !== undefined) {
                          formatted = label
                        } else {
                          const value = decodeSignal(bytes, signal)
                          formatted = isFinite(value) ? parseFloat(value.toPrecision(6)).toString() : '—'
                          unit = signal.unit || null
                        }

                        return (
                          <div key={signal.name} className="signal-decode-item" title={label && displayHex ? label : undefined}>
                            <span className="signal-decode-name">{signal.name}</span>
                            <span className="signal-decode-value">{formatted}</span>
                            {unit && <span className="signal-decode-unit">{unit}</span>}
                            {label && displayHex && <span className="signal-decode-label">{label}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}

            {bottomPadding > 0 && (
              <tr><td colSpan={7} style={{ height: bottomPadding, padding: 0 }} /></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default FrameTable
