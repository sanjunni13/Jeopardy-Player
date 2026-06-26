// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog'

const defaultProps = {
  isOpen: true,
  gameName: 'My Trivia Game',
  isDeleting: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

describe('DeleteConfirmationDialog', () => {
  describe('visibility based on isOpen prop (Req 2.1, 2.2)', () => {
    it('renders dialog content when isOpen is true', () => {
      render(<DeleteConfirmationDialog {...defaultProps} isOpen={true} />)

      expect(screen.getByText('Delete Draft')).toBeInTheDocument()
    })

    it('does not render dialog content when isOpen is false', () => {
      render(<DeleteConfirmationDialog {...defaultProps} isOpen={false} />)

      expect(screen.queryByText('Delete Draft')).not.toBeInTheDocument()
    })
  })

  describe('dialog shows game name (Req 2.3)', () => {
    it('displays the game name in the confirmation message', () => {
      render(<DeleteConfirmationDialog {...defaultProps} gameName="My Trivia Game" />)

      expect(screen.getByText('My Trivia Game')).toBeInTheDocument()
    })

    it('displays a different game name correctly', () => {
      render(<DeleteConfirmationDialog {...defaultProps} gameName="Final Round Quiz" />)

      expect(screen.getByText('Final Round Quiz')).toBeInTheDocument()
    })
  })

  describe('confirm triggers callback (Req 2.5)', () => {
    it('calls onConfirm when the Delete button is clicked', () => {
      const onConfirm = vi.fn()
      render(<DeleteConfirmationDialog {...defaultProps} onConfirm={onConfirm} />)

      const deleteButton = screen.getByRole('button', { name: 'Delete' })
      fireEvent.click(deleteButton)

      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
  })

  describe('cancel closes dialog without side effects (Req 2.6)', () => {
    it('calls onCancel when the Cancel button is clicked and does not call onConfirm', () => {
      const onCancel = vi.fn()
      const onConfirm = vi.fn()
      render(
        <DeleteConfirmationDialog
          {...defaultProps}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      // onCancel is called (may be called multiple times due to Radix AlertDialog.Cancel
      // triggering both onClick and onOpenChange)
      expect(onCancel).toHaveBeenCalled()
      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  describe('loading/deleting state (Req 2.7)', () => {
    it('shows spinner and loading text when isDeleting is true', () => {
      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={true} />)

      expect(screen.getByText('Deleting draft...')).toBeInTheDocument()
      // Confirm/cancel buttons should not be visible during deletion
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('shows confirm and cancel buttons when isDeleting is false', () => {
      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={false} />)

      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.queryByText('Deleting draft...')).not.toBeInTheDocument()
    })
  })
})
