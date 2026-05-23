import { useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import './App.css'

interface ImportedFile {
  name: string
  content: string
}

function App() {
  const [importedFile, setImportedFile] = useState<ImportedFile | null>(null)

  function handleFileImport(content: string, filename: string) {
    setImportedFile({ name: filename, content })
  }

  return (
    <div className="app">
      <Header onFileImport={handleFileImport} />
      <div className="app-body">
        <Sidebar />
        <main className="main-content">
          {importedFile ? (
            <div className="file-preview">
              <p className="file-preview-name">{importedFile.name}</p>
              <pre className="file-preview-content">{importedFile.content}</pre>
            </div>
          ) : (
            <p className="main-placeholder">Import a CAN log file to get started</p>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
