import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import NavTabs from './components/NavTabs'
import TableView from './views/TableView'
import ChartView from './views/ChartView'
import AnalysisView from './views/AnalysisView'
import StatsView from './views/StatsView'
import ScatterView from './views/ScatterView'
import DbcView from './views/DbcView'
import { parseDbcFile, type DbcData } from './parsers/dbc'
import { saveFile, loadFile, saveDbcFile, loadDbcFile, clearDbcFile, saveChartConfig, loadChartConfig, saveAnalysisPanels, loadAnalysisPanels } from './utils/storage'
import type { ImportedFile, ChartConfig, AnalysisPanel, AnalysisPanelSource } from './types'
import { BYTE_COLORS } from './utils/chartColors'
import ParseWorker from './workers/parseWorker?worker'
import './App.css'

const DEFAULT_CHART_CONFIG: ChartConfig = { signals: [], displayMode: 'line' }

function App() {
  const [importedFile, setImportedFile] = useState<ImportedFile | null>(null)
  const [dbcData, setDbcData]           = useState<DbcData | null>(null)
  const [dbcName, setDbcName]           = useState<string | null>(null)
  const [chartConfig, setChartConfig]   = useState<ChartConfig>(() => {
    const saved = loadChartConfig()
    if (!saved) return DEFAULT_CHART_CONFIG
    // Migrate persisted signals that predate the stable-color field
    const signals = saved.signals.map((s, i) => ({
      ...s,
      color: (s as { color?: string }).color ?? BYTE_COLORS[i % BYTE_COLORS.length],
    }))
    return { ...saved, signals }
  })
  const [analysisPanels, setAnalysisPanels] = useState<AnalysisPanel[]>(
    () => loadAnalysisPanels() ?? []
  )
  const [sidebarWidth, setSidebarWidth]   = useState(224)
  const [isParsing, setIsParsing]         = useState(false)
  const [darkMode, setDarkMode]           = useState(() => localStorage.getItem('graphcan-dark') === 'true')
  const [dbcSelectedKey, setDbcSelectedKey] = useState<string | null>(null)
  const [dbcSearch, setDbcSearch]           = useState('')
  const [dbcSelectedMux, setDbcSelectedMux] = useState<number | 'all'>('all')

  // Restore persisted data on mount
  useEffect(() => {
    loadFile().then(stored => {
      if (!stored) return
      const worker = new ParseWorker()
      worker.onmessage = (e) => {
        if (e.data.ok) setImportedFile({ name: stored.name, result: e.data.result, importKey: 1 })
        worker.terminate()
      }
      worker.postMessage({ kind: 'text', content: stored.content, filename: stored.name })
    })
    loadDbcFile().then(stored => {
      if (!stored) return
      setDbcData(parseDbcFile(stored.content))
      setDbcName(stored.name)
    })
  }, [])

  // Persist chart config and analysis panels on every change
  useEffect(() => { saveChartConfig(chartConfig) }, [chartConfig])
  useEffect(() => { saveAnalysisPanels(analysisPanels) }, [analysisPanels])

  // Apply dark mode to DOM + persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('graphcan-dark', String(darkMode))
  }, [darkMode])

  function handleFileImport(content: string, filename: string) {
    setIsParsing(true)
    const worker = new ParseWorker()
    worker.onmessage = (e) => {
      const { ok, result, error } = e.data
      if (ok) {
        setImportedFile(prev => ({ name: filename, result, importKey: (prev?.importKey ?? 0) + 1 }))
        setChartConfig(prev => ({ ...prev, signals: [] }))
        saveFile(filename, content)
      } else {
        console.error('Parse error:', error)
      }
      setIsParsing(false)
      worker.terminate()
    }
    worker.postMessage({ kind: 'text', content, filename })
  }

  function handleBinaryImport(buffer: ArrayBuffer, filename: string) {
    setIsParsing(true)
    const worker = new ParseWorker()
    worker.onmessage = (e) => {
      const { ok, result, error } = e.data
      if (ok) {
        setImportedFile(prev => ({ name: filename, result, importKey: (prev?.importKey ?? 0) + 1 }))
        setChartConfig(prev => ({ ...prev, signals: [] }))
      } else {
        console.error('Parse error:', error)
      }
      setIsParsing(false)
      worker.terminate()
    }
    worker.postMessage({ kind: 'binary', buffer }, [buffer])
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
    setAnalysisPanels(prev => {
      const usedColors = new Set(prev.map(p => p.color))
      const color = BYTE_COLORS.find(c => !usedColors.has(c)) ?? BYTE_COLORS[prev.length % BYTE_COLORS.length]
      return [...prev, { uid: `${id}-${Date.now()}`, id, source, color }]
    })
  }

  function handleRemovePanel(uid: string) {
    setAnalysisPanels(prev => prev.filter(p => p.uid !== uid))
  }

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    const startX     = e.clientX
    const startWidth = sidebarWidth

    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.max(160, Math.min(480, startWidth + ev.clientX - startX))
      setSidebarWidth(newWidth)
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor    = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor    = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const location = useLocation()
  const isDbcRoute = location.pathname === '/dbc'

  return (
    <div className="app">
      <Header
        onFileImport={handleFileImport}
        onBinaryImport={handleBinaryImport}
        onDbcImport={handleDbcImport}
        dbcName={dbcName}
        onDbcClear={handleDbcClear}
        isParsing={isParsing}
        darkMode={darkMode}
        onDarkModeToggle={() => setDarkMode(d => !d)}
      />
      <NavTabs />
      {isParsing && <div className="loading-bar" />}
      <div className="app-body">
        {!isDbcRoute && (
          <>
            <div className="sidebar-container" style={{ width: sidebarWidth }}>
              <Sidebar
                importedFile={importedFile}
                dbcData={dbcData}
                onAddSignal={signal => {
                  setChartConfig(prev => {
                    const exists = prev.signals.some(s => s.id === signal.id && s.byteIndex === signal.byteIndex)
                    if (exists) return prev
                    const usedColors = new Set(prev.signals.map(s => s.color))
                    const color = BYTE_COLORS.find(c => !usedColors.has(c)) ?? BYTE_COLORS[prev.signals.length % BYTE_COLORS.length]
                    return { ...prev, signals: [...prev.signals, { ...signal, color }] }
                  })
                }}
                onAddPanel={handleAddPanel}
              />
            </div>
            <div className="resize-handle" onMouseDown={handleResizeStart} />
          </>
        )}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/table" replace />} />
            <Route path="/table" element={<TableView importedFile={importedFile} dbcData={dbcData} />} />
            <Route path="/chart" element={
              <ChartView importedFile={importedFile} dbcData={dbcData} dbcName={dbcName} config={chartConfig} onConfigChange={setChartConfig} themeKey={darkMode ? 'dark' : 'light'} />
            } />
            <Route path="/stats" element={<StatsView importedFile={importedFile} dbcData={dbcData} />} />
            <Route path="/analysis" element={
              <AnalysisView panels={analysisPanels} importedFile={importedFile} dbcData={dbcData} dbcName={dbcName} onRemovePanel={handleRemovePanel} themeKey={darkMode ? 'dark' : 'light'} />
            } />
            <Route path="/scatter" element={
              <ScatterView importedFile={importedFile} dbcData={dbcData} themeKey={darkMode ? 'dark' : 'light'} />
            } />
            <Route path="/dbc" element={
                <DbcView
                  dbcData={dbcData}
                  selectedKey={dbcSelectedKey}
                  onSelectKey={setDbcSelectedKey}
                  search={dbcSearch}
                  onSearch={setDbcSearch}
                  selectedMux={dbcSelectedMux}
                  onSelectMux={setDbcSelectedMux}
                />
              } />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
