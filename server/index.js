'use strict'

const koffi = require('koffi')
const { WebSocketServer } = require('ws')

// ─── PCANBasic.dll bindings ───────────────────────────────────────────────────
//
// TPCANMsg layout  (14 bytes):  DWORD ID | BYTE MSGTYPE | BYTE LEN | BYTE DATA[8]
// TPCANTimestamp   ( 8 bytes):  DWORD millis | WORD millis_overflow | WORD micros

let CAN_Initialize, CAN_Uninitialize, CAN_Read

try {
  const lib = koffi.load('PCANBasic')

  const TPCANMsg = koffi.struct('TPCANMsg', {
    ID:      'uint32',
    MSGTYPE: 'uint8',
    LEN:     'uint8',
    DATA:    koffi.array('uint8', 8),
  })

  const TPCANTimestamp = koffi.struct('TPCANTimestamp', {
    millis:          'uint32',
    millis_overflow: 'uint16',
    micros:          'uint16',
  })

  CAN_Initialize   = lib.func('CAN_Initialize',   'uint32', ['uint16', 'uint16', 'uint8', 'uint32', 'uint8'])
  CAN_Uninitialize = lib.func('CAN_Uninitialize', 'uint32', ['uint16'])
  CAN_Read         = lib.func('CAN_Read',         'uint32', ['uint16', koffi.out(koffi.pointer(TPCANMsg)), koffi.out(koffi.pointer(TPCANTimestamp))])
} catch (err) {
  console.error('[PCAN] Failed to load PCANBasic.dll:', err.message)
  console.error('[PCAN] Make sure the PCAN driver is installed (https://peak-system.com)')
  process.exit(1)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PCAN_USBBUS1          = 0x51
const PCAN_ERROR_OK         = 0x00000
const PCAN_ERROR_QRCVEMPTY  = 0x00020
const PCAN_MSGTYPE_EXTENDED = 0x02

const BITRATES = {
  10:   0x672F,
  20:   0x532F,
  50:   0x472F,
  100:  0x432F,
  125:  0x031C,
  250:  0x011C,
  500:  0x001C,
  800:  0x0016,
  1000: 0x0014,
}

// ─── WebSocket server ─────────────────────────────────────────────────────────

const PORT = 8765
const wss  = new WebSocketServer({ port: PORT })
console.log(`[GraphCan] PCAN bridge listening on ws://localhost:${PORT}`)

const clients = new Set()

wss.on('connection', ws => {
  console.log('[WS] Client connected')
  clients.add(ws)

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'open')  openChannel(msg.speedKbps ?? 500)
      if (msg.type === 'close') closeChannel()
    } catch { /* ignore malformed messages */ }
  })

  ws.on('close', () => {
    console.log('[WS] Client disconnected')
    clients.delete(ws)
    if (clients.size === 0) closeChannel()
  })
})

function broadcast(obj) {
  const data = JSON.stringify(obj)
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) ws.send(data)
  }
}

// ─── PCAN channel lifecycle ───────────────────────────────────────────────────

let isOpen    = false
let loopTimer = null

function openChannel(speedKbps) {
  if (isOpen) closeChannel()

  const btr    = BITRATES[speedKbps] ?? BITRATES[500]
  const result = CAN_Initialize(PCAN_USBBUS1, btr, 0, 0, 0)

  if (result !== PCAN_ERROR_OK) {
    const msg = `CAN_Initialize failed: 0x${result.toString(16).toUpperCase()}`
    console.error(`[PCAN] ${msg}`)
    broadcast({ type: 'error', message: msg })
    return
  }

  isOpen = true
  console.log(`[PCAN] Channel opened at ${speedKbps} kbps`)
  broadcast({ type: 'status', connected: true })
  scheduleRead()
}

function closeChannel() {
  if (!isOpen) return
  if (loopTimer) { clearImmediate(loopTimer); loopTimer = null }
  CAN_Uninitialize(PCAN_USBBUS1)
  isOpen = false
  console.log('[PCAN] Channel closed')
  broadcast({ type: 'status', connected: false })
}

// ─── Frame read loop ──────────────────────────────────────────────────────────

function scheduleRead() {
  loopTimer = setImmediate(readLoop)
}

function readLoop() {
  if (!isOpen) return

  const batch = []

  // Drain up to 256 frames per event-loop tick
  for (let i = 0; i < 256; i++) {
    const msg = {}
    const ts  = {}

    const rc = CAN_Read(PCAN_USBBUS1, msg, ts)
    if (rc === PCAN_ERROR_QRCVEMPTY) break
    if (rc !== PCAN_ERROR_OK) break

    const len        = Math.min(msg.LEN, 8)
    const isExtended = (msg.MSGTYPE & PCAN_MSGTYPE_EXTENDED) !== 0
    const idHex      = msg.ID.toString(16).toUpperCase().padStart(isExtended ? 8 : 3, '0')
    const elapsedMs  = ts.millis_overflow * 65536 + ts.millis + ts.micros / 1000

    batch.push({
      timestamp: msToHMS(elapsedMs),
      direction: 'Rx',
      channel:   1,
      id:        `0x${idHex}`,
      dlc:       len,
      data:      Array.from(msg.DATA.slice(0, len), b => b.toString(16).toUpperCase().padStart(2, '0')),
    })
  }

  if (batch.length > 0) broadcast({ type: 'frames', frames: batch })

  scheduleRead()
}

// ─── Timestamp formatting (mirrors frontend utils/time.ts) ───────────────────

function msToHMS(ms) {
  const t = Math.max(0, ms)
  const h = Math.floor(t / 3_600_000)
  const m = Math.floor((t % 3_600_000) / 60_000)
  const s = Math.floor((t % 60_000) / 1_000)
  const f = Math.round(t % 1_000).toString().padStart(3, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${f}`
}

function pad(n) { return String(n).padStart(2, '0') }

// ─── Cleanup ──────────────────────────────────────────────────────────────────

process.on('SIGINT',  () => { closeChannel(); process.exit(0) })
process.on('SIGTERM', () => { closeChannel(); process.exit(0) })
