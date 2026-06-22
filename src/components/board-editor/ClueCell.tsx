export interface ClueCellProps {
  pointValue: number
  hasContent: boolean
  hasMedia: boolean
  dailyDouble: boolean
  onClick: () => void
  ariaLabel: string
}

export function ClueCell({
  pointValue,
  hasContent,
  hasMedia,
  dailyDouble,
  onClick,
  ariaLabel,
}: ClueCellProps) {
  return (
    <button
      type="button"
      role="gridcell"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`
        min-h-[44px] min-w-[44px] relative flex items-center justify-center
        rounded border text-sm font-semibold transition-colors
        cursor-pointer select-none
        ${
          hasContent
            ? 'clue-cell--filled bg-primary/90 text-primary-foreground border-primary hover:bg-primary'
            : 'clue-cell--empty bg-muted/40 text-muted-foreground border-border hover:bg-muted'
        }
      `}
    >
      {/* Point value display */}
      <span className="clue-cell__value">${pointValue}</span>

      {/* Media badge indicator */}
      {hasMedia && (
        <span
          className="clue-cell__media-badge absolute top-0.5 right-0.5 text-[10px] leading-none"
          aria-hidden="true"
        >
          🎵
        </span>
      )}

      {/* Daily double star indicator */}
      {dailyDouble && (
        <span
          className="clue-cell__daily-double absolute bottom-0.5 right-0.5 text-[10px] leading-none"
          aria-hidden="true"
        >
          ⭐
        </span>
      )}
    </button>
  )
}
