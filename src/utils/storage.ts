import { openDB } from 'idb'
import type { ChartConfig, AnalysisPanel } from '../types'
import type { DbcData } from '../parsers/dbc'

const DB_NAME = 'graphcan'
const DB_VERSION = 2

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files')
      if (!db.objectStoreNames.contains('dbc'))   db.createObjectStore('dbc')
    },
  })
}

// ── Log file (IndexedDB) ──────────────────────────────────────

interface StoredFile {
  name: string
  content: string
}

export async function saveFile(name: string, content: string): Promise<void> {
  const db = await getDB()
  await db.put('files', { name, content } satisfies StoredFile, 'last')
}

export async function loadFile(): Promise<StoredFile | undefined> {
  const db = await getDB()
  return db.get('files', 'last')
}

// ── DBC file (IndexedDB) ──────────────────────────────────────

export async function saveDbcFile(name: string, content: string): Promise<void> {
  const db = await getDB()
  await db.put('dbc', { name, content } satisfies StoredFile, 'last')
}

export async function loadDbcFile(): Promise<StoredFile | undefined> {
  const db = await getDB()
  return db.get('dbc', 'last')
}

export async function clearDbcFile(): Promise<void> {
  const db = await getDB()
  await db.delete('dbc', 'last')
}

// ── DBC Editor state (localStorage) ─────────────────────────

const EDITOR_DATA_KEY  = 'graphcan-editor-data'
const EDITOR_NODES_KEY = 'graphcan-editor-nodes'

export function saveEditorState(data: DbcData, nodes: string[]): void {
  try {
    localStorage.setItem(EDITOR_DATA_KEY,  JSON.stringify(data))
    localStorage.setItem(EDITOR_NODES_KEY, JSON.stringify(nodes))
  } catch { /* quota exceeded — silently ignore */ }
}

export function loadEditorState(): { data: DbcData; nodes: string[] } | null {
  try {
    const rawData  = localStorage.getItem(EDITOR_DATA_KEY)
    const rawNodes = localStorage.getItem(EDITOR_NODES_KEY)
    if (!rawData) return null
    return {
      data:  JSON.parse(rawData)  as DbcData,
      nodes: rawNodes ? (JSON.parse(rawNodes) as string[]) : [],
    }
  } catch {
    return null
  }
}

// ── Analysis panels (localStorage) ───────────────────────────

const ANALYSIS_PANELS_KEY = 'graphcan-analysis-panels'

export function saveAnalysisPanels(panels: AnalysisPanel[]): void {
  localStorage.setItem(ANALYSIS_PANELS_KEY, JSON.stringify(panels))
}

export function loadAnalysisPanels(): AnalysisPanel[] | null {
  const raw = localStorage.getItem(ANALYSIS_PANELS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AnalysisPanel[]
  } catch {
    return null
  }
}

// ── Chart config (localStorage) ───────────────────────────────

const CHART_CONFIG_KEY = 'chartConfig'

export function saveChartConfig(config: ChartConfig): void {
  localStorage.setItem(CHART_CONFIG_KEY, JSON.stringify(config))
}

export function loadChartConfig(): ChartConfig | null {
  const raw = localStorage.getItem(CHART_CONFIG_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ChartConfig
  } catch {
    return null
  }
}
