// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { BuilderForm } from './BuilderForm'
import { ExitGuardDialog } from './ExitGuardDialog'
import { BuilderToolbar } from './BuilderToolbar'
import { generateEmptyFormState } from '../../utils/builderFormStructure'

const defaultFormProps = {
  formState: generateEmptyFormState(1, 1),
  errors: {} as Record<string, string>,
  isDirty: false,
  isSaving: false,
  isPublishing: false,
  lastSavedAt: null,
  autoSaveStatus: 'idle' as const,
  saveMessage: null,
  publishMessage: null,
  onSetGameName: vi.fn(),
  onSetTotalRounds: vi.fn(),
  onSetCategoriesPerRound: vi.fn(),
  onSetCategoryName: vi.fn(),
  onSetClueField: vi.fn(),
  onSetFinalField: vi.fn(),
  onValidateField: vi.fn(),
  onSave: vi.fn(),
  onPublish: vi.fn(),
  onDismissSaveMessage: vi.fn(),
  onDismissPublishMessage: vi.fn(),
}

describe('BuilderForm', () => {
  it('renders initial state with game name empty, 1 round selected, and 1 category (Req 1.9)', () => {
    render(<BuilderForm {...defaultFormProps} />)

    // Game name input should be empty
    const gameNameInput = screen.getByLabelText('Game Name')
    expect(gameNameInput).toHaveValue('')

    // Number of Rounds should be 1
    const roundsSelect = screen.getByLabelText('Number of Rounds')
    expect(roundsSelect).toHaveValue('1')

    // Categories per Round should be 1
    const categoriesSelect = screen.getByLabelText('Categories per Round')
    expect(categoriesSelect).toHaveValue('1')
  })

  it('displays validation error when set and removes it when cleared (Req 2.5)', () => {
    const { rerender } = render(
      <BuilderForm {...defaultFormProps} errors={{ gameName: 'Game name is required' }} />
    )

    // Error should be displayed
    expect(screen.getByText('Game name is required')).toBeInTheDocument()

    // Re-render with no errors
    rerender(<BuilderForm {...defaultFormProps} errors={{}} />)

    // Error should be gone
    expect(screen.queryByText('Game name is required')).not.toBeInTheDocument()
  })

  it('disables Save button when isSaving is true (Req 3.7)', () => {
    render(<BuilderForm {...defaultFormProps} isSaving={true} />)

    const saveButton = screen.getByRole('button', { name: /saving draft/i })
    expect(saveButton).toBeDisabled()
  })

  it('shows save success message when saveMessage is provided (Req 3.4)', () => {
    render(
      <BuilderForm
        {...defaultFormProps}
        saveMessage={{ type: 'success', text: 'Draft saved successfully!' }}
      />
    )

    expect(screen.getByText('Draft saved successfully!')).toBeInTheDocument()
  })
})

describe('ExitGuardDialog', () => {
  const dialogProps = {
    isOpen: true,
    onCancel: vi.fn(),
    onSaveAndExit: vi.fn(),
    onExitWithoutSaving: vi.fn(),
  }

  it('renders three options: Cancel, Save and Exit, Exit Without Saving (Req 5.3)', () => {
    render(<ExitGuardDialog {...dialogProps} />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save and Exit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exit Without Saving' })).toBeInTheDocument()
  })

  it('disables Save and Exit button when isSaving is true and shows loading', () => {
    render(<ExitGuardDialog {...dialogProps} isSaving={true} />)

    // When isSaving is true, the dialog shows a full loading state (spinner + text)
    // instead of button options.
    expect(screen.getByText('Saving your changes...')).toBeInTheDocument()
    // Buttons should not be present during saving state
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('BuilderToolbar', () => {
  const toolbarProps = {
    onSave: vi.fn(),
    onPublish: vi.fn(),
    isSaving: false,
    isPublishing: false,
    lastSavedAt: null,
    autoSaveStatus: 'idle' as const,
  }

  it('disables Publish button when isPublishing is true (Req 6.3)', () => {
    render(<BuilderToolbar {...toolbarProps} isPublishing={true} />)

    const publishButton = screen.getByRole('button', { name: /publishing game/i })
    expect(publishButton).toBeDisabled()
  })
})
