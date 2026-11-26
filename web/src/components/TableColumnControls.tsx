import type { ReactNode } from 'react'
import type { Table as TanStackTable } from '@tanstack/react-table'
import { Check, ChevronDown, ChevronUp, ChevronsUpDown, EyeOff, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export type SortDirection = 'asc' | 'desc' | false

export interface ColumnHeaderMenuProps {
  title: ReactNode
  sortable?: boolean
  sortDirection?: SortDirection
  onSortChange?: (next: SortDirection) => void
  hideable?: boolean
  onHide?: () => void
  align?: 'start' | 'center' | 'end'
  className?: string
}

export function ColumnHeaderMenu({
  title,
  sortable = false,
  sortDirection = false,
  onSortChange,
  hideable = false,
  onHide,
  align = 'start',
  className,
}: ColumnHeaderMenuProps) {
  const canSort = Boolean(sortable)
  const canHide = Boolean(hideable && onHide)

  if (!canSort && !canHide) {
    return <span className={className}>{title}</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            '-ml-1.5 inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent',
            className,
          )}
        >
          <span className="truncate">{title}</span>
          {canSort && (
            sortDirection === 'asc'
              ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              : sortDirection === 'desc'
                ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                : <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-32">
        {canSort && (
          <>
            <DropdownMenuItem
              role="menuitemcheckbox"
              aria-checked={sortDirection === 'asc'}
              onSelect={() => onSortChange?.(sortDirection === 'asc' ? false : 'asc')}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>升序</span>
              <Check
                className={cn(
                  'ml-auto size-4 shrink-0 text-foreground',
                  sortDirection === 'asc' ? 'opacity-100' : 'opacity-0',
                )}
                aria-hidden="true"
              />
            </DropdownMenuItem>
            <DropdownMenuItem
              role="menuitemcheckbox"
              aria-checked={sortDirection === 'desc'}
              onSelect={() => onSortChange?.(sortDirection === 'desc' ? false : 'desc')}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>降序</span>
              <Check
                className={cn(
                  'ml-auto size-4 shrink-0 text-foreground',
                  sortDirection === 'desc' ? 'opacity-100' : 'opacity-0',
                )}
                aria-hidden="true"
              />
            </DropdownMenuItem>
          </>
        )}
        {canHide && (
          <DropdownMenuItem
            onSelect={() => onHide?.()}
            className="flex items-center gap-2 px-2 py-1.5 text-sm"
          >
            <EyeOff className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>隐藏</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface ViewColumnOption {
  id: string
  label: string
  visible: boolean
  disabled?: boolean
}

export interface DataTableViewOptionsBaseProps {
  label?: string
  align?: 'start' | 'center' | 'end'
  className?: string
}

export interface ManualDataTableViewOptionsProps extends DataTableViewOptionsBaseProps {
  columns: ViewColumnOption[]
  onToggle: (columnId: string, nextVisible: boolean) => void
  table?: never
  labels?: never
}

export interface TanStackDataTableViewOptionsProps<TData> extends DataTableViewOptionsBaseProps {
  table: TanStackTable<TData>
  labels?: Record<string, string>
  columns?: never
  onToggle?: never
}

export type DataTableViewOptionsProps<TData = unknown> =
  | ManualDataTableViewOptionsProps
  | TanStackDataTableViewOptionsProps<TData>

function isSystemColumn(id: string): boolean {
  return id === 'select' || id === 'actions'
}

export function getTanStackViewColumns<TData>(
  table: TanStackTable<TData>,
  labels?: Record<string, string>,
): ViewColumnOption[] {
  return table
    .getAllLeafColumns()
    .filter(column => !isSystemColumn(column.id) && column.getCanHide())
    .map(column => {
      const metaLabel = (column.columnDef.meta as { label?: string } | undefined)?.label
      const headerLabel = typeof column.columnDef.header === 'string' ? column.columnDef.header : undefined
      return {
        id: column.id,
        label: labels?.[column.id] ?? metaLabel ?? headerLabel ?? column.id,
        visible: column.getIsVisible(),
      }
    })
}

export function DataTableViewOptions<TData = unknown>(props: DataTableViewOptionsProps<TData>) {
  const { label, align = 'end', className } = props
  const resolvedColumns = 'table' in props && props.table
    ? getTanStackViewColumns(props.table, props.labels)
    : props.columns
  const handleToggle = 'table' in props && props.table
    ? (columnId: string, nextVisible: boolean) => {
        props.table.getColumn(columnId)?.toggleVisibility(nextVisible)
      }
    : props.onToggle

  if (!resolvedColumns.length) return null

  const lockedVisibleCount = 'table' in props && props.table
    ? props.table
        .getVisibleLeafColumns()
        .filter(column => !isSystemColumn(column.id) && !column.getCanHide())
        .length
    : 0
  const totalVisibleCount = resolvedColumns.filter(col => col.visible).length + lockedVisibleCount

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="切换显示列"
          className={cn('h-8 gap-1.5 rounded-lg px-2.5 text-sm font-medium', className)}
        >
          <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>{label ?? '视图'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-44 p-0">
        <Command className="p-0.5">
          <CommandInput aria-label="搜索列" placeholder="搜索列…" className="h-8 text-sm" />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">未找到匹配的列</CommandEmpty>
            <CommandGroup className="p-1">
              {resolvedColumns.map(col => {
                const isLastVisible = col.visible && totalVisibleCount <= 1
                const isDisabled = Boolean(col.disabled) || isLastVisible
                return (
                  <CommandItem
                    key={col.id}
                    value={col.label}
                    disabled={isDisabled}
                    onSelect={() => {
                      if (!isDisabled) handleToggle(col.id, !col.visible)
                    }}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm"
                  >
                    <span className="truncate">{col.label}</span>
                    <Check
                      className={cn(
                        'ml-auto size-4 shrink-0 text-foreground',
                        col.visible ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
