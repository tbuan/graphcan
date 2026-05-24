import { useState, useRef, useCallback } from 'react'
import type { CanFrame } from '../parsers/busmaster'
import { parseSlcanChunk } from '../parsers/slcan'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// Keep at most this many frames in memory to prevent unbounded growth
const MAX_FRAMES = 50_000

// Batch React state updates every N ms instead of on every incoming frame.
// At 1000 frames/s this means ~50 frames per re-render instead of 1000.
const FLUSH_MS = 50

// WebSerial is not yet in every TypeScript DOM lib — narrow the type locally.
type SerialApi = {
  requestPort(options?: { filters?: { usbVendorId?: number }[] }): Promise<SerialPort>
}

function getSerial(): SerialApi | null {
  return 'serial' in navigator ? (navigator as unknown as { serial: SerialApi }).serial : null
}

export function useSerialPort() {
  const [status,    setStatus]    = useState<ConnectionStatus>('disconnected')
  const [error,     setError]     = useState<string | null>(null)
  const [frames,    setFrames]    = useState<CanFrame[]>([])
  const [frameRate, setFrameRate] = useState(0)

  // Refs hold mutable state that must not trigger re-renders
  const portRef       = useRef<SerialPort | null>(null)
  const readerRef     = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const startTimeRef  = useRef(0)
  const pendingRef    = useRef<CanFrame[]>([])
  const remainderRef  = useRef('')
  const isReadingRef  = useRef(false)
  const flushTimerRef = useRef<number | null>(null)
  // Sliding window: timestamps (perf.now) of recently received frames
  const rateWindowRef = useRef<number[]>([])

  // Flush accumulated frames into React state and update the per-second rate
  const flushPending = useCallback(() => {
    flushTimerRef.current = null
    const batch = pendingRef.current.splice(0)
    if (batch.length === 0) return

    const now = performance.now()
    rateWindowRef.current.push(...batch.map(() => now))
    // Keep only events from the last second
    rateWindowRef.current = rateWindowRef.current.filter(t => now - t < 1000)
    setFrameRate(rateWindowRef.current.length)

    setFrames(prev => {
      const merged = [...prev, ...batch]
      return merged.length > MAX_FRAMES ? merged.slice(-MAX_FRAMES) : merged
    })
  }, [])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(flushPending, FLUSH_MS)
  }, [flushPending])

  const connect = useCallback(async (speedCmd: string) => {
    const serial = getSerial()
    if (!serial) {
      setError('WebSerial API not supported — use Chrome or Edge')
      setStatus('error')
      return
    }

    try {
      setStatus('connecting')
      setError(null)

      // requestPort() shows the browser's native port-picker dialog
      const port = await serial.requestPort()
      await port.open({ baudRate: 115200 })

      // Configure CAN speed then open the bus
      const writer = port.writable!.getWriter()
      await writer.write(new TextEncoder().encode(`${speedCmd}\r`))
      await writer.write(new TextEncoder().encode('O\r'))
      writer.releaseLock()

      portRef.current       = port
      startTimeRef.current  = performance.now()
      remainderRef.current  = ''
      pendingRef.current    = []
      rateWindowRef.current = []
      isReadingRef.current  = true
      setFrames([])
      setFrameRate(0)
      setStatus('connected')

      // Async read loop — await yields control so the main thread stays responsive
      const reader = port.readable!.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()

      const readLoop = async () => {
        while (isReadingRef.current) {
          try {
            const { value, done } = await reader.read()
            if (done) break
            const chunk   = decoder.decode(value, { stream: true })
            const elapsed = performance.now() - startTimeRef.current
            const { frames, remainder } = parseSlcanChunk(chunk, remainderRef.current, elapsed)
            remainderRef.current = remainder
            if (frames.length > 0) {
              pendingRef.current.push(...frames)
              scheduleFlush()
            }
          } catch {
            break
          }
        }
        // Adapter closed the port on its own
        if (isReadingRef.current) setStatus('disconnected')
      }

      readLoop()
    } catch (err) {
      setError(String(err))
      setStatus('error')
    }
  }, [scheduleFlush])

  const disconnect = useCallback(async () => {
    isReadingRef.current = false

    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current)
      flushPending()
    }

    try {
      await readerRef.current?.cancel()
      // Gracefully close the CAN channel before closing the serial port
      const writer = portRef.current?.writable?.getWriter()
      if (writer) {
        await writer.write(new TextEncoder().encode('C\r'))
        writer.releaseLock()
      }
      await portRef.current?.close()
    } catch { /* ignore cleanup errors */ }

    portRef.current   = null
    readerRef.current = null
    setStatus('disconnected')
  }, [flushPending])

  const clearFrames = useCallback(() => {
    pendingRef.current    = []
    rateWindowRef.current = []
    startTimeRef.current  = performance.now()
    setFrames([])
    setFrameRate(0)
  }, [])

  return { status, error, frames, frameRate, connect, disconnect, clearFrames }
}
