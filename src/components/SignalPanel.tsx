import { useEffect, useRef, useMemo, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { AnalysisPanel } from '../types'
import type { CanFrame } from '../parsers/busmaster'
import type { DbcData, DbcSignal } from '../parsers/dbc'
import { getMessageName } from '../utils/dbc'
import { buildUPlotData, buildDbcSignalData } from '../utils/buildChartData'

function getTheme() {
  const s = getComputedStyle(document.documentElement)
  return {
    border:    s.getPropertyValue('--color-border').trim()     || '#D5D3CE',
    textMuted: s.getPropertyValue('--color-text-muted').trim() || '#89877F',
  }
}

interface SignalPanelProps {
  panel: AnalysisPanel
  frames: CanFrame[]
  dbcData: DbcData | null
  color: string
  syncKey: string
  themeKey: string
  onRemove: () => void
  onReady: (u: uPlot) => void
  onDestroy: (u: uPlot) => void
  onScaleChange: (source: uPlot, min: number, max: number) => void
}

function wheelZoomPlugin(onScaleChange: SignalPanelProps['onScaleChange']): uPlot.Plugin {
  return {
    hooks: {
      ready(u: uPlot) {
        u.over.addEventListener('wheel', (e: WheelEvent) => {
          if (!e.ctrlKey) return
          e.preventDefault()
          const xMin = u.scales.x.min!
          const xMax = u.scales.x.max!
          const xRange = xMax - xMin
          const cursorPct = (u.cursor.left ?? u.bbox.width / 2) / u.bbox.width
          const factor = e.deltaY < 0 ? 0.75 : 1 / 0.75
          const newRange = xRange * factor
          const anchor = xMin + cursorPct * xRange
          const min = anchor - cursorPct * newRange
          const max = anchor + (1 - cursorPct) * newRange
          u.setScale('x', { min, max })
          onScaleChange(u, min, max)
        }, { passive: false })
      },
    },
  }
}

function panPlugin(onScaleChange: SignalPanelProps['onScaleChange']): uPlot.Plugin {
  return {
    hooks: {
      ready(u: uPlot) {
        u.over.addEventListener('mousedown', (e: MouseEvent) => {
          if (e.button !== 1) return
          e.preventDefault()
          const startX   = e.clientX
          const startMin = u.scales.x.min!
          const startMax = u.scales.x.max!
          const range    = startMax - startMin
          u.over.style.cursor = 'grabbing'

          function onMouseMove(ev: MouseEvent) {
            const shift = ((ev.clientX - startX) / u.bbox.width) * range
            const min = startMin - shift
            const max = startMax - shift
            u.setScale('x', { min, max })
            onScaleChange(u, min, max)
          }

          function onMouseUp(ev: MouseEvent) {
            if (ev.button !== 1) return
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            u.over.style.cursor = ''
          }

          window.addEventListener('mousemove', onMouseMove)
          window.addEventListener('mouseup', onMouseUp)
        })
      },
    },
  }
}

type DisplayMode = 'line' | 'points' | 'both'

const DISPLAY_MODES: DisplayMode[] = ['line', 'points', 'both']
const DISPLAY_MODE_LABEL: Record<DisplayMode, string> = { line: 'LINE', points: 'DOTS', both: 'BOTH' }

function SignalPanel({ panel, frames, dbcData, color, syncKey, themeKey, onRemove, onReady, onDestroy, onScaleChange }: SignalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef      = useRef<uPlot | null>(null)
  const valueRef     = useRef<HTMLSpanElement>(null)

  const [displayMode, setDisplayMode] = useState<DisplayMode>('line')

  function cycleDisplayMode() {
    setDisplayMode(prev => DISPLAY_MODES[(DISPLAY_MODES.indexOf(prev) + 1) % DISPLAY_MODES.length])
  }

  const dbcSignal = useMemo<DbcSignal | null>(() => {
    if (panel.source.kind !== 'signal') return null
    const { signalName } = panel.source
    return dbcData?.[panel.id]?.signals.find(s => s.name === signalName) ?? null
  }, [dbcData, panel.id, panel.source])

  const label = panel.source.kind === 'signal'
    ? panel.source.signalName
    : `${getMessageName(panel.id, dbcData)} · B${panel.source.byteIndex}`

  const data = useMemo(() => {
    if (panel.source.kind === 'signal' && dbcSignal) {
      return buildDbcSignalData(frames, panel.id, dbcSignal)
    }
    if (panel.source.kind === 'byte') {
      return buildUPlotData(frames, [{ id: panel.id, byteIndex: panel.source.byteIndex }])
    }
    return [[], []] as uPlot.AlignedData
  }, [frames, panel.id, panel.source, dbcSignal])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const theme    = getTheme()
    const unit      = dbcSignal?.unit ?? ''
    const valuesMap = dbcSignal?.values

    const opts: uPlot.Options = {
      width:  container.clientWidth,
      height: container.clientHeight,
      plugins: [wheelZoomPlugin(onScaleChange), panPlugin(onScaleChange)],
      cursor: {
        sync: { key: syncKey },
        drag: { x: true, y: false },
      },
      hooks: {
        setScale: [(u, key) => {
          if (key === 'x') onScaleChange(u, u.scales.x.min!, u.scales.x.max!)
        }],
        setCursor: [(u) => {
          if (!valueRef.current) return
          const idx = u.cursor.idx
          if (idx == null) { valueRef.current.textContent = '—'; return }
          const val = (u.data[1] as (number | null)[])[idx]
          if (val == null) { valueRef.current.textContent = '—'; return }
          const label = valuesMap?.[Math.round(val)]
          if (label !== undefined) {
            valueRef.current.textContent = label
          } else {
            const formatted = Number.isInteger(val) ? String(val) : parseFloat(val.toPrecision(6)).toString()
            valueRef.current.textContent = unit ? `${formatted} ${unit}` : formatted
          }
        }],
      },
      series: [
        { label: 'Time' },
        {
          label,
          stroke: color,
          width:  displayMode === 'points' ? 0 : 1.5,
          points: {
            show: displayMode !== 'line',
            size: 5,
            fill: color,
          },
        },
      ],
      axes: [
        { stroke: theme.textMuted, ticks: { stroke: theme.border }, grid: { stroke: theme.border, width: 1 } },
        { stroke: theme.textMuted, ticks: { stroke: theme.border }, grid: { stroke: theme.border, width: 1 }, size: 55 },
      ],
      scales: { y: { auto: true } },
      legend: { show: false },
    }

    const u = new uPlot(opts, data, container)
    plotRef.current = u
    onReady(u)

    const ro = new ResizeObserver(() => {
      plotRef.current?.setSize({ width: container.clientWidth, height: container.clientHeight })
    })
    ro.observe(container)

    return () => {
      if (plotRef.current) { onDestroy(plotRef.current); plotRef.current.destroy(); plotRef.current = null }
      ro.disconnect()
    }
  }, [data, syncKey, color, dbcSignal, displayMode, themeKey])

  return (
    <div className="signal-panel">
      <div className="signal-panel-header">
        <span className="signal-panel-dot" style={{ background: color }} />
        <span className="signal-panel-label">{label}</span>
        <span className="signal-panel-value"><span ref={valueRef}>—</span></span>
        <button
          className="signal-panel-mode"
          onClick={cycleDisplayMode}
          title={`Display: ${displayMode}`}
        >
          {DISPLAY_MODE_LABEL[displayMode]}
        </button>
        <button className="signal-panel-remove" onClick={onRemove} aria-label="Remove panel">×</button>
      </div>
      <div ref={containerRef} className="signal-panel-chart" />
    </div>
  )
}

export default SignalPanel
