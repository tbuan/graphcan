import type { CanFrame } from '../parsers/busmaster'

interface FrameTableProps {
  frames: CanFrame[]
  filename: string
  skippedLines: number
}

const MAX_DISPLAYED_FRAMES = 2000

function FrameTable({ frames, filename, skippedLines }: FrameTableProps) {
  const displayed = frames.slice(0, MAX_DISPLAYED_FRAMES)
  const truncated = frames.length > MAX_DISPLAYED_FRAMES

  return (
    <div className="frame-table-wrapper">
      <div className="frame-table-header">
        <span className="frame-table-filename">{filename}</span>
        <span className="frame-table-stats">
          {frames.length.toLocaleString()} frames
          {skippedLines > 0 && ` · ${skippedLines} skipped lines`}
          {truncated && ` · showing first ${MAX_DISPLAYED_FRAMES.toLocaleString()}`}
        </span>
      </div>

      <div className="frame-table-scroll">
        <table className="frame-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Dir</th>
              <th>Ch</th>
              <th>CAN ID</th>
              <th>DLC</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((frame, index) => (
              <tr key={index}>
                <td className="cell-mono">{frame.timestamp}</td>
                <td className={frame.direction === 'Rx' ? 'cell-rx' : 'cell-tx'}>
                  {frame.direction}
                </td>
                <td>{frame.channel}</td>
                <td className="cell-mono cell-id">{frame.id}</td>
                <td>{frame.dlc}</td>
                <td className="cell-mono cell-data">{frame.data.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default FrameTable
