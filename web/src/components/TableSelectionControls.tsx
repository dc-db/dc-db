import type { JSX, ReactNode } from 'react'
import type { ColumnDef, Row, Table as TanStackTable } from '@tanstack/react-table'
import { LoaderCircle, Trash2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'

export interface RowIndexSelectHeaderProps {
  checked: boolean | 'indeterminate'
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  ariaLabel?: string
}

export function RowIndexSelectHeader({
  checked,
  disabled = false,
  onCheckedChange,
  ariaLabel = '全选当前页',
}: RowIndexSelectHeaderProps): JSX.Element {
  return (
    <div
      className="flex items-center justify-center"
      onClick={event => event.stopPropagation()}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={value => onCheckedChange(value === true)}
        aria-label={ariaLabel}
      />
    </div>
  )
}

export interface RowIndexSelectCellProps {
  rowNumber: number
  selected: boolean
  disabled?: boolean
  onToggle: (checked: boolean) => void
  ariaLabel?: string
}

export function RowIndexSelectCell({
  rowNumber,
  selected,
  disabled = false,
  onToggle,
  ariaLabel,
}: RowIndexSelectCellProps): JSX.Element {
  return (
    <div
      className="group/select-cell relative mx-auto flex h-8 w-full min-w-8 items-center justify-center"
      onClick={event => event.stopPropagation()}
    >
      <span
        aria-hidden="true"
        className={cn(
          'text-xs tabular-nums text-muted-foreground select-none transition-opacity',
          selected
            ? 'opacity-0 pointer-events-none'
            : disabled
              ? 'opacity-100'
              : 'opacity-100 group-hover/select-cell:opacity-0 group-focus-within/select-cell:opacity-0',
        )}
      >
        {rowNumber}
      </span>
      {(!disabled || selected) && (
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity',
            selected
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none group-hover/select-cell:opacity-100 group-hover/select-cell:pointer-events-auto group-focus-within/select-cell:opacity-100 group-focus-within/select-cell:pointer-events-auto',
          )}
        >
          <Checkbox
            checked={selected}
            disabled={disabled}
            onCheckedChange={value => onToggle(value === true)}
            aria-label={ariaLabel ?? `选择第 ${rowNumber} 行`}
          />
        </span>
      )}
    </div>
  )
}

export interface BulkActionBarProps {
  count: number
  unit?: string
  onClear: () => void
  onExport?: () => void
  exportLabel?: string
  onDelete?: () => void
  deleteLabel?: string
  deleteDisabled?: boolean
  deleting?: boolean
  extraActions?: ReactNode
}

export function BulkActionBar({
  count,
  unit = '项',
  onClear,
  onExport,
  exportLabel = '导出',
  onDelete,
  deleteLabel = '删除',
  deleteDisabled = false,
  deleting = false,
  extraActions,
}: BulkActionBarProps): JSX.Element | null {
  if (count <= 0) return null

  const hasActions = Boolean(extraActions || onExport || onDelete)

  return (
    <div
      role="region"
      aria-label="批量操作栏"
      className="bulk-bar fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-xl ring-1 ring-foreground/10"
    >
      <div className="inline-flex h-7 items-center rounded-md border border-border bg-muted/50 text-xs font-medium text-muted-foreground">
        <span className="whitespace-nowrap px-2.5 tabular-nums">
          已选择 <strong className="font-semibold text-foreground">{count}</strong> {unit}
        </span>
        <button
          type="button"
          className="inline-flex h-full items-center justify-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="清空已选"
          title="清空已选"
          onClick={onClear}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {hasActions && <div className="h-4 w-px bg-border" aria-hidden="true" />}
      {extraActions}
      {onExport && (
        <Button type="button" size="sm" variant="outline" onClick={onExport}>
          <Upload className="size-4" aria-hidden="true" />
          {exportLabel}
        </Button>
      )}
      {onDelete && (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={deleteDisabled || deleting}
          onClick={onDelete}
        >
          {deleting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
          {deleteLabel}
        </Button>
      )}
    </div>
  )
}

export interface RowSelectionColumnOptions<TData> {
  /** Base offset for row numbers (e.g. (page - 1) * pageSize for server/external pagination; if omitted, uses TanStack table pagination state). */
  getRowNumber?: (row: Row<TData>, index: number, table: TanStackTable<TData>) => number
  isRowSelectable?: (row: TData) => boolean
  selectAllLabel?: string
  getRowLabel?: (row: TData, rowNumber: number) => string
}

export function createRowSelectionColumn<TData>(
  options?: RowSelectionColumnOptions<TData>,
): ColumnDef<TData, unknown> {
  const getRowNumber = options?.getRowNumber
  const isRowSelectable = options?.isRowSelectable
  const selectAllLabel = options?.selectAllLabel
  const getRowLabel = options?.getRowLabel

  return {
    id: 'select',
    size: 48,
    enableSorting: false,
    enableHiding: false,
    meta: {
      headerClassName:
        'sticky top-0 left-0 z-30 w-12 min-w-12 px-2 text-center bg-background [box-shadow:inset_-1px_0_0_var(--border),inset_0_-1px_0_var(--border)]',
      cellClassName:
        'group/select-cell sticky left-0 z-10 w-12 min-w-12 px-2 text-center bg-background transition-colors group-hover/row:bg-[var(--table-header-hover-opaque)] group-data-[state=selected]/row:bg-[var(--table-row-selected)]',
    },
    header: ({ table }) => {
      const pageRows = table.getRowModel().rows
      const selectableRows = pageRows.filter(
        row => row.getCanSelect() && (isRowSelectable ? isRowSelectable(row.original) : true),
      )

      let checked: boolean | 'indeterminate'
      if (isRowSelectable) {
        const allSelected =
          selectableRows.length > 0 && selectableRows.every(row => row.getIsSelected())
        const someSelected = selectableRows.some(row => row.getIsSelected())
        checked = allSelected ? true : someSelected ? 'indeterminate' : false
      } else {
        checked =
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
      }

      return (
        <RowIndexSelectHeader
          checked={checked}
          disabled={selectableRows.length === 0}
          ariaLabel={selectAllLabel}
          onCheckedChange={next => {
            if (isRowSelectable) {
              table.setRowSelection(prev => {
                const updated = { ...prev }
                for (const row of selectableRows) {
                  if (next) updated[row.id] = true
                  else delete updated[row.id]
                }
                return updated
              })
            } else {
              table.toggleAllPageRowsSelected(next)
            }
          }}
        />
      )
    },
    cell: ({ row, table }) => {
      const visibleRows = table.getRowModel().rows
      const foundIndex = visibleRows.findIndex(r => r.id === row.id)
      const displayIndex = foundIndex >= 0 ? foundIndex : row.index

      let rowNumber: number
      if (getRowNumber) {
        rowNumber = getRowNumber(row, displayIndex, table)
      } else {
        const pagination = table.getState().pagination
        const pageIndex = pagination?.pageIndex ?? 0
        const pageSize = pagination?.pageSize ?? 0
        const offset = pageIndex > 0 && pageSize > 0 ? pageIndex * pageSize : 0
        rowNumber = offset + displayIndex + 1
      }

      const canSelect =
        row.getCanSelect() && (isRowSelectable ? isRowSelectable(row.original) : true)

      return (
        <RowIndexSelectCell
          rowNumber={rowNumber}
          selected={row.getIsSelected()}
          disabled={!canSelect}
          onToggle={checked => row.toggleSelected(checked)}
          ariaLabel={getRowLabel ? getRowLabel(row.original, rowNumber) : undefined}
        />
      )
    },
  }
}
