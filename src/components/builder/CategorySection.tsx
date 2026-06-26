import { useState } from 'react'
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
  onMediaAttach: (clueIdx: number, file: File | string) => void
  onMediaRemove: (clueIdx: number) => void
  mediaUploadingState: Record<number, boolean>
  mediaErrors: Record<number, string | null>
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
  onMediaAttach,
  onMediaRemove,
  mediaUploadingState,
  mediaErrors,
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
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-950 hover:bg-slate-900 transition-colors"
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

          {/* Clue rows */}
          <div className="space-y-1">
            {category.clues.map((clue, i) => {
              const clueErrors = {
                value: errors[`rounds.${roundIndex}.${categoryIndex}.clues.${i}.value`],
                clue: errors[`rounds.${roundIndex}.${categoryIndex}.clues.${i}.clue`],
                solution: errors[`rounds.${roundIndex}.${categoryIndex}.clues.${i}.solution`],
              }

              return (
                <ClueRow
                  key={i}
                  roundIndex={roundIndex}
                  categoryIndex={categoryIndex}
                  clueIndex={i}
                  roundName={roundName}
                  categoryName={category.name}
                  clue={clue}
                  errors={clueErrors}
                  onFieldChange={(field, value) => onClueFieldChange(i, field, value)}
                  onMediaAttach={(file) => onMediaAttach(i, file)}
                  onMediaRemove={() => onMediaRemove(i)}
                  isMediaUploading={mediaUploadingState[i] ?? false}
                  mediaError={mediaErrors[i] ?? null}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
