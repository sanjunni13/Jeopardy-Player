import { DropdownMenu } from 'radix-ui'

export interface OptionsMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSwap: () => void
  onDelete: () => void
  categoryName: string
}

/**
 * Category options dropdown menu.
 * Renders "Swap Categories" and "Delete Category" items.
 * Uses Radix DropdownMenu for built-in focus trap, Escape handling, and outside click dismissal.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.7, 13.3
 */
export function OptionsMenu({
  open,
  onOpenChange,
  onSwap,
  onDelete,
  categoryName,
}: OptionsMenuProps) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 rounded transition-colors"
          title="Options"
          aria-label={`Options for category ${categoryName}`}
        >
          <span aria-hidden="true" className="text-lg leading-none">⋮</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
          sideOffset={4}
          align="end"
        >
          <DropdownMenu.Item
            className="flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onSelect={onSwap}
          >
            Swap Categories
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            className="flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
            onSelect={onDelete}
          >
            Delete Category
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default OptionsMenu
