export type SignalMux =
  | { kind: 'switch' }           // M  — valeur qui sélectionne le groupe actif
  | { kind: 'muxed'; id: number } // m3 — actif seulement quand mux === 3

export interface DbcSignal {
  name: string
  startBit: number
  length: number
  isLittleEndian: boolean
  isSigned: boolean
  factor: number
  offset: number
  unit: string
  mux?: SignalMux
  values?: Record<number, string>
  receivers?: string[]
  comment?: string
}

export interface DbcMessage {
  id: number
  name: string
  dlc: number
  signals: DbcSignal[]
  transmitter?: string
  comment?: string
  cycleTime?: number   // ms — from GenMsgCycleTime / CycleTime attribute
  sendType?: string    // e.g. "cyclic", "event", "cyclicEvent" — from GenMsgSendType
}

// Keyed by normalized hex ID matching busmaster format: "0X142406E4"
export type DbcData = Record<string, DbcMessage>

// BO_ 2228388068 MessageName: 8 Sender
const BO_REGEX = /^BO_ (\d+) (\w+)\s*:\s*(\d+)\s*(\S+)?/

// SG_ SignalName : 0|16@1+ (0.01,-40) [0|0] "km/h" Receivers
// SG_ SignalName M : ...   ← multiplexer switch signal
// SG_ SignalName m3 : ...  ← active when mux = 3
// @1 = Intel/little-endian, @0 = Motorola/big-endian
const SG_REGEX =
  /^\s+SG_ (\w+)\s*(M|m\d+)?\s*:\s*(\d+)\|(\d+)@(\d)([+-])\s*\(([^,]+),([^)]+)\)\s*\[[^\]]+\]\s*"([^"]*)"\s*(.*)/

// VAL_ 2228388068 SignalName 0 "OFF" 1 "ON" ;
const VAL_REGEX = /^VAL_ (\d+) (\w+)(.*?);/
const VAL_PAIR_REGEX = /(\d+)\s+"([^"]*)"/g

function normalizeId(rawId: number): string {
  // Bit 31 is used by some tools to mark extended (29-bit) frames — strip it
  const id = rawId & 0x1fffffff
  return `0X${id.toString(16).toUpperCase()}`
}

export function parseDbcFile(content: string): DbcData {
  const data: DbcData = {}
  let currentKey: string | null = null

  for (const line of content.split('\n')) {
    const boMatch = BO_REGEX.exec(line)
    if (boMatch) {
      currentKey = normalizeId(parseInt(boMatch[1], 10))
      const txRaw = boMatch[4]?.trim()
      data[currentKey] = {
        id:          parseInt(boMatch[1], 10) & 0x1fffffff,
        name:        boMatch[2],
        dlc:         parseInt(boMatch[3], 10),
        transmitter: txRaw && txRaw !== 'Vector__XXX' ? txRaw : undefined,
        signals:     [],
      }
      continue
    }

    const valMatch = VAL_REGEX.exec(line)
    if (valMatch) {
      const msgKey = normalizeId(parseInt(valMatch[1], 10))
      const sigName = valMatch[2]
      const signal = data[msgKey]?.signals.find(s => s.name === sigName)
      if (signal) {
        signal.values = {}
        VAL_PAIR_REGEX.lastIndex = 0
        let pair: RegExpExecArray | null
        while ((pair = VAL_PAIR_REGEX.exec(valMatch[3])) !== null) {
          signal.values[parseInt(pair[1], 10)] = pair[2]
        }
      }
      continue
    }

    if (currentKey) {
      const sgMatch = SG_REGEX.exec(line)
      if (sgMatch) {
        // Groups: 1=name, 2=mux(M/m3/undefined), 3=startBit, 4=length, 5=byteOrder,
        //         6=sign, 7=factor, 8=offset, 9=unit, 10=receivers
        const muxStr = sgMatch[2]
        const mux: DbcSignal['mux'] = muxStr === 'M'
          ? { kind: 'switch' }
          : muxStr
            ? { kind: 'muxed', id: parseInt(muxStr.slice(1), 10) }
            : undefined

        const rxRaw = sgMatch[10]?.trim()
        const receivers = rxRaw
          ? rxRaw.split(',').map(r => r.trim()).filter(r => r && r !== 'Vector__XXX')
          : undefined

        data[currentKey].signals.push({
          name:           sgMatch[1],
          startBit:       parseInt(sgMatch[3], 10),
          length:         parseInt(sgMatch[4], 10),
          isLittleEndian: sgMatch[5] === '1',
          isSigned:       sgMatch[6] === '-',
          factor:         parseFloat(sgMatch[7]),
          offset:         parseFloat(sgMatch[8]),
          unit:           sgMatch[9],
          mux,
          receivers:      receivers?.length ? receivers : undefined,
        })
      }
    }
  }

  // BA_DEF_ — collect ENUM definitions for message attributes (needed to resolve send type index)
  const enumDefs: Record<string, string[]> = {}
  const BA_DEF_REGEX = /^BA_DEF_ BO_\s+"(\w+)"\s+ENUM\s+(.*?)\s*;/gm
  let baDef: RegExpExecArray | null
  while ((baDef = BA_DEF_REGEX.exec(content)) !== null) {
    enumDefs[baDef[1]] = [...baDef[2].matchAll(/"([^"]*)"/g)].map(m => m[1])
  }

  // BA_ — resolve cycle time and send type for each message
  const CYCLE_NAMES    = new Set(['GenMsgCycleTime', 'CycleTime', 'MsgCycleTime', 'MessageCycleTime'])
  const SENDTYPE_NAMES = new Set(['GenMsgSendType', 'SendType', 'MsgSendType'])
  const BA_REGEX = /^BA_ "(\w+)" BO_ (\d+)\s+(.*?)\s*;/gm
  let ba: RegExpExecArray | null
  while ((ba = BA_REGEX.exec(content)) !== null) {
    const attr   = ba[1]
    const msgKey = normalizeId(parseInt(ba[2], 10))
    const raw    = ba[3].trim()
    if (!data[msgKey]) continue

    if (CYCLE_NAMES.has(attr)) {
      const ms = parseInt(raw, 10)
      if (!isNaN(ms) && ms > 0) data[msgKey].cycleTime = ms
    } else if (SENDTYPE_NAMES.has(attr)) {
      const enumList = enumDefs[attr]
      if (enumList) {
        const idx = parseInt(raw, 10)
        const val = !isNaN(idx) ? enumList[idx] : undefined
        if (val && val !== 'NoMsgSendType' && val !== 'notUsed') data[msgKey].sendType = val
      } else {
        const val = raw.replace(/^"|"$/g, '')
        if (val && val !== 'NoMsgSendType') data[msgKey].sendType = val
      }
    }
  }

  // CM_ comments (may span multiple lines, so we scan the full content)
  const CM_BO = /CM_ BO_ (\d+)\s+"([\s\S]*?)"\s*;/g
  const CM_SG = /CM_ SG_ (\d+)\s+(\w+)\s+"([\s\S]*?)"\s*;/g

  let cm: RegExpExecArray | null
  while ((cm = CM_BO.exec(content)) !== null) {
    const key = normalizeId(parseInt(cm[1], 10))
    if (data[key]) data[key].comment = cm[2].trim()
  }
  while ((cm = CM_SG.exec(content)) !== null) {
    const key = normalizeId(parseInt(cm[1], 10))
    const sig = data[key]?.signals.find(s => s.name === cm![2])
    if (sig) sig.comment = cm[3].trim()
  }

  return data
}
