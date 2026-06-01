import { useState, useMemo } from 'react'
import type { DbcData, DbcMessage, DbcSignal } from '../parsers/dbc'
import BitLayout from '../components/BitLayout'
import { exportDbc } from '../utils/dbcExport'
import { getMuxLabel } from '../utils/dbc'

// ─── Constants ────────────────────────────────────────────

const SIG_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  '#06B6D4', '#A855F7',
]

// ─── Helpers ──────────────────────────────────────────────

function makeKey(id: number): string {
  return `0X${(id & 0x1fffffff).toString(16).toUpperCase()}`
}

function fmtHex(id: number): string {
  return `0x${id.toString(16).toUpperCase().padStart(3, '0')}`
}

function freshMessage(existingIds: Set<number>): { key: string; msg: DbcMessage } {
  let id = 0
  while (existingIds.has(id)) id++
  return { key: makeKey(id), msg: { id, name: 'NewMessage', dlc: 8, signals: [] } }
}

function freshSignal(): DbcSignal {
  return { name: 'NewSignal', startBit: 0, length: 8, isLittleEndian: true, isSigned: false, factor: 1, offset: 0, unit: '' }
}

// ─── Conflict detection ───────────────────────────────────

function findConflicts(signals: DbcSignal[], dlc: number): Set<string> {
  const usage = new Map<number, string[]>()

  for (const sig of signals) {
    if (sig.isLittleEndian ?? true) {
      for (let i = 0; i < sig.length; i++) {
        const bit = sig.startBit + i
        if (bit >> 3 >= dlc) continue
        if (!usage.has(bit)) usage.set(bit, [])
        usage.get(bit)!.push(sig.name)
      }
    } else {
      let bit = sig.startBit
      for (let i = 0; i < sig.length; i++) {
        if (bit >> 3 < dlc) {
          if (!usage.has(bit)) usage.set(bit, [])
          usage.get(bit)!.push(sig.name)
        }
        bit = (bit & 7) === 0 ? bit + 15 : bit - 1
      }
    }
  }

  const pairs = new Set<string>()
  for (const names of usage.values()) {
    if (names.length < 2) continue
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        pairs.add([names[i], names[j]].sort().join(' ↔ '))
  }
  return pairs
}

// ─── Props ────────────────────────────────────────────────

interface DbcEditorViewProps {
  data: DbcData
  onChange: (data: DbcData) => void
  nodes: string[]
  onNodesChange: (nodes: string[]) => void
  selectedKey: string | null
  onSelectKey: (key: string | null) => void
  selectedSigIdx: number | null
  onSelectSigIdx: (idx: number | null) => void
  importedDbc: DbcData | null
  onApplyToViewer: (data: DbcData) => void
}

// ─── Main component ───────────────────────────────────────

export default function DbcEditorView({ data, onChange, nodes, onNodesChange, selectedKey, onSelectKey, selectedSigIdx, onSelectSigIdx, importedDbc, onApplyToViewer }: DbcEditorViewProps) {
  const [idInput, setIdInput]               = useState<string>('')
  const [idFocused, setIdFocused]           = useState(false)
  const [newValKey, setNewValKey]           = useState('')
  const [newValLabel, setNewValLabel]       = useState('')
  const [newNodeName, setNewNodeName]       = useState('')
  const [rxInput, setRxInput]               = useState('')
  const [listWidth, setListWidth]           = useState(220)
  const [previewWidth, setPreviewWidth]     = useState(380)
  const [previewMux, setPreviewMux]         = useState<number | 'all'>('all')

  function makeResizeHandler(
    getCurrent: () => number,
    setter: (w: number) => void,
    min: number,
    max: number,
    direction: 'right' | 'left' = 'right',
  ) {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      const startX    = e.clientX
      const startW    = getCurrent()
      const sign      = direction === 'right' ? 1 : -1
      function onMove(ev: MouseEvent) {
        setter(Math.max(min, Math.min(max, startW + sign * (ev.clientX - startX))))
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.style.cursor    = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor    = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
  }

  const messages = useMemo(() =>
    Object.entries(data).map(([key, msg]) => ({ key, msg })).sort((a, b) => a.msg.id - b.msg.id),
    [data],
  )

  const selectedMsg  = selectedKey ? data[selectedKey] ?? null : null
  const selectedSig  = selectedMsg && selectedSigIdx != null ? selectedMsg.signals[selectedSigIdx] ?? null : null
  const effectiveDlc = selectedMsg ? Math.max(1, selectedMsg.dlc) : 8

  // ── Mux derived state ──────────────────────────────────
  const switchIdx    = selectedMsg ? selectedMsg.signals.findIndex(s => s.mux?.kind === 'switch') : -1
  const switchSignal = switchIdx >= 0 ? selectedMsg!.signals[switchIdx] : null
  const isMuxed      = switchIdx >= 0
  const muxedIds     = useMemo(() => {
    if (!selectedMsg) return []
    return [...new Set(
      selectedMsg.signals
        .filter(s => s.mux?.kind === 'muxed')
        .map(s => (s.mux as { kind: 'muxed'; id: number }).id),
    )].sort((a, b) => a - b)
  }, [selectedMsg])
  // Non-switch signals (shown in the regular signal list)
  const regularSignals = useMemo(
    () => selectedMsg?.signals.map((s, i) => ({ sig: s, origIdx: i })).filter(({ sig }) => sig.mux?.kind !== 'switch') ?? [],
    [selectedMsg],
  )
  // Filtered by active mux preview selection (strict: only the selected group)
  const visibleRegulars = useMemo(() => {
    if (!isMuxed || previewMux === 'all') return regularSignals
    return regularSignals.filter(({ sig }) =>
      !sig.mux ||
      (sig.mux.kind === 'muxed' && (sig.mux as { kind: 'muxed'; id: number }).id === previewMux),
    )
  }, [regularSignals, isMuxed, previewMux])
  // Note: when a specific mux is selected, visibleRegulars includes "common"
  // signals (no mux) in the list since they logically belong to all groups.

  // ── Message mutations ──────────────────────────────────

  function addMessage() {
    const existingIds = new Set(Object.values(data).map(m => m.id))
    const { key, msg } = freshMessage(existingIds)
    onChange({ ...data, [key]: msg })
    onSelectKey(key)
    onSelectSigIdx(null)
  }

  function deleteMessage(key: string) {
    const next = { ...data }
    delete next[key]
    onChange(next)
    if (selectedKey === key) { onSelectKey(null); onSelectSigIdx(null) }
  }

  function updateMessage(key: string, updates: Partial<DbcMessage>) {
    const msg = { ...data[key], ...updates }
    if ('id' in updates) {
      const newKey = makeKey(msg.id)
      if (newKey !== key) {
        const next = { ...data }
        delete next[key]
        next[newKey] = msg
        onChange(next)
        onSelectKey(newKey)
        return
      }
    }
    onChange({ ...data, [key]: msg })
  }

  // ── Signal mutations ───────────────────────────────────

  function addSignal() {
    if (!selectedKey) return
    const msg     = data[selectedKey]
    const signals = [...msg.signals, freshSignal()]
    onChange({ ...data, [selectedKey]: { ...msg, signals } })
    onSelectSigIdx(signals.length - 1)
  }

  function deleteSignal(idx: number) {
    if (!selectedKey) return
    const msg     = data[selectedKey]
    const signals = msg.signals.filter((_, i) => i !== idx)
    onChange({ ...data, [selectedKey]: { ...msg, signals } })
    if (selectedSigIdx === idx) onSelectSigIdx(null)
    else if (selectedSigIdx != null && selectedSigIdx > idx) onSelectSigIdx(selectedSigIdx - 1)
  }

  function updateSignal(idx: number, updates: Partial<DbcSignal>) {
    if (!selectedKey) return
    const msg     = data[selectedKey]
    const signals = msg.signals.map((s, i) => i === idx ? { ...s, ...updates } : s)
    onChange({ ...data, [selectedKey]: { ...msg, signals } })
  }

  // ── Mux mutations ──────────────────────────────────────

  function enableMux() {
    if (!selectedKey) return
    const msg = data[selectedKey]
    if (isMuxed) return
    const muxSwitch: DbcSignal = {
      name: 'MuxID', startBit: 0, length: 4,
      isLittleEndian: true, isSigned: false, factor: 1, offset: 0, unit: '',
      mux: { kind: 'switch' },
    }
    onChange({ ...data, [selectedKey]: { ...msg, signals: [muxSwitch, ...msg.signals] } })
    setPreviewMux('all')
  }

  function disableMux() {
    if (!selectedKey) return
    const msg = data[selectedKey]
    const signals = msg.signals
      .filter(s => s.mux?.kind !== 'switch')
      .map(s => ({ ...s, mux: undefined }))
    onChange({ ...data, [selectedKey]: { ...msg, signals } })
    onSelectSigIdx(null)
    setPreviewMux('all')
  }

  function updateSwitchSignal(updates: Partial<DbcSignal>) {
    if (!selectedKey || switchIdx < 0) return
    const msg     = data[selectedKey]
    const signals = msg.signals.map((s, i) => i === switchIdx ? { ...s, ...updates } : s)
    onChange({ ...data, [selectedKey]: { ...msg, signals } })
  }

  function addValue() {
    if (!selectedKey || selectedSigIdx == null) return
    const key = parseInt(newValKey, 10)
    if (isNaN(key) || !newValLabel.trim()) return
    const sig  = data[selectedKey].signals[selectedSigIdx]
    updateSignal(selectedSigIdx, { values: { ...(sig.values ?? {}), [key]: newValLabel.trim() } })
    setNewValKey('')
    setNewValLabel('')
  }

  function removeValue(rawKey: string) {
    if (!selectedKey || selectedSigIdx == null) return
    const sig  = data[selectedKey].signals[selectedSigIdx]
    const next = { ...(sig.values ?? {}) }
    delete next[Number(rawKey)]
    updateSignal(selectedSigIdx, { values: Object.keys(next).length ? next : undefined })
  }

  function updateValueLabel(rawKey: string, label: string) {
    if (!selectedKey || selectedSigIdx == null) return
    const sig  = data[selectedKey].signals[selectedSigIdx]
    updateSignal(selectedSigIdx, { values: { ...(sig.values ?? {}), [Number(rawKey)]: label } })
  }

  // ── Node (BU_) mutations ───────────────────────────────

  function addNode() {
    const name = newNodeName.trim()
    if (!name || nodes.includes(name)) return
    onNodesChange([...nodes, name].sort())
    setNewNodeName('')
  }

  function removeNode(name: string) {
    onNodesChange(nodes.filter(n => n !== name))
  }

  function loadFromViewer() {
    if (!importedDbc) return
    // Extract all unique node names from transmitters + receivers
    const found = new Set<string>()
    for (const msg of Object.values(importedDbc)) {
      if (msg.transmitter) found.add(msg.transmitter)
      for (const sig of msg.signals) sig.receivers?.forEach(r => found.add(r))
    }
    onNodesChange([...found].sort())
    onChange({ ...importedDbc })
    onSelectKey(null)
    onSelectSigIdx(null)
  }

  // ── Receiver helpers ────────────────────────────────────

  function toggleReceiver(rx: string) {
    if (!selectedKey || selectedSigIdx == null) return
    const sig = data[selectedKey].signals[selectedSigIdx]
    const cur = sig.receivers ?? []
    const next = cur.includes(rx) ? cur.filter(r => r !== rx) : [...cur, rx]
    updateSignal(selectedSigIdx, { receivers: next.length ? next : undefined })
  }

  function addCustomReceiver() {
    const rx = rxInput.trim()
    if (!rx || !selectedKey || selectedSigIdx == null) return
    const sig = data[selectedKey].signals[selectedSigIdx]
    const cur = sig.receivers ?? []
    if (!cur.includes(rx)) updateSignal(selectedSigIdx, { receivers: [...cur, rx] })
    setRxInput('')
  }

  // ── Export ─────────────────────────────────────────────

  function handleExport() {
    const content = exportDbc(data, nodes)
    const blob    = new Blob([content], { type: 'text/plain' })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement('a')
    a.href = url; a.download = 'export.dbc'
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ── Bit preview ────────────────────────────────────────

  const allPreviewSignals = selectedMsg?.signals ?? []
  const previewSignals = useMemo(() => {
    if (!isMuxed || previewMux === 'all') return allPreviewSignals
    // Strict filter: switch + signals explicitly in this mux group only.
    // Common signals (no mux) are excluded to avoid confusion in editor context.
    return allPreviewSignals.filter(s =>
      s.mux?.kind === 'switch' ||
      (s.mux?.kind === 'muxed' && (s.mux as { kind: 'muxed'; id: number }).id === previewMux),
    )
  }, [allPreviewSignals, isMuxed, previewMux])
  const previewColors = previewSignals.map((sig) => {
    const origIdx = allPreviewSignals.indexOf(sig)
    return SIG_COLORS[origIdx % SIG_COLORS.length]
  })
  const conflicts = useMemo(() => findConflicts(previewSignals, effectiveDlc), [previewSignals, effectiveDlc])

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="dbc-editor">

      {/* ── Left: message list ───────────────────────────── */}
      <div className="dbc-editor-list" style={{ width: listWidth }}>
        <div className="dbc-editor-list-header">
          <span className="dbc-editor-list-title">Messages</span>
          <button className="dbc-editor-btn-icon" onClick={addMessage} title="New message">＋</button>
        </div>

        <div className="dbc-editor-items">
          {messages.length === 0 && (
            <p className="dbc-editor-hint">Aucun message.<br />Cliquez ＋ pour commencer.</p>
          )}
          {messages.map(({ key, msg }) => (
            <div
              key={key}
              className={`dbc-editor-item ${selectedKey === key ? 'dbc-editor-item-active' : ''}`}
              onClick={() => { onSelectKey(key); onSelectSigIdx(null) }}
            >
              <div className="dbc-editor-item-body">
                <span className="dbc-editor-item-name">{msg.name}</span>
                <span className="dbc-editor-item-id">{fmtHex(msg.id)}</span>
              </div>
              <button
                className="dbc-editor-item-del"
                onClick={e => { e.stopPropagation(); deleteMessage(key) }}
                title="Delete"
              >×</button>
            </div>
          ))}
        </div>

        {/* ── Nodes (BU_) section ── */}
        <div className="dbc-editor-nodes">
          <div className="dbc-editor-nodes-header">
            <span className="dbc-editor-list-title">Nodes (BU_)</span>
            <button
              className="dbc-editor-btn-icon"
              title="Add node"
              onClick={addNode}
            >＋</button>
          </div>
          <div className="dbc-editor-nodes-list">
            {nodes.length === 0 && (
              <p className="dbc-editor-hint" style={{ padding: '6px 8px', textAlign: 'left' }}>Aucun node.</p>
            )}
            {nodes.map(name => (
              <div key={name} className="dbc-editor-node-item">
                <span className="dbc-editor-node-name">{name}</span>
                <button className="dbc-editor-item-del" onClick={() => removeNode(name)}>×</button>
              </div>
            ))}
          </div>
          <div className="dbc-editor-node-add">
            <input
              className="dbc-editor-input"
              style={{ flex: 1, fontSize: 12, padding: '4px 7px' }}
              placeholder="ECU_Name"
              value={newNodeName}
              onChange={e => setNewNodeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNode()}
            />
          </div>
        </div>

        <div className="dbc-editor-list-footer">
          <span className="dbc-editor-count">{messages.length} msg</span>
          <div className="dbc-editor-footer-btns">
            {importedDbc && (
              <button
                className="dbc-editor-btn-secondary"
                onClick={loadFromViewer}
                title="Copy imported DBC into editor"
              >
                Load from viewer
              </button>
            )}
            <button className="dbc-editor-btn-secondary" onClick={() => onApplyToViewer(data)}>
              → Viewer
            </button>
            <button className="dbc-editor-btn-primary" onClick={handleExport}>
              Export .dbc
            </button>
          </div>
        </div>
      </div>

      {/* resize handle — list / form */}
      <div
        className="resize-handle"
        onMouseDown={makeResizeHandler(() => listWidth, setListWidth, 160, 400)}
      />

      {/* ── Center: forms ────────────────────────────────── */}
      <div className="dbc-editor-form">
        {!selectedMsg ? (
          <p className="dbc-editor-placeholder">Sélectionnez un message pour l'éditer</p>
        ) : (
          <>
            {/* Message form */}
            <section className="dbc-editor-section">
              <h3 className="dbc-editor-section-title">Message</h3>
              <div className="dbc-editor-fields">

                <EditorField label="Name">
                  <input
                    className="dbc-editor-input"
                    value={selectedMsg.name}
                    onChange={e => updateMessage(selectedKey!, { name: e.target.value })}
                  />
                </EditorField>

                <EditorField label="ID (hex)">
                  <input
                    className="dbc-editor-input dbc-editor-input-mono"
                    value={idFocused ? idInput : fmtHex(selectedMsg.id)}
                    onFocus={() => { setIdFocused(true); setIdInput(fmtHex(selectedMsg.id)) }}
                    onBlur={() => {
                      setIdFocused(false)
                      const raw = idInput.replace(/^0x/i, '')
                      const n   = parseInt(raw, 16)
                      if (!isNaN(n) && n >= 0) updateMessage(selectedKey!, { id: n })
                    }}
                    onChange={e => setIdInput(e.target.value)}
                  />
                </EditorField>

                <EditorField label="DLC">
                  <select
                    className="dbc-editor-input"
                    value={selectedMsg.dlc}
                    onChange={e => updateMessage(selectedKey!, { dlc: parseInt(e.target.value) })}
                  >
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </EditorField>

                <EditorField label="Transmitter">
                  <input
                    className="dbc-editor-input"
                    list="dbc-editor-nodes-list"
                    value={selectedMsg.transmitter ?? ''}
                    placeholder="ECU_Name"
                    onChange={e => updateMessage(selectedKey!, { transmitter: e.target.value || undefined })}
                  />
                  <datalist id="dbc-editor-nodes-list">
                    {nodes.map(n => <option key={n} value={n} />)}
                  </datalist>
                </EditorField>

                <EditorField label="Send type">
                  <select
                    className="dbc-editor-input"
                    value={selectedMsg.sendType ?? ''}
                    onChange={e => updateMessage(selectedKey!, { sendType: e.target.value || undefined })}
                  >
                    <option value="">—</option>
                    <option value="cyclic">Cyclic</option>
                    <option value="event">Event</option>
                    <option value="cyclicEvent">Cyclic + Event</option>
                  </select>
                </EditorField>

                <EditorField label="Cycle time (ms)">
                  <input
                    type="number"
                    className="dbc-editor-input"
                    value={selectedMsg.cycleTime ?? ''}
                    min={0}
                    placeholder="100"
                    onChange={e => {
                      const n = parseInt(e.target.value)
                      updateMessage(selectedKey!, { cycleTime: isNaN(n) || n <= 0 ? undefined : n })
                    }}
                  />
                </EditorField>

                <EditorField label="Comment" wide>
                  <textarea
                    className="dbc-editor-input dbc-editor-textarea"
                    value={selectedMsg.comment ?? ''}
                    rows={2}
                    onChange={e => updateMessage(selectedKey!, { comment: e.target.value || undefined })}
                  />
                </EditorField>

                {/* Mux toggle at message level */}
                <div className="dbc-editor-field-wide">
                  <label className="dbc-editor-label">Multiplexing</label>
                  <div className="dbc-editor-toggle-group" style={{ width: 'fit-content' }}>
                    <button
                      className={`dbc-editor-toggle ${!isMuxed ? 'dbc-editor-toggle-active' : ''}`}
                      onClick={disableMux}
                    >Not multiplexed</button>
                    <button
                      className={`dbc-editor-toggle ${isMuxed ? 'dbc-editor-toggle-active' : ''}`}
                      onClick={enableMux}
                    >Multiplexed</button>
                  </div>
                </div>
              </div>
            </section>

            {/* Switch signal section — only when message is muxed */}
            {isMuxed && switchSignal && (
              <section className="dbc-editor-section dbc-editor-section-mux">
                <h3 className="dbc-editor-section-title">
                  <span className="dbc-badge-mux" style={{ marginRight: 6 }}>MUX</span>
                  Switch signal
                </h3>
                <div className="dbc-editor-fields">
                  <EditorField label="Name">
                    <input
                      className="dbc-editor-input"
                      value={switchSignal.name}
                      onChange={e => updateSwitchSignal({ name: e.target.value })}
                    />
                  </EditorField>
                  <EditorField label="Start bit">
                    <input
                      type="number" className="dbc-editor-input"
                      value={switchSignal.startBit} min={0} max={effectiveDlc * 8 - 1}
                      onChange={e => updateSwitchSignal({ startBit: Math.max(0, parseInt(e.target.value) || 0) })}
                    />
                  </EditorField>
                  <EditorField label="Length (bits)">
                    <input
                      type="number" className="dbc-editor-input"
                      value={switchSignal.length} min={1} max={64}
                      onChange={e => updateSwitchSignal({ length: Math.max(1, parseInt(e.target.value) || 1) })}
                    />
                  </EditorField>
                  <EditorField label="Byte order">
                    <div className="dbc-editor-toggle-group">
                      <button className={`dbc-editor-toggle ${switchSignal.isLittleEndian ? 'dbc-editor-toggle-active' : ''}`} onClick={() => updateSwitchSignal({ isLittleEndian: true })}>Intel LE</button>
                      <button className={`dbc-editor-toggle ${!switchSignal.isLittleEndian ? 'dbc-editor-toggle-active' : ''}`} onClick={() => updateSwitchSignal({ isLittleEndian: false })}>Motorola BE</button>
                    </div>
                  </EditorField>
                  <EditorField label="Factor">
                    <input type="number" className="dbc-editor-input" value={switchSignal.factor} step="any"
                      onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) updateSwitchSignal({ factor: n }) }}
                    />
                  </EditorField>
                  <EditorField label="Offset">
                    <input type="number" className="dbc-editor-input" value={switchSignal.offset} step="any"
                      onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) updateSwitchSignal({ offset: n }) }}
                    />
                  </EditorField>
                </div>
              </section>
            )}

            {/* Signal section */}
            <section className="dbc-editor-section">
              <div className="dbc-editor-section-header">
                <h3 className="dbc-editor-section-title">Signals</h3>
                <button className="dbc-editor-btn-icon-sm" onClick={addSignal} title="Add signal">＋ Add</button>
              </div>

              {/* Signal list — only non-switch signals */}
              <div className="dbc-editor-sig-list">
                {visibleRegulars.length === 0 && (
                  <p className="dbc-editor-hint">
                    {isMuxed && previewMux !== 'all'
                      ? `Aucun signal pour ${typeof previewMux === 'number' ? getMuxLabel(previewMux, switchSignal) : previewMux}. Cliquez ＋ Add.`
                      : 'Aucun signal. Cliquez ＋ Add pour en créer un.'}
                  </p>
                )}
                {visibleRegulars.map(({ sig, origIdx }) => (
                  <div
                    key={origIdx}
                    className={`dbc-editor-sig-item ${selectedSigIdx === origIdx ? 'dbc-editor-sig-item-active' : ''}`}
                    style={{ '--sig-color': SIG_COLORS[origIdx % SIG_COLORS.length] } as React.CSSProperties}
                    onClick={() => onSelectSigIdx(origIdx)}
                  >
                    <div className="dbc-editor-sig-item-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span className="dbc-editor-sig-name">{sig.name}</span>
                        {sig.mux?.kind === 'muxed' && (
                          <span className="dbc-badge-mux dbc-badge-sm">
                            {getMuxLabel((sig.mux as { kind: 'muxed'; id: number }).id, switchSignal)}
                          </span>
                        )}
                      </div>
                      <span className="dbc-editor-sig-meta">
                        bit {sig.startBit} · {sig.length} bits · {sig.isLittleEndian ? 'LE' : 'BE'} · {sig.isSigned ? 'int' : 'uint'}
                      </span>
                    </div>
                    <button
                      className="dbc-editor-item-del"
                      onClick={e => { e.stopPropagation(); deleteSignal(origIdx) }}
                      title="Delete signal"
                    >×</button>
                  </div>
                ))}
              </div>

              {/* Signal form */}
              {selectedSig != null && selectedSigIdx != null && (
                <div className="dbc-editor-sig-form">
                  <div className="dbc-editor-sig-form-title">
                    <span className="dbc-sig-swatch" style={{ background: SIG_COLORS[selectedSigIdx % SIG_COLORS.length] }} />
                    {selectedSig.name}
                  </div>
                  <div className="dbc-editor-fields">

                    <EditorField label="Name" wide>
                      <input
                        className="dbc-editor-input"
                        value={selectedSig.name}
                        onChange={e => updateSignal(selectedSigIdx, { name: e.target.value })}
                      />
                    </EditorField>

                    <EditorField label="Start bit">
                      <input
                        type="number"
                        className="dbc-editor-input"
                        value={selectedSig.startBit}
                        min={0}
                        max={effectiveDlc * 8 - 1}
                        onChange={e => updateSignal(selectedSigIdx, { startBit: Math.max(0, parseInt(e.target.value) || 0) })}
                      />
                    </EditorField>

                    <EditorField label="Length (bits)">
                      <input
                        type="number"
                        className="dbc-editor-input"
                        value={selectedSig.length}
                        min={1}
                        max={64}
                        onChange={e => updateSignal(selectedSigIdx, { length: Math.max(1, parseInt(e.target.value) || 1) })}
                      />
                    </EditorField>

                    <EditorField label="Byte order">
                      <div className="dbc-editor-toggle-group">
                        <button
                          className={`dbc-editor-toggle ${selectedSig.isLittleEndian ? 'dbc-editor-toggle-active' : ''}`}
                          onClick={() => updateSignal(selectedSigIdx, { isLittleEndian: true })}
                        >Intel LE</button>
                        <button
                          className={`dbc-editor-toggle ${!selectedSig.isLittleEndian ? 'dbc-editor-toggle-active' : ''}`}
                          onClick={() => updateSignal(selectedSigIdx, { isLittleEndian: false })}
                        >Motorola BE</button>
                      </div>
                    </EditorField>

                    <EditorField label="Value type">
                      <div className="dbc-editor-toggle-group">
                        <button
                          className={`dbc-editor-toggle ${!selectedSig.isSigned ? 'dbc-editor-toggle-active' : ''}`}
                          onClick={() => updateSignal(selectedSigIdx, { isSigned: false })}
                        >Unsigned</button>
                        <button
                          className={`dbc-editor-toggle ${selectedSig.isSigned ? 'dbc-editor-toggle-active' : ''}`}
                          onClick={() => updateSignal(selectedSigIdx, { isSigned: true })}
                        >Signed</button>
                      </div>
                    </EditorField>

                    {/* Mux group — only shown when the message is multiplexed */}
                    {isMuxed && (
                      <>
                        <EditorField label="Mux group">
                          <div className="dbc-editor-toggle-group">
                            <button
                              className={`dbc-editor-toggle ${!selectedSig.mux ? 'dbc-editor-toggle-active' : ''}`}
                              onClick={() => updateSignal(selectedSigIdx, { mux: undefined })}
                            >Common</button>
                            <button
                              className={`dbc-editor-toggle ${selectedSig.mux?.kind === 'muxed' ? 'dbc-editor-toggle-active' : ''}`}
                              onClick={() => {
                                if (selectedSig.mux?.kind !== 'muxed')
                                  updateSignal(selectedSigIdx, { mux: { kind: 'muxed', id: 0 } })
                              }}
                            >Muxed (m?)</button>
                          </div>
                        </EditorField>

                        {selectedSig.mux?.kind === 'muxed' && (
                          <EditorField label="Mux ID">
                            <select
                              className="dbc-editor-input"
                              value={(selectedSig.mux as { kind: 'muxed'; id: number }).id}
                              onChange={e => updateSignal(selectedSigIdx, {
                                mux: { kind: 'muxed', id: parseInt(e.target.value) },
                              })}
                            >
                              {muxedIds.map(id => (
                                <option key={id} value={id}>{getMuxLabel(id, switchSignal)}</option>
                              ))}
                              {(() => {
                                const nextId = Math.max(0, ...muxedIds.map(id => id + 1))
                                return <option value={nextId}>+ New group {nextId}</option>
                              })()}
                            </select>
                          </EditorField>
                        )}
                      </>
                    )}

                    <EditorField label="Factor">
                      <input
                        type="number"
                        className="dbc-editor-input"
                        value={selectedSig.factor}
                        step="any"
                        onChange={e => {
                          const n = parseFloat(e.target.value)
                          if (!isNaN(n)) updateSignal(selectedSigIdx, { factor: n })
                        }}
                      />
                    </EditorField>

                    <EditorField label="Offset">
                      <input
                        type="number"
                        className="dbc-editor-input"
                        value={selectedSig.offset}
                        step="any"
                        onChange={e => {
                          const n = parseFloat(e.target.value)
                          if (!isNaN(n)) updateSignal(selectedSigIdx, { offset: n })
                        }}
                      />
                    </EditorField>

                    <EditorField label="Unit">
                      <input
                        className="dbc-editor-input"
                        value={selectedSig.unit}
                        placeholder="km/h"
                        onChange={e => updateSignal(selectedSigIdx, { unit: e.target.value })}
                      />
                    </EditorField>

                    {/* Receivers */}
                    <div className="dbc-editor-field-wide">
                      <label className="dbc-editor-label">Receivers</label>
                      <div className="dbc-editor-rx-tags">
                        {(selectedSig.receivers ?? []).map(rx => (
                          <span key={rx} className="dbc-editor-rx-tag">
                            {rx}
                            <button onClick={() => toggleReceiver(rx)}>×</button>
                          </span>
                        ))}
                        {nodes.filter(n => !(selectedSig.receivers ?? []).includes(n)).map(n => (
                          <span
                            key={n}
                            className="dbc-editor-rx-tag dbc-editor-rx-tag-off"
                            onClick={() => toggleReceiver(n)}
                          >{n}</span>
                        ))}
                      </div>
                      <div className="dbc-editor-value-add" style={{ marginTop: 4 }}>
                        <input
                          className="dbc-editor-input dbc-editor-value-label-input"
                          placeholder="Custom receiver…"
                          value={rxInput}
                          onChange={e => setRxInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addCustomReceiver()}
                        />
                        <button className="dbc-editor-btn-icon-sm" onClick={addCustomReceiver}>Add</button>
                      </div>
                    </div>

                    <EditorField label="Comment" wide>
                      <textarea
                        className="dbc-editor-input dbc-editor-textarea"
                        value={selectedSig.comment ?? ''}
                        rows={2}
                        onChange={e => updateSignal(selectedSigIdx, { comment: e.target.value || undefined })}
                      />
                    </EditorField>

                    {/* Values */}
                    <div className="dbc-editor-field-wide">
                      <label className="dbc-editor-label">Values</label>
                      {Object.keys(selectedSig.values ?? {}).length > 0 && (
                        <div className="dbc-editor-values-list">
                          {Object.entries(selectedSig.values!)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([k, label]) => (
                              <div key={k} className="dbc-editor-value-row">
                                <span className="dbc-editor-value-key">{k}</span>
                                <input
                                  className="dbc-editor-input dbc-editor-value-label"
                                  value={label}
                                  onChange={e => updateValueLabel(k, e.target.value)}
                                />
                                <button
                                  className="dbc-editor-value-del"
                                  onClick={() => removeValue(k)}
                                  title="Delete"
                                >×</button>
                              </div>
                            ))}
                        </div>
                      )}
                      <div className="dbc-editor-value-add">
                        <input
                          type="number"
                          className="dbc-editor-input dbc-editor-value-key-input"
                          placeholder="0"
                          value={newValKey}
                          onChange={e => setNewValKey(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addValue()}
                        />
                        <input
                          className="dbc-editor-input dbc-editor-value-label-input"
                          placeholder="Label…"
                          value={newValLabel}
                          onChange={e => setNewValLabel(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addValue()}
                        />
                        <button className="dbc-editor-btn-icon-sm" onClick={addValue}>Add</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* resize handle — center / preview */}
      <div
        className="resize-handle"
        onMouseDown={makeResizeHandler(() => previewWidth, setPreviewWidth, 200, 600, 'left')}
      />

      {/* ── Right: bit layout preview ─────────────────────── */}
      <div className="dbc-editor-preview" style={{ width: previewWidth }}>
        {!selectedMsg ? (
          <p className="dbc-editor-placeholder">Sélectionnez un message pour voir le bit layout</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h3 className="dbc-editor-section-title" style={{ flex: 1 }}>Bit Layout</h3>
              {isMuxed && (
                <select
                  className="dbc-mux-select"
                  value={previewMux}
                  onChange={e => setPreviewMux(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                >
                  <option value="all">All mux</option>
                  {muxedIds.map(id => (
                    <option key={id} value={id}>{getMuxLabel(id, switchSignal)}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="dbc-bit-scroll">
              <BitLayout
                dlc={effectiveDlc}
                signals={previewSignals}
                colors={previewColors}
                muxLabels={switchSignal?.values ?? undefined}
              />
            </div>

            {conflicts.size > 0 && (
              <div className="dbc-editor-conflicts">
                <span className="dbc-editor-conflict-icon">⚠</span>
                <div>
                  <div className="dbc-editor-conflict-title">Conflits de bits</div>
                  {[...conflicts].map(pair => (
                    <div key={pair} className="dbc-editor-conflict-item">{pair}</div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Helper component ─────────────────────────────────────

function EditorField({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`dbc-editor-field ${wide ? 'dbc-editor-field-wide' : ''}`}>
      <label className="dbc-editor-label">{label}</label>
      {children}
    </div>
  )
}
