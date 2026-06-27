import { useState, useEffect, useMemo } from 'react'
import QRCode from 'qrcode'
import { buildSessionLink } from '../utils/sessionIdGenerator'

interface UseSessionQRResult {
  /** Base64-encoded QR code PNG data URL, or null while generating */
  qrDataUrl: string | null
  /** The plain text session link URL */
  sessionLink: string
}

/**
 * Hook that generates a QR code data URL from a session ID.
 * Uses the `qrcode` library to produce a base64-encoded PNG.
 *
 * @param sessionId - The session ID to encode in the QR code
 * @returns An object with the QR data URL and the session link text
 */
export function useSessionQR(sessionId: string): UseSessionQRResult {
  const sessionLink = useMemo(() => buildSessionLink(sessionId), [sessionId])
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function generate() {
      try {
        const dataUrl = await QRCode.toDataURL(sessionLink, {
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
  }, [sessionLink])

  return { qrDataUrl, sessionLink }
}
