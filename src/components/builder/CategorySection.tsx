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
  onBlurClueValue: (clueIdx: number) => void
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
  onBlurClueValue,
}: CategorySectionProps) {
  const categoryNameId = `r${roundIndex}-c${categoryIndex}-name`
  const categoryNameErrorKey = `rounds.${roundIndex}.${categoryIndex}.name`
  const categoryNameError = errors[categoryNameErrorKey]
  const categoryNameErrorId = `${categoryNameId}-error`

  return (
    <div className="p-4 rounded-lg border border-border/50 bg-card/50" data-category-index={categoryIndex}>
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
          className={`${inputClasses} ${categoryNameError ? 'border-destructive' : ''}`}
        />
        {categoryNameError && (
          <p id={categoryNameErrorId} className="text-sm text-destructive mt-1">
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
              onBlurValue={() => onBlurClueValue(i)}
            />
          )
        })}
      </div>
    </div>
  )
}
