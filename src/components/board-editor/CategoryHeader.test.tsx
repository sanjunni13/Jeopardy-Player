// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryHeader } from './CategoryHeader'

function renderHeader(overrides: Partial<React.ComponentProps<typeof CategoryHeader>> = {}) {
  const defaultProps = {
    categoryIndex: 0,
    name: 'Science',
    isDefault: false,
    onNameChange: vi.fn(),
    onOptionsOpen: vi.fn(),
    dragHandleProps: { 'data-testid': 'drag-handle-props' },
  }
  const props = { ...defaultProps, ...overrides }
  const result = render(<CategoryHeader {...props} />)
  return { ...result, props }
}

describe('CategoryHeader', () => {
  it('renders the category name in the input', () => {
    renderHeader({ name: 'History' })
    const input = screen.getByLabelText('Category 1 name')
    expect(input).toHaveValue('History')
  })

  it('renders the drag handle with proper aria-label', () => {
    renderHeader({ name: 'Geography' })
    const handle = screen.getByLabelText('Drag to reorder category Geography')
    expect(handle).toBeInTheDocument()
  })

  it('spreads dragHandleProps onto the drag handle element', () => {
    renderHeader({ dragHandleProps: { 'data-testid': 'my-handle' } })
    const handle = screen.getByTestId('my-handle')
    expect(handle).toBeInTheDocument()
  })

  it('renders the three-dot options button with title tooltip', () => {
    renderHeader({ name: 'Music' })
    const optionsBtn = screen.getByTitle('Options')
    expect(optionsBtn).toBeInTheDocument()
  })

  it('fires onOptionsOpen when three-dot icon is clicked', () => {
    const onOptionsOpen = vi.fn()
    renderHeader({ onOptionsOpen })
    const optionsBtn = screen.getByTitle('Options')
    fireEvent.click(optionsBtn)
    expect(onOptionsOpen).toHaveBeenCalledTimes(1)
  })

  it('fires onNameChange on blur with new value', () => {
    const onNameChange = vi.fn()
    renderHeader({ name: 'Science', onNameChange })
    const input = screen.getByLabelText('Category 1 name')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Physics' } })
    fireEvent.blur(input)
    expect(onNameChange).toHaveBeenCalledWith('Physics')
  })

  it('fires onNameChange on Enter key with new value', () => {
    const onNameChange = vi.fn()
    renderHeader({ name: 'Science', onNameChange })
    const input = screen.getByLabelText('Category 1 name')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Chemistry' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNameChange).toHaveBeenCalledWith('Chemistry')
  })

  it('does not fire onNameChange if value is unchanged on blur', () => {
    const onNameChange = vi.fn()
    renderHeader({ name: 'Science', onNameChange })
    const input = screen.getByLabelText('Category 1 name')
    fireEvent.focus(input)
    fireEvent.blur(input)
    expect(onNameChange).not.toHaveBeenCalled()
  })

  it('reverts to original name on Escape key', () => {
    const onNameChange = vi.fn()
    renderHeader({ name: 'Science', onNameChange })
    const input = screen.getByLabelText('Category 1 name')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Something else' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onNameChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('Science')
  })

  it('does not fire onNameChange if input is empty on blur', () => {
    const onNameChange = vi.fn()
    renderHeader({ name: 'Science', onNameChange })
    const input = screen.getByLabelText('Category 1 name')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onNameChange).not.toHaveBeenCalled()
    // Reverts to original
    expect(input).toHaveValue('Science')
  })

  it('applies italic styling when isDefault is true', () => {
    renderHeader({ isDefault: true, name: 'Category 1' })
    const input = screen.getByLabelText('Category 1 name')
    expect(input.className).toContain('italic')
  })

  it('does not apply italic styling when isDefault is false', () => {
    renderHeader({ isDefault: false, name: 'Custom Name' })
    const input = screen.getByLabelText('Category 1 name')
    expect(input.className).not.toContain('italic')
  })

  it('meets minimum 44px touch target on drag handle and options button', () => {
    renderHeader({ name: 'Test' })
    const handle = screen.getByLabelText('Drag to reorder category Test')
    const optionsBtn = screen.getByTitle('Options')
    expect(handle.className).toContain('min-h-[44px]')
    expect(handle.className).toContain('min-w-[44px]')
    expect(optionsBtn.className).toContain('min-h-[44px]')
    expect(optionsBtn.className).toContain('min-w-[44px]')
  })
})
