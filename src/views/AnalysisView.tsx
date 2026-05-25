import { useRef, useState, useMemo, useEffect } from 'react'
import uPlot from 'uplot'
import SignalPanel from '../components/SignalPanel'
import MiniMap from '../components/MiniMap'
import type { ImportedFile, AnalysisPanel, Annotation } from '../types'
import type { DbcData } from '../parsers/dbc'
import { buildOverviewData } from '../utils/buildChartData'

interface AnalysisViewProps {
  panels: AnalysisPanel[]
  importedFile: ImportedFile | null
  dbcData: DbcData | null
  dbcName: string | null
  onRemovePanel: (uid: string) => void
  themeKey: string
}

const SYNC_KEY    = 'graphcan-analysis'
const PAD         = 20
const HEADER_H    = 84
const PANEL_HDR_H = 28
const PANEL_GAP   = 10

function AnalysisView({ panels, importedFile, dbcData, dbcName, onRemovePanel, themeKey }: AnalysisViewProps) {
  const instancesRef = useRef<uPlot[]>([])
  const syncingRef   = useRef(false)

  const [zoomRange,   setZoomRange]   = useState<[number, number] | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  // Reset on new file
  useEffect(() => {
    setZoomRange(null)
    setAnnotations([])
  }, [importedFile?.importKey])

  // Overview data for the minimap: all panel signals normalized to [0,1] on a 0-based time axis
  const overviewData = useMemo(
    () => buildOverviewData(importedFile?.result.frames ?? [], panels, dbcData),
    [importedFile, panels, dbcData],
  )

  // Colors in panel order so MiniMap can match series to colors
  const overviewSignals = useMemo(
    () => panels.map(p => ({ id: p.id, byteIndex: 0, color: p.color })),
    [panels],
  )

  function handleReady(u: uPlot) {
    instancesRef.current.push(u)
  }

  function handleDestroy(u: uPlot) {
    instancesRef.current = instancesRef.current.filter(i => i !== u)
  }

  function handleScaleChange(source: uPlot, min: number, max: number) {
    if (syncingRef.current) return
    setZoomRange([min, max])
    syncingRef.current = true
    for (const u of instancesRef.current) {
      if (u !== source) u.setScale('x', { min, max })
    }
    syncingRef.current = false
  }

  function handleMinimapRangeChange(min: number, max: number) {
    setZoomRange([min, max])
    syncingRef.current = true
    for (const u of instancesRef.current) {
      u.setScale('x', { min, max })
    }
    syncingRef.current = false
  }

  function handleAnnotationAdd(t: number) {
    setAnnotations(prev => [...prev, { t, label: `${t.toFixed(2)}s` }])
  }

  function handleAnnotationRemove(t: number) {
    setAnnotations(prev => prev.filter(a => Math.abs(a.t - t) > 0.001))
  }

  function handleExport() {
    const instances = instancesRef.current
    if (instances.length === 0) return

    const dpr       = window.devicePixelRatio || 1
    const firstPlot = instances[0]
    const xMin      = firstPlot.scales.x.min ?? 0
    const xMax      = firstPlot.scales.x.max ?? 0
    const dateStr   = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

    const chartLogW  = firstPlot.ctx.canvas.width / dpr
    const totalLogW  = chartLogW + PAD * 2
    const panelsTotal = instances.reduce(
      (sum, u) => sum + PANEL_HDR_H + u.ctx.canvas.height / dpr + PANEL_GAP, 0,
    ) - PANEL_GAP
    const totalLogH = HEADER_H + panelsTotal + PAD * 2

    const out = document.createElement('canvas')
    out.width  = totalLogW * dpr
    out.height = totalLogH * dpr
    const ctx  = out.getContext('2d')!
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, totalLogW, totalLogH)
    ctx.fillStyle = '#F8F7F5'
    ctx.fillRect(0, 0, totalLogW, HEADER_H)

    ctx.fillStyle = '#1A1917'
    ctx.font      = 'bold 14px system-ui, sans-serif'
    ctx.fillText('GraphCan — CAN Bus Report', PAD, PAD + 14)
    ctx.fillStyle = '#5A5750'
    ctx.font      = '12px system-ui, sans-serif'
    ctx.fillText(`File: ${importedFile?.name ?? 'unknown'}  ·  DBC: ${dbcName ?? 'None'}`, PAD, PAD + 36)
    ctx.fillText(
      `Time: ${xMin.toFixed(3)} s – ${xMax.toFixed(3)} s  (Δ ${(xMax - xMin).toFixed(3)} s)  ·  ${dateStr}`,
      PAD, PAD + 56,
    )

    ctx.strokeStyle = '#D5D3CE'
    ctx.lineWidth   = 0.5
    ctx.beginPath(); ctx.moveTo(0, HEADER_H); ctx.lineTo(totalLogW, HEADER_H); ctx.stroke()

    let y = HEADER_H + PAD
    instances.forEach(u => {
      const src       = u.ctx.canvas
      const chartLogH = src.height / dpr
      const color     = typeof u.series[1]?.stroke === 'string' ? u.series[1].stroke : '#888'
      const label     = u.series[1]?.label ?? ''

      ctx.fillStyle = '#F8F7F5'
      ctx.fillRect(PAD, y, chartLogW, PANEL_HDR_H)
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(PAD + 12, y + PANEL_HDR_H / 2, 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#1A1917'
      ctx.font      = '12px system-ui, sans-serif'
      ctx.fillText(label, PAD + 24, y + PANEL_HDR_H / 2 + 4)
      y += PANEL_HDR_H

      ctx.drawImage(src, PAD, y, chartLogW, chartLogH)

      ctx.strokeStyle = '#D5D3CE'
      ctx.beginPath(); ctx.moveTo(PAD, y + chartLogH); ctx.lineTo(PAD + chartLogW, y + chartLogH); ctx.stroke()
      y += chartLogH + PANEL_GAP
    })

    const url = out.toDataURL('image/png')
    const a   = document.createElement('a')
    a.href = url; a.download = `graphcan-analysis-${Date.now()}.png`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  if (!importedFile) {
    return <p className="main-placeholder">Import a CAN log file to get started</p>
  }

  if (panels.length === 0) {
    return <p className="main-placeholder">Select a signal in the sidebar to add a panel</p>
  }

  return (
    <div className="analysis-view">
      <div className="analysis-toolbar">
        <button className="btn-export" onClick={handleExport}>Export PNG</button>
      </div>

      <MiniMap
        data={overviewData}
        signals={overviewSignals}
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

      {panels.map(panel => (
        <SignalPanel
          key={panel.uid}
          panel={panel}
          frames={importedFile.result.frames}
          dbcData={dbcData}
          color={panel.color}
          syncKey={SYNC_KEY}
          themeKey={themeKey}
          annotations={annotations}
          onAnnotationAdd={handleAnnotationAdd}
          onAnnotationRemove={handleAnnotationRemove}
          onRemove={() => onRemovePanel(panel.uid)}
          onReady={handleReady}
          onDestroy={handleDestroy}
          onScaleChange={handleScaleChange}
        />
      ))}
    </div>
  )
}

export default AnalysisView
