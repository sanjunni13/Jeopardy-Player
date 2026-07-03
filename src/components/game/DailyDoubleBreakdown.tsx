import type { EnrichedDDRecord } from '../../utils/analyticsUtils'

interface DailyDoubleBreakdownProps {
  records: EnrichedDDRecord[]
}

function formatDollar(value: number): string {
  if (value < 0) return `-$${Math.abs(value).toLocaleString()}`
  return `$${value.toLocaleString()}`
}

function formatNetImpact(netImpact: number): string {
  if (netImpact >= 0) return `+$${netImpact.toLocaleString()}`
  return `-$${Math.abs(netImpact).toLocaleString()}`
}

export function DailyDoubleBreakdown({ records }: DailyDoubleBreakdownProps) {
  // Render nothing when there are no records — Requirement 6.5
  if (records.length === 0) return null

  return (
    <div className="dd-breakdown">
      <table className="dd-breakdown-table" aria-label="Daily Double results">
        <thead>
          <tr>
            <th className="dd-breakdown-th">Round</th>
            <th className="dd-breakdown-th">Category</th>
            <th className="dd-breakdown-th">Player</th>
            <th className="dd-breakdown-th">Wager</th>
            <th className="dd-breakdown-th">Outcome</th>
            <th className="dd-breakdown-th">Net Impact</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr
              key={`${record.clueKey}-${index}`}
              className={`dd-breakdown-row ${record.outcome === 'correct' ? 'dd-breakdown-row-correct' : 'dd-breakdown-row-incorrect'}`}
            >
              <td className="dd-breakdown-td">{record.roundDisplayName}</td>
              <td className="dd-breakdown-td">{record.categoryName}</td>
              <td className="dd-breakdown-td">{record.playerName}</td>
              <td className="dd-breakdown-td">{formatDollar(record.wager)}</td>
              <td className="dd-breakdown-td dd-breakdown-outcome">
                <span className={`dd-breakdown-outcome-badge dd-breakdown-outcome-badge--${record.outcome}`}>
                  {record.outcome === 'correct' ? '✓ Correct' : '✗ Incorrect'}
                </span>
              </td>
              <td className={`dd-breakdown-td dd-breakdown-net ${record.netImpact >= 0 ? 'dd-breakdown-net--positive' : 'dd-breakdown-net--negative'}`}>
                {formatNetImpact(record.netImpact)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
