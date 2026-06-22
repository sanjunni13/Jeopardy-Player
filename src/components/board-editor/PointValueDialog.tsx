import { useState, useRef, useEffect, useCallback } from 'react'
import { validatePointValue } from '../../utils/builderValidation'
import './PointValueDialog.css'

export interface PointValueDialogProps {
  currentValue: number
  rowIndex: number
  onConfirm: (newValue: number) => void
  onCancel: () => void
}

/**
 * Small dialog for editing a point value row.
 * Styled consistently with the existing logout/delete dialogs.
 * Features inline validation, focus trap, and accessible labeling.
 */
export function PointValueDialog({
  currentValue,
  rowIndex,
  onConfirm,
  onCancel,
}: PointValueDialogProps) {
  const [inputValue, setInputValue] = useState<string>(String(currentValue))
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Validate on every change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)

    if (val.trim() === '') {
      setError('Point value is required')
    } else {
      setError(validatePointValue(val))
    }
  }, [])

  const isValid = error === null && inputValue.trim() !== ''

  const handleConfirm = useCallback(() => {
    if (!isValid) return
    const numericValue = Number(inputValue)
    onConfirm(numericValue)
  }, [isValid, inputValue, onConfirm])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && isValid) {
        e.preventDefault()
        handleConfirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    },
    [isValid, handleConfirm, onCancel]
  )

  // Focus trap: keep focus within the dialog
  const handleFocusTrap = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled])'
      )
      if (!focusableElements || focusableElements.length === 0) return

      const firstEl = focusableElements[0]
      const lastEl = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    },
    []
  )

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel()
      }
    },
    [onCancel]
  )

  const dialogLabelId = `point-value-dialog-title-${rowIndex}`

  return (
    <div
      className="logout-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogLabelId}
      aria-label={`Edit point value for row ${rowIndex + 1}`}
      onClick={handleBackdropClick}
      onKeyDown={handleFocusTrap}
    >
      <div
        className="logout-panel point-value-dialog"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id={dialogLabelId} className="logout-title">
          Edit Point Value
        </h2>
        <p className="logout-message">
          Set the point value for row {rowIndex + 1}. This value applies to all categories in the row.
        </p>

        <div className="point-value-dialog__input-group">
          <label
            htmlFor={`point-value-input-${rowIndex}`}
            className="point-value-dialog__label"
          >
            Point Value
          </label>
          <input
            ref={inputRef}
            id={`point-value-input-${rowIndex}`}
            type="number"
            min="1"
            step="1"
            className={`point-value-dialog__input ${error ? 'point-value-dialog__input--error' : ''}`}
            value={inputValue}
            onChange={handleChange}
            aria-invalid={!!error}
            aria-describedby={error ? `point-value-error-${rowIndex}` : undefined}
          />
          {error && (
            <p
              id={`point-value-error-${rowIndex}`}
              className="point-value-dialog__error"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

        <div className="logout-actions">
          <button
            type="button"
            className="logout-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="logout-btn-confirm point-value-dialog__confirm"
            onClick={handleConfirm}
            disabled={!isValid}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

export default PointValueDialog
