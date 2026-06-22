import { useCallback, useRef, type KeyboardEvent } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CategoryFormState } from '../../utils/builderFormStructure'
import './BoardEditor.css'

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface BoardGridProps {
  categories: CategoryFormState[]
  roundIndex: number
  pointValues: number[]
  onCellClick: (catIdx: number, clueIdx: number) => void
  onCategoryReorder: (fromIdx: number, toIdx: number) => void
  onPointValueClick: (rowIdx: number) => void
  onAddColumn: () => void
  onAddRow: () => void
  onCategoryNameChange: (catIdx: number, name: string) => void
  onOptionsOpen: (catIdx: number) => void
}

// ─── SortableCategoryHeader ────────────────────────────────────────────────────

interface SortableCategoryHeaderProps {
  id: string
  categoryIndex: number
  name: string
  onNameChange: (name: string) => void
  onOptionsOpen: () => void
}

function SortableCategoryHeader({
  id,
  categoryIndex,
  name,
  onNameChange,
  onOptionsOpen,
}: SortableCategoryHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="gridcell"
      className="board-grid__header-cell"
      data-dragging={isDragging || undefined}
    >
      <div className="board-grid__category-header">
        {/* Drag handle (grid icon) */}
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="board-grid__drag-handle"
          aria-label={`Drag to reorder ${name}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>

        {/* Inline-editable category name */}
        <input
          type="text"
          className="board-grid__category-name-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          aria-label={`Category ${categoryIndex + 1} name`}
          placeholder={`Category ${categoryIndex + 1}`}
        />

        {/* Options menu trigger (three-dot icon) */}
        <button
          type="button"
          className="board-grid__options-trigger"
          aria-label="Options"
          title="Options"
          onClick={onOptionsOpen}
        >
          ⋮
        </button>
      </div>
    </div>
  )
}

// ─── ClueCell ──────────────────────────────────────────────────────────────────

interface ClueCellProps {
  pointValue: number
  hasContent: boolean
  hasMedia: boolean
  dailyDouble: boolean
  onClick: () => void
  ariaLabel: string
}

function ClueCell({
  pointValue,
  hasContent,
  hasMedia,
  dailyDouble,
  onClick,
  ariaLabel,
}: ClueCellProps) {
  return (
    <button
      type="button"
      className={`board-grid__clue-cell ${hasContent ? 'board-grid__clue-cell--filled' : ''} ${dailyDouble ? 'board-grid__clue-cell--daily-double' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <span className="board-grid__clue-value">${pointValue}</span>
      {hasMedia && <span className="board-grid__media-badge" aria-hidden="true">🎬</span>}
      {dailyDouble && <span className="board-grid__daily-double-badge" aria-hidden="true">⭐</span>}
    </button>
  )
}

// ─── PointValueLabel ───────────────────────────────────────────────────────────

interface PointValueLabelProps {
  value: number
  rowIndex: number
  onClick: () => void
}

function PointValueLabel({ value, rowIndex, onClick }: PointValueLabelProps) {
  return (
    <button
      type="button"
      className="board-grid__point-value-label"
      onClick={onClick}
      aria-label={`Edit point value for row ${rowIndex + 1}, currently ${value} dollars`}
    >
      ${value}
    </button>
  )
}

// ─── AddColumnButton ───────────────────────────────────────────────────────────

function AddColumnButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="board-grid__add-column-btn"
      onClick={onClick}
      aria-label="Add category column"
    >
      +
    </button>
  )
}

// ─── AddRowButton ──────────────────────────────────────────────────────────────

function AddRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="board-grid__add-row-btn"
      onClick={onClick}
      aria-label="Add point value row"
    >
      + Row
    </button>
  )
}

// ─── BoardGrid Component ───────────────────────────────────────────────────────

export function BoardGrid({
  categories,
  roundIndex,
  pointValues,
  onCellClick,
  onCategoryReorder,
  onPointValueClick,
  onAddColumn,
  onAddRow,
  onCategoryNameChange,
  onOptionsOpen,
}: BoardGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)

  // DnD sensors — pointer for mouse/touch, keyboard for a11y
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  )

  // Sortable IDs for categories
  const categoryIds = categories.map((_, idx) => `category-${idx}`)

  // Handle drag end: resolve from/to indices and fire callback
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const fromIdx = categoryIds.indexOf(String(active.id))
      const toIdx = categoryIds.indexOf(String(over.id))

      if (fromIdx !== -1 && toIdx !== -1) {
        onCategoryReorder(fromIdx, toIdx)
      }
    },
    [categoryIds, onCategoryReorder]
  )

  // Keyboard navigation within the grid (arrow keys)
  const handleGridKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      const grid = gridRef.current
      if (!grid) return

      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        return
      }

      // Get all focusable elements in grid cells
      const cells = Array.from(
        grid.querySelectorAll<HTMLElement>(
          '[role="gridcell"] button, [role="gridcell"] input'
        )
      )

      const currentIndex = cells.indexOf(target)
      if (currentIndex === -1) return

      // Grid dimensions: rows = header + clue rows, cols = point-label + categories + add-btn
      const rowCount = pointValues.length + 1 // header row + clue rows
      const colCount = categories.length + 2 // point labels + categories + add col btn

      // Map flat index to row/col position
      const row = Math.floor(currentIndex / colCount)
      const col = currentIndex % colCount

      let nextRow = row
      let nextCol = col

      switch (event.key) {
        case 'ArrowUp':
          nextRow = Math.max(0, row - 1)
          break
        case 'ArrowDown':
          nextRow = Math.min(rowCount - 1, row + 1)
          break
        case 'ArrowLeft':
          nextCol = Math.max(0, col - 1)
          break
        case 'ArrowRight':
          nextCol = Math.min(colCount - 1, col + 1)
          break
      }

      const nextIndex = nextRow * colCount + nextCol
      if (nextIndex >= 0 && nextIndex < cells.length && nextIndex !== currentIndex) {
        event.preventDefault()
        cells[nextIndex]?.focus()
      }
    },
    [categories.length, pointValues.length]
  )

  // CSS Grid template: auto (point labels) | repeat(N, 1fr) (categories) | auto (add column)
  const gridTemplateColumns = `auto repeat(${categories.length}, 1fr) auto`
  // Grid rows: auto (header) | repeat(M, 1fr) (clue rows) | auto (add row)
  const gridTemplateRows = `auto repeat(${pointValues.length}, 1fr) auto`

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={gridRef}
        role="grid"
        aria-label={`Round ${roundIndex + 1} game board, ${categories.length} categories, ${pointValues.length} rows`}
        className="board-grid"
        style={{
          display: 'grid',
          gridTemplateColumns,
          gridTemplateRows,
          gap: '4px',
        }}
        onKeyDown={handleGridKeyDown}
      >
        {/* ─── Row 0: Header row ──────────────────────────────────── */}

        {/* Corner cell (empty, top-left) */}
        <div role="gridcell" className="board-grid__corner-cell" aria-hidden="true" />

        {/* Category header cells (sortable) */}
        <SortableContext items={categoryIds} strategy={horizontalListSortingStrategy}>
          {categories.map((category, catIdx) => (
            <SortableCategoryHeader
              key={categoryIds[catIdx]}
              id={categoryIds[catIdx]}
              categoryIndex={catIdx}
              name={category.name}
              onNameChange={(name) => onCategoryNameChange(catIdx, name)}
              onOptionsOpen={() => onOptionsOpen(catIdx)}
            />
          ))}
        </SortableContext>

        {/* Add column button (top-right corner) */}
        <div role="gridcell" className="board-grid__add-column-cell">
          <AddColumnButton onClick={onAddColumn} />
        </div>

        {/* ─── Rows 1..N: Clue rows ──────────────────────────────── */}
        {pointValues.map((pointValue, rowIdx) => (
          <div key={rowIdx} role="row" style={{ display: 'contents' }}>
            {/* Point value label (left column) */}
            <div role="gridcell" className="board-grid__point-value-cell">
              <PointValueLabel
                value={pointValue}
                rowIndex={rowIdx}
                onClick={() => onPointValueClick(rowIdx)}
              />
            </div>

            {/* Clue cells for each category in this row */}
            {categories.map((category, catIdx) => {
              const clue = category.clues[rowIdx]
              const hasContent = !!(clue?.clue || clue?.solution)
              const hasMedia = !!(clue?.media && clue.media.length > 0)
              const dailyDouble = clue?.dailyDouble ?? false
              const ariaLabel = `${category.name}, row ${rowIdx + 1}, ${pointValue} dollars`

              return (
                <div key={catIdx} role="gridcell" className="board-grid__clue-cell-wrapper">
                  <ClueCell
                    pointValue={pointValue}
                    hasContent={hasContent}
                    hasMedia={hasMedia}
                    dailyDouble={dailyDouble}
                    onClick={() => onCellClick(catIdx, rowIdx)}
                    ariaLabel={ariaLabel}
                  />
                </div>
              )
            })}

            {/* Empty cell in add-column column for this row */}
            <div role="gridcell" className="board-grid__empty-cell" aria-hidden="true" />
          </div>
        ))}

        {/* ─── Bottom edge: Add row button ────────────────────────── */}
        <div
          className="board-grid__add-row-row"
          style={{ gridColumn: '1 / -1' }}
        >
          <AddRowButton onClick={onAddRow} />
        </div>
      </div>
    </DndContext>
  )
}

export default BoardGrid
