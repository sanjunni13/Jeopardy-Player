// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ClueEditorModal } from './ClueEditorModal'
import type { ClueFormState, MediaAttachment } from '../../utils/builderFormStructure'

const baseClue: ClueFormState = {
  value: '400',
  clue: 'What is the capital of France?',
  solution: 'Paris',
  dailyDouble: false,
}

const emptyClue: ClueFormState = {
  value: '',
  clue: '',
  solution: '',
  dailyDouble: false,
}

describe('ClueEditorModal', () => {
  it('renders with dialog role and aria-modal', () => {
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={400}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('displays the read-only point value', () => {
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={800}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('$800')).toBeInTheDocument()
  })

  it('renders clue text textarea with existing value', () => {
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={400}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const textarea = screen.getByLabelText('Clue') as HTMLTextAreaElement
    expect(textarea.value).toBe('What is the capital of France?')
  })

  it('renders solution text textarea with existing value', () => {
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={400}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const textarea = screen.getByLabelText('Solution') as HTMLTextAreaElement
    expect(textarea.value).toBe('Paris')
  })

  it('renders daily double checkbox unchecked by default', () => {
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={400}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const checkbox = screen.getByLabelText('Daily Double') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('renders daily double checkbox checked when clue has dailyDouble=true', () => {
    render(
      <ClueEditorModal
        clue={{ ...baseClue, dailyDouble: true }}
        pointValue={400}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const checkbox = screen.getByLabelText('Daily Double') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={400}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onSave with updated clue and media when Save is clicked', () => {
    const onSave = vi.fn()
    render(
      <ClueEditorModal
        clue={emptyClue}
        pointValue={200}
        mediaAttachments={[]}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    )

    // Edit fields
    fireEvent.change(screen.getByLabelText('Clue'), {
      target: { value: 'New clue text' },
    })
    fireEvent.change(screen.getByLabelText('Solution'), {
      target: { value: 'New solution' },
    })
    fireEvent.click(screen.getByLabelText('Daily Double'))

    fireEvent.click(screen.getByText('Save'))

    expect(onSave).toHaveBeenCalledTimes(1)
    const [savedClue, savedMedia] = onSave.mock.calls[0]
    expect(savedClue.clue).toBe('New clue text')
    expect(savedClue.solution).toBe('New solution')
    expect(savedClue.dailyDouble).toBe(true)
    expect(savedMedia).toEqual([])
  })

  it('shows YouTube validation error for invalid URL on save', () => {
    render(
      <ClueEditorModal
        clue={emptyClue}
        pointValue={200}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('YouTube URL'), {
      target: { value: 'not-a-youtube-url' },
    })
    fireEvent.click(screen.getByText('Save'))

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('does not call onSave when YouTube URL is invalid', () => {
    const onSave = vi.fn()
    render(
      <ClueEditorModal
        clue={emptyClue}
        pointValue={200}
        mediaAttachments={[]}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('YouTube URL'), {
      target: { value: 'invalid-url' },
    })
    fireEvent.click(screen.getByText('Save'))

    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves YouTube URL as media attachment when valid', () => {
    const onSave = vi.fn()
    render(
      <ClueEditorModal
        clue={emptyClue}
        pointValue={200}
        mediaAttachments={[]}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('YouTube URL'), {
      target: { value: 'https://youtube.com/watch?v=abc123' },
    })
    fireEvent.click(screen.getByText('Save'))

    expect(onSave).toHaveBeenCalledTimes(1)
    const [, savedMedia] = onSave.mock.calls[0]
    expect(savedMedia).toContainEqual({
      type: 'youtube',
      url: 'https://youtube.com/watch?v=abc123',
    })
  })

  it('pre-populates YouTube URL from existing media attachments', () => {
    const media: MediaAttachment[] = [
      { type: 'youtube', url: 'https://youtu.be/existing123' },
    ]
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={400}
        mediaAttachments={media}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const input = screen.getByLabelText('YouTube URL') as HTMLInputElement
    expect(input.value).toBe('https://youtu.be/existing123')
  })

  it('renders image and audio file inputs', () => {
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={400}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/Image/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Audio/)).toBeInTheDocument()
  })

  it('calls onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn()
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={400}
        mediaAttachments={[]}
        onSave={vi.fn()}
        onCancel={onCancel}
      />
    )
    // Click the backdrop (dialog element itself)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows media attachment indicator for existing image', () => {
    const media: MediaAttachment[] = [
      { type: 'image', url: 'http://example.com/image.png', filename: 'photo.png' },
    ]
    render(
      <ClueEditorModal
        clue={baseClue}
        pointValue={400}
        mediaAttachments={media}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('✓ photo.png')).toBeInTheDocument()
  })
})
