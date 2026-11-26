import { Fragment } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

export interface RowActionItem {
  key: string
  label: string
  onSelect: () => void
  disabled?: boolean
  destructive?: boolean
  separatorBefore?: boolean
}

export interface RowActionsMenuProps {
  ariaLabel?: string
  onEdit?: () => void
  editLabel?: string
  editDisabled?: boolean
  onDelete?: () => void
  deleteLabel?: string
  deleteDisabled?: boolean
  extraItems?: RowActionItem[]
  align?: 'start' | 'center' | 'end'
}

export function RowActionsMenu({
  ariaLabel,
  onEdit,
  editLabel,
  editDisabled,
  onDelete,
  deleteLabel,
  deleteDisabled,
  extraItems,
  align,
}: RowActionsMenuProps) {
  const items = extraItems ?? []
  if (!onEdit && !onDelete && items.length === 0) return null

  const hasBeforeDelete = Boolean(onEdit) || items.length > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ariaLabel ?? '更多操作'}
          className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 data-[state=open]:bg-accent data-[state=open]:text-foreground"
          onClick={e => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align ?? 'end'} className="w-36" onClick={e => e.stopPropagation()}>
        {onEdit && (
          <DropdownMenuItem disabled={editDisabled} onSelect={() => onEdit()}>
            {editLabel ?? '编辑'}
          </DropdownMenuItem>
        )}
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {item.separatorBefore && (onEdit || index > 0) && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={item.disabled}
              variant={item.destructive ? 'destructive' : 'default'}
              onSelect={() => item.onSelect()}
            >
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
        {onDelete && (
          <>
            {hasBeforeDelete && <DropdownMenuSeparator />}
            <DropdownMenuItem disabled={deleteDisabled} onSelect={() => onDelete()}>
              {deleteLabel ?? '删除'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
