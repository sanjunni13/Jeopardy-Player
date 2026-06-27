// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ConnectionStatusBanner } from './ConnectionStatusBanner'

describe('ConnectionStatusBanner', () => {
  it('renders nothing when connected', () => {
    const { container } = render(
      <ConnectionStatusBanner connectionState="connected" error={null} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows "Connecting..." when connecting', () => {
    render(<ConnectionStatusBanner connectionState="connecting" error={null} />)
    expect(screen.getByText('Connecting...')).toBeInTheDocument()
  })

  it('shows disconnection message when disconnected', () => {
    render(<ConnectionStatusBanner connectionState="disconnected" error={null} />)
    expect(screen.getByText('Disconnected. Reconnecting...')).toBeInTheDocument()
  })

  it('shows disconnection message when reconnecting', () => {
    render(<ConnectionStatusBanner connectionState="reconnecting" error={null} />)
    expect(screen.getByText('Disconnected. Reconnecting...')).toBeInTheDocument()
  })

  it('shows "Connection lost" with retry button when failed', () => {
    const onRetry = vi.fn()
    render(
      <ConnectionStatusBanner connectionState="failed" error={null} onRetry={onRetry} />
    )
    expect(screen.getByText(/Connection lost/)).toBeInTheDocument()
    const retryButton = screen.getByRole('button', { name: 'Retry' })
    expect(retryButton).toBeInTheDocument()
    fireEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('displays the error message in failed state', () => {
    render(
      <ConnectionStatusBanner connectionState="failed" error="Server unavailable" />
    )
    expect(screen.getByText(/Server unavailable/)).toBeInTheDocument()
  })

  it('does not render retry button if onRetry is not provided', () => {
    render(<ConnectionStatusBanner connectionState="failed" error={null} />)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('has role="alert" for accessibility', () => {
    render(<ConnectionStatusBanner connectionState="connecting" error={null} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
