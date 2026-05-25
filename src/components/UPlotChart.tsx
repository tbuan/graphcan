import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { DisplayMode, Signal, Annotation } from '../types'

function getTheme() {
  const s = getComputedStyle(document.documentElement)
  return {
    border:    s.getPropertyValue('--color-border').trim()     || '#D5D3CE',
    textMuted: s.getPropertyValue('--color-text-muted').trim() || '#89877F',
  }
}

interface UPlotChartProps {
  data: uPlot.AlignedData
  signals: Signal[]
  displayMode: DisplayMode
  themeKey: string
  annotations?: Annotation[]
  onAnnotationAdd?: (t: number) => void
  onAnnotationRemove?: (t: number) => void
  onRangeChange?: (min: number, max: number) => void
}

export interface UPlotChartHandle {
  exportPNG(opts: {
    filename: string
    dbcName: string | null
    signalLabels: string[]
  }): void
  setRange(min: number, max: number): void
}

const PAD        = 24
const HEADER_H   = 84
const LEGEND_ROW = 26

// ─── Plugins ──────────────────────────────────────────────────────────────────

function wheelZoomPlugin(): uPlot.Plugin {
  return {
    hooks: {
      ready(u) {
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
          u.setScale('x', {
            min: anchor - cursorPct * newRange,
            max: anchor + (1 - cursorPct) * newRange,
          })
        }, { passive: false })
      },
    },
  }
}

function panPlugin(): uPlot.Plugin {
  return {
    hooks: {
      ready(u) {
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
            u.setScale('x', { min: startMin - shift, max: startMax - shift })
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

function annotationPlugin(
  annRef:      React.RefObject<Annotation[]>,
  onAddRef:    React.RefObject<((t: number) => void) | undefined>,
  onRemoveRef: React.RefObject<((t: number) => void) | undefined>,
): uPlot.Plugin {
  return {
    hooks: {
      ready(u) {
        u.over.addEventListener('click', (e: MouseEvent) => {
          if (!e.shiftKey) return
          const t        = u.posToVal(e.offsetX, 'x')
          const near     = annRef.current.find(a => Math.abs(u.valToPos(a.t, 'x') - e.offsetX) < 10)
          if (near) onRemoveRef.current?.(near.t)
          else      onAddRef.current?.(t)
        })
        // Shift+click cursor hint
        u.over.addEventListener('mousemove', (e: MouseEvent) => {
          u.over.style.cursor = e.shiftKey ? 'crosshair' : ''
        })
      },
      draw(u) {
        const anns = annRef.current
        if (!anns.length) return
        const ctx = u.ctx
        const dpr = window.devicePixelRatio || 1
        ctx.save()
        anns.forEach(ann => {
          const xPx = u.valToPos(ann.t, 'x', true)
          if (xPx < u.bbox.left || xPx > u.bbox.left + u.bbox.width) return
          ctx.strokeStyle = '#F59E0B'
          ctx.setLineDash([4 * dpr, 4 * dpr])
          ctx.lineWidth = 1.5 * dpr
          ctx.beginPath()
          ctx.moveTo(xPx, u.bbox.top)
          ctx.lineTo(xPx, u.bbox.top + u.bbox.height)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.fillStyle = '#F59E0B'
          ctx.font = `bold ${10 * dpr}px system-ui, sans-serif`
          ctx.fillText(ann.label, xPx + 4 * dpr, u.bbox.top + 13 * dpr)
        })
        ctx.restore()
      },
    },
  }
}

// ─── Series builder ───────────────────────────────────────────────────────────

function buildSeries(signals: Signal[], displayMode: DisplayMode): uPlot.Series[] {
  return [
    { label: 'Time (s)' },
    ...signals.map(signal => ({
      label:  `${signal.id} B${signal.byteIndex}`,
      stroke: signal.color,
      width:  1.5,
      paths:  displayMode === 'points' ? (() => null) as uPlot.Series.PathBuilder : undefined,
      points: { show: displayMode !== 'line', fill: signal.color, size: 5 },
    })),
  ]
}

// ─── Component ────────────────────────────────────────────────────────────────

const UPlotChart = forwardRef<UPlotChartHandle, UPlotChartProps>(
  function UPlotChart(
    { data, signals, displayMode, themeKey, annotations, onAnnotationAdd, onAnnotationRemove, onRangeChange },
    ref,
  ) {
    const containerRef   = useRef<HTMLDivElement>(null)
    const plotRef        = useRef<uPlot | null>(null)
    const externalSetRef = useRef(false)

    // Always-fresh refs — avoids stale closures in uPlot hooks/plugins
    const annRef         = useRef<Annotation[]>(annotations ?? [])
    const onAddRef       = useRef(onAnnotationAdd)
    const onRemoveRef    = useRef(onAnnotationRemove)
    const onRangeRef     = useRef(onRangeChange)

    annRef.current      = annotations ?? []
    onAddRef.current    = onAnnotationAdd
    onRemoveRef.current = onAnnotationRemove
    onRangeRef.current  = onRangeChange

    // Redraw when annotations change (without recreating the plot)
    useEffect(() => {
      plotRef.current?.redraw(false)
    }, [annotations])

    useImperativeHandle(ref, () => ({
      setRange(min, max) {
        externalSetRef.current = true
        plotRef.current?.setScale('x', { min, max })
        externalSetRef.current = false
      },

      exportPNG({ filename, dbcName, signalLabels }) {
        const plot = plotRef.current
        if (!plot) return
        const dpr       = window.devicePixelRatio || 1
        const src       = plot.ctx.canvas
        const chartLogW = src.width  / dpr
        const chartLogH = src.height / dpr
        const legendH   = signals.length * LEGEND_ROW + PAD * 2
        const totalLogW = chartLogW + PAD * 2
        const totalLogH = HEADER_H + chartLogH + legendH

        const out = document.createElement('canvas')
        out.width  = totalLogW * dpr
        out.height = totalLogH * dpr
        const ctx  = out.getContext('2d')!
        ctx.scale(dpr, dpr)

        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, totalLogW, totalLogH)
        ctx.fillStyle = '#F8F7F5'
        ctx.fillRect(0, 0, totalLogW, HEADER_H)

        const xMin    = plot.scales.x.min ?? 0
        const xMax    = plot.scales.x.max ?? 0
        const dateStr = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

        ctx.fillStyle = '#1A1917'
        ctx.font      = 'bold 14px system-ui, sans-serif'
        ctx.fillText('GraphCan — CAN Bus Report', PAD, PAD + 14)
        ctx.fillStyle = '#5A5750'
        ctx.font      = '12px system-ui, sans-serif'
        ctx.fillText(`File: ${filename}  ·  DBC: ${dbcName ?? 'None'}`, PAD, PAD + 36)
        ctx.fillText(
          `Time: ${xMin.toFixed(3)} s – ${xMax.toFixed(3)} s  (Δ ${(xMax - xMin).toFixed(3)} s)  ·  ${dateStr}`,
          PAD, PAD + 56,
        )

        ctx.strokeStyle = '#D5D3CE'
        ctx.lineWidth   = 0.5
        ctx.beginPath(); ctx.moveTo(0, HEADER_H); ctx.lineTo(totalLogW, HEADER_H); ctx.stroke()

        ctx.drawImage(src, PAD, HEADER_H, chartLogW, chartLogH)

        ctx.beginPath(); ctx.moveTo(0, HEADER_H + chartLogH); ctx.lineTo(totalLogW, HEADER_H + chartLogH); ctx.stroke()

        ctx.font = '12px system-ui, sans-serif'
        let ly   = HEADER_H + chartLogH + PAD
        signals.forEach((signal, i) => {
          ctx.fillStyle = signal.color
          ctx.beginPath(); ctx.arc(PAD + 6, ly - 5, 6, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#1A1917'
          ctx.fillText(signalLabels[i] ?? `${signal.id} B${signal.byteIndex}`, PAD + 18, ly)
          ly += LEGEND_ROW
        })

        const url = out.toDataURL('image/png')
        const a   = document.createElement('a')
        a.href = url; a.download = `graphcan-${Date.now()}.png`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
      },
    }), [signals])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const theme = getTheme()

      const opts: uPlot.Options = {
        width:  container.clientWidth,
        height: container.clientHeight,
        plugins: [
          wheelZoomPlugin(),
          panPlugin(),
          annotationPlugin(annRef, onAddRef, onRemoveRef),
        ],
        cursor: { drag: { x: true, y: false } },
        hooks: {
          setScale: [(u, key) => {
            if (key !== 'x' || externalSetRef.current) return
            onRangeRef.current?.(u.scales.x.min!, u.scales.x.max!)
          }],
        },
        series: buildSeries(signals, displayMode),
        axes: [
          {
            stroke: theme.textMuted,
            ticks:  { stroke: theme.border },
            grid:   { stroke: theme.border, width: 1 },
            label:  'Time (s)',
          },
          {
            stroke: theme.textMuted,
            ticks:  { stroke: theme.border },
            grid:   { stroke: theme.border, width: 1 },
            label:  'Value (0–255)',
            size:   55,
            splits: (_u, _axisIdx, scaleMin, scaleMax, foundIncr) => {
              const result: number[] = []
              for (let v = scaleMin; v < scaleMax; v += foundIncr) result.push(v)
              result.push(scaleMax)
              return result
            },
          },
        ],
        scales: { y: { range: () => [0, 255] } },
      }

      plotRef.current = new uPlot(opts, data, container)

      const ro = new ResizeObserver(() => {
        plotRef.current?.setSize({ width: container.clientWidth, height: container.clientHeight })
      })
      ro.observe(container)

      return () => {
        plotRef.current?.destroy()
        plotRef.current = null
        ro.disconnect()
      }
    }, [data, signals, displayMode, themeKey])

    return <div ref={containerRef} className="uplot-container" />
  },
)

export default UPlotChart
