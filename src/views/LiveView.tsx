import { useState } from 'react'
import { useSerialPort }    from '../hooks/useSerialPort'
import { useWebSocketPort } from '../hooks/useWebSocketPort'
import { CAN_SPEEDS, type CanSpeed } from '../parsers/slcan'
import FrameTable           from '../components/FrameTable'
import type { DbcData }     from '../parsers/dbc'
import type { CanFrame }    from '../parsers/busmaster'

interface LiveViewProps {
  dbcData: DbcData | null
}

type ConnectionMode = 'slcan' | 'pcan'

const SPEED_KBPS: { label: string; kbps: number }[] = [
  { label: '10 kbps',  kbps: 10  },
  { label: '20 kbps',  kbps: 20  },
  { label: '50 kbps',  kbps: 50  },
  { label: '100 kbps', kbps: 100 },
  { label: '125 kbps', kbps: 125 },
  { label: '250 kbps', kbps: 250 },
  { label: '500 kbps', kbps: 500 },
  { label: '800 kbps', kbps: 800 },
  { label: '1 Mbps',   kbps: 1000 },
]

const STATUS_DOT: Record<string, string> = {
  disconnected: 'live-dot-off',
  connecting:   'live-dot-connecting',
  connected:    'live-dot-on',
  error:        'live-dot-error',
}

function LiveView({ dbcData }: LiveViewProps) {
  const [mode, setMode] = useState<ConnectionMode>('pcan')

  // Speed state shared between modes
  const [selectedSlcanSpeed, setSelectedSlcanSpeed] = useState<CanSpeed>(CAN_SPEEDS[6])
  const [selectedKbps,       setSelectedKbps]       = useState(500)

  const serial = useSerialPort()
  const ws     = useWebSocketPort()

  // Active hook depending on chosen mode
  const active = mode === 'slcan' ? serial : ws
  const { status, error, frames, frameRate, clearFrames, disconnect } = active

  function handleConnect() {
    if (mode === 'slcan') {
      serial.connect(selectedSlcanSpeed.cmd)
    } else {
      ws.connect(selectedKbps)
    }
  }

  const isConnected  = status === 'connected'
  const isConnecting = status === 'connecting'

  // ── Connection screen (shown when not connected) ──────────────────────────
  if (status === 'disconnected' || status === 'error') {
    return (
      <div className="live-connect-screen">
        <div className="live-connect-card">
          <h2 className="live-connect-title">Live CAN Sniffer</h2>

          {/* Mode selector */}
          <div className="live-mode-tabs">
            <button
              className={`live-mode-tab ${mode === 'pcan' ? 'active' : ''}`}
              onClick={() => setMode('pcan')}
            >
              PCAN-USB
              <span className="live-mode-tag">via local server</span>
            </button>
            <button
              className={`live-mode-tab ${mode === 'slcan' ? 'active' : ''}`}
              onClick={() => setMode('slcan')}
            >
              SLCAN
              <span className="live-mode-tag">CANable / CANtact</span>
            </button>
          </div>

          {mode === 'pcan' ? (
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

  // ── Active capture screen ─────────────────────────────────────────────────
  return (
    <div className="live-view">
      <div className="live-topbar">
        <div className="live-status">
          <span className={`live-dot ${STATUS_DOT[status]}`} />
          <span className="live-status-label">
            {isConnecting ? 'Connecting…' : 'Connected'}
          </span>
          <span className="live-speed-badge">
            {mode === 'slcan' ? selectedSlcanSpeed.label : `${selectedKbps} kbps`}
          </span>
          <span className="live-mode-badge">{mode === 'pcan' ? 'PCAN' : 'SLCAN'}</span>
        </div>

        <div className="live-stats">
          <span className="live-stat">
            <span className="live-stat-value">{(frames as CanFrame[]).length.toLocaleString()}</span>
            <span className="live-stat-label">frames</span>
          </span>
          <span className="live-stat">
            <span className="live-stat-value">{frameRate}</span>
            <span className="live-stat-label">frames/s</span>
          </span>
        </div>

        <div className="live-actions">
          <button className="live-btn-clear" onClick={clearFrames} disabled={isConnecting}>
            Clear
          </button>
          <button className="live-btn-disconnect" onClick={disconnect} disabled={isConnecting}>
            Disconnect
          </button>
        </div>
      </div>

      {(frames as CanFrame[]).length === 0 ? (
        <p className="main-placeholder">
          {isConnected ? 'Waiting for frames…' : 'Connecting…'}
        </p>
      ) : (
        <FrameTable
          frames={frames as CanFrame[]}
          filename="Live capture"
          skippedLines={0}
          dbcData={dbcData}
        />
      )}
    </div>
  )
}

export default LiveView
