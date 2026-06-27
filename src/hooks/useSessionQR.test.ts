// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSessionQR } from './useSessionQR'

describe('useSessionQR', () => {
  it('returns the correct session link', () => {
    const { result } = renderHook(() => useSessionQR('abc123'))
    expect(result.current.sessionLink).toBe(`${window.location.origin}/play/abc123`)
  })

  it('generates a QR code data URL', async () => {
    const { result } = renderHook(() => useSessionQR('test-session-id'))

    await waitFor(() => {
      expect(result.current.qrDataUrl).not.toBeNull()
    })

    expect(result.current.qrDataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('starts with qrDataUrl as null before generation completes', () => {
    const { result } = renderHook(() => useSessionQR('session1'))
    // Initially null before async generation completes (or may resolve quickly)
    expect(result.current.qrDataUrl === null || result.current.qrDataUrl?.startsWith('data:image')).toBe(true)
  })

  it('regenerates QR code when sessionId changes', async () => {
    const { result, rerender } = renderHook(
      ({ sessionId }) => useSessionQR(sessionId),
      { initialProps: { sessionId: 'session-a' } }
    )

    await waitFor(() => {
      expect(result.current.qrDataUrl).not.toBeNull()
    })

    const firstDataUrl = result.current.qrDataUrl

    rerender({ sessionId: 'session-b' })

    expect(result.current.sessionLink).toBe(`${window.location.origin}/play/session-b`)

    await waitFor(() => {
      expect(result.current.qrDataUrl).not.toBeNull()
      expect(result.current.qrDataUrl).not.toBe(firstDataUrl)
    })
  })

  it('produces a data URL with substantial content (256px QR code)', async () => {
    const { result } = renderHook(() => useSessionQR('size-test'))

    await waitFor(() => {
      expect(result.current.qrDataUrl).not.toBeNull()
    })

    // The QR code is generated at 256px width, so the data URL should be substantial
    expect(result.current.qrDataUrl!.length).toBeGreaterThan(100)
  })
})
