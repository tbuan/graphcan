import { parseBusmasterLog } from './busmaster'
import type { ParseResult } from './busmaster'
import { parseAscFile }            from './asc'
import { parseTrcFile }            from './trc'
import { parseCandumpLog }         from './candump'
import { parseSimpleLog, isSimpleLog } from './simplelog'

type Format = 'busmaster' | 'asc' | 'trc' | 'candump' | 'simple'

function isStandardAsc(content: string): boolean {
  const head = content.slice(0, 500)
  return /^date\s+\w/m.test(head) || /^base\s+hex/m.test(head)
}

function detectFormat(content: string, filename: string): Format {
  const ext  = filename.split('.').pop()?.toLowerCase()

  if (ext === 'trc') return 'trc'

  if (ext === 'asc') {
    // Standard Vector ASC has date/base-hex headers; otherwise fall back to simple
    return isStandardAsc(content) ? 'asc' : 'simple'
  }

  // Content-based detection for .log and any unknown extension
  const head = content.slice(0, 1000)
  if (head.includes('***BUSMASTER'))                              return 'busmaster'
  if (/^date\s+\w/m.test(head) || /^base\s+hex/m.test(head))    return 'asc'
  if (/^;\s*(Start.?[Tt]ime|PEAK)/m.test(head))                  return 'trc'
  if (/^\(\d+\.\d+\)\s+\S+\s+[0-9A-Fa-f]+#/m.test(head))       return 'candump'
  if (isSimpleLog(content))                                       return 'simple'

  return 'busmaster'
}

export function parseCanLog(content: string, filename: string): ParseResult {
  switch (detectFormat(content, filename)) {
    case 'asc':     return parseAscFile(content)
    case 'trc':     return parseTrcFile(content)
    case 'candump': return parseCandumpLog(content)
    case 'simple':  return parseSimpleLog(content)
    default:        return parseBusmasterLog(content)
  }
}
