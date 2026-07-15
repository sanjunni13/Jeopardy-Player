import { useState } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import type { CategoryFormState, ClueFormState } from '../../utils/builderFormStructure'
import { ClueRow } from './ClueRow'

interface CategorySectionProps {
  roundIndex: number
  categoryIndex: number
  roundName: string
  category: CategoryFormState
  errors: Record<string, string>
  onCategoryNameChange: (name: string) => void
  onClueFieldChange: (clueIdx: number, field: keyof ClueFormState, value: string | boolean) => void
  onReorderClues: (newOrder: ClueFormState[]) => void
  onMediaAttach: (clueIdx: number, file: File | string) => void
  onMediaRemove: (clueIdx: number) => void
  mediaUploadingState: Record<number, boolean>
  mediaErrors: Record<number, string | null>
  onDragHandlePointerDown?: (e: React.PointerEvent) => void
}

const inputClasses =
  'w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-input/30 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function CategorySection({
  roundIndex,
  categoryIndex,
  roundName,
  category,
  errors,
  onCategoryNameChange,
  onClueFieldChange,
  onReorderClues,
  onMediaAttach,
  onMediaRemove,
  mediaUploadingState,
  mediaErrors,
  onDragHandlePointerDown,
}: CategorySectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(true)

  const categoryNameId = `r${roundIndex}-c${categoryIndex}-name`
  const categoryNameErrorKey = `rounds.${roundIndex}.${categoryIndex}.name`
  const categoryNameError = errors[categoryNameErrorKey]
  const categoryNameErrorId = `${categoryNameId}-error`

  const displayName = category.name || `Category ${categoryIndex + 1}`
  const filledClues = category.clues.filter(c => c.clue && c.solution).length

  return (
    <div className="rounded-lg border border-slate-600/50 bg-slate-800" data-category-index={categoryIndex}>
      {/* Collapsible header */}
      <div className="flex items-center bg-slate-950 hover:bg-slate-900 transition-colors rounded-t-lg">
        {/* Drag handle for category */}
        <div
          className="flex items-center justify-center px-2 py-3 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          onPointerDown={onDragHandlePointerDown}
          aria-label={`Drag to reorder ${displayName}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="5" r="1" />
            <circle cx="9" cy="12" r="1" />
            <circle cx="9" cy="19" r="1" />
            <circle cx="15" cy="5" r="1" />
            <circle cx="15" cy="12" r="1" />
            <circle cx="15" cy="19" r="1" />
          </svg>
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex-1 flex items-center justify-between px-2 py-3 text-left"
          aria-expanded={!isCollapsed}
          aria-controls={`category-content-${roundIndex}-${categoryIndex}`}
        >
          <div className="flex items-center gap-2">
            {/* Chevron icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-muted-foreground transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-sm font-medium text-foreground">{displayName}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {filledClues}/5 clues
          </span>
        </button>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <div id={`category-content-${roundIndex}-${categoryIndex}`} className="p-4 pt-2 border-t border-border/30">
          {/* Category name input */}
          <div className="mb-3">
            <label htmlFor={categoryNameId} className="sr-only">
              Category {categoryIndex + 1} name - {roundName} Round
            </label>
            <input
              id={categoryNameId}
              type="text"
              placeholder={`Category ${categoryIndex + 1} name`}
              value={category.name}
              onChange={(e) => onCategoryNameChange(e.target.value)}
              maxLength={100}
              aria-invalid={categoryNameError ? true : undefined}
              aria-describedby={categoryNameError ? categoryNameErrorId : undefined}
              className={`${inputClasses} ${categoryNameError ? 'border-red-500' : ''}`}
            />
            {categoryNameError && (
              <p id={categoryNameErrorId} className="text-sm text-red-500 mt-1">
                {categoryNameError}
              </p>
            )}
          </div>

          {/* Clue rows with drag-and-drop */}
          <Reorder.Group
            as="div"
            axis="y"
            values={category.clues as unknown as ClueFormState[]}
            onReorder={onReorderClues}
            className="space-y-1"
          >
            {category.clues.map((clue, i) => {
              const clueErrors = {
                value: errors[`rounds.${roundIndex}.${categoryIndex}.clues.${i}.value`],
                clue: errors[`rounds.${roundIndex}.${categoryIndex}.clues.${i}.clue`],
                solution: errors[`rounds.${roundIndex}.${categoryIndex}.clues.${i}.solution`],
              }

              return (
                <ReorderableClueRow
                  key={clue._id}
                  clue={clue}
                  roundIndex={roundIndex}
                  categoryIndex={categoryIndex}
                  clueIndex={i}
                  roundName={roundName}
                  categoryName={category.name}
                  errors={clueErrors}
                  onFieldChange={(field, value) => onClueFieldChange(i, field, value)}
                  onMediaAttach={(file) => onMediaAttach(i, file)}
                  onMediaRemove={() => onMediaRemove(i)}
                  isMediaUploading={mediaUploadingState[i] ?? false}
                  mediaError={mediaErrors[i] ?? null}
                />
              )
            })}
          </Reorder.Group>
        </div>
      )}
    </div>
  )
}

// ─── Internal wrapper for reorderable clue rows ────────────────────────────────

interface ReorderableClueRowProps {
  clue: ClueFormState
  roundIndex: number
  categoryIndex: number
  clueIndex: number
  roundName: string
  categoryName: string
  errors: { clue?: string; solution?: string }
  onFieldChange: (field: keyof ClueFormState, value: string | boolean) => void
  onMediaAttach: (file: File | string) => void
  onMediaRemove: () => void
  isMediaUploading: boolean
  mediaError: string | null
}

function ReorderableClueRow({
  clue,
  roundIndex,
  categoryIndex,
  clueIndex,
  roundName,
  categoryName,
  errors,
  onFieldChange,
  onMediaAttach,
  onMediaRemove,
  isMediaUploading,
  mediaError,
}: ReorderableClueRowProps) {
  const controls = useDragControls()
  const [isDragging, setIsDragging] = useState(false)

  return (
    <Reorder.Item
      value={clue}
      as="div"
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      style={{
        position: 'relative',
        borderRadius: '0.5rem',
        userSelect: isDragging ? 'none' : 'auto',
        boxShadow: isDragging ? '0 8px 24px rgba(0, 0, 0, 0.4)' : 'none',
        zIndex: isDragging ? 50 : 'auto',
      }}
    >
      <ClueRow
        roundIndex={roundIndex}
        categoryIndex={categoryIndex}
        clueIndex={clueIndex}
        roundName={roundName}
        categoryName={categoryName}
        clue={clue}
        errors={errors}
        onFieldChange={onFieldChange}
        onMediaAttach={onMediaAttach}
        onMediaRemove={onMediaRemove}
        isMediaUploading={isMediaUploading}
        mediaError={mediaError}
        onDragHandlePointerDown={(e) => { e.preventDefault(); controls.start(e) }}
      />
    </Reorder.Item>
  )
}
