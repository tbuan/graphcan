import type { DbcData } from '../parsers/dbc'

const SEND_TYPE_ENUM = ['NoMsgSendType', 'cyclic', 'event', 'cyclicEvent']

export function exportDbc(data: DbcData, nodes: string[] = []): string {
  const messages = Object.values(data).sort((a, b) => a.id - b.id)
  const buLine   = nodes.length ? `BU_: ${nodes.join(' ')}` : 'BU_:'

  let out = `VERSION ""\n\nNS_ :\n\nBS_:\n\n${buLine}\n\n`

  // ── Messages + signals ───────────────────────────────────
  for (const msg of messages) {
    const tx = msg.transmitter || 'Vector__XXX'
    out += `BO_ ${msg.id} ${msg.name}: ${msg.dlc} ${tx}\n`

    for (const sig of msg.signals) {
      const mux = sig.mux
        ? sig.mux.kind === 'switch'
          ? ' M'
          : ` m${(sig.mux as { kind: 'muxed'; id: number }).id}`
        : ''
      const endian = sig.isLittleEndian ? '1' : '0'
      const sign   = sig.isSigned ? '-' : '+'
      const rx     = sig.receivers?.join(', ') || 'Vector__XXX'
      out += ` SG_ ${sig.name}${mux} : ${sig.startBit}|${sig.length}@${endian}${sign}`
      out += ` (${sig.factor},${sig.offset}) [0|0] "${sig.unit}" ${rx}\n`
    }
    out += '\n'
  }

  // ── Value tables ─────────────────────────────────────────
  for (const msg of messages) {
    for (const sig of msg.signals) {
      if (!sig.values || Object.keys(sig.values).length === 0) continue
      const pairs = Object.entries(sig.values).map(([k, v]) => `${k} "${v}"`).join(' ')
      out += `VAL_ ${msg.id} ${sig.name} ${pairs} ;\n`
    }
  }

  // ── Attributes (send type + cycle time) ──────────────────
  const hasAttrs = messages.some(m => m.sendType || m.cycleTime)
  if (hasAttrs) {
    out += '\nBA_DEF_ BO_ "GenMsgSendType" ENUM "NoMsgSendType","cyclic","event","cyclicEvent";\n'
    out += 'BA_DEF_ BO_ "GenMsgCycleTime" INT 0 10000;\n'
    out += 'BA_DEF_DEF_ "GenMsgSendType" "NoMsgSendType";\n'
    out += 'BA_DEF_DEF_ "GenMsgCycleTime" 0;\n\n'
    for (const msg of messages) {
      if (msg.sendType) {
        const idx = SEND_TYPE_ENUM.indexOf(msg.sendType)
        if (idx >= 0) out += `BA_ "GenMsgSendType" BO_ ${msg.id} ${idx};\n`
      }
      if (msg.cycleTime) {
        out += `BA_ "GenMsgCycleTime" BO_ ${msg.id} ${msg.cycleTime};\n`
      }
    }
  }

  // ── Comments ─────────────────────────────────────────────
  out += '\n'
  for (const msg of messages) {
    if (msg.comment) out += `CM_ BO_ ${msg.id} "${msg.comment.replace(/"/g, '\\"')}";\n`
    for (const sig of msg.signals) {
      if (sig.comment) out += `CM_ SG_ ${msg.id} ${sig.name} "${sig.comment.replace(/"/g, '\\"')}";\n`
    }
  }

  return out
}
