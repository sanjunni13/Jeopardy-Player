interface CheatSheetButtonProps {
  onClick: () => void
}

export function CheatSheetButton({ onClick }: CheatSheetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-4 right-4 z-40 rounded-full bg-[#6A1B9A] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-[#7B1FA2] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CE93D8] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      Answer Sheet
    </button>
  )
}
