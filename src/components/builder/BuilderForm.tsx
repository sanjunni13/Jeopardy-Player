import { useRef, useEffect, useState } from 'react'
import { RoundSection } from './RoundSection'
import { FinalJeopardySection } from './FinalJeopardySection'
import { BuilderToolbar } from './BuilderToolbar'
import { RoundTabs } from './RoundTabs'
import { generateRoundLabels } from '../../utils/builderFormStructure'
import type {
  BuilderFormState,
  ValidationErrors,
  ClueFormState,
  FinalRoundFormState,
  MediaData,
} from '../../utils/builderFormStructure'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface BuilderFormProps {
  formState: BuilderFormState
  errors: ValidationErrors
  isDirty: boolean
  isSaving: boolean
  isPublishing: boolean
  lastSavedAt: Date | null
  autoSaveStatus: 'idle' | 'pending' | 'saving' | 'failed'
  onSetGameName: (name: string) => void
  onSetTotalRounds: (n: number) => void
  onSetCategoriesPerRound: (n: number) => void
  onSetCategoryName: (roundIdx: number, catIdx: number, name: string) => void
  onSetClueField: (
    roundIdx: number,
    catIdx: number,
    clueIdx: number,
    field: keyof ClueFormState,
    value: string | boolean | MediaData | null
  ) => void
  onSetFinalField: (field: keyof FinalRoundFormState, value: string | MediaData | null) => void
  onValidateField: (fieldPath: string) => void
  onSave: () => void
  onPublish: () => void
  onMediaAttach?: (roundIdx: number, catIdx: number, clueIdx: number, file: File | string) => void
  onMediaRemove?: (roundIdx: number, catIdx: number, clueIdx: number) => void
  mediaUploadingState?: Record<string, boolean>
  mediaErrors?: Record<string, string | null>
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function BuilderForm({
  formState,
  errors,
  isSaving,
  isPublishing,
  lastSavedAt,
  autoSaveStatus,
  onSetGameName,
  onSetTotalRounds,
  onSetCategoriesPerRound,
  onSetCategoryName,
  onSetClueField,
  onSetFinalField,
  onValidateField,
  onSave,
  onPublish,
  onMediaAttach,
  onMediaRemove,
  mediaUploadingState = {},
  mediaErrors = {},
}: BuilderFormProps) {
  // ─── Tab navigation (Req 1.2, 1.3, 1.5, 1.6) ─────────────────────────────
  const [activeTabRaw, setActiveTab] = useState(0)

  // Clamp activeTab when totalRounds decreases (Property 2: active tab fallback)
  const activeTab = Math.min(activeTabRaw, formState.totalRounds)

  // ─── Focus management (Req 11.6) ──────────────────────────────────────────
  const prevTotalRoundsRef = useRef(formState.totalRounds)
  const prevCategoriesPerRoundRef = useRef(formState.categoriesPerRound)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prevRounds = prevTotalRoundsRef.current
    const currRounds = formState.totalRounds

    if (currRounds > prevRounds) {
      // Rounds increased: focus first input of the new round section
      requestAnimationFrame(() => {
        const newSectionIndex = prevRounds // 0-indexed, so prev count = new section index
        const section = containerRef.current?.querySelector(
          `[data-round-index="${newSectionIndex}"]`
        )
        const firstInput = section?.querySelector<HTMLElement>(
          'input, select, textarea'
        )
        firstInput?.focus()
      })
    } else if (currRounds < prevRounds) {
      // Rounds decreased: focus last remaining section's first input
      requestAnimationFrame(() => {
        const lastSectionIndex = currRounds - 1
        const section = containerRef.current?.querySelector(
          `[data-round-index="${lastSectionIndex}"]`
        )
        const firstInput = section?.querySelector<HTMLElement>(
          'input, select, textarea'
        )
        firstInput?.focus()
      })
    }

    prevTotalRoundsRef.current = currRounds
  }, [formState.totalRounds])

  useEffect(() => {
    const prevCategories = prevCategoriesPerRoundRef.current
    const currCategories = formState.categoriesPerRound

    if (currCategories > prevCategories) {
      // Categories increased: focus first input of a new category in the first round
      requestAnimationFrame(() => {
        const firstRoundSection = containerRef.current?.querySelector(
          '[data-round-index="0"]'
        )
        const allCategorySections = firstRoundSection?.querySelectorAll(
          '[data-category-index]'
        )
        if (allCategorySections && allCategorySections.length > 0) {
          const newCategory = allCategorySections[prevCategories] // 0-indexed
          const firstInput = newCategory?.querySelector<HTMLElement>(
            'input, select, textarea'
          )
          firstInput?.focus()
        }
      })
    } else if (currCategories < prevCategories) {
      // Categories decreased: focus last remaining category's first input
      requestAnimationFrame(() => {
        const firstRoundSection = containerRef.current?.querySelector(
          '[data-round-index="0"]'
        )
        const allCategorySections = firstRoundSection?.querySelectorAll(
          '[data-category-index]'
        )
        if (allCategorySections && allCategorySections.length > 0) {
          const lastCategory = allCategorySections[currCategories - 1]
          const firstInput = lastCategory?.querySelector<HTMLElement>(
            'input, select, textarea'
          )
          firstInput?.focus()
        }
      })
    }

    prevCategoriesPerRoundRef.current = currCategories
  }, [formState.categoriesPerRound])

  // ─── Derived data ──────────────────────────────────────────────────────────
  const roundLabels = generateRoundLabels(formState.totalRounds)
  const roundOptions = [1, 2, 3, 4, 5, 6]

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Game Name Input */}
      <div className="space-y-2">
        <label
          htmlFor="builder-game-name"
          className="block text-sm font-medium text-foreground"
        >
          Game Name
        </label>
        <input
          id="builder-game-name"
          type="text"
          value={formState.gameName}
          onChange={(e) => onSetGameName(e.target.value)}
          onBlur={() => onValidateField('gameName')}
          aria-invalid={!!errors['gameName']}
          aria-describedby={errors['gameName'] ? 'builder-game-name-error' : undefined}
          className="w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-input/30 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          maxLength={100}
        />
        {errors['gameName'] && (
          <p
            id="builder-game-name-error"
            className="text-sm text-red-500"
            role="alert"
          >
            {errors['gameName']}
          </p>
        )}
      </div>

      {/* Round/Category Config */}
      <div className="flex gap-4 flex-wrap justify-center">
        <div className="space-y-2">
          <label
            htmlFor="builder-total-rounds"
            className="block text-sm font-medium text-foreground"
          >
            Number of Rounds
          </label>
          <select
            id="builder-total-rounds"
            value={formState.totalRounds}
            onChange={(e) => onSetTotalRounds(Number(e.target.value))}
            className="min-h-11 px-3 py-2 rounded-lg border border-border bg-slate-800 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {roundOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="builder-categories-per-round"
            className="block text-sm font-medium text-foreground"
          >
            Categories per Round
          </label>
          <select
            id="builder-categories-per-round"
            value={formState.categoriesPerRound}
            onChange={(e) => onSetCategoriesPerRound(Number(e.target.value))}
            className="min-h-11 px-3 py-2 rounded-lg border border-border bg-slate-800 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {roundOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Round Tabs Navigation */}
      <RoundTabs
        totalRounds={formState.totalRounds}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Conditionally render active round or Final Jeopardy */}
      {activeTab < formState.totalRounds ? (
        <div key={activeTab} data-round-index={activeTab}>
          <RoundSection
            roundIndex={activeTab}
            roundName={roundLabels[activeTab]}
            categories={formState.rounds[activeTab]}
            errors={errors}
            onCategoryNameChange={(catIdx, name) =>
              onSetCategoryName(activeTab, catIdx, name)
            }
            onClueFieldChange={(catIdx, clueIdx, field, value) =>
              onSetClueField(activeTab, catIdx, clueIdx, field, value)
            }
            onMediaAttach={(catIdx, clueIdx, file) =>
              onMediaAttach?.(activeTab, catIdx, clueIdx, file)
            }
            onMediaRemove={(catIdx, clueIdx) =>
              onMediaRemove?.(activeTab, catIdx, clueIdx)
            }
            mediaUploadingState={
              Object.fromEntries(
                Object.entries(mediaUploadingState)
                  .filter(([key]) => key.startsWith(`${activeTab}-`))
                  .map(([key, val]) => [key.slice(`${activeTab}-`.length), val])
              )
            }
            mediaErrors={
              Object.fromEntries(
                Object.entries(mediaErrors)
                  .filter(([key]) => key.startsWith(`${activeTab}-`))
                  .map(([key, val]) => [key.slice(`${activeTab}-`.length), val])
              )
            }
          />
        </div>
      ) : (
        <FinalJeopardySection
          finalRound={formState.finalRound}
          errors={{
            category: errors['final.category'],
            clue: errors['final.clue'],
            solution: errors['final.solution'],
          }}
          onFieldChange={onSetFinalField}
          media={formState.finalRound.media ?? null}
          onMediaAttach={onMediaAttach ? (file) => onMediaAttach(formState.totalRounds, 0, 0, file) : undefined}
          onMediaRemove={onMediaRemove ? () => onMediaRemove(formState.totalRounds, 0, 0) : undefined}
        />
      )}

      {/* Builder Toolbar */}
      <BuilderToolbar
        onSave={onSave}
        onPublish={onPublish}
        isSaving={isSaving}
        isPublishing={isPublishing}
        lastSavedAt={lastSavedAt}
        autoSaveStatus={autoSaveStatus}
      />
    </div>
  )
}
