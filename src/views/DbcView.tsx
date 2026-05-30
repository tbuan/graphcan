import { useMemo, useEffect, useState, Fragment } from 'react'
import type { DbcData } from '../parsers/dbc'
import BitLayout from '../components/BitLayout'

interface DbcViewProps {
  dbcData:      DbcData | null
  selectedKey:  string | null
  onSelectKey:  (key: string | null) => void
  search:       string
  onSearch:     (s: string) => void
  selectedMux:  number | 'all'
  onSelectMux:  (mux: number | 'all') => void
}

const SIG_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  '#06B6D4', '#A855F7',
]

function fmtHexId(id: number): string {
  return `0x${id.toString(16).toUpperCase().padStart(3, '0')}`
}

function fmtRange(sig: { isSigned: boolean; length: number; factor: number; offset: number }): string {
  const maxRaw  = sig.isSigned ? 2 ** (sig.length - 1) - 1 : 2 ** sig.length - 1
  const minRaw  = sig.isSigned ? -(2 ** (sig.length - 1)) : 0
  const physMin = minRaw * sig.factor + sig.offset
  const physMax = maxRaw * sig.factor + sig.offset
  const fmt = (v: number) => Number.isInteger(v) ? String(v) : parseFloat(v.toPrecision(5)).toString()
  return `${fmt(physMin)} … ${fmt(physMax)}`
}

export default function DbcView({
  dbcData,
  selectedKey, onSelectKey,
  search,      onSearch,
  selectedMux, onSelectMux,
}: DbcViewProps) {
  const [activeTab, setActiveTab] = useState<'layout' | 'info'>('layout')

  // Reset mux selection and tab when the selected message changes
  useEffect(() => { onSelectMux('all'); setActiveTab('layout') }, [selectedKey])

  const messages = useMemo(() => {
    if (!dbcData) return []
    return Object.entries(dbcData)
      .map(([key, msg]) => ({ key, msg }))
      .sort((a, b) => a.msg.id - b.msg.id)
  }, [dbcData])

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(({ key, msg }) =>
      msg.name.toLowerCase().includes(q) ||
      key.toLowerCase().includes(q) ||
      fmtHexId(msg.id).toLowerCase().includes(q),
    )
  }, [messages, search])

  const selected     = selectedKey ? dbcData?.[selectedKey] ?? null : null
  const hasMux       = selected?.signals.some(s => s.mux !== undefined) ?? false
  const effectiveDlc = selected ? (selected.dlc > 0 ? selected.dlc : 8) : 8

  // All mux IDs present in this message
  const muxIds = useMemo(() => {
    if (!selected) return []
    return [...new Set(
      selected.signals
        .filter(s => s.mux?.kind === 'muxed')
        .map(s => (s.mux as { kind: 'muxed'; id: number }).id),
    )].sort((a, b) => a - b)
  }, [selected])

  // Signals to show in bit layout + table (filtered by mux selection)
  const visibleSignals = useMemo(() => {
    if (!selected) return []
    if (!hasMux || selectedMux === 'all') return selected.signals
    return selected.signals.filter(s =>
      !s.mux ||
      s.mux.kind === 'switch' ||
      (s.mux.kind === 'muxed' && (s.mux as { kind: 'muxed'; id: number }).id === selectedMux),
    )
  }, [selected, hasMux, selectedMux])

  // Colors stable relative to the original signal index (don't shift on mux change)
  const visibleColors = useMemo(() =>
    visibleSignals.map(sig => {
      const origIdx = selected!.signals.indexOf(sig)
      return SIG_COLORS[origIdx % SIG_COLORS.length]
    }),
  [visibleSignals, selected])

  // For each muxed signal name, collect all mux IDs it appears in (across the whole message)
  const muxIdsByName = useMemo(() => {
    const map = new Map<string, number[]>()
    if (!selected) return map
    for (const sig of selected.signals) {
      if (sig.mux?.kind !== 'muxed') continue
      const id = (sig.mux as { kind: 'muxed'; id: number }).id
      if (!map.has(sig.name)) map.set(sig.name, [])
      map.get(sig.name)!.push(id)
    }
    return map
  }, [selected])

  // Grouped signals for the table (regular → mux switch → muxed by id).
  // When showing all mux IDs, collapse signals with the same name into one row.
  const groupedSignals = useMemo(() => {
    const regular   = visibleSignals.filter(s => !s.mux)
    const muxSwitch = visibleSignals.filter(s => s.mux?.kind === 'switch')
    const muxed     = visibleSignals.filter(s => s.mux?.kind === 'muxed')

    let muxedRows: typeof muxed
    if (selectedMux === 'all') {
      const seen = new Set<string>()
      muxedRows = muxed.filter(s => { if (seen.has(s.name)) return false; seen.add(s.name); return true })
    } else {
      const ids = [...new Set(muxed.map(s => (s.mux as { kind: 'muxed'; id: number }).id))].sort((a, b) => a - b)
      muxedRows = ids.flatMap(id => muxed.filter(s => (s.mux as { kind: 'muxed'; id: number }).id === id))
    }
    return [...regular, ...muxSwitch, ...muxedRows]
  }, [visibleSignals, selectedMux])

  if (!dbcData) {
    return <p className="main-placeholder">Load a DBC file to visualize it</p>
  }

  return (
    <div className="dbc-view">

      {/* ── Left: message list ──────────────────────────────────────── */}
      <div className="dbc-list-panel">
        <input
          className="dbc-search"
          placeholder="Filter messages…"
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
        <div className="dbc-list">
          {filteredMessages.map(({ key, msg }) => {
            const isMuxed = msg.signals.some(s => s.mux !== undefined)
            return (
              <div
                key={key}
                className={`dbc-list-item ${selectedKey === key ? 'dbc-list-item-active' : ''}`}
                onClick={() => onSelectKey(key)}
              >
                <span className="dbc-list-name">{msg.name}</span>
                <div className="dbc-list-meta">
                  <span className="dbc-list-id">{fmtHexId(msg.id)}</span>
                  <span className="dbc-list-sigcount">{msg.signals.length} sig</span>
                  {isMuxed && <span className="dbc-badge-mux">MUX</span>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="dbc-list-footer">
          {filteredMessages.length} / {messages.length} messages
        </div>
      </div>

      {/* ── Right: detail panel ─────────────────────────────────────── */}
      <div className="dbc-detail-panel">
        {!selected ? (
          <p className="dbc-select-hint">Select a message to inspect it</p>
        ) : (
          <>
            {/* Header */}
            <div className="dbc-msg-header">
              <span className="dbc-msg-name">{selected.name}</span>
              <span className="dbc-msg-id">{fmtHexId(selected.id)}</span>
              <span className="dbc-msg-badge">DLC {effectiveDlc}</span>
              <span className="dbc-msg-badge">{selected.signals.length} signals</span>
              {hasMux && <span className="dbc-badge-mux">MUX</span>}

              {/* Mux selector — only on Layout tab */}
              {activeTab === 'layout' && hasMux && muxIds.length > 0 && (
                <select
                  className="dbc-mux-select"
                  value={selectedMux}
                  onChange={e => onSelectMux(
                    e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10),
                  )}
                >
                  <option value="all">All mux IDs</option>
                  {muxIds.map(id => (
                    <option key={id} value={id}>Mux {id}</option>
                  ))}
                </select>
              )}

              {/* Tab switcher */}
              <div className="dbc-detail-tabs">
                <button
                  className={`dbc-detail-tab ${activeTab === 'layout' ? 'dbc-detail-tab-active' : ''}`}
                  onClick={() => setActiveTab('layout')}
                >
                  Layout
                </button>
                <button
                  className={`dbc-detail-tab ${activeTab === 'info' ? 'dbc-detail-tab-active' : ''}`}
                  onClick={() => setActiveTab('info')}
                >
                  Info
                </button>
              </div>
            </div>

            {activeTab === 'layout' ? (
              <>
                {/* Bit layout */}
                <section className="dbc-section">
                  <h3 className="dbc-section-title">Bit Layout</h3>
                  <div className="dbc-bit-scroll">
                    <BitLayout
                      dlc={effectiveDlc}
                      signals={visibleSignals}
                      colors={visibleColors}
                    />
                  </div>
                </section>

                {/* Signal table */}
                <section className="dbc-section">
                  <h3 className="dbc-section-title">
                    Signals
                    {selectedMux !== 'all' && (
                      <span className="dbc-section-badge">Mux {selectedMux}</span>
                    )}
                  </h3>
                  <div className="dbc-sig-table-wrap">
                    <table className="dbc-sig-table">
                      <thead>
                        <tr>
                          <th className="dbc-th">Signal</th>
                          <th className="dbc-th dbc-th-r">Start bit</th>
                          <th className="dbc-th dbc-th-r">Length</th>
                          <th className="dbc-th dbc-th-r">Factor</th>
                          <th className="dbc-th dbc-th-r">Offset</th>
                          <th className="dbc-th">Unit</th>
                          <th className="dbc-th">Type</th>
                          <th className="dbc-th">Range</th>
                          <th className="dbc-th">Values</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedSignals.map((sig, i) => {
                          const origIdx  = selected.signals.indexOf(sig)
                          const color    = SIG_COLORS[origIdx % SIG_COLORS.length]
                          const muxLabel = sig.mux?.kind === 'switch'
                            ? 'MUX'
                            : sig.mux?.kind === 'muxed'
                              ? selectedMux === 'all'
                                ? (muxIdsByName.get(sig.name) ?? []).map(id => `m${id}`).join(' ')
                                : `m${(sig.mux as { kind: 'muxed'; id: number }).id}`
                              : null
                          const hasValues = sig.values && Object.keys(sig.values).length > 0
                          const prevSig   = groupedSignals[i - 1]
                          const showSep   = hasMux && sig.mux?.kind === 'switch' && prevSig && !prevSig.mux

                          return (
                            <Fragment key={i}>
                              {showSep && (
                                <tr className="dbc-sig-sep">
                                  <td colSpan={9}><span>Multiplexed signals</span></td>
                                </tr>
                              )}
                              <tr className="dbc-sig-row">
                                <td className="dbc-td">
                                  <div className="dbc-sig-name-cell">
                                    <span className="dbc-sig-swatch" style={{ background: color }} />
                                    <span className="dbc-sig-name">{sig.name}</span>
                                    {muxLabel && <span className="dbc-badge-mux dbc-badge-sm">{muxLabel}</span>}
                                  </div>
                                </td>
                                <td className="dbc-td dbc-td-r">{sig.startBit}</td>
                                <td className="dbc-td dbc-td-r">{sig.length}</td>
                                <td className="dbc-td dbc-td-r">{sig.factor}</td>
                                <td className="dbc-td dbc-td-r">{sig.offset}</td>
                                <td className="dbc-td">{sig.unit || '—'}</td>
                                <td className="dbc-td">
                                  <span className="dbc-sig-type">{sig.isSigned ? 'int' : 'uint'}{sig.length}</span>
                                  <span className="dbc-sig-endian">{sig.isLittleEndian ? 'LE' : 'BE'}</span>
                                </td>
                                <td className="dbc-td dbc-td-range">{fmtRange(sig)}</td>
                                <td className="dbc-td dbc-td-values">
                                  {hasValues && (
                                    <details className="dbc-values">
                                      <summary className="dbc-values-summary">
                                        {Object.keys(sig.values!).length} values
                                      </summary>
                                      <div className="dbc-values-list">
                                        {Object.entries(sig.values!).map(([k, v]) => (
                                          <div key={k} className="dbc-value-item">
                                            <span className="dbc-value-key">{k}</span>
                                            <span className="dbc-value-val">{v}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </details>
                                  )}
                                </td>
                              </tr>
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : (
              <>
                {/* Info tab — message metadata */}
                <section className="dbc-section">
                  <h3 className="dbc-section-title">Message</h3>
                  <div className="dbc-info-grid">
                    <span className="dbc-info-label">Transmitter</span>
                    <span className="dbc-info-value">{selected.transmitter ?? <em className="dbc-text-muted">—</em>}</span>
                    <span className="dbc-info-label">Send type</span>
                    <span className="dbc-info-value">
                      {selected.sendType
                        ? <span className="dbc-info-badge">{selected.sendType}</span>
                        : <em className="dbc-text-muted">—</em>}
                    </span>
                    <span className="dbc-info-label">Cycle time</span>
                    <span className="dbc-info-value">
                      {selected.cycleTime != null
                        ? <><strong>{selected.cycleTime}</strong><span className="dbc-info-unit"> ms</span></>
                        : <em className="dbc-text-muted">—</em>}
                    </span>
                    <span className="dbc-info-label">Comment</span>
                    <span className="dbc-info-value dbc-info-comment">{selected.comment ?? <em className="dbc-text-muted">—</em>}</span>
                  </div>
                </section>

                {/* Info tab — per-signal receivers + comments */}
                <section className="dbc-section">
                  <h3 className="dbc-section-title">Signals</h3>
                  <div className="dbc-sig-table-wrap">
                    <table className="dbc-sig-table">
                      <thead>
                        <tr>
                          <th className="dbc-th">Signal</th>
                          <th className="dbc-th">Receivers</th>
                          <th className="dbc-th">Comment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.signals.map((sig, i) => {
                          const color    = SIG_COLORS[i % SIG_COLORS.length]
                          const muxLabel = sig.mux?.kind === 'switch'
                            ? 'MUX'
                            : sig.mux?.kind === 'muxed'
                              ? `m${(sig.mux as { kind: 'muxed'; id: number }).id}`
                              : null
                          return (
                            <tr key={i} className="dbc-sig-row">
                              <td className="dbc-td">
                                <div className="dbc-sig-name-cell">
                                  <span className="dbc-sig-swatch" style={{ background: color }} />
                                  <span className="dbc-sig-name">{sig.name}</span>
                                  {muxLabel && <span className="dbc-badge-mux dbc-badge-sm">{muxLabel}</span>}
                                </div>
                              </td>
                              <td className="dbc-td">
                                {sig.receivers?.length
                                  ? sig.receivers.join(', ')
                                  : <em className="dbc-text-muted">—</em>}
                              </td>
                              <td className="dbc-td dbc-info-comment">
                                {sig.comment ?? <em className="dbc-text-muted">—</em>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
