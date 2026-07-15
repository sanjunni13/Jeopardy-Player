import { Reorder, useDragControls } from 'motion/react'
import type { CategoryFormState, ClueFormState } from '../../utils/builderFormStructure'
import { CategorySection } from './CategorySection'

interface RoundSectionProps {
  roundIndex: number
  roundName: string
  categories: CategoryFormState[]
  errors: Record<string, string>
  onCategoryNameChange: (catIdx: number, name: string) => void
  onClueFieldChange: (catIdx: number, clueIdx: number, field: keyof ClueFormState, value: string | boolean) => void
  onReorderCategories: (newOrder: CategoryFormState[]) => void
  onReorderClues: (catIdx: number, newOrder: ClueFormState[]) => void
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
  onReorderCategories,
  onReorderClues,
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

      <Reorder.Group
        as="div"
        axis="y"
        values={categories}
        onReorder={onReorderCategories}
        className="space-y-4"
      >
        {categories.map((category, catIdx) => {
          const catUploadingState: Record<number, boolean> = {}
          const catMediaErrors: Record<number, string | null> = {}
          for (let clueIdx = 0; clueIdx < category.clues.length; clueIdx++) {
            const key = `${catIdx}-${clueIdx}`
            catUploadingState[clueIdx] = mediaUploadingState[key] ?? false
            catMediaErrors[clueIdx] = mediaErrors[key] ?? null
          }

          return (
            <ReorderableCategoryItem
              key={category._id}
              category={category}
              roundIndex={roundIndex}
              categoryIndex={catIdx}
              roundName={roundName}
              errors={errors}
              onCategoryNameChange={(name) => onCategoryNameChange(catIdx, name)}
              onClueFieldChange={(clueIdx, field, value) => onClueFieldChange(catIdx, clueIdx, field, value)}
              onReorderClues={(newOrder) => onReorderClues(catIdx, newOrder)}
              onMediaAttach={(clueIdx, file) => onMediaAttach(catIdx, clueIdx, file)}
              onMediaRemove={(clueIdx) => onMediaRemove(catIdx, clueIdx)}
              mediaUploadingState={catUploadingState}
              mediaErrors={catMediaErrors}
            />
          )
        })}
      </Reorder.Group>
    </div>
  )
}

// ─── Internal wrapper for reorderable category items ───────────────────────────

interface ReorderableCategoryItemProps {
  category: CategoryFormState
  roundIndex: number
  categoryIndex: number
  roundName: string
  errors: Record<string, string>
  onCategoryNameChange: (name: string) => void
  onClueFieldChange: (clueIdx: number, field: keyof ClueFormState, value: string | boolean) => void
  onReorderClues: (newOrder: ClueFormState[]) => void
  onMediaAttach: (clueIdx: number, file: File | string) => void
  onMediaRemove: (clueIdx: number) => void
  mediaUploadingState: Record<number, boolean>
  mediaErrors: Record<number, string | null>
}

function ReorderableCategoryItem({
  category,
  roundIndex,
  categoryIndex,
  roundName,
  errors,
  onCategoryNameChange,
  onClueFieldChange,
  onReorderClues,
  onMediaAttach,
  onMediaRemove,
  mediaUploadingState,
  mediaErrors,
}: ReorderableCategoryItemProps) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={category}
      as="div"
      dragListener={false}
      dragControls={controls}
      style={{ position: 'relative', boxShadow: 'none', userSelect: 'auto' }}
      whileDrag={{ boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)', zIndex: 50, userSelect: 'none' }}
    >
      <CategorySection
        roundIndex={roundIndex}
        categoryIndex={categoryIndex}
        roundName={roundName}
        category={category}
        errors={errors}
        onCategoryNameChange={onCategoryNameChange}
        onClueFieldChange={onClueFieldChange}
        onReorderClues={onReorderClues}
        onMediaAttach={onMediaAttach}
        onMediaRemove={onMediaRemove}
        mediaUploadingState={mediaUploadingState}
        mediaErrors={mediaErrors}
        onDragHandlePointerDown={(e) => { e.preventDefault(); controls.start(e) }}
      />
    </Reorder.Item>
  )
}
