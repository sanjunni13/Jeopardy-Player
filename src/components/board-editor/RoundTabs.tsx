interface RoundTabsProps {
  totalRounds: number
  activeRound: number
  onSelectRound: (index: number) => void
  onAddRound: () => void
  onDeleteRound: (index: number) => void
  onSwapRounds: (indexA: number, indexB: number) => void
}

export function RoundTabs({
  totalRounds,
  activeRound,
  onSelectRound,
  onAddRound,
  onDeleteRound,
  onSwapRounds,
}: RoundTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border pb-1">
      <div role="tablist" aria-label="Game rounds" className="flex items-center gap-1">
        {Array.from({ length: totalRounds }, (_, index) => (
          <div key={index} className="flex items-center gap-0.5">
            {/* Swap left arrow — hidden for the first tab */}
            {index > 0 && (
              <button
                type="button"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={`Move Round ${index + 1} left`}
                onClick={() => onSwapRounds(index, index - 1)}
              >
                ◀
              </button>
            )}

            {/* Round tab button */}
            <button
              type="button"
              role="tab"
              id={`round-tab-${index}`}
              aria-selected={activeRound === index}
              aria-controls={`round-panel-${index}`}
              className={`min-h-[44px] px-4 py-2 font-medium text-sm rounded-t transition-colors ${
                activeRound === index
                  ? 'bg-primary text-primary-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              onClick={() => onSelectRound(index)}
            >
              Round {index + 1}
            </button>

            {/* Delete round button — hidden when only 1 round exists */}
            {totalRounds > 1 && (
              <button
                type="button"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-destructive"
                aria-label={`Delete Round ${index + 1}`}
                onClick={() => onDeleteRound(index)}
              >
                ✕
              </button>
            )}

            {/* Swap right arrow — hidden for the last tab */}
            {index < totalRounds - 1 && (
              <button
                type="button"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={`Move Round ${index + 1} right`}
                onClick={() => onSwapRounds(index, index + 1)}
              >
                ▶
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add round button */}
      <button
        type="button"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center ml-2 text-muted-foreground hover:text-foreground rounded border border-border hover:bg-muted"
        aria-label="Add round"
        onClick={onAddRound}
      >
        +
      </button>
    </div>
  )
}
