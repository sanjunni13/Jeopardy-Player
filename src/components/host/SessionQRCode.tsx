import { useSessionQR } from '../../hooks/useSessionQR'
import './SessionQRCode.css'

interface SessionQRCodeProps {
  sessionId: string
}

export function SessionQRCode({ sessionId }: SessionQRCodeProps) {
  const { qrDataUrl, sessionLink } = useSessionQR(sessionId)

  return (
    <div className="session-qr">
      <div className="session-qr-code-container">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR code to join game session"
            className="session-qr-image"
            width={200}
            height={200}
          />
        ) : (
          <div className="session-qr-loading" aria-label="Generating QR code">
            <div className="session-qr-spinner" />
            <span className="session-qr-loading-text">Generating QR code…</span>
          </div>
        )}
      </div>
      <p className="session-qr-link-label">Or join manually:</p>
      <code className="session-qr-link">{sessionLink}</code>
    </div>
  )
}
