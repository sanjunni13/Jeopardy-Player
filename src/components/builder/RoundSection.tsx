import type { CategoryFormState, ClueFormState } from '../../utils/builderFormStructure'
import { CategorySection } from './CategorySection'

interface RoundSectionProps {
  roundIndex: number
  roundName: string
  categories: CategoryFormState[]
  errors: Record<string, string>
  onCategoryNameChange: (catIdx: number, name: string) => void
  onClueFieldChange: (catIdx: number, clueIdx: number, field: keyof ClueFormState, value: string | boolean) => void
  onBlurClueValue: (catIdx: number, clueIdx: number) => void
}

export function RoundSection({
  roundIndex,
  roundName,
  categories,
  errors,
  onCategoryNameChange,
  onClueFieldChange,
  onBlurClueValue,
}: RoundSectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground capitalize">
        {roundName} Round
      </h2>

      <div className="space-y-4">
        {categories.map((category, catIdx) => (
          <CategorySection
            key={catIdx}
            roundIndex={roundIndex}
            categoryIndex={catIdx}
            roundName={roundName}
            category={category}
            errors={errors}
            onCategoryNameChange={(name) => onCategoryNameChange(catIdx, name)}
            onClueFieldChange={(clueIdx, field, value) => onClueFieldChange(catIdx, clueIdx, field, value)}
            onBlurClueValue={(clueIdx) => onBlurClueValue(catIdx, clueIdx)}
          />
        ))}
      </div>
    </div>
  )
}
