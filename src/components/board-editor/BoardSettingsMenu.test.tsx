// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { BoardSettingsMenu } from './BoardSettingsMenu'

/**
 * Radix DropdownMenu requires pointer events to open.
 * We simulate a full pointerdown + click sequence to properly trigger it.
 */
function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Board Settings' })
  act(() => {
    fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 })
    fireEvent.click(trigger)
  })
}

describe('BoardSettingsMenu', () => {
  const defaultProps = {
    onDeleteBoard: vi.fn(),
    onDownloadJSON: vi.fn(),
  }

  it('renders a gear icon trigger with title "Board Settings" (Req 1.9)', () => {
    render(<BoardSettingsMenu {...defaultProps} />)

    const trigger = screen.getByRole('button', { name: 'Board Settings' })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute('title', 'Board Settings')
  })

  it('displays dropdown with "Delete Board" and "Download JSON Template" when triggered (Req 4.1, 4.2)', () => {
    render(<BoardSettingsMenu {...defaultProps} />)

    openMenu()

    expect(screen.getByRole('menuitem', { name: 'Delete Board' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Download JSON Template' })).toBeInTheDocument()
  })

  it('calls onDownloadJSON when "Download JSON Template" is selected', () => {
    const onDownloadJSON = vi.fn()
    render(<BoardSettingsMenu {...defaultProps} onDownloadJSON={onDownloadJSON} />)

    openMenu()

    const item = screen.getByRole('menuitem', { name: 'Download JSON Template' })
    act(() => {
      fireEvent.click(item)
    })

    expect(onDownloadJSON).toHaveBeenCalledTimes(1)
  })

  it('calls onDeleteBoard when "Delete Board" is selected', () => {
    const onDeleteBoard = vi.fn()
    render(<BoardSettingsMenu {...defaultProps} onDeleteBoard={onDeleteBoard} />)

    openMenu()

    const item = screen.getByRole('menuitem', { name: 'Delete Board' })
    act(() => {
      fireEvent.click(item)
    })

    expect(onDeleteBoard).toHaveBeenCalledTimes(1)
  })

  it('"Delete Board" item has destructive styling', () => {
    render(<BoardSettingsMenu {...defaultProps} />)

    openMenu()

    const deleteItem = screen.getByRole('menuitem', { name: 'Delete Board' })
    expect(deleteItem.className).toContain('text-destructive')
  })

  it('closes the menu when Escape is pressed (Req 4.7)', () => {
    render(<BoardSettingsMenu {...defaultProps} />)

    openMenu()

    expect(screen.getByRole('menuitem', { name: 'Delete Board' })).toBeInTheDocument()

    // Press Escape on the menu content
    act(() => {
      fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' })
    })

    expect(screen.queryByRole('menuitem', { name: 'Delete Board' })).not.toBeInTheDocument()
  })
})
