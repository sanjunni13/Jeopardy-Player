import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { FrostedGlassModal } from '../ui/framer-motion-animations'
import './DisplayQRCode.css'

interface DisplayQRCodeProps {
  sessionId: string
  isOpen: boolean
  onClose: () => void
}

export function DisplayQRCode({ sessionId, isOpen, onClose }: DisplayQRCodeProps) {
  const displayUrl = `${window.location.origin}/display/${sessionId}`
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false

    async function generate() {
      try {
        const dataUrl = await QRCode.toDataURL(displayUrl, {
          width: 256,
          margin: 2,
          errorCorrectionLevel: 'M',
        })
        if (!cancelled) {
          setQrDataUrl(dataUrl)
        }
      } catch {
        if (!cancelled) {
          setQrDataUrl(null)
        }
      }
    }

    generate()

    return () => {
      cancelled = true
      setQrDataUrl(null)
    }
  }, [displayUrl, isOpen])

  return (
    <FrostedGlassModal open={isOpen} onClose={onClose} ariaLabelledBy="display-qr-title">
      <div className="display-qr" onClick={(e) => e.stopPropagation()}>
        <h2 id="display-qr-title" className="display-qr__title">📺 TV Display</h2>

        <p className="display-qr__instruction">Open this on your TV or projector</p>

        <div className="display-qr__code-container">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR code for TV display"
              className="display-qr__image"
              width={200}
              height={200}
            />
          ) : (
            <div className="display-qr__loading" aria-label="Generating QR code">
              <div className="display-qr__spinner" />
              <span className="display-qr__loading-text">Generating QR code…</span>
            </div>
          )}
        </div>

        <p className="display-qr__link-label">Or open this URL manually:</p>
        <code className="display-qr__link">{displayUrl}</code>

        <button
          type="button"
          className="display-qr__close-btn"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </FrostedGlassModal>
  )
}
