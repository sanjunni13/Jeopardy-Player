import './ConnectionStatusBanner.css'

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed'

interface ConnectionStatusBannerProps {
  connectionState: ConnectionState
  error: string | null
  onRetry?: () => void
}

export function ConnectionStatusBanner({ connectionState, error, onRetry }: ConnectionStatusBannerProps) {
  if (connectionState === 'connected') {
    return null
  }

  const bannerClass = `connection-banner connection-banner--${connectionState}`

  return (
    <div className={bannerClass} role="alert" aria-live="polite">
      {connectionState === 'connecting' && (
        <>
          <span className="connection-banner__spinner" aria-hidden="true" />
          <span>Connecting...</span>
        </>
      )}

      {(connectionState === 'disconnected' || connectionState === 'reconnecting') && (
        <>
          <span className="connection-banner__spinner" aria-hidden="true" />
          <span>Disconnected. Reconnecting...</span>
        </>
      )}

      {connectionState === 'failed' && (
        <>
          <span>Connection lost.{error ? ` ${error}` : ''}</span>
          {onRetry && (
            <button
              type="button"
              className="connection-banner__retry-button"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </>
      )}
    </div>
  )
}
