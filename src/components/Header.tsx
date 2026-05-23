import { useRef } from 'react'

interface HeaderProps {
  onFileImport: (content: string, filename: string) => void
  onBinaryImport: (buffer: ArrayBuffer, filename: string) => void
  onDbcImport: (content: string, filename: string) => void
  dbcName: string | null
  onDbcClear: () => void
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function readFileAsBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function Header({ onFileImport, onBinaryImport, onDbcImport, dbcName, onDbcClear }: HeaderProps) {
  const logInputRef = useRef<HTMLInputElement>(null)
  const dbcInputRef = useRef<HTMLInputElement>(null)

  async function handleLogChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'blf') {
      onBinaryImport(await readFileAsBuffer(file), file.name)
    } else {
      onFileImport(await readFileAsText(file), file.name)
    }
    e.target.value = ''
  }

  async function handleDbcChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    onDbcImport(await readFileAsText(file), file.name)
    e.target.value = ''
  }

  return (
    <header className="header">
      <svg
        className="header-logo"
        width="38" height="22"
        viewBox="0 0 38 22"
        aria-hidden="true"
        fill="none"
        stroke="#111110"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <polyline points="0,17 8,17 8,5 21,5 21,17 28,17 28,5 38,5" />
      </svg>
      <h1 className="header-title">GraphCan</h1>

      <div className="header-actions">
        {dbcName ? (
          <span className="dbc-badge" title={dbcName}>
            <span className="dbc-badge-label">DBC</span>
            <span className="dbc-badge-name">{dbcName}</span>
            <button className="dbc-badge-clear" onClick={onDbcClear} aria-label="Remove DBC">×</button>
          </span>
        ) : (
          <button className="btn-import btn-import-secondary" onClick={() => dbcInputRef.current?.click()}>
            Import DBC
          </button>
        )}

        <button className="btn-import" onClick={() => logInputRef.current?.click()}>
          Import CAN log
        </button>

        <input ref={logInputRef} type="file" accept=".asc,.csv,.trc,.log,.blf"
          onChange={handleLogChange} style={{ display: 'none' }} />
        <input ref={dbcInputRef} type="file" accept=".dbc"
          onChange={handleDbcChange} style={{ display: 'none' }} />
      </div>
    </header>
  )
}

export default Header
