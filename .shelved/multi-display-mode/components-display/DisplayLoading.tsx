import './DisplayUtility.css'

/**
 * TV-optimized loading screen shown while connecting to the game session.
 * Displays a CSS spinner and "Connecting to game..." message.
 * Purely presentational — no interactivity.
 */
export function DisplayLoading() {
  return (
    <div className="display-utility">
      <div className="display-utility__content">
        <div className="display-loading__spinner" aria-hidden="true" />
        <p className="display-utility__text">Connecting to game...</p>
      </div>
    </div>
  )
}
