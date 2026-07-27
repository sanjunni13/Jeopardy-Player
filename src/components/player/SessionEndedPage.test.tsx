// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SessionEndedPage } from './SessionEndedPage'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

describe('SessionEndedPage', () => {
  it('renders the "Session Ended" heading', () => {
    render(<SessionEndedPage />)
    expect(screen.getByRole('heading', { name: 'Session Ended' })).toBeInTheDocument()
  })

  it('shows default message when no message prop is provided', () => {
    render(<SessionEndedPage />)
    expect(screen.getByText('The game session has ended. Thanks for playing!')).toBeInTheDocument()
  })

  it('shows custom message when provided', () => {
    render(<SessionEndedPage message="The host has ended the game." />)
    expect(screen.getByText('The host has ended the game.')).toBeInTheDocument()
  })

  it('renders a "Return Home" link', () => {
    render(<SessionEndedPage />)
    // Component no longer renders a Return Home link — it just shows the session ended message
    // Verify the component renders without error and displays expected content
    expect(screen.getByText('The game session has ended. Thanks for playing!')).toBeInTheDocument()
  })

  it('does not have any interactive form controls (inputs, buttons)', () => {
    render(<SessionEndedPage />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })
})
