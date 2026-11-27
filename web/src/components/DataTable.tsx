import type { MouseEvent, ReactNode } from 'react'
import { flexRender, type Table as TanStackTable } from '@tanstack/react-table'
import { LoaderCircle } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { ColumnHeaderMenu } from './TableColumnControls'
import { TablePager } from './TablePager'

interface Props<T> {
  table: TanStackTable<T>
  loading?: boolean
  emptyMessage?: ReactNode
  showPager?: boolean
  pagerExtra?: ReactNode
  pagerUnit?: string
  allowColumnHiding?: boolean
  onRowClick?: (row: T, event: MouseEvent<HTMLTableRowElement>) => void
  rowClassName?: (row: T) => string | undefined
  className?: string
  containerClassName?: string
}

function isSystemColumn(id: string): boolean {
  return id === 'select' || id === 'actions'
}

export function DataTable<T>({
  table,
  loading = false,
  emptyMessage = '暂无数据',
  showPager = true,
  pagerExtra,
  pagerUnit,
  allowColumnHiding = true,
  onRowClick,
  rowClassName,
  className,
  containerClassName,
}: Props<T>) {
  const visibleLeafColumns = table.getVisibleLeafColumns()
  const columnCount = visibleLeafColumns.length || 1
  const visibleDataColumnCount = visibleLeafColumns.filter(column => !isSystemColumn(column.id)).length
  const visibleHideableCount = visibleLeafColumns.filter(
    column => !isSystemColumn(column.id) && column.getCanHide(),
  ).length
  const canStillHide = allowColumnHiding && visibleDataColumnCount > 1 && visibleHideableCount > 0
  const rows = table.getRowModel().rows

  return (
    <div className="data-table-shell">
      <Table className={className} containerClassName={containerClassName}>
        <TableHeader>
          {table.getHeaderGroups().map(group => (
            <TableRow key={group.id}>
              {group.headers.map(header => {
                const system = isSystemColumn(header.column.id)
                const canSort = !system && header.column.getCanSort()
                const canHide = !system && header.column.getCanHide() && canStillHide
                const sorted = header.column.getIsSorted()
                const meta = header.column.columnDef.meta as { headerClassName?: string } | undefined
                const title = flexRender(header.column.columnDef.header, header.getContext())
                return (
                  <TableHead
                    key={header.id}
                    className={meta?.headerClassName}
                    aria-sort={canSort ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
                  >
                    {header.isPlaceholder ? null : (canSort || canHide) ? (
                      <ColumnHeaderMenu
                        title={title}
                        sortable={canSort}
                        sortDirection={sorted}
                        onSortChange={next => {
                          if (next === false) {
                            header.column.clearSorting()
                          } else {
                            header.column.toggleSorting(next === 'desc')
                          }
                        }}
                        hideable={canHide}
                        onHide={() => header.column.toggleVisibility(false)}
                      />
                    ) : (
                      title
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="h-28 text-center text-muted-foreground">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
                  加载中…
                </span>
              </TableCell>
            </TableRow>
          ) : rows.length > 0 ? (
            rows.map(row => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={[onRowClick ? 'cursor-pointer' : '', rowClassName?.(row.original) ?? ''].filter(Boolean).join(' ') || undefined}
                onClick={onRowClick ? event => onRowClick(row.original, event) : undefined}
              >
                {row.getVisibleCells().map(cell => {
                  const meta = cell.column.columnDef.meta as { cellClassName?: string } | undefined
                  return (
                    <TableCell key={cell.id} className={meta?.cellClassName}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="h-28 whitespace-normal text-center text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {showPager && <TablePager table={table} extra={pagerExtra} unit={pagerUnit} />}
    </div>
  )
}
