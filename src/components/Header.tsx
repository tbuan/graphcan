import { useRef } from 'react'

interface HeaderProps {
  onFileImport: (content: string, filename: string) => void
}

function Header({ onFileImport }: HeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      onFileImport(content, file.name)
    }
    reader.readAsText(file)
  }

  return (
    <header className="header">
      <span className="header-logo" aria-hidden="true">⚡</span>
      <h1 className="header-title">GraphCan</h1>

      <div className="header-actions">
        <button
          className="btn-import"
          onClick={() => inputRef.current?.click()}
        >
          Import CAN log
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".asc,.csv,.trc,.log"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </header>
  )
}

export default Header
