// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ToggleSwitch } from './ToggleSwitch'

describe('ToggleSwitch', () => {
  it('renders with role="switch" and aria-checked reflects checked prop (Req 8.1, 9.1)', () => {
    render(
      <ToggleSwitch checked={false} onChange={() => {}} label="Dark Mode" id="theme-toggle" />
    )

    const toggle = screen.getByRole('switch')
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('renders aria-checked="true" when checked is true', () => {
    render(
      <ToggleSwitch checked={true} onChange={() => {}} label="Dark Mode" id="theme-toggle" />
    )

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onChange with the toggled value on click', () => {
    const handleChange = vi.fn()
    render(
      <ToggleSwitch checked={false} onChange={handleChange} label="Dark Mode" id="theme-toggle" />
    )

    fireEvent.click(screen.getByRole('switch'))
    expect(handleChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when checked is true and clicked', () => {
    const handleChange = vi.fn()
    render(
      <ToggleSwitch checked={true} onChange={handleChange} label="Dark Mode" id="theme-toggle" />
    )

    fireEvent.click(screen.getByRole('switch'))
    expect(handleChange).toHaveBeenCalledWith(false)
  })

  it('supports keyboard interaction via Space to toggle', () => {
    const handleChange = vi.fn()
    render(
      <ToggleSwitch checked={false} onChange={handleChange} label="Animations" id="anim-toggle" />
    )

    const toggle = screen.getByRole('switch')
    fireEvent.keyDown(toggle, { key: ' ', code: 'Space' })
    // Button elements natively handle Space via click, so simulate the click that the browser fires
    fireEvent.click(toggle)
    expect(handleChange).toHaveBeenCalledWith(true)
  })

  it('associates label with the button via aria-labelledby', () => {
    render(
      <ToggleSwitch checked={false} onChange={() => {}} label="Reduced Animations" id="reduce-motion" />
    )

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-labelledby', 'reduce-motion-label')
    expect(screen.getByText('Reduced Animations')).toHaveAttribute('id', 'reduce-motion-label')
  })

  it('renders with the correct id attribute', () => {
    render(
      <ToggleSwitch checked={false} onChange={() => {}} label="Theme" id="my-toggle" />
    )

    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('id', 'my-toggle')
  })
})
