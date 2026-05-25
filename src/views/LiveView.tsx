import { useMemo, useState } from 'react'
import type { SerialPortState } from '../hooks/useSerialPort'
import type { WsPortState }    from '../hooks/useWebSocketPort'
import { CAN_SPEEDS, type CanSpeed } from '../parsers/slcan'
import LiveTable, { type LiveViewMode } from '../components/LiveTable'
import type { DbcData }  from '../parsers/dbc'
import type { CanFrame } from '../parsers/busmaster'
import { getMessageName }  from '../utils/dbc'

function normalizeFrameId(hexId: string): string {
  const num = parseInt(hexId, 16)
  if (isNaN(num)) return hexId.toUpperCase()
  return '0x' + (num & 0x1fffffff).toString(16).toUpperCase()
}

interface LiveViewProps {
  dbcData: DbcData | null
  serial:  SerialPortState
  ws:      WsPortState
}

type ConnectionMode = 'slcan' | 'pcan'

const SPEED_KBPS: { label: string; kbps: number }[] = [
  { label: '10 kbps',  kbps: 10   },
  { label: '20 kbps',  kbps: 20   },
  { label: '50 kbps',  kbps: 50   },
  { label: '100 kbps', kbps: 100  },
  { label: '125 kbps', kbps: 125  },
  { label: '250 kbps', kbps: 250  },
  { label: '500 kbps', kbps: 500  },
  { label: '800 kbps', kbps: 800  },
  { label: '1 Mbps',   kbps: 1000 },
]

const STATUS_DOT: Record<string, string> = {
  disconnected: 'live-dot-off',
  connecting:   'live-dot-connecting',
  connected:    'live-dot-on',
  error:        'live-dot-error',
}

function LiveView({ dbcData, serial, ws }: LiveViewProps) {
  const [connMode, setConnMode] = useState<ConnectionMode>('pcan')

  const [selectedSlcanSpeed, setSelectedSlcanSpeed] = useState<CanSpeed>(CAN_SPEEDS[6])
  const [selectedKbps,       setSelectedKbps]       = useState(500)

  const active = connMode === 'slcan' ? serial : ws
  const { status, error, frames, frameRate, clearFrames, disconnect } = active

  // ── Display state ──────────────────────────────────────────────────────────
  const [viewMode,   setViewMode]   = useState<LiveViewMode>('unique')
  const [autoScroll, setAutoScroll] = useState(true)
  const [paused,     setPaused]     = useState(false)
  const [frozenFrames, setFrozenFrames] = useState<CanFrame[]>([])

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [hiddenIds,       setHiddenIds]       = useState<Set<string>>(new Set())
  const [pinnedIds,       setPinnedIds]       = useState<string[]>([])
  const [manualInput,     setManualInput]     = useState('')

  const seenIds = useMemo(() => {
    const ids = new Set<string>()
    for (const f of frames as CanFrame[]) ids.add(normalizeFrameId(f.id))
    return ids
  }, [frames])

  const allPanelIds = useMemo(
    () => Array.from(new Set([...seenIds, ...pinnedIds])).sort(),
    [seenIds, pinnedIds],
  )

  function getFilterLabel(normalizedId: string): string {
    if (!dbcData) return ''
    const key  = '0X' + normalizedId.slice(2)
    const name = getMessageName(key, dbcData)
    return name !== key ? name : ''
  }

  function toggleHidden(id: string) {
    setHiddenIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleAddManual() {
    const raw = manualInput.trim()
    if (!raw) return
    const num = parseInt(raw.replace(/^0x/i, ''), 16)
    if (isNaN(num)) return
    const normalized = '0x' + (num & 0x1fffffff).toString(16).toUpperCase()
    if (!seenIds.has(normalized) && !pinnedIds.includes(normalized)) {
      setPinnedIds(prev => [...prev, normalized])
    }
    setManualInput('')
  }

  function removePinned(id: string) {
    setPinnedIds(prev => prev.filter(p => p !== id))
    setHiddenIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  function handleShowAll() { setHiddenIds(new Set()) }
  function handleHideAll()  { setHiddenIds(new Set(allPanelIds)) }

  const displayFrames = paused ? frozenFrames : (frames as CanFrame[])

  function handleConnect() {
    if (connMode === 'slcan') serial.connect(selectedSlcanSpeed.cmd)
    else                      ws.connect(selectedKbps)
  }

  function togglePause() {
    if (!paused) setFrozenFrames([...(frames as CanFrame[])])
    setPaused(p => !p)
  }

  function handleClear() {
    setRecordState('idle')
    clearFrames()
    setFrozenFrames([])
    setPaused(false)
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  // frames is append-only, so we only need to remember the start index.
  const [recordState,    setRecordState]    = useState<'idle' | 'naming' | 'recording'>('idle')
  const [recordName,     setRecordName]     = useState('')
  const [recordStartIdx, setRecordStartIdx] = useState(0)

  function handleStartRecording() {
    if (!recordName.trim()) return
    setRecordStartIdx((frames as CanFrame[]).length)
    setRecordState('recording')
  }

  function handleStopRecording() {
    const recorded = (frames as CanFrame[]).slice(recordStartIdx)
    setRecordState('idle')
    if (recorded.length === 0) return

    const withName = dbcData !== null
    const headers  = ['Timestamp', 'ID', ...(withName ? ['Name'] : []), 'Direction', 'DLC', 'Data']
    const rows     = recorded.map((f: CanFrame) => {
      const label = withName ? getFilterLabel(normalizeFrameId(f.id)) : ''
      const cols  = [f.timestamp, f.id, ...(withName ? [label] : []), f.direction, String(f.dlc), f.data.join(' ')]
      return cols.map(v => `"${v.replace(/"/g, '""')}"`).join(',')
    })

    const csv  = [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${recordName.trim().replace(/[^a-z0-9_-]/gi, '_') || 'graphcan'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setRecordName('')
  }

  const isConnected  = status === 'connected'
  const isConnecting = status === 'connecting'

  // ── Connection screen ──────────────────────────────────────────────────────
  if (status === 'disconnected' || status === 'error') {
    return (
      <div className="live-connect-screen">
        <div className="live-connect-card">
          <h2 className="live-connect-title">Live CAN Sniffer</h2>

          <div className="live-mode-tabs">
            <button
              className={`live-mode-tab ${connMode === 'pcan' ? 'active' : ''}`}
              onClick={() => setConnMode('pcan')}
            >
              PCAN-USB
              <span className="live-mode-tag">via local server</span>
            </button>
            <button
              className={`live-mode-tab ${connMode === 'slcan' ? 'active' : ''}`}
              onClick={() => setConnMode('slcan')}
            >
              SLCAN
              <span className="live-mode-tag">CANable / CANtact</span>
            </button>
          </div>

          {connMode === 'pcan' ? (
            <>
              <p className="live-connect-subtitle">
                Requires the local bridge to be running:<br />
                <code className="live-code">cd server &amp;&amp; npm install &amp;&amp; npm start</code>
              </p>
              <div className="live-connect-form">
                <label className="live-connect-label">CAN bus speed</label>
                <div className="live-speed-grid">
                  {SPEED_KBPS.map(s => (
                    <button
                      key={s.kbps}
                      className={`live-speed-btn ${selectedKbps === s.kbps ? 'active' : ''}`}
                      onClick={() => setSelectedKbps(s.kbps)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="live-connect-subtitle">
                Requires a SLCAN-compatible adapter (CANable, PCAN-USB FD…) and Chrome or Edge.
              </p>
              <div className="live-connect-form">
                <label className="live-connect-label">CAN bus speed</label>
                <div className="live-speed-grid">
                  {CAN_SPEEDS.map(s => (
                    <button
                      key={s.cmd}
                      className={`live-speed-btn ${selectedSlcanSpeed.cmd === s.cmd ? 'active' : ''}`}
                      onClick={() => setSelectedSlcanSpeed(s)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <pre className="live-connect-error">{error}</pre>}

          <button className="live-connect-btn" onClick={handleConnect}>
            Connect
          </button>
        </div>
      </div>
    )
  }

  // ── Active capture screen ──────────────────────────────────────────────────
  return (
    <div className="live-view">
      <div className="live-topbar">

        {/* Left: connection status */}
        <div className="live-status">
          <span className={`live-dot ${STATUS_DOT[status]}`} />
          <span className="live-status-label">
            {isConnecting ? 'Connecting…' : 'Connected'}
          </span>
          <span className="live-speed-badge">
            {connMode === 'slcan' ? selectedSlcanSpeed.label : `${selectedKbps} kbps`}
          </span>
          <span className="live-mode-badge">{connMode === 'pcan' ? 'PCAN' : 'SLCAN'}</span>
        </div>

        {/* Center: frame stats */}
        <div className="live-stats">
          <span className="live-stat">
            <span className="live-stat-value">
              {(frames as CanFrame[]).length.toLocaleString()}
            </span>
            <span className="live-stat-label">frames</span>
          </span>
          <span className="live-stat">
            <span className="live-stat-value">{frameRate}</span>
            <span className="live-stat-label">frames/s</span>
          </span>
        </div>

        {/* Right: controls */}
        <div className="live-actions">

          {/* Unique / Trace toggle */}
          <div className="live-view-toggle">
            <button
              className={viewMode === 'unique' ? 'active' : ''}
              onClick={() => setViewMode('unique')}
              title="One row per ID — latest frame + cycle time"
            >
              Unique
            </button>
            <button
              className={viewMode === 'trace' ? 'active' : ''}
              onClick={() => setViewMode('trace')}
              title="Chronological stream of all received frames"
            >
              Trace
            </button>
          </div>

          {viewMode === 'trace' && (
            <button
              className={`live-btn-autoscroll ${autoScroll ? 'active' : ''}`}
              onClick={() => setAutoScroll(a => !a)}
              title="Scroll to latest frame automatically"
            >
              ↓
            </button>
          )}

          <button
            className={`live-btn-pause ${paused ? 'active' : ''}`}
            onClick={togglePause}
            disabled={isConnecting}
            title={paused ? 'Resume live display' : 'Freeze display without disconnecting'}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>

          <button
            className="live-btn-clear"
            onClick={handleClear}
            disabled={isConnecting}
          >
            Clear
          </button>

          <button
            className={`live-btn-filter ${filterPanelOpen ? 'active' : ''} ${hiddenIds.size > 0 ? 'live-btn-filter-on' : ''}`}
            onClick={() => setFilterPanelOpen(o => !o)}
            title="Message filter"
          >
            Filter{hiddenIds.size > 0 ? ` (${allPanelIds.length - hiddenIds.size}/${allPanelIds.length})` : ''}
          </button>

          {recordState === 'idle' && (
            <button
              className="live-btn-record"
              onClick={() => setRecordState('naming')}
              title="Start recording frames to CSV"
            >
              ● Record
            </button>
          )}

          {recordState === 'naming' && (
            <div className="live-record-naming">
              <input
                className="live-record-input"
                type="text"
                placeholder="File name…"
                value={recordName}
                autoFocus
                onChange={e => setRecordName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  handleStartRecording()
                  if (e.key === 'Escape') setRecordState('idle')
                }}
              />
              <button className="live-record-start" onClick={handleStartRecording}>Start</button>
              <button className="live-record-cancel" onClick={() => setRecordState('idle')}>×</button>
            </div>
          )}

          {recordState === 'recording' && (
            <div className="live-recording-active">
              <span className="live-rec-dot" />
              <span className="live-rec-label">Recording…</span>
              <button className="live-btn-stop" onClick={handleStopRecording}>Stop</button>
            </div>
          )}

          <button
            className="live-btn-disconnect"
            onClick={disconnect}
            disabled={isConnecting}
          >
            Disconnect
          </button>
        </div>
      </div>

      {filterPanelOpen && (
        <div className="live-filter-panel">
          <div className="lfp-toolbar">
            <div className="lfp-add">
              <input
                className="lfp-add-input"
                type="text"
                placeholder="Add ID (e.g. 0x1A2B3C4D)"
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddManual() }}
              />
              <button className="lfp-add-btn" onClick={handleAddManual}>Add</button>
            </div>
            <div className="lfp-bulk">
              <button onClick={handleShowAll}>Show all</button>
              <button onClick={handleHideAll}>Hide all</button>
            </div>
          </div>

          <div className="lfp-list">
            {allPanelIds.length === 0 ? (
              <span className="lfp-empty">No messages yet — add an ID above or wait for frames</span>
            ) : (
              allPanelIds.map(id => {
                const isSeen   = seenIds.has(id)
                const isHidden = hiddenIds.has(id)
                const label    = getFilterLabel(id)
                return (
                  <label key={id} className={`lfp-item ${isHidden ? 'lfp-item-hidden' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => toggleHidden(id)}
                    />
                    <span className="lfp-id">{id}</span>
                    {label && <span className="lfp-name">{label}</span>}
                    {!isSeen && (
                      <>
                        <span className="lfp-badge">not seen</span>
                        <button
                          className="lfp-remove"
                          onClick={e => { e.preventDefault(); removePinned(id) }}
                          title="Remove"
                        >×</button>
                      </>
                    )}
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}

      {displayFrames.length === 0 ? (
        <p className="main-placeholder">
          {paused
            ? 'No frames captured before pause.'
            : isConnected ? 'Waiting for frames…' : 'Connecting…'}
        </p>
      ) : (
        <LiveTable
          frames={displayFrames}
          dbcData={dbcData}
          mode={viewMode}
          autoScroll={autoScroll}
          hiddenIds={hiddenIds}
        />
      )}
    </div>
  )
}

export default LiveView
