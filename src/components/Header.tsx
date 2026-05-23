import { useRef } from 'react'

interface HeaderProps {
  onFileImport: (content: string, filename: string) => void
  onDbcImport: (content: string, filename: string) => void
  dbcName: string | null
  onDbcClear: () => void
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function Header({ onFileImport, onDbcImport, dbcName, onDbcClear }: HeaderProps) {
  const logInputRef = useRef<HTMLInputElement>(null)
  const dbcInputRef = useRef<HTMLInputElement>(null)

  async function handleLogChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    onFileImport(await readFile(file), file.name)
    e.target.value = ''
  }

  async function handleDbcChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    onDbcImport(await readFile(file), file.name)
    e.target.value = ''
  }

  return (
    <header className="header">
      <span className="header-logo" aria-hidden="true">⚡</span>
      <h1 className="header-title">GraphCan</h1>

      <div className="header-actions">
        {dbcName ? (
          <span className="dbc-badge" title={dbcName}>
            DBC: {dbcName}
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

        <input ref={logInputRef} type="file" accept=".asc,.csv,.trc,.log"
          onChange={handleLogChange} style={{ display: 'none' }} />
        <input ref={dbcInputRef} type="file" accept=".dbc"
          onChange={handleDbcChange} style={{ display: 'none' }} />
      </div>
    </header>
  )
}

export default Header
