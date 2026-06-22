import type { ClueFormState } from '../../utils/builderFormStructure'

interface ClueRowProps {
  roundIndex: number
  categoryIndex: number
  clueIndex: number
  roundName: string
  categoryName: string
  clue: ClueFormState
  errors: {
    value?: string
    clue?: string
    solution?: string
  }
  onFieldChange: (field: keyof ClueFormState, value: string | boolean) => void
  onBlurValue: () => void
}

const inputClasses =
  'w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-input/30 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function ClueRow({
  roundIndex,
  categoryIndex,
  clueIndex,
  roundName,
  categoryName,
  clue,
  errors,
  onFieldChange,
  onBlurValue,
}: ClueRowProps) {
  const idPrefix = `r${roundIndex}-c${categoryIndex}-q${clueIndex}`
  const clueNumber = clueIndex + 1
  const categoryLabel = categoryName || `Category ${categoryIndex + 1}`

  const valueId = `${idPrefix}-value`
  const clueId = `${idPrefix}-clue`
  const solutionId = `${idPrefix}-solution`
  const dailyDoubleId = `${idPrefix}-daily-double`
  const valueErrorId = `${idPrefix}-value-error`
  const clueErrorId = `${idPrefix}-clue-error`
  const solutionErrorId = `${idPrefix}-solution-error`

  return (
    <div className="grid grid-cols-[6rem_1fr_1fr_auto] items-start gap-3 py-2">
      {/* Value input */}
      <div className="flex flex-col">
        <label htmlFor={valueId} className="sr-only">
          Clue {clueNumber} value - {roundName} Round, {categoryLabel}
        </label>
        <input
          id={valueId}
          type="number"
          inputMode="numeric"
          placeholder="$"
          value={clue.value}
          onChange={(e) => onFieldChange('value', e.target.value)}
          onBlur={onBlurValue}
          aria-invalid={errors.value ? true : undefined}
          aria-describedby={errors.value ? valueErrorId : undefined}
          className={`${inputClasses} ${errors.value ? 'border-destructive' : ''}`}
        />
        {errors.value && (
          <p id={valueErrorId} className="text-sm text-destructive mt-1">
            {errors.value}
          </p>
        )}
      </div>

      {/* Clue text input */}
      <div className="flex flex-col">
        <label htmlFor={clueId} className="sr-only">
          Clue {clueNumber} clue text - {roundName} Round, {categoryLabel}
        </label>
        <input
          id={clueId}
          type="text"
          placeholder="Clue text"
          value={clue.clue}
          onChange={(e) => onFieldChange('clue', e.target.value)}
          aria-invalid={errors.clue ? true : undefined}
          aria-describedby={errors.clue ? clueErrorId : undefined}
          className={`${inputClasses} ${errors.clue ? 'border-destructive' : ''}`}
        />
        {errors.clue && (
          <p id={clueErrorId} className="text-sm text-destructive mt-1">
            {errors.clue}
          </p>
        )}
      </div>

      {/* Solution input */}
      <div className="flex flex-col">
        <label htmlFor={solutionId} className="sr-only">
          Clue {clueNumber} solution - {roundName} Round, {categoryLabel}
        </label>
        <input
          id={solutionId}
          type="text"
          placeholder="Solution"
          value={clue.solution}
          onChange={(e) => onFieldChange('solution', e.target.value)}
          aria-invalid={errors.solution ? true : undefined}
          aria-describedby={errors.solution ? solutionErrorId : undefined}
          className={`${inputClasses} ${errors.solution ? 'border-destructive' : ''}`}
        />
        {errors.solution && (
          <p id={solutionErrorId} className="text-sm text-destructive mt-1">
            {errors.solution}
          </p>
        )}
      </div>

      {/* Daily Double toggle */}
      <div className="flex flex-col">
        <label htmlFor={dailyDoubleId} className="sr-only">
          Clue {clueNumber} daily double - {roundName} Round, {categoryLabel}
        </label>
        <div className="flex items-center min-h-11">
          <input
            id={dailyDoubleId}
            type="checkbox"
            checked={clue.dailyDouble}
            onChange={(e) => onFieldChange('dailyDouble', e.target.checked)}
            className="min-h-5 min-w-5 h-5 w-5 rounded border-border accent-primary cursor-pointer"
          />
          <span className="ml-2 text-sm text-muted-foreground select-none">DD</span>
        </div>
      </div>
    </div>
  )
}
