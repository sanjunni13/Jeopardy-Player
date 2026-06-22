// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OptionsMenu } from './OptionsMenu'

describe('OptionsMenu', () => {
  const defaultProps = {
    open: false,
    onOpenChange: vi.fn(),
    onSwap: vi.fn(),
    onDelete: vi.fn(),
    categoryName: 'Category 1',
  }

  it('renders a trigger button with Options label (Req 3.1)', () => {
    render(<OptionsMenu {...defaultProps} />)

    const trigger = screen.getByRole('button', { name: 'Options for category Category 1' })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute('title', 'Options')
  })

  it('displays "Swap Categories" and "Delete Category" items when open (Req 3.2)', () => {
    render(<OptionsMenu {...defaultProps} open={true} />)

    expect(screen.getByRole('menuitem', { name: 'Swap Categories' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete Category' })).toBeInTheDocument()
  })

  it('does not show menu items when closed', () => {
    render(<OptionsMenu {...defaultProps} open={false} />)

    expect(screen.queryByRole('menuitem', { name: 'Swap Categories' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete Category' })).not.toBeInTheDocument()
  })

  it('calls onSwap when "Swap Categories" is selected (Req 3.3)', () => {
    const onSwap = vi.fn()
    render(<OptionsMenu {...defaultProps} open={true} onSwap={onSwap} />)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Swap Categories' }))

    expect(onSwap).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete when "Delete Category" is selected (Req 3.5)', () => {
    const onDelete = vi.fn()
    render(<OptionsMenu {...defaultProps} open={true} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Category' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('"Delete Category" item has destructive styling (Req 3.5)', () => {
    render(<OptionsMenu {...defaultProps} open={true} />)

    const deleteItem = screen.getByRole('menuitem', { name: 'Delete Category' })
    expect(deleteItem.className).toContain('text-destructive')
  })

  it('closes the menu when Escape is pressed (Req 3.7, 13.3)', () => {
    const onOpenChange = vi.fn()
    render(<OptionsMenu {...defaultProps} open={true} onOpenChange={onOpenChange} />)

    expect(screen.getByRole('menuitem', { name: 'Swap Categories' })).toBeInTheDocument()

    // Press Escape on the menu
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders the trigger with correct aria attributes for controlled state', () => {
    render(<OptionsMenu {...defaultProps} open={false} />)

    const trigger = screen.getByRole('button', { name: 'Options for category Category 1' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  })
})
