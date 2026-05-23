export function parseTimestampToMs(ts: string): number {
  const parts = ts.split(':')
  if (parts.length === 4) {
    // BUSMASTER: HH:MM:SS:dddd (dddd in 0.1 ms units)
    const [h, m, s, frac] = parts.map(Number)
    return (h * 3600 + m * 60 + s) * 1000 + frac / 10
  }
  if (parts.length === 3) {
    // Standard: HH:MM:SS.mmm
    const [h, m] = parts.map(Number)
    const [sec, msFrac = '0'] = parts[2].split('.')
    return (h * 3600 + m * 60 + Number(sec)) * 1000
         + Number(msFrac.padEnd(3, '0').slice(0, 3))
  }
  // Fallback: plain float seconds
  return parseFloat(ts) * 1000
}

// Convert a millisecond offset to "HH:MM:SS.mmm" for display and parsing.
export function msToHMS(ms: number): string {
  const t = Math.max(0, ms)
  const h = Math.floor(t / 3_600_000)
  const m = Math.floor((t % 3_600_000) / 60_000)
  const s = Math.floor((t % 60_000) / 1_000)
  const f = Math.round(t % 1_000).toString().padStart(3, '0')
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${f}`
}

export function formatDelta(ms: number): string {
  const abs = Math.abs(ms)
  if (abs < 1) return `${(abs * 1000).toFixed(0)} µs`
  if (abs < 1000) return `${abs.toFixed(3)} ms`
  return `${(abs / 1000).toFixed(3)} s`
}
