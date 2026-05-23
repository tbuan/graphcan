import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import NavTabs from './components/NavTabs'
import TableView from './views/TableView'
import ChartView from './views/ChartView'
import AnalysisView from './views/AnalysisView'
import { parseBusmasterLog } from './parsers/busmaster'
import { parseDbcFile, type DbcData } from './parsers/dbc'
import { saveFile, loadFile, saveDbcFile, loadDbcFile, clearDbcFile, saveChartConfig, loadChartConfig } from './utils/storage'
import type { ImportedFile, ChartConfig, AnalysisPanel, AnalysisPanelSource } from './types'
import './App.css'

const DEFAULT_CHART_CONFIG: ChartConfig = { signals: [], displayMode: 'line' }

function App() {
  const [importedFile, setImportedFile] = useState<ImportedFile | null>(null)
  const [dbcData, setDbcData]           = useState<DbcData | null>(null)
  const [dbcName, setDbcName]           = useState<string | null>(null)
  const [chartConfig, setChartConfig]   = useState<ChartConfig>(
    () => loadChartConfig() ?? DEFAULT_CHART_CONFIG
  )
  const [analysisPanels, setAnalysisPanels] = useState<AnalysisPanel[]>([])

  // Restore persisted data on mount
  useEffect(() => {
    loadFile().then(stored => {
      if (!stored) return
      setImportedFile({ name: stored.name, result: parseBusmasterLog(stored.content), importKey: 1 })
    })
    loadDbcFile().then(stored => {
      if (!stored) return
      setDbcData(parseDbcFile(stored.content))
      setDbcName(stored.name)
    })
  }, [])

  // Persist chart config on every change
  useEffect(() => { saveChartConfig(chartConfig) }, [chartConfig])

  function handleFileImport(content: string, filename: string) {
    setImportedFile(prev => ({
      name: filename,
      result: parseBusmasterLog(content),
      importKey: (prev?.importKey ?? 0) + 1,
    }))
    setChartConfig(prev => ({ ...prev, signals: [] }))
    saveFile(filename, content)
  }

  function handleDbcImport(content: string, filename: string) {
    setDbcData(parseDbcFile(content))
    setDbcName(filename)
    saveDbcFile(filename, content)
  }

  function handleDbcClear() {
    setDbcData(null)
    setDbcName(null)
    clearDbcFile()
  }

  function handleAddPanel(id: string, source: AnalysisPanelSource) {
    setAnalysisPanels(prev => [
      ...prev,
      { uid: `${id}-${Date.now()}`, id, source },
    ])
  }

  function handleRemovePanel(uid: string) {
    setAnalysisPanels(prev => prev.filter(p => p.uid !== uid))
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Header
          onFileImport={handleFileImport}
          onDbcImport={handleDbcImport}
          dbcName={dbcName}
          onDbcClear={handleDbcClear}
        />
        <NavTabs />
        <div className="app-body">
          <Sidebar
            importedFile={importedFile}
            dbcData={dbcData}
            onAddSignal={signal => {
              setChartConfig(prev => {
                const exists = prev.signals.some(s => s.id === signal.id && s.byteIndex === signal.byteIndex)
                if (exists) return prev
                return { ...prev, signals: [...prev.signals, signal] }
              })
            }}
            onAddPanel={handleAddPanel}
          />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Navigate to="/table" replace />} />
              <Route path="/table" element={<TableView importedFile={importedFile} dbcData={dbcData} />} />
              <Route path="/chart" element={
                <ChartView importedFile={importedFile} dbcData={dbcData} config={chartConfig} onConfigChange={setChartConfig} />
              } />
              <Route path="/analysis" element={
                <AnalysisView panels={analysisPanels} importedFile={importedFile} dbcData={dbcData} onRemovePanel={handleRemovePanel} />
              } />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
