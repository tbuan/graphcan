import { useEffect, useRef } from 'react'
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
          e.preventDefault() // prevent browser autoscroll mode

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

function UPlotChart({ data, signals, displayMode, themeKey }: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

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

export default UPlotChart
