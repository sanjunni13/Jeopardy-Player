interface AddRowButtonProps {
  onClick: () => void
}

export function AddRowButton({ onClick }: AddRowButtonProps) {
  return (
    <button
      type="button"
      className="min-h-[44px] min-w-[44px] w-full flex items-center justify-center border-2 border-dashed border-muted-foreground/40 rounded text-muted-foreground text-xl font-bold hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
      aria-label="Add clue row"
      onClick={onClick}
    >
      +
    </button>
  )
}
