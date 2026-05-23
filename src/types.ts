import type { ParseResult } from './parsers/busmaster'

export interface ImportedFile {
  name: string
  result: ParseResult
  importKey: number
}

export interface Signal {
  id: string
  byteIndex: number
}

export type DisplayMode = 'line' | 'points' | 'line+points'

export interface ChartConfig {
  signals: Signal[]
  displayMode: DisplayMode
}
