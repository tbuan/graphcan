import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import NavTabs from './components/NavTabs'
import TableView from './views/TableView'
import ChartView from './views/ChartView'
import { parseBusmasterLog } from './parsers/busmaster'
import type { ImportedFile, ChartConfig } from './types'
import './App.css'

function App() {
  const [importedFile, setImportedFile] = useState<ImportedFile | null>(null)
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    signals: [],
    displayMode: 'line',
  })

  function handleFileImport(content: string, filename: string) {
    const result = parseBusmasterLog(content)
    setImportedFile(prev => ({
      name: filename,
      result,
      importKey: (prev?.importKey ?? 0) + 1,
    }))
    setChartConfig(prev => ({ ...prev, signals: [] }))
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Header onFileImport={handleFileImport} />
        <NavTabs />
        <div className="app-body">
          <Sidebar
            importedFile={importedFile}
            onAddSignal={signal => {
              setChartConfig(prev => {
                const exists = prev.signals.some(
                  s => s.id === signal.id && s.byteIndex === signal.byteIndex
                )
                if (exists) return prev
                return { ...prev, signals: [...prev.signals, signal] }
              })
            }}
          />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Navigate to="/table" replace />} />
              <Route path="/table" element={<TableView importedFile={importedFile} />} />
              <Route
                path="/chart"
                element={
                  <ChartView
                    importedFile={importedFile}
                    config={chartConfig}
                    onConfigChange={setChartConfig}
                  />
                }
              />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
