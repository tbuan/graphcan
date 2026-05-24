import { useState, useRef, useCallback } from 'react'
import type { CanFrame } from '../parsers/busmaster'

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const WS_URL    = 'ws://localhost:8765'
const MAX_FRAMES = 50_000
const FLUSH_MS   = 50

export function useWebSocketPort() {
  const [status,    setStatus]    = useState<WsStatus>('disconnected')
  const [error,     setError]     = useState<string | null>(null)
  const [frames,    setFrames]    = useState<CanFrame[]>([])
  const [frameRate, setFrameRate] = useState(0)

  const wsRef         = useRef<WebSocket | null>(null)
  const pendingRef    = useRef<CanFrame[]>([])
  const flushTimerRef = useRef<number | null>(null)
  const rateWindowRef = useRef<number[]>([])

  const flushPending = useCallback(() => {
    flushTimerRef.current = null
    const batch = pendingRef.current.splice(0)
    if (batch.length === 0) return

    const now = performance.now()
    rateWindowRef.current.push(...batch.map(() => now))
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

  const connect = useCallback((speedKbps: number) => {
    setStatus('connecting')
    setError(null)

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      // Tell the server which CAN speed to use
      ws.send(JSON.stringify({ type: 'open', speedKbps }))
    }

    ws.onmessage = e => {
      const msg = JSON.parse(e.data as string) as {
        type: string
        connected?: boolean
        frames?: CanFrame[]
        message?: string
      }

      if (msg.type === 'status') {
        setStatus(msg.connected ? 'connected' : 'disconnected')
      }

      if (msg.type === 'frames' && msg.frames) {
        pendingRef.current.push(...msg.frames)
        scheduleFlush()
      }

      if (msg.type === 'error') {
        setError(msg.message ?? 'Unknown error')
        setStatus('error')
      }
    }

    ws.onerror = () => {
      setError('Cannot reach the local bridge — is the server running?\n\nRun: cd server && npm start')
      setStatus('error')
    }

    ws.onclose = () => {
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushPending() }
      wsRef.current = null
      setStatus(prev => prev === 'error' ? prev : 'disconnected')
    }
  }, [scheduleFlush, flushPending])

  const disconnect = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'close' }))
    wsRef.current?.close()
    wsRef.current = null
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushPending() }
    setStatus('disconnected')
  }, [flushPending])

  const clearFrames = useCallback(() => {
    pendingRef.current    = []
    rateWindowRef.current = []
    setFrames([])
    setFrameRate(0)
  }, [])

  return { status, error, frames, frameRate, connect, disconnect, clearFrames }
}

export type WsPortState = ReturnType<typeof useWebSocketPort>
