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
}

export interface DbcMessage {
  id: number
  name: string
  signals: DbcSignal[]
}

// Keyed by normalized hex ID matching busmaster format: "0X142406E4"
export type DbcData = Record<string, DbcMessage>

// BO_ 2228388068 MessageName: 8 Sender
const BO_REGEX = /^BO_ (\d+) (\w+)\s*:\s*(\d+)/

// SG_ SignalName : 0|16@1+ (0.01,-40) [0|0] "km/h" Receivers
// SG_ SignalName M : ...   ← multiplexer switch signal
// SG_ SignalName m3 : ...  ← active when mux = 3
// @1 = Intel/little-endian, @0 = Motorola/big-endian
const SG_REGEX =
  /^\s+SG_ (\w+)\s*(M|m\d+)?\s*:\s*(\d+)\|(\d+)@(\d)([+-])\s*\(([^,]+),([^)]+)\)\s*\[[^\]]+\]\s*"([^"]*)"/

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
      data[currentKey] = {
        id: parseInt(boMatch[1], 10) & 0x1fffffff,
        name: boMatch[2],
        signals: [],
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
        // Groups: 1=name, 2=mux(M/m3/undefined), 3=startBit, 4=length, 5=byteOrder, 6=sign, 7=factor, 8=offset, 9=unit
        const muxStr = sgMatch[2]
        const mux: DbcSignal['mux'] = muxStr === 'M'
          ? { kind: 'switch' }
          : muxStr
            ? { kind: 'muxed', id: parseInt(muxStr.slice(1), 10) }
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
        })
      }
    }
  }

  return data
}
