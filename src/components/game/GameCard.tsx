interface GameCardProps {
  id: string
  gameName: string
  totalRounds: number
  creatorName?: string | null
  onClick: (id: string) => void
}

export function GameCard({ id, gameName, totalRounds, creatorName, onClick }: GameCardProps) {
  const roundLabel = totalRounds === 1 ? '1 round' : `${totalRounds} rounds`

  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-left transition-colors cursor-pointer hover:bg-[#6A1B9A] focus:bg-[#6A1B9A] focus:outline-none"
    >
      <h3 className="text-lg font-semibold text-slate-100">{gameName}</h3>
      <p className="mt-1 text-sm text-slate-400">{roundLabel}</p>
      {creatorName && (
        <p className="mt-1 text-xs text-slate-500">by {creatorName}</p>
      )}
    </button>
  )
}
