import type { MouseEvent, ReactNode } from 'react'
import { flexRender, type Table as TanStackTable } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, LoaderCircle } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { TablePager } from './TablePager'

interface Props<T> {
  table: TanStackTable<T>
  loading?: boolean
  emptyMessage?: ReactNode
  showPager?: boolean
  pagerExtra?: ReactNode
  pagerUnit?: string
  onRowClick?: (row: T, event: MouseEvent<HTMLTableRowElement>) => void
  rowClassName?: (row: T) => string | undefined
  className?: string
}

export function DataTable<T>({
  table,
  loading = false,
  emptyMessage = '暂无数据',
  showPager = true,
  pagerExtra,
  pagerUnit,
  onRowClick,
  rowClassName,
  className,
}: Props<T>) {
  const columnCount = table.getVisibleLeafColumns().length || 1
  const rows = table.getRowModel().rows

  return (
    <div className="data-table-shell">
      <Table className={className}>
        <TableHeader className="bg-muted/40">
          {table.getHeaderGroups().map(group => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map(header => {
                const canSort = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                const meta = header.column.columnDef.meta as { headerClassName?: string } | undefined
                return (
                  <TableHead
                    key={header.id}
                    className={meta?.headerClassName}
                    aria-sort={canSort ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        className={`data-table-sort -ml-1.5 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring${sorted ? ' is-sorted text-foreground' : ' text-muted-foreground'}`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        <span
                          className={`data-table-sort-icon inline-flex items-center ${sorted ? 'text-foreground' : 'text-muted-foreground/60'}`}
                          aria-hidden="true"
                        >
                          {sorted === 'asc'
                            ? <ArrowUp className="size-3.5" />
                            : sorted === 'desc'
                              ? <ArrowDown className="size-3.5" />
                              : <ChevronsUpDown className="size-3.5" />}
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
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
                className={['transition-colors data-[state=selected]:bg-muted/60', onRowClick ? 'cursor-pointer' : '', rowClassName?.(row.original) ?? ''].filter(Boolean).join(' ') || undefined}
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
              <TableCell colSpan={columnCount} className="h-28 text-center text-sm text-muted-foreground">
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
