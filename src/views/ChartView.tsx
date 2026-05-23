import { useState, useMemo } from 'react'
import UPlotChart from '../components/UPlotChart'
import { buildUPlotData } from '../utils/buildChartData'
import { BYTE_COLORS } from '../utils/chartColors'
import type { ImportedFile, ChartConfig, DisplayMode } from '../types'

const DISPLAY_MODES: { value: DisplayMode; label: string }[] = [
  { value: 'line',        label: 'Line' },
  { value: 'points',      label: 'Points' },
  { value: 'line+points', label: 'Line + Points' },
]

interface ChartViewProps {
  importedFile: ImportedFile | null
  config: ChartConfig
  onConfigChange: (config: ChartConfig) => void
}

function ChartView({ importedFile, config, onConfigChange }: ChartViewProps) {
  const { signals, displayMode } = config

  // Local state for the "add signal" form — ephemeral, no need to persist
  const [pendingId, setPendingId] = useState<string>('')
  const [pendingByte, setPendingByte] = useState<number>(0)

  const uniqueIds = useMemo(() => {
    if (!importedFile) return []
    return Array.from(new Set(importedFile.result.frames.map(f => f.id))).sort()
  }, [importedFile])

  const pendingDlc = useMemo(() => {
    if (!importedFile || !pendingId) return 8
    return importedFile.result.frames.find(f => f.id === pendingId)?.dlc ?? 8
  }, [importedFile, pendingId])

  const uplotData = useMemo(
    () => buildUPlotData(importedFile?.result.frames ?? [], signals),
    [importedFile, signals],
  )

  function addSignal() {
    if (!pendingId) return
    const already = signals.some(s => s.id === pendingId && s.byteIndex === pendingByte)
    if (already) return
    onConfigChange({ ...config, signals: [...signals, { id: pendingId, byteIndex: pendingByte }] })
  }

  function removeSignal(index: number) {
    onConfigChange({ ...config, signals: signals.filter((_, i) => i !== index) })
  }

  function setDisplayMode(mode: DisplayMode) {
    onConfigChange({ ...config, displayMode: mode })
  }

  if (!importedFile) {
    return <p className="main-placeholder">Import a CAN log file to get started</p>
  }

  return (
    <div className="chart-view">

      {/* Controls row */}
      <div className="chart-controls">
        <div className="chart-control-group">
          <label className="chart-label">CAN ID</label>
          <select
            className="chart-select"
            value={pendingId}
            onChange={e => { setPendingId(e.target.value); setPendingByte(0) }}
          >
            <option value="">— select —</option>
            {uniqueIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>

        {pendingId && (
          <div className="chart-control-group">
            <label className="chart-label">Byte</label>
            <div className="chart-byte-selector">
              {Array.from({ length: pendingDlc }, (_, i) => i).map(b => (
                <button
                  key={b}
                  className={`btn-byte ${pendingByte === b ? 'btn-byte-active' : ''}`}
                  onClick={() => setPendingByte(b)}
                >
                  B{b}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className="btn-add-signal"
          onClick={addSignal}
          disabled={!pendingId}
        >
          + Add
        </button>

        <div className="chart-control-group chart-control-right">
          <label className="chart-label">Display</label>
          <div className="chart-mode-selector">
            {DISPLAY_MODES.map(m => (
              <button
                key={m.value}
                className={`btn-mode ${displayMode === m.value ? 'btn-mode-active' : ''}`}
                onClick={() => setDisplayMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active signals */}
      {signals.length > 0 && (
        <div className="signal-chips">
          {signals.map((signal, i) => (
            <span key={i} className="signal-chip">
              <span
                className="signal-chip-dot"
                style={{ background: BYTE_COLORS[i % BYTE_COLORS.length] }}
              />
              {signal.id} · B{signal.byteIndex}
              <button
                className="signal-chip-remove"
                onClick={() => removeSignal(i)}
                aria-label={`Remove ${signal.id} B${signal.byteIndex}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Chart or empty state */}
      {signals.length > 0 ? (
        <UPlotChart
          key={importedFile.importKey}
          data={uplotData}
          signals={signals}
          displayMode={displayMode}
        />
      ) : (
        <p className="chart-empty">Select a CAN ID and a byte, then click + Add</p>
      )}

    </div>
  )
}

export default ChartView
