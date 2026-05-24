import { useMemo } from 'react'
import UPlotChart from '../components/UPlotChart'
import { buildUPlotData } from '../utils/buildChartData'
import type { ImportedFile, ChartConfig, DisplayMode } from '../types'
import type { DbcData } from '../parsers/dbc'
import { getMessageName } from '../utils/dbc'

const DISPLAY_MODES: { value: DisplayMode; label: string }[] = [
  { value: 'line',        label: 'Line' },
  { value: 'points',      label: 'Points' },
  { value: 'line+points', label: 'Line + Points' },
]

interface ChartViewProps {
  importedFile: ImportedFile | null
  dbcData: DbcData | null
  config: ChartConfig
  onConfigChange: (config: ChartConfig) => void
  themeKey: string
}

function ChartView({ importedFile, dbcData, config, onConfigChange, themeKey }: ChartViewProps) {
  const { signals, displayMode } = config

  const uplotData = useMemo(
    () => buildUPlotData(importedFile?.result.frames ?? [], signals),
    [importedFile, signals],
  )

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

      <div className="chart-topbar">
        <div className="signal-chips">
          {signals.map((signal, i) => (
            <span key={i} className="signal-chip">
              <span
                className="signal-chip-dot"
                style={{ background: signal.color }}
              />
              {getMessageName(signal.id, dbcData)} · B{signal.byteIndex}
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

      {signals.length > 0 ? (
        <UPlotChart
          key={importedFile.importKey}
          data={uplotData}
          signals={signals}
          displayMode={displayMode}
          themeKey={themeKey}
        />
      ) : (
        <p className="chart-empty">Add signals from the sidebar to get started</p>
      )}

    </div>
  )
}

export default ChartView
