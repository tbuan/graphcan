import { openDB } from 'idb'
import type { ChartConfig } from '../types'

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
