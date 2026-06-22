// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BoardToolbar } from './BoardToolbar'
import type { BoardToolbarProps } from './BoardToolbar'

function defaultProps(overrides: Partial<BoardToolbarProps> = {}): BoardToolbarProps {
  return {
    gameName: 'My Game',
    onGameNameChange: vi.fn(),
    onSave: vi.fn(),
    onPublish: vi.fn(),
    isSaving: false,
    isPublishing: false,
    lastSavedAt: null,
    autoSaveStatus: 'idle',
    saveMessage: null,
    publishMessage: null,
    onDismissSaveMessage: vi.fn(),
    onDismissPublishMessage: vi.fn(),
    ...overrides,
  }
}

describe('BoardToolbar', () => {
  // ─── Game Name Input ───────────────────────────────────────────────────────

  it('renders the game name input with current value', () => {
    render(<BoardToolbar {...defaultProps()} />)
    const input = screen.getByPlaceholderText('Enter game name...')
    expect(input).toHaveValue('My Game')
  })

  it('calls onGameNameChange when the game name input changes', () => {
    const onGameNameChange = vi.fn()
    render(<BoardToolbar {...defaultProps({ onGameNameChange })} />)
    const input = screen.getByPlaceholderText('Enter game name...')
    fireEvent.change(input, { target: { value: 'New Name' } })
    expect(onGameNameChange).toHaveBeenCalledWith('New Name')
  })

  it('displays game name validation error when gameNameError is provided', () => {
    render(<BoardToolbar {...defaultProps({ gameNameError: 'Name is required' })} />)
    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Name is required')
  })

  it('marks input as aria-invalid when gameNameError is provided', () => {
    render(<BoardToolbar {...defaultProps({ gameNameError: 'Name is required' })} />)
    const input = screen.getByPlaceholderText('Enter game name...')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not mark input as aria-invalid when no error', () => {
    render(<BoardToolbar {...defaultProps()} />)
    const input = screen.getByPlaceholderText('Enter game name...')
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })

  // ─── Save Button ──────────────────────────────────────────────────────────

  it('renders the Save button', () => {
    render(<BoardToolbar {...defaultProps()} />)
    const btn = screen.getByRole('button', { name: 'Save draft' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('Save')
  })

  it('disables Save button and shows "Saving..." when isSaving is true', () => {
    render(<BoardToolbar {...defaultProps({ isSaving: true })} />)
    const btn = screen.getByRole('button', { name: 'Saving draft...' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('Saving...')
  })

  it('calls onSave when Save button is clicked', () => {
    const onSave = vi.fn()
    render(<BoardToolbar {...defaultProps({ onSave })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  // ─── Publish Button ───────────────────────────────────────────────────────

  it('renders the Publish button', () => {
    render(<BoardToolbar {...defaultProps()} />)
    const btn = screen.getByRole('button', { name: 'Publish game' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('Publish')
  })

  it('disables Publish button and shows "Publishing..." when isPublishing is true', () => {
    render(<BoardToolbar {...defaultProps({ isPublishing: true })} />)
    const btn = screen.getByRole('button', { name: 'Publishing game...' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('Publishing...')
  })

  it('calls onPublish when Publish button is clicked', () => {
    const onPublish = vi.fn()
    render(<BoardToolbar {...defaultProps({ onPublish })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish game' }))
    expect(onPublish).toHaveBeenCalledTimes(1)
  })

  // ─── Auto-save Status Indicator ───────────────────────────────────────────

  it('displays "Auto-saved at" with formatted time when idle and lastSavedAt is set', () => {
    const date = new Date(2024, 5, 15, 15, 45, 0)
    render(<BoardToolbar {...defaultProps({ autoSaveStatus: 'idle', lastSavedAt: date })} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/Auto-saved at/)
  })

  it('displays "Auto-saving..." when autoSaveStatus is saving', () => {
    render(<BoardToolbar {...defaultProps({ autoSaveStatus: 'saving' })} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Auto-saving...')
  })

  it('displays auto-save failed warning when autoSaveStatus is failed', () => {
    render(<BoardToolbar {...defaultProps({ autoSaveStatus: 'failed' })} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Auto-save failed. Save manually.')
  })

  it('does not display auto-save status when idle and no lastSavedAt', () => {
    render(<BoardToolbar {...defaultProps({ autoSaveStatus: 'idle', lastSavedAt: null })} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // ─── Save Message ─────────────────────────────────────────────────────────

  it('displays save success message with dismiss button', () => {
    render(
      <BoardToolbar
        {...defaultProps({ saveMessage: { type: 'success', text: 'Draft saved!' } })}
      />
    )
    expect(screen.getByText('Draft saved!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss save message' })).toBeInTheDocument()
  })

  it('displays save error message', () => {
    render(
      <BoardToolbar
        {...defaultProps({ saveMessage: { type: 'error', text: 'Save failed' } })}
      />
    )
    expect(screen.getByText('Save failed')).toBeInTheDocument()
  })

  it('calls onDismissSaveMessage when dismiss button is clicked', () => {
    const onDismissSaveMessage = vi.fn()
    render(
      <BoardToolbar
        {...defaultProps({
          saveMessage: { type: 'success', text: 'Saved!' },
          onDismissSaveMessage,
        })}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss save message' }))
    expect(onDismissSaveMessage).toHaveBeenCalledTimes(1)
  })

  // ─── Publish Message ──────────────────────────────────────────────────────

  it('displays publish success message with dismiss button', () => {
    render(
      <BoardToolbar
        {...defaultProps({ publishMessage: { type: 'success', text: 'Game published!' } })}
      />
    )
    expect(screen.getByText('Game published!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss publish message' })).toBeInTheDocument()
  })

  it('displays publish error message', () => {
    render(
      <BoardToolbar
        {...defaultProps({ publishMessage: { type: 'error', text: 'Publish failed' } })}
      />
    )
    expect(screen.getByText('Publish failed')).toBeInTheDocument()
  })

  it('calls onDismissPublishMessage when dismiss button is clicked', () => {
    const onDismissPublishMessage = vi.fn()
    render(
      <BoardToolbar
        {...defaultProps({
          publishMessage: { type: 'error', text: 'Error!' },
          onDismissPublishMessage,
        })}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss publish message' }))
    expect(onDismissPublishMessage).toHaveBeenCalledTimes(1)
  })

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('has a toolbar role with an accessible label', () => {
    render(<BoardToolbar {...defaultProps()} />)
    expect(screen.getByRole('toolbar', { name: 'Board editor toolbar' })).toBeInTheDocument()
  })
})
