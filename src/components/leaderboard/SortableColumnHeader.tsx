import type { SortableColumn } from '../../utils/leaderboardUtils'

export interface SortableColumnHeaderProps {
  label: string
  column: SortableColumn
  activeColumn: SortableColumn
  direction: 'asc' | 'desc'
  onSort: (column: SortableColumn) => void
}

export function SortableColumnHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
}: SortableColumnHeaderProps) {
  const isActive = column === activeColumn

  const ariaSortValue: 'ascending' | 'descending' | 'none' = isActive
    ? direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none'

  return (
    <th aria-sort={ariaSortValue}>
      <button
        className="sort-button"
        type="button"
        onClick={() => onSort(column)}
      >
        {label}
        {isActive && (
          <span className="sort-arrow" aria-hidden="true">
            {direction === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </button>
    </th>
  )
}
