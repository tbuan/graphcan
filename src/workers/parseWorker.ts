import { parseCanLog } from '../parsers/parseCanLog'
import { parseBlf } from '../parsers/blf'
import type { ParseResult } from '../parsers/busmaster'

type WorkerRequest =
  | { kind: 'text';   content: string;     filename: string }
  | { kind: 'binary'; buffer: ArrayBuffer; filename: string }

type WorkerResponse =
  | { ok: true;  result: ParseResult }
  | { ok: false; error: string }

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    let result: ParseResult
    if (e.data.kind === 'binary') {
      result = parseBlf(new Uint8Array(e.data.buffer))
    } else {
      result = parseCanLog(e.data.content, e.data.filename)
    }
    const response: WorkerResponse = { ok: true, result }
    self.postMessage(response)
  } catch (err) {
    const response: WorkerResponse = { ok: false, error: String(err) }
    self.postMessage(response)
  }
}
