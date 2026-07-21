import './DisplayUtility.css'

interface DisplayErrorProps {
  message: string
}

/**
 * TV-optimized error screen shown when the session is not found or connection fails.
 * Displays the error message in large, readable text on a dark background.
 * Purely presentational — no interactivity.
 */
export function DisplayError({ message }: DisplayErrorProps) {
  return (
    <div className="display-utility">
      <div className="display-utility__content">
        <div className="display-error__icon" aria-hidden="true">⚠</div>
        <p className="display-utility__text display-error__message">{message}</p>
      </div>
    </div>
  )
}
