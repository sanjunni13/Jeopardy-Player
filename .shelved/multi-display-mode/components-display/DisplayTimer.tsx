import './DisplayTimer.css'

interface DisplayTimerProps {
  remaining: number | null // seconds remaining, null if inactive
  expired: boolean // true when timer has expired (show "Time's Up!")
}

export function DisplayTimer({ remaining, expired }: DisplayTimerProps) {
  if (remaining === null && !expired) {
    return null
  }

  if (expired || remaining === 0) {
    return (
      <div className="display-timer">
        <span className="display-timer__expired">Time's Up!</span>
      </div>
    )
  }

  const colorClass = getColorClass(remaining)

  return (
    <div className="display-timer">
      <span className={`display-timer__countdown ${colorClass}`}>
        {remaining}
      </span>
    </div>
  )
}

function getColorClass(remaining: number): string {
  if (remaining <= 5) {
    return 'display-timer__countdown--red'
  }
  if (remaining <= 10) {
    return 'display-timer__countdown--yellow'
  }
  return 'display-timer__countdown--white'
}
