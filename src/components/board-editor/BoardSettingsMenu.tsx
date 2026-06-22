import { DropdownMenu } from 'radix-ui'

export interface BoardSettingsMenuProps {
  onDeleteBoard: () => void
  onDownloadJSON: () => void
}

/**
 * Board-level settings dropdown triggered by a gear icon.
 * Renders "Delete Board" (destructive) and "Download JSON Template" items.
 * Uses Radix DropdownMenu which handles focus trap, Escape, and outside click automatically.
 *
 * Validates: Requirements 4.1, 4.2, 4.7, 1.7, 1.9
 */
export function BoardSettingsMenu({ onDeleteBoard, onDownloadJSON }: BoardSettingsMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 rounded transition-colors"
          title="Board Settings"
          aria-label="Board Settings"
        >
          <span aria-hidden="true" className="text-lg leading-none">⚙</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
          sideOffset={5}
          align="end"
        >
          <DropdownMenu.Item
            className="flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onSelect={onDownloadJSON}
          >
            Download JSON Template
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            className="flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
            onSelect={onDeleteBoard}
          >
            Delete Board
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default BoardSettingsMenu
