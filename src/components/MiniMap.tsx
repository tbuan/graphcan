import { useEffect, useRef } from 'react'
import type uPlot from 'uplot'
import type { Signal } from '../types'

interface MiniMapProps {
  data: uPlot.AlignedData
  signals?: Signal[]
  viewMin: number | null
  viewMax: number | null
  onRangeChange: (min: number, max: number) => void
}

const H        = 64
const EDGE_HIT = 8

export default function MiniMap({ data, signals = [], viewMin, viewMax, onRangeChange }: MiniMapProps) {
  const wrapRef   = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const xs        = data[0] as number[]
  const fullMin   = xs.at(0)  ?? 0
  const fullMax   = xs.at(-1) ?? 1
  const fullRange = Math.max(fullMax - fullMin, 0.001)

  const effMin = viewMin ?? fullMin
  const effMax = viewMax ?? fullMax

  function redraw() {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return

    const dpr = window.devicePixelRatio || 1
    const W   = wrap.clientWidth
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    for (let si = 1; si < data.length; si++) {
      const ys    = data[si] as (number | null)[]
      const color = signals[si - 1]?.color ?? '#888'

      // Auto-normalize y range so any signal (0-255 bytes or DBC decoded) fills the height
      let yMin = Infinity, yMax = -Infinity
      for (const y of ys) {
        if (y == null) continue
        if (y < yMin) yMin = y
        if (y > yMax) yMax = y
      }
      const yRange = Math.max(yMax - yMin, 0.001)

      ctx.strokeStyle = color
      ctx.lineWidth   = 1
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      let started = false
      for (let i = 0; i < xs.length; i++) {
        const y = ys[i]
        if (y == null) continue
        const cx = ((xs[i] - fullMin) / fullRange) * W
        const cy = H * 0.9 - ((y - yMin) / yRange) * (H * 0.82)
        if (!started) { ctx.moveTo(cx, cy); started = true }
        else            ctx.lineTo(cx, cy)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  useEffect(() => {
    redraw()
    const ro = new ResizeObserver(redraw)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [data, signals])

  function handleViewportMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()

    const vpRect     = e.currentTarget.getBoundingClientRect()
    const wrapRect   = wrapRef.current!.getBoundingClientRect()
    const offsetInVp = e.clientX - vpRect.left
    const isLeft     = offsetInVp < EDGE_HIT
    const isRight    = vpRect.width - offsetInVp < EDGE_HIT

    const startX    = e.clientX
    const startMin  = effMin
    const startMax  = effMax
    const viewWidth = startMax - startMin
    const minWidth  = fullRange * 0.005

    function onMove(ev: MouseEvent) {
      const dt = ((ev.clientX - startX) / wrapRect.width) * fullRange
      if (isLeft) {
        const newMin = Math.max(fullMin, Math.min(startMin + dt, startMax - minWidth))
        onRangeChange(newMin, startMax)
      } else if (isRight) {
        const newMax = Math.min(fullMax, Math.max(startMax + dt, startMin + minWidth))
        onRangeChange(startMin, newMax)
      } else {
        const newMin = Math.max(fullMin, Math.min(startMin + dt, fullMax - viewWidth))
        onRangeChange(newMin, newMin + viewWidth)
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleWrapClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = wrapRef.current!.getBoundingClientRect()
    const t    = fullMin + ((e.clientX - rect.left) / rect.width) * fullRange
    const half = (effMax - effMin) / 2
    const newMin = Math.max(fullMin, Math.min(t - half, fullMax - 2 * half))
    onRangeChange(newMin, newMin + 2 * half)
  }

  const leftPct  = ((effMin - fullMin) / fullRange) * 100
  const widthPct = ((effMax - effMin)  / fullRange) * 100
  const rightPct = leftPct + widthPct

  return (
    <div ref={wrapRef} className="minimap" onClick={handleWrapClick}>
      <canvas ref={canvasRef} className="minimap-canvas" />

      {/* Dim areas outside the viewport */}
      {leftPct > 0.1 && (
        <div className="minimap-shade" style={{ left: 0, width: `${leftPct}%` }} />
      )}
      {rightPct < 99.9 && (
        <div className="minimap-shade" style={{ left: `${rightPct}%`, width: `${100 - rightPct}%` }} />
      )}

      <div
        className="minimap-viewport"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        onMouseDown={handleViewportMouseDown}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}
