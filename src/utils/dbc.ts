import type { DbcData } from '../parsers/dbc'

/** Returns message name if known, otherwise the raw ID. */
export function getMessageName(id: string, dbc: DbcData | null): string {
  return dbc?.[id]?.name ?? id
}

/** Returns "MessageName (0X...)" if known, otherwise just the raw ID. */
export function getMessageLabel(id: string, dbc: DbcData | null): string {
  const name = dbc?.[id]?.name
  return name ? `${name} (${id})` : id
}
