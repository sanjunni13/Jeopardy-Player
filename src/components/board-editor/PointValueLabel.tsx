import './PointValueLabel.css'

export interface PointValueLabelProps {
  value: number
  rowIndex: number
  onClick: () => void
}

/**
 * Clickable dollar value label rendered in the far-left column of the board grid.
 * Clicking opens the PointValueDialog to edit the point value for that row.
 */
export function PointValueLabel({ value, rowIndex, onClick }: PointValueLabelProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Edit row ${rowIndex + 1} point value, currently ${value} dollars`}
      className="point-value-label"
    >
      ${value}
    </button>
  )
}

export default PointValueLabel
