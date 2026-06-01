import type { DbcData, DbcSignal } from '../parsers/dbc'

/** Returns message name if known, otherwise the raw ID. */
export function getMessageName(id: string, dbc: DbcData | null): string {
  return dbc?.[id]?.name ?? id
}

/** Returns "MessageName (0X...)" if known, otherwise just the raw ID. */
export function getMessageLabel(id: string, dbc: DbcData | null): string {
  const name = dbc?.[id]?.name
  return name ? `${name} (${id})` : id
}

/**
 * Resolves a mux ID to a human-readable label.
 * If the switch signal has a values map and the ID has an entry, returns that name.
 * Otherwise falls back to "m{id}".
 */
export function getMuxLabel(id: number, switchSignal?: DbcSignal | null): string {
  return switchSignal?.values?.[id] ?? `m${id}`
}

/** Returns the mux switch signal of a message, or null if none. */
export function getSwitchSignal(signals: DbcSignal[]): DbcSignal | null {
  return signals.find(s => s.mux?.kind === 'switch') ?? null
}
