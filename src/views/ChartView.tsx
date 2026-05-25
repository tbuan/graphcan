import { useMemo, useRef, useState, useEffect } from 'react'
import UPlotChart, { type UPlotChartHandle } from '../components/UPlotChart'
import MiniMap from '../components/MiniMap'
import { buildUPlotData } from '../utils/buildChartData'
import type { ImportedFile, ChartConfig, DisplayMode, Annotation } from '../types'
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
  dbcName: string | null
  config: ChartConfig
  onConfigChange: (config: ChartConfig) => void
  themeKey: string
}

function ChartView({ importedFile, dbcData, dbcName, config, onConfigChange, themeKey }: ChartViewProps) {
  const { signals, displayMode } = config
  const chartRef = useRef<UPlotChartHandle>(null)

  const [zoomRange,  setZoomRange]  = useState<[number, number] | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  // Reset zoom and annotations when a new file is imported
  useEffect(() => {
    setZoomRange(null)
    setAnnotations([])
  }, [importedFile?.importKey])

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

  function handleExport() {
    const signalLabels = signals.map(s => {
      const msgName = getMessageName(s.id, dbcData)
      return `${msgName} · B${s.byteIndex}`
    })
    chartRef.current?.exportPNG({ filename: importedFile?.name ?? 'unknown', dbcName, signalLabels })
  }

  // Called by UPlotChart when the user zooms/pans
  function handleRangeChange(min: number, max: number) {
    setZoomRange([min, max])
  }

  // Called by MiniMap when the user drags the viewport
  function handleMinimapRangeChange(min: number, max: number) {
    setZoomRange([min, max])
    chartRef.current?.setRange(min, max)
  }

  function handleAnnotationAdd(t: number) {
    const label = `${t.toFixed(2)}s`
    setAnnotations(prev => [...prev, { t, label }])
  }

  function handleAnnotationRemove(t: number) {
    setAnnotations(prev => prev.filter(a => Math.abs(a.t - t) > 0.001))
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
              <span className="signal-chip-dot" style={{ background: signal.color }} />
              {getMessageName(signal.id, dbcData)} · B{signal.byteIndex}
              <button
                className="signal-chip-remove"
                onClick={() => removeSignal(i)}
                aria-label={`Remove ${signal.id} B${signal.byteIndex}`}
              >×</button>
            </span>
          ))}
        </div>

        <div className="chart-topbar-right">
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

          <button
            className="btn-export"
            onClick={handleExport}
            disabled={signals.length === 0}
            title="Export current view as PNG"
          >
            Export PNG
          </button>
        </div>
      </div>

      {signals.length > 0 ? (
        <>
          <UPlotChart
            ref={chartRef}
            key={importedFile.importKey}
            data={uplotData}
            signals={signals}
            displayMode={displayMode}
            themeKey={themeKey}
            annotations={annotations}
            onAnnotationAdd={handleAnnotationAdd}
            onAnnotationRemove={handleAnnotationRemove}
            onRangeChange={handleRangeChange}
          />
          <MiniMap
            data={uplotData}
            signals={signals}
            viewMin={zoomRange?.[0] ?? null}
            viewMax={zoomRange?.[1] ?? null}
            onRangeChange={handleMinimapRangeChange}
          />
          {annotations.length > 0 && (
            <div className="annotation-list">
              {annotations.map((a, i) => (
                <span key={i} className="annotation-chip">
                  <span className="annotation-chip-dot" />
                  {a.label}
                  <button
                    className="annotation-chip-remove"
                    onClick={() => handleAnnotationRemove(a.t)}
                    aria-label="Remove annotation"
                  >×</button>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="chart-empty">Add signals from the sidebar to get started</p>
      )}

    </div>
  )
}

export default ChartView
