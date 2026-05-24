import { useState } from 'react'
import type { SerialPortState } from '../hooks/useSerialPort'
import type { WsPortState }    from '../hooks/useWebSocketPort'
import { CAN_SPEEDS, type CanSpeed } from '../parsers/slcan'
import LiveTable, { type LiveViewMode } from '../components/LiveTable'
import type { DbcData }  from '../parsers/dbc'
import type { CanFrame } from '../parsers/busmaster'

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
    clearFrames()
    setFrozenFrames([])
    setPaused(false)
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
            className="live-btn-disconnect"
            onClick={disconnect}
            disabled={isConnecting}
          >
            Disconnect
          </button>
        </div>
      </div>

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
        />
      )}
    </div>
  )
}

export default LiveView
