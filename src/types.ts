import type { ParseResult } from './parsers/busmaster'

export interface ImportedFile {
  name: string
  result: ParseResult
  importKey: number
}

export interface Signal {
  id: string
  byteIndex: number
  color: string
}

export type DisplayMode = 'line' | 'points' | 'line+points'

export interface ChartConfig {
  signals: Signal[]
  displayMode: DisplayMode
}

export type AnalysisPanelSource =
  | { kind: 'byte';   byteIndex: number }
  | { kind: 'signal'; signalName: string }

export interface Annotation {
  t: number
  label: string
}

export interface AnalysisPanel {
  uid: string
  id: string
  source: AnalysisPanelSource
  color: string
}
