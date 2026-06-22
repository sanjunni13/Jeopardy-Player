// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PointValueDialog } from './PointValueDialog'

function renderDialog(overrides: Partial<React.ComponentProps<typeof PointValueDialog>> = {}) {
  const defaultProps = {
    currentValue: 400,
    rowIndex: 1,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  const result = render(<PointValueDialog {...defaultProps} />)
  return { ...result, ...defaultProps }
}

describe('PointValueDialog', () => {
  it('renders as a dialog with correct aria-label', () => {
    renderDialog({ rowIndex: 2 })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Edit point value for row 3')
  })

  it('pre-populates the input with the current value', () => {
    renderDialog({ currentValue: 800 })
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    expect(input.value).toBe('800')
  })

  it('shows confirm and cancel buttons', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', () => {
    const { onCancel } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm with numeric value when confirm is clicked with valid input', () => {
    const { onConfirm } = renderDialog({ currentValue: 200 })
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '600' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledWith(600)
  })

  it('disables confirm button when input is empty', () => {
    renderDialog()
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('disables confirm button when value is less than 1', () => {
    renderDialog()
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('disables confirm button when value is a non-integer', () => {
    renderDialog()
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '3.5' } })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('shows inline error message for invalid value', () => {
    renderDialog()
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '-5' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert').textContent).toContain('at least 1')
  })

  it('does not show error for valid value', () => {
    renderDialog({ currentValue: 100 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('calls onConfirm on Enter key when value is valid', () => {
    const { onConfirm } = renderDialog({ currentValue: 500 })
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith(500)
  })

  it('calls onCancel on Escape key', () => {
    const { onCancel } = renderDialog()
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when backdrop is clicked', () => {
    const { onCancel } = renderDialog()
    const backdrop = screen.getByRole('dialog')
    fireEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel when dialog panel is clicked', () => {
    const { onCancel } = renderDialog()
    const title = screen.getByText('Edit Point Value')
    fireEvent.click(title)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('sets aria-invalid on input when error is present', () => {
    renderDialog()
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '0' } })
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('enables confirm button with valid value after fixing invalid input', () => {
    renderDialog()
    const input = screen.getByLabelText('Point Value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.change(input, { target: { value: '100' } })
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled()
  })
})
