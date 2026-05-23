import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseTimestampToMs } from '../utils/time'
import { getMessageLabel } from '../utils/dbc'
import type { ImportedFile, Signal } from '../types'
import type { DbcData } from '../parsers/dbc'

interface SidebarProps {
  importedFile: ImportedFile | null
  dbcData: DbcData | null
  onAddSignal: (signal: Signal) => void
}

function Sidebar({ importedFile, dbcData, onAddSignal }: SidebarProps) {
  const navigate = useNavigate()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const duration = useMemo(() => {
    const frames = importedFile?.result.frames
    if (!frames || frames.length < 2) return null
    const ms = parseTimestampToMs(frames[frames.length - 1].timestamp)
             - parseTimestampToMs(frames[0].timestamp)
    return ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(2)} s`
  }, [importedFile])

  const idStats = useMemo(() => {
    if (!importedFile) return []
    const counts: Record<string, number> = {}
    const dlcs: Record<string, number> = {}
    for (const frame of importedFile.result.frames) {
      counts[frame.id] = (counts[frame.id] ?? 0) + 1
      if (!dlcs[frame.id]) dlcs[frame.id] = frame.dlc
    }
    return Object.entries(counts)
      .map(([id, count]) => ({ id, count, dlc: dlcs[id] ?? 8 }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [importedFile])

  function handleAddByte(id: string, byteIndex: number) {
    onAddSignal({ id, byteIndex })
    navigate('/chart')
    setExpandedId(null)
  }

  if (!importedFile) {
    return (
      <aside className="sidebar">
        <p className="sidebar-placeholder">No file loaded</p>
      </aside>
    )
  }

  const { metadata, frames } = importedFile.result

  return (
    <aside className="sidebar">

      <section className="sidebar-section">
        <h2 className="sidebar-section-title">File</h2>
        <dl className="sidebar-info-list">
          <div className="sidebar-info-row">
            <dt>Name</dt>
            <dd className="sidebar-filename" title={importedFile.name}>
              {importedFile.name}
            </dd>
          </div>
          <div className="sidebar-info-row">
            <dt>Frames</dt>
            <dd>{frames.length.toLocaleString()}</dd>
          </div>
          {duration && (
            <div className="sidebar-info-row">
              <dt>Duration</dt>
              <dd>{duration}</dd>
            </div>
          )}
          {metadata.baudrate && (
            <div className="sidebar-info-row">
              <dt>Baudrate</dt>
              <dd>{metadata.baudrate}</dd>
            </div>
          )}
          {metadata.startDate && (
            <div className="sidebar-info-row">
              <dt>Date</dt>
              <dd>{metadata.startDate}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="sidebar-section sidebar-section-grow">
        <h2 className="sidebar-section-title">CAN IDs ({idStats.length})</h2>
        <ul className="sidebar-id-list">
          {idStats.map(({ id, count, dlc }) => (
            <li key={id} className={`sidebar-id-item ${expandedId === id ? 'sidebar-id-item-open' : ''}`}>
              <div className="sidebar-id-row">
                <span className="sidebar-id-value" title={id}>
                  {getMessageLabel(id, dbcData)}
                </span>
                <span className="sidebar-id-count">{count}</span>
                <button
                  className="sidebar-id-add"
                  onClick={() => setExpandedId(expandedId === id ? null : id)}
                  aria-label={`Add signal from ${id}`}
                >
                  {expandedId === id ? '×' : '+'}
                </button>
              </div>
              {expandedId === id && (
                <div className="sidebar-byte-picker">
                  {Array.from({ length: dlc }, (_, b) => (
                    <button
                      key={b}
                      className="sidebar-byte-btn"
                      onClick={() => handleAddByte(id, b)}
                    >
                      B{b}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

    </aside>
  )
}

export default Sidebar
