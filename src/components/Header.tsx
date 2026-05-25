import { useRef } from 'react'

interface HeaderProps {
  onFileImport: (content: string, filename: string) => void
  onBinaryImport: (buffer: ArrayBuffer, filename: string) => void
  onDbcImport: (content: string, filename: string) => void
  dbcName: string | null
  onDbcClear: () => void
  isParsing: boolean
  darkMode: boolean
  onDarkModeToggle: () => void
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

function Header({ onFileImport, onBinaryImport, onDbcImport, dbcName, onDbcClear, isParsing, darkMode, onDarkModeToggle }: HeaderProps) {
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
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <polyline points="0,17 8,17 8,5 21,5 21,17 28,17 28,5 38,5" />
      </svg>
      <h1 className="header-title">GraphCan</h1>

      <div className="header-actions">
        <button
          className="btn-theme-toggle"
          onClick={onDarkModeToggle}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

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

        <button className="btn-import" onClick={() => logInputRef.current?.click()} disabled={isParsing}>
          {isParsing ? 'Parsing…' : 'Import CAN log'}
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
