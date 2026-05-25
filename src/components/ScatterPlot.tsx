import { useEffect, useRef } from 'react'

interface ScatterPlotProps {
  points: [number, number][]
  xLabel: string
  yLabel: string
  themeKey: string
}

const ML = 68   // left margin  (y-axis labels)
const MB = 52   // bottom margin (x-axis labels)
const MT = 16   // top margin
const MR = 20   // right margin
const TICKS = 5

function getTheme() {
  const s = getComputedStyle(document.documentElement)
  return {
    border:    s.getPropertyValue('--color-border').trim()     || '#D5D3CE',
    textMuted: s.getPropertyValue('--color-text-muted').trim() || '#89877F',
    surface:   s.getPropertyValue('--color-surface').trim()    || '#FFFFFF',
  }
}

function fmtTick(v: number): string {
  if (Math.abs(v) >= 10_000) return `${(v / 1000).toFixed(1)}k`
  if (Number.isInteger(v))    return String(v)
  if (Math.abs(v) >= 100)     return v.toFixed(0)
  if (Math.abs(v) >= 10)      return v.toFixed(1)
  return parseFloat(v.toPrecision(3)).toString()
}

export default function ScatterPlot({ points, xLabel, yLabel, themeKey }: ScatterPlotProps) {
  const wrapRef   = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function draw() {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return

    const dpr = window.devicePixelRatio || 1
    const W   = wrap.clientWidth
    const H   = wrap.clientHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const theme = getTheme()
    ctx.fillStyle = theme.surface
    ctx.fillRect(0, 0, W, H)

    const plotW = W - ML - MR
    const plotH = H - MT - MB

    if (!points.length) {
      ctx.fillStyle = theme.textMuted
      ctx.font      = '13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Select two signals above to compare them', W / 2, H / 2)
      return
    }

    // ── Data range ──────────────────────────────────────────────────────────
    let xMin = Infinity, xMax = -Infinity
    let yMin = Infinity, yMax = -Infinity
    for (const [x, y] of points) {
      if (x < xMin) xMin = x; if (x > xMax) xMax = x
      if (y < yMin) yMin = y; if (y > yMax) yMax = y
    }
    const xPad = (xMax - xMin) * 0.05 || 1
    const yPad = (yMax - yMin) * 0.05 || 1
    xMin -= xPad; xMax += xPad
    yMin -= yPad; yMax += yPad
    const xRange = xMax - xMin
    const yRange = yMax - yMin

    const toX = (v: number) => ML + ((v - xMin) / xRange) * plotW
    const toY = (v: number) => MT + plotH - ((v - yMin) / yRange) * plotH

    // ── Grid + tick labels ───────────────────────────────────────────────────
    ctx.strokeStyle = theme.border
    ctx.lineWidth   = 0.5
    ctx.fillStyle   = theme.textMuted
    ctx.font        = '11px system-ui, sans-serif'

    for (let i = 0; i <= TICKS; i++) {
      const vy = yMin + (i / TICKS) * yRange
      const y  = toY(vy)
      ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + plotW, y); ctx.stroke()
      ctx.textAlign = 'right'
      ctx.fillText(fmtTick(vy), ML - 7, y + 4)
    }
    for (let i = 0; i <= TICKS; i++) {
      const vx = xMin + (i / TICKS) * xRange
      const x  = toX(vx)
      ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + plotH); ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillText(fmtTick(vx), x, MT + plotH + 16)
    }

    // ── Axis borders ─────────────────────────────────────────────────────────
    ctx.strokeStyle = theme.border
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(ML, MT);         ctx.lineTo(ML, MT + plotH)
    ctx.moveTo(ML, MT + plotH); ctx.lineTo(ML + plotW, MT + plotH)
    ctx.stroke()

    // ── Dots ─────────────────────────────────────────────────────────────────
    // Auto-adjust opacity to reduce overplotting when there are many points
    ctx.fillStyle   = '#3B82F6'
    ctx.globalAlpha = Math.max(0.12, Math.min(0.65, 1500 / points.length))
    for (const [x, y] of points) {
      ctx.beginPath()
      ctx.arc(toX(x), toY(y), 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // ── Axis labels ───────────────────────────────────────────────────────────
    ctx.fillStyle = theme.textMuted
    ctx.font      = '12px system-ui, sans-serif'
    ctx.textAlign = 'center'

    // X label — truncate if too long
    const maxXLabelW = plotW - 20
    ctx.save()
    const xFull = xLabel
    ctx.fillText(xFull, ML + plotW / 2, H - 6, maxXLabelW)
    ctx.restore()

    // Y label (rotated)
    ctx.save()
    ctx.translate(13, MT + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(yLabel, 0, 0, plotH - 20)
    ctx.restore()
  }

  useEffect(() => {
    draw()
    const ro = new ResizeObserver(draw)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [points, xLabel, yLabel, themeKey])

  return (
    <div ref={wrapRef} className="scatter-wrap">
      <canvas ref={canvasRef} className="scatter-canvas" />
    </div>
  )
}
