import { BoardSettingsMenu } from './BoardSettingsMenu'

export interface FinalSectionProps {
  category: string
  hasMedia: boolean
  onClick: () => void
  onDeleteBoard: () => void
  onDownloadJSON: () => void
}

/**
 * Renders the "Final Jeopardy" card below the board grid.
 * - Displays a clickable area that opens the FinalEditorModal
 * - Shows category name or placeholder
 * - Displays media indicator when attachments are present
 * - Includes BoardSettingsMenu (gear icon) in the section header
 *
 * Validates: Requirements 1.6, 1.7, 8.1, 12.7
 */
export function FinalSection({
  category,
  hasMedia,
  onClick,
  onDeleteBoard,
  onDownloadJSON,
}: FinalSectionProps) {
  return (
    <div
      className="final-section flex items-center gap-2 mt-4 rounded border border-border bg-muted/30 px-3 py-2"
      data-testid="final-section"
    >
      {/* Clickable card area — opens FinalEditorModal */}
      <button
        type="button"
        className="final-section__card flex-1 min-h-[44px] min-w-[44px] flex items-center gap-2 rounded px-3 py-2 text-left transition-colors bg-primary/10 hover:bg-primary/20 border border-primary/30 cursor-pointer"
        onClick={onClick}
        aria-label="Edit Final Jeopardy"
      >
        <span className="font-semibold text-sm text-foreground">Final Jeopardy</span>

        <span className="text-sm text-muted-foreground truncate">
          {category || '(No category)'}
        </span>

        {/* Media indicator */}
        {hasMedia && (
          <span
            className="final-section__media-indicator text-xs leading-none shrink-0"
            aria-label="Media attached"
          >
            📎
          </span>
        )}
      </button>

      {/* Board Settings gear icon (dropdown menu) */}
      <BoardSettingsMenu
        onDeleteBoard={onDeleteBoard}
        onDownloadJSON={onDownloadJSON}
      />
    </div>
  )
}

export default FinalSection
