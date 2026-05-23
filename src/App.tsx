import { useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import FrameTable from './components/FrameTable'
import { parseBusmasterLog, type ParseResult } from './parsers/busmaster'
import './App.css'

interface ImportedFile {
  name: string
  result: ParseResult
}

function App() {
  const [importedFile, setImportedFile] = useState<ImportedFile | null>(null)

  function handleFileImport(content: string, filename: string) {
    const result = parseBusmasterLog(content)
    setImportedFile({ name: filename, result })
  }

  return (
    <div className="app">
      <Header onFileImport={handleFileImport} />
      <div className="app-body">
        <Sidebar />
        <main className="main-content">
          {importedFile ? (
            <FrameTable
              frames={importedFile.result.frames}
              filename={importedFile.name}
              skippedLines={importedFile.result.skippedLines}
            />
          ) : (
            <p className="main-placeholder">Import a CAN log file to get started</p>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
