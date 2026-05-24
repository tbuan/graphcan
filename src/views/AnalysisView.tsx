import { useRef } from 'react'
import uPlot from 'uplot'
import SignalPanel from '../components/SignalPanel'
import type { ImportedFile, AnalysisPanel } from '../types'
import type { DbcData } from '../parsers/dbc'

interface AnalysisViewProps {
  panels: AnalysisPanel[]
  importedFile: ImportedFile | null
  dbcData: DbcData | null
  onRemovePanel: (uid: string) => void
  themeKey: string
}

const SYNC_KEY = 'graphcan-analysis'

function AnalysisView({ panels, importedFile, dbcData, onRemovePanel, themeKey }: AnalysisViewProps) {
  const instancesRef = useRef<uPlot[]>([])
  const syncingRef   = useRef(false)

  function handleReady(u: uPlot) {
    instancesRef.current.push(u)
  }

  function handleDestroy(u: uPlot) {
    instancesRef.current = instancesRef.current.filter(i => i !== u)
  }

  function handleScaleChange(source: uPlot, min: number, max: number) {
    if (syncingRef.current) return
    syncingRef.current = true
    for (const u of instancesRef.current) {
      if (u !== source) u.setScale('x', { min, max })
    }
    syncingRef.current = false
  }

  if (!importedFile) {
    return <p className="main-placeholder">Import a CAN log file to get started</p>
  }

  if (panels.length === 0) {
    return <p className="main-placeholder">Select a signal in the sidebar to add a panel</p>
  }

  return (
    <div className="analysis-view">
      {panels.map((panel) => (
        <SignalPanel
          key={panel.uid}
          panel={panel}
          frames={importedFile.result.frames}
          dbcData={dbcData}
          color={panel.color}
          syncKey={SYNC_KEY}
          themeKey={themeKey}
          onRemove={() => onRemovePanel(panel.uid)}
          onReady={handleReady}
          onDestroy={handleDestroy}
          onScaleChange={handleScaleChange}
        />
      ))}
    </div>
  )
}

export default AnalysisView
