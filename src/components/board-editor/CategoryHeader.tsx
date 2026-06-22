import { useState, useRef, useCallback, type KeyboardEvent, type FocusEvent } from 'react'

export interface CategoryHeaderProps {
  categoryIndex: number
  name: string
  isDefault: boolean
  onNameChange: (name: string) => void
  onOptionsOpen: () => void
  dragHandleProps: Record<string, unknown>  // from @dnd-kit useSortable
}

export function CategoryHeader({
  categoryIndex,
  name,
  isDefault,
  onNameChange,
  onOptionsOpen,
  dragHandleProps,
}: CategoryHeaderProps) {
  // Track whether we are actively editing — if not, the input shows the prop value directly
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // The displayed value: use local editValue only while editing, otherwise use the prop
  const displayValue = isEditing ? editValue : name

  const commitName = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== name) {
      onNameChange(trimmed)
    }
    setIsEditing(false)
  }, [editValue, name, onNameChange])

  const handleFocus = useCallback(() => {
    setEditValue(name)
    setIsEditing(true)
    // Select all text on focus for easy replacement
    setTimeout(() => {
      inputRef.current?.select()
    }, 0)
  }, [name])

  const handleBlur = useCallback((_e: FocusEvent<HTMLInputElement>) => {
    commitName()
  }, [commitName])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitName()
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
      inputRef.current?.blur()
    }
  }, [commitName])

  return (
    <div
      className="flex items-center gap-1 min-h-[44px] px-2 py-1 bg-muted/50 rounded border border-border"
      data-testid={`category-header-${categoryIndex}`}
    >
      {/* Drag handle — grid icon */}
      <button
        type="button"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
        aria-label={`Drag to reorder category ${name}`}
        {...dragHandleProps}
      >
        <span aria-hidden="true" className="text-lg leading-none">⠿</span>
      </button>

      {/* Inline-editable category name */}
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={(e) => setEditValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`flex-1 min-w-0 px-1 py-0.5 text-sm font-medium rounded transition-colors truncate ${
          isEditing
            ? 'bg-background border border-ring outline-none'
            : 'bg-transparent border border-transparent hover:border-border cursor-pointer'
        } ${isDefault ? 'text-muted-foreground italic' : 'text-foreground'}`}
        aria-label={`Category ${categoryIndex + 1} name`}
      />

      {/* Three-dot options icon */}
      <button
        type="button"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
        title="Options"
        aria-label={`Options for category ${name}`}
        onClick={onOptionsOpen}
      >
        <span aria-hidden="true" className="text-lg leading-none">⋮</span>
      </button>
    </div>
  )
}

export default CategoryHeader
