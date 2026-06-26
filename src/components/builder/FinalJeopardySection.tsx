import type { FinalRoundFormState, MediaData } from '../../utils/builderFormStructure'
import { MediaAttachment } from './MediaAttachment'

interface FinalJeopardySectionProps {
  finalRound: FinalRoundFormState
  errors: {
    category?: string
    clue?: string
    solution?: string
  }
  onFieldChange: (field: keyof FinalRoundFormState, value: string) => void
  media?: MediaData | null
  onMediaAttach?: (file: File | string) => void
  onMediaRemove?: () => void
  isMediaUploading?: boolean
  mediaError?: string | null
}

export function FinalJeopardySection({
  finalRound,
  errors,
  onFieldChange,
  media = null,
  onMediaAttach,
  onMediaRemove,
  isMediaUploading = false,
  mediaError = null,
}: FinalJeopardySectionProps) {
  return (
    <section aria-labelledby="final-jeopardy-heading" className="p-6 rounded-xl border border-border bg-card">
      <h2
        id="final-jeopardy-heading"
        className="text-lg font-semibold text-foreground mb-4"
      >
        Final Jeopardy
      </h2>

      <div className="space-y-4">
        {/* Category */}
        <div>
          <label
            htmlFor="final-jeopardy-category"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Final Jeopardy Category
          </label>
          <input
            id="final-jeopardy-category"
            type="text"
            value={finalRound.category}
            onChange={(e) => onFieldChange('category', e.target.value)}
            aria-invalid={!!errors.category}
            aria-describedby={errors.category ? 'final-jeopardy-category-error' : undefined}
            className="w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-input/30 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {errors.category && (
            <p id="final-jeopardy-category-error" className="text-sm text-red-500 mt-1">
              {errors.category}
            </p>
          )}
        </div>

        {/* Clue with media attachment */}
        <div>
          <label
            htmlFor="final-jeopardy-clue"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Final Jeopardy Clue
          </label>
          <div className="relative">
            <textarea
              id="final-jeopardy-clue"
              value={finalRound.clue}
              onChange={(e) => onFieldChange('clue', e.target.value)}
              aria-invalid={!!errors.clue}
              aria-describedby={errors.clue ? 'final-jeopardy-clue-error' : undefined}
              className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-input/30 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-24 resize-y"
            />
            {onMediaAttach && onMediaRemove && (
              <div className="absolute right-1 top-2">
                <MediaAttachment
                  media={media}
                  onAttach={onMediaAttach}
                  onRemove={onMediaRemove}
                  isUploading={isMediaUploading}
                  error={mediaError}
                />
              </div>
            )}
          </div>
          {errors.clue && (
            <p id="final-jeopardy-clue-error" className="text-sm text-red-500 mt-1">
              {errors.clue}
            </p>
          )}
        </div>

        {/* Solution */}
        <div>
          <label
            htmlFor="final-jeopardy-solution"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Final Jeopardy Solution
          </label>
          <input
            id="final-jeopardy-solution"
            type="text"
            value={finalRound.solution}
            onChange={(e) => onFieldChange('solution', e.target.value)}
            aria-invalid={!!errors.solution}
            aria-describedby={errors.solution ? 'final-jeopardy-solution-error' : undefined}
            className="w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-input/30 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {errors.solution && (
            <p id="final-jeopardy-solution-error" className="text-sm text-red-500 mt-1">
              {errors.solution}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
