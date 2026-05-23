import { openDB } from 'idb'
import type { ChartConfig } from '../types'

const DB_NAME = 'graphcan'
const DB_VERSION = 1

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('files')
    },
  })
}

// ── File (IndexedDB) ──────────────────────────────────────────

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
