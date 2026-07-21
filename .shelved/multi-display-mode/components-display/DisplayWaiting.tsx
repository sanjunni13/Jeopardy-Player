import './DisplayUtility.css'

/**
 * TV-optimized waiting screen shown when connected but the game hasn't started yet.
 * Displays "Waiting for game to begin" with a subtle pulsing animation.
 * Purely presentational — no interactivity.
 */
export function DisplayWaiting() {
  return (
    <div className="display-utility">
      <div className="display-utility__content">
        <p className="display-utility__text display-waiting__text">
          Waiting for game to begin
        </p>
      </div>
    </div>
  )
}
