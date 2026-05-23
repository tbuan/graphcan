// Last field in BUSMASTER timestamps is in 0.1ms units
export function parseTimestampToMs(ts: string): number {
  const [h, m, s, frac] = ts.split(':').map(Number)
  return (h * 3600 + m * 60 + s) * 1000 + frac / 10
}

export function formatDelta(ms: number): string {
  const abs = Math.abs(ms)
  if (abs < 1) return `${(abs * 1000).toFixed(0)} µs`
  if (abs < 1000) return `${abs.toFixed(3)} ms`
  return `${(abs / 1000).toFixed(3)} s`
}
