import type { CategoryFormState, ClueFormState } from '../../utils/builderFormStructure'
import { CategorySection } from './CategorySection'

interface RoundSectionProps {
  roundIndex: number
  roundName: string
  categories: CategoryFormState[]
  errors: Record<string, string>
  onCategoryNameChange: (catIdx: number, name: string) => void
  onClueFieldChange: (catIdx: number, clueIdx: number, field: keyof ClueFormState, value: string | boolean) => void
  onMediaAttach: (catIdx: number, clueIdx: number, file: File | string) => void
  onMediaRemove: (catIdx: number, clueIdx: number) => void
  mediaUploadingState: Record<string, boolean>
  mediaErrors: Record<string, string | null>
}

export function RoundSection({
  roundIndex,
  roundName,
  categories,
  errors,
  onCategoryNameChange,
  onClueFieldChange,
  onMediaAttach,
  onMediaRemove,
  mediaUploadingState,
  mediaErrors,
}: RoundSectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground capitalize">
        {roundName} Round
      </h2>

      <div className="space-y-4">
        {categories.map((category, catIdx) => {
          // Build per-clue uploading state for this category
          const catUploadingState: Record<number, boolean> = {}
          const catMediaErrors: Record<number, string | null> = {}
          for (let clueIdx = 0; clueIdx < category.clues.length; clueIdx++) {
            const key = `${catIdx}-${clueIdx}`
            catUploadingState[clueIdx] = mediaUploadingState[key] ?? false
            catMediaErrors[clueIdx] = mediaErrors[key] ?? null
          }

          return (
            <CategorySection
              key={catIdx}
              roundIndex={roundIndex}
              categoryIndex={catIdx}
              roundName={roundName}
              category={category}
              errors={errors}
              onCategoryNameChange={(name) => onCategoryNameChange(catIdx, name)}
              onClueFieldChange={(clueIdx, field, value) => onClueFieldChange(catIdx, clueIdx, field, value)}
              onMediaAttach={(clueIdx, file) => onMediaAttach(catIdx, clueIdx, file)}
              onMediaRemove={(clueIdx) => onMediaRemove(catIdx, clueIdx)}
              mediaUploadingState={catUploadingState}
              mediaErrors={catMediaErrors}
            />
          )
        })}
      </div>
    </div>
  )
}
