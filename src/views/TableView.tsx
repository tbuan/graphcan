import FrameTable from '../components/FrameTable'
import type { ImportedFile } from '../types'

interface TableViewProps {
  importedFile: ImportedFile | null
}

function TableView({ importedFile }: TableViewProps) {
  if (!importedFile) {
    return <p className="main-placeholder">Import a CAN log file to get started</p>
  }

  return (
    <FrameTable
      key={importedFile.importKey}
      frames={importedFile.result.frames}
      filename={importedFile.name}
      skippedLines={importedFile.result.skippedLines}
    />
  )
}

export default TableView
