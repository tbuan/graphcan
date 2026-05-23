import FrameTable from '../components/FrameTable'
import type { ImportedFile } from '../types'
import type { DbcData } from '../parsers/dbc'

interface TableViewProps {
  importedFile: ImportedFile | null
  dbcData: DbcData | null
}

function TableView({ importedFile, dbcData }: TableViewProps) {
  if (!importedFile) {
    return <p className="main-placeholder">Import a CAN log file to get started</p>
  }

  return (
    <FrameTable
      key={importedFile.importKey}
      frames={importedFile.result.frames}
      filename={importedFile.name}
      skippedLines={importedFile.result.skippedLines}
      dbcData={dbcData}
    />
  )
}

export default TableView
