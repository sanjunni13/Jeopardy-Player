import { useCallback } from 'react'
import type { ClueFormState } from '../../utils/builderFormStructure'
import { computeClueValue } from '../../utils/clueValues'
import { MediaAttachment } from './MediaAttachment'

interface ClueRowProps {
  roundIndex: number
  categoryIndex: number
  clueIndex: number
  roundName: string
  categoryName: string
  clue: ClueFormState
  errors: {
    clue?: string
    solution?: string
  }
  onFieldChange: (field: keyof ClueFormState, value: string | boolean) => void
  onMediaAttach: (file: File | string) => void
  onMediaRemove: () => void
  isMediaUploading: boolean
  mediaError: string | null
  onDragHandlePointerDown?: (e: React.PointerEvent) => void
}

const inputClasses =
  'w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none overflow-hidden'

export function ClueRow({
  roundIndex,
  categoryIndex,
  clueIndex,
  roundName,
  categoryName,
  clue,
  errors,
  onFieldChange,
  onMediaAttach,
  onMediaRemove,
  isMediaUploading,
  mediaError,
  onDragHandlePointerDown,
}: ClueRowProps) {
  const idPrefix = `r${roundIndex}-c${categoryIndex}-q${clueIndex}`
  const clueNumber = clueIndex + 1
  const categoryLabel = categoryName || `Category ${categoryIndex + 1}`

  const clueId = `${idPrefix}-clue`
  const solutionId = `${idPrefix}-solution`
  const dailyDoubleId = `${idPrefix}-daily-double`
  const clueErrorId = `${idPrefix}-clue-error`
  const solutionErrorId = `${idPrefix}-solution-error`

  const computedValue = computeClueValue(clueIndex + 1, roundIndex + 1)

  const autoResize = useCallback((e: React.ChangeEvent<HTMLTextAreaElement> | React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const textareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [])

  return (
    <div className="py-2 bg-slate-800 rounded-lg">
      <div className="grid grid-cols-[auto_6rem_1fr_1fr_auto] items-start gap-3">
        {/* Drag handle */}
        <div className="flex items-center min-h-11">
          <div
            className="flex items-center justify-center p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            aria-label={`Drag to reorder clue ${clueNumber}`}
            onPointerDown={onDragHandlePointerDown}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
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
        </div>

        {/* Computed value label */}
        <div className="flex flex-col">
          <span
            className="w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-slate-800 text-sm flex items-center"
            aria-label={`Clue ${clueNumber} value - ${roundName} Round, ${categoryLabel}`}
          >
            ${computedValue}
          </span>
        </div>

        {/* Clue text input with inline attach button */}
        <div className="flex flex-col">
          <label htmlFor={clueId} className="sr-only">
            Clue {clueNumber} clue text - {roundName} Round, {categoryLabel}
          </label>
          {clue.media ? (
            <div className="w-full min-h-11 py-2 flex items-center">
              <MediaAttachment
                media={clue.media}
                onAttach={onMediaAttach}
                onRemove={onMediaRemove}
                isUploading={isMediaUploading}
                error={mediaError}
                renderMode="preview"
              />
            </div>
          ) : (
            <MediaAttachment
              media={null}
              onAttach={onMediaAttach}
              onRemove={onMediaRemove}
              isUploading={isMediaUploading}
              error={mediaError}
              renderMode="inline"
              clueInputElement={
                <textarea
                  ref={textareaRef}
                  id={clueId}
                  placeholder="Clue text"
                  value={clue.clue}
                  onChange={(e) => { onFieldChange('clue', e.target.value); autoResize(e) }}
                  onInput={autoResize}
                  rows={1}
                  aria-invalid={errors.clue ? true : undefined}
                  aria-describedby={errors.clue ? clueErrorId : undefined}
                  className={`${inputClasses} pr-10 ${errors.clue ? 'border-red-500' : ''}`}
                />
              }
            />
          )}
          {errors.clue && (
            <p id={clueErrorId} className="text-sm text-red-500 mt-1">
              {errors.clue}
            </p>
          )}
        </div>

        {/* Solution input */}
        <div className="flex flex-col">
          <label htmlFor={solutionId} className="sr-only">
            Clue {clueNumber} solution - {roundName} Round, {categoryLabel}
          </label>
          <textarea
            ref={textareaRef}
            id={solutionId}
            placeholder="Solution"
            value={clue.solution}
            onChange={(e) => { onFieldChange('solution', e.target.value); autoResize(e) }}
            onInput={autoResize}
            rows={1}
            aria-invalid={errors.solution ? true : undefined}
            aria-describedby={errors.solution ? solutionErrorId : undefined}
            className={`${inputClasses} ${errors.solution ? 'border-red-500' : ''}`}
          />
          {errors.solution && (
            <p id={solutionErrorId} className="text-sm text-red-500 mt-1">
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
    </div>
  )
}
