import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { DisplayMode, Signal } from '../types'

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
}

export interface UPlotChartHandle {
  exportPNG(opts: {
    filename: string
    dbcName: string | null
    signalLabels: string[]
  }): void
}

function wheelZoomPlugin(): uPlot.Plugin {
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
          const zoomFactor = e.deltaY < 0 ? 0.75 : 1 / 0.75
          const newRange = xRange * zoomFactor
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
      ready(u: uPlot) {
        u.over.addEventListener('mousedown', (e: MouseEvent) => {
          if (e.button !== 1) return
          e.preventDefault()

          const startX    = e.clientX
          const startMin  = u.scales.x.min!
          const startMax  = u.scales.x.max!
          const range     = startMax - startMin
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

function buildSeries(signals: Signal[], displayMode: DisplayMode): uPlot.Series[] {
  return [
    { label: 'Time (s)' },
    ...signals.map((signal) => {
      const color = signal.color
      return {
        label: `${signal.id} B${signal.byteIndex}`,
        stroke: color,
        width: 1.5,
        paths: displayMode === 'points'
          ? (() => null) as uPlot.Series.PathBuilder
          : undefined,
        points: {
          show: displayMode !== 'line',
          fill: color,
          size: 5,
        },
      }
    }),
  ]
}

const PAD        = 24
const HEADER_H   = 84
const LEGEND_ROW = 26

const UPlotChart = forwardRef<UPlotChartHandle, UPlotChartProps>(
  function UPlotChart({ data, signals, displayMode, themeKey }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const plotRef      = useRef<uPlot | null>(null)

    useImperativeHandle(ref, () => ({
      exportPNG({ filename, dbcName, signalLabels }) {
        const plot = plotRef.current
        if (!plot) return

        const dpr      = window.devicePixelRatio || 1
        const src      = plot.ctx.canvas           // physical pixels
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

        // Background
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, totalLogW, totalLogH)

        // Header strip
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

        // Separator
        ctx.strokeStyle = '#D5D3CE'
        ctx.lineWidth   = 0.5
        ctx.beginPath()
        ctx.moveTo(0, HEADER_H)
        ctx.lineTo(totalLogW, HEADER_H)
        ctx.stroke()

        // Chart — drawImage maps src canvas (physical) into destination rect (logical)
        ctx.drawImage(src, PAD, HEADER_H, chartLogW, chartLogH)

        // Separator before legend
        ctx.beginPath()
        ctx.moveTo(0, HEADER_H + chartLogH)
        ctx.lineTo(totalLogW, HEADER_H + chartLogH)
        ctx.stroke()

        // Legend
        ctx.font = '12px system-ui, sans-serif'
        let ly   = HEADER_H + chartLogH + PAD
        signals.forEach((signal, i) => {
          ctx.fillStyle = signal.color
          ctx.beginPath()
          ctx.arc(PAD + 6, ly - 5, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#1A1917'
          ctx.fillText(signalLabels[i] ?? `${signal.id} B${signal.byteIndex}`, PAD + 18, ly)
          ly += LEGEND_ROW
        })

        const url = out.toDataURL('image/png')
        const a   = document.createElement('a')
        a.href     = url
        a.download = `graphcan-${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      },
    }), [signals])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const theme = getTheme()
      const opts: uPlot.Options = {
        width:  container.clientWidth,
        height: container.clientHeight,
        plugins: [wheelZoomPlugin(), panPlugin()],
        cursor: { drag: { x: true, y: false } },
        series: buildSeries(signals, displayMode),
        axes: [
          {
            stroke: theme.textMuted,
            ticks: { stroke: theme.border },
            grid:  { stroke: theme.border, width: 1 },
            label: 'Time (s)',
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
        plotRef.current?.setSize({
          width:  container.clientWidth,
          height: container.clientHeight,
        })
      })
      ro.observe(container)

      return () => {
        plotRef.current?.destroy()
        plotRef.current = null
        ro.disconnect()
      }
    }, [data, signals, displayMode, themeKey])

    return <div ref={containerRef} className="uplot-container" />
  }
)

export default UPlotChart
