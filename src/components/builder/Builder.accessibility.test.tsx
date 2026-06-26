// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ExitGuardDialog } from './ExitGuardDialog'
import { ClueRow } from './ClueRow'
import { FinalJeopardySection } from './FinalJeopardySection'
import { BuilderForm } from './BuilderForm'
import { generateEmptyFormState } from '../../utils/builderFormStructure'

const defaultFormProps = {
  formState: generateEmptyFormState(1, 1),
  errors: {} as Record<string, string>,
  isDirty: false,
  isSaving: false,
  isPublishing: false,
  lastSavedAt: null,
  autoSaveStatus: 'idle' as const,
  onSetGameName: vi.fn(),
  onSetTotalRounds: vi.fn(),
  onSetCategoriesPerRound: vi.fn(),
  onSetCategoryName: vi.fn(),
  onSetClueField: vi.fn(),
  onSetFinalField: vi.fn(),
  onValidateField: vi.fn(),
  onSave: vi.fn(),
  onPublish: vi.fn(),
}

describe('Accessibility: Keyboard navigation order (Req 11.1)', () => {
  it('BuilderForm key inputs are focusable and in the document', () => {
    render(<BuilderForm {...defaultFormProps} />)

    // Game name input
    const gameNameInput = screen.getByLabelText(/game name/i)
    expect(gameNameInput).toBeInTheDocument()
    expect(gameNameInput.tabIndex).not.toBe(-1)

    // Round selector
    const roundsSelect = screen.getByLabelText(/number of rounds/i)
    expect(roundsSelect).toBeInTheDocument()
    expect(roundsSelect.tabIndex).not.toBe(-1)

    // Categories per round selector
    const categoriesSelect = screen.getByLabelText(/categories per round/i)
    expect(categoriesSelect).toBeInTheDocument()
    expect(categoriesSelect.tabIndex).not.toBe(-1)

    // Final Jeopardy fields
    expect(screen.getByLabelText(/final jeopardy category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/final jeopardy clue/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/final jeopardy solution/i)).toBeInTheDocument()
  })
})

describe('Accessibility: Focus management on section add (Req 11.6)', () => {
  it('round sections have data-round-index attributes for focus targeting', () => {
    const formState = generateEmptyFormState(2, 1)
    const { container } = render(
      <BuilderForm {...defaultFormProps} formState={formState} />
    )

    const roundSections = container.querySelectorAll('[data-round-index]')
    expect(roundSections.length).toBe(2)
    expect(roundSections[0].getAttribute('data-round-index')).toBe('0')
    expect(roundSections[1].getAttribute('data-round-index')).toBe('1')
  })

  it('category sections have data-category-index attributes for focus targeting', () => {
    const formState = generateEmptyFormState(1, 3)
    const { container } = render(
      <BuilderForm {...defaultFormProps} formState={formState} />
    )

    const categorySections = container.querySelectorAll('[data-category-index]')
    expect(categorySections.length).toBe(3)
    expect(categorySections[0].getAttribute('data-category-index')).toBe('0')
    expect(categorySections[1].getAttribute('data-category-index')).toBe('1')
    expect(categorySections[2].getAttribute('data-category-index')).toBe('2')
  })
})

describe('Accessibility: Focus trap in ExitGuardDialog (Req 11.4)', () => {
  it('traps focus within ExitGuardDialog on forward Tab', () => {
    render(
      <ExitGuardDialog
        isOpen={true}
        onCancel={vi.fn()}
        onSaveAndExit={vi.fn()}
        onExitWithoutSaving={vi.fn()}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(3)

    // Focus the last button
    const lastButton = buttons[buttons.length - 1]
    lastButton.focus()
    expect(document.activeElement).toBe(lastButton)

    // Dispatch Tab keydown — focus trap should wrap to first button
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('traps focus within ExitGuardDialog on Shift+Tab', () => {
    render(
      <ExitGuardDialog
        isOpen={true}
        onCancel={vi.fn()}
        onSaveAndExit={vi.fn()}
        onExitWithoutSaving={vi.fn()}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(3)

    // Focus the first button
    const firstButton = buttons[0]
    firstButton.focus()
    expect(document.activeElement).toBe(firstButton)

    // Dispatch Shift+Tab keydown — focus trap should wrap to last button
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
  })
})

describe('Accessibility: Focus restoration on dialog dismiss (Req 11.5)', () => {
  it('when dialog opens, first button receives focus', () => {
    render(
      <ExitGuardDialog
        isOpen={true}
        onCancel={vi.fn()}
        onSaveAndExit={vi.fn()}
        onExitWithoutSaving={vi.fn()}
      />
    )

    const buttons = screen.getAllByRole('button')
    // The first focusable button should have focus when the dialog opens
    expect(document.activeElement).toBe(buttons[0])
  })
})

describe('Accessibility: ARIA label associations (Req 11.2)', () => {
  it('ClueRow inputs have associated labels', () => {
    render(
      <ClueRow
        roundIndex={0}
        categoryIndex={0}
        clueIndex={0}
        roundName="Single"
        categoryName="History"
        clue={{ value: '', clue: '', solution: '', dailyDouble: false }}
        errors={{}}
        onFieldChange={vi.fn()}
        onBlurValue={vi.fn()}
      />
    )

    // Each input should have an associated label via htmlFor
    expect(screen.getByLabelText(/clue 1 value/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/clue 1 clue text/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/clue 1 solution/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/clue 1 daily double/i)).toBeInTheDocument()
  })

  it('FinalJeopardySection inputs have associated labels', () => {
    render(
      <FinalJeopardySection
        finalRound={{ category: '', clue: '', solution: '' }}
        errors={{}}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText(/final jeopardy category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/final jeopardy clue/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/final jeopardy solution/i)).toBeInTheDocument()
  })

  it('BuilderForm game name input has associated label', () => {
    render(<BuilderForm {...defaultFormProps} />)

    expect(screen.getByLabelText(/game name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/number of rounds/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/categories per round/i)).toBeInTheDocument()
  })
})
