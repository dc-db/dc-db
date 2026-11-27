import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from 'react'
import { flexRender, type RowData, type Table as TanStackTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { ColumnHeaderMenu, type ColumnFilterConfig } from './TableColumnControls'
import { TableFooterBar } from './TableFooterBar'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    headerClassName?: string
    cellClassName?: string
    filter?: ColumnFilterConfig
  }

  interface TableMeta<TData extends RowData> {
    rowIndexMap?: Map<string, number>
  }
}

export interface DataTableColumnMeta {
  label?: string
  headerClassName?: string
  cellClassName?: string
  filter?: ColumnFilterConfig
}

export interface DataTableProps<TData> {
  table: TanStackTable<TData>
  loading?: boolean
  emptyMessage?: ReactNode
  frame?: 'fixed' | 'compact'
  showFooter?: boolean
  footerUnit?: string
  footerExtra?: ReactNode
  estimateRowHeight?: number
  scrollResetKey?: string | number
  className?: string
  containerClassName?: string
  onRowClick?: (row: TData, event: MouseEvent<HTMLTableRowElement>) => void
  rowClassName?: (row: TData) => string | undefined
  allowColumnHiding?: boolean
  /** @deprecated Use showFooter instead. */
  showPager?: boolean
  /** @deprecated Use footerUnit instead. */
  pagerUnit?: string
  /** @deprecated Use footerExtra instead. */
  pagerExtra?: ReactNode
}

function isSystemColumn(id: string): boolean {
  return id === 'select' || id === 'actions'
}

export function DataTable<TData>({
  table,
  loading = false,
  emptyMessage = '暂无数据',
  frame = 'fixed',
  showFooter,
  footerUnit,
  footerExtra,
  estimateRowHeight = 44,
  scrollResetKey,
  className,
  containerClassName,
  onRowClick,
  rowClassName,
  allowColumnHiding = true,
  showPager,
  pagerUnit,
  pagerExtra,
}: DataTableProps<TData>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibleLeafColumns = table.getVisibleLeafColumns()
  const columnCount = visibleLeafColumns.length || 1
  const visibleDataColumnCount = visibleLeafColumns.filter(column => !isSystemColumn(column.id)).length
  const visibleHideableCount = visibleLeafColumns.filter(
    column => !isSystemColumn(column.id) && column.getCanHide(),
  ).length
  const canStillHide = allowColumnHiding && visibleDataColumnCount > 1 && visibleHideableCount > 0

  const rows = table.getRowModel().rows
  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    for (let index = 0; index < rows.length; index += 1) {
      map.set(rows[index].id, index)
    }
    return map
  }, [rows])

  if (table.options.meta) {
    table.options.meta.rowIndexMap = rowIndexMap
  } else {
    table.options.meta = { rowIndexMap }
  }

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 12,
  })

  const tableState = table.getState()
  const columnFilters = tableState.columnFilters
  const globalFilter = tableState.globalFilter

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [scrollResetKey, rows.length, columnFilters, globalFilter])

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? Math.max(0, totalSize - virtualItems[virtualItems.length - 1].end) : 0

  const resolvedShowFooter = showFooter ?? showPager ?? true
  const resolvedUnit = footerUnit ?? pagerUnit ?? '条'
  const resolvedExtra = footerExtra ?? pagerExtra

  const totalCount = table.getFilteredRowModel().rows.length
  const hasSelection =
    typeof table.getAllLeafColumns === 'function' &&
    table.getAllLeafColumns().some(column => column.id === 'select')
  const selectedCount =
    hasSelection && typeof table.getFilteredSelectedRowModel === 'function'
      ? table.getFilteredSelectedRowModel().rows.length
      : 0

  const stateCellHeight = frame === 'compact' ? 'h-28' : 'h-48'

  return (
    <div
      className={cn(
        'data-table-shell table-frame',
        frame === 'compact' ? 'table-frame-compact' : 'table-frame-fixed',
      )}
    >
      <Table
        bare
        containerRef={scrollRef}
        className={className}
        containerClassName={containerClassName}
        aria-rowcount={!loading && rows.length > 0 ? rows.length + 1 : undefined}
      >
        <TableHeader>
          {table.getHeaderGroups().map(group => (
            <TableRow key={group.id}>
              {group.headers.map(header => {
                const isPinnedLeft = header.column.id === 'select'
                const system = isSystemColumn(header.column.id)
                const canSort = !system && header.column.getCanSort()
                const canHide = !system && header.column.getCanHide() && canStillHide
                const sorted = header.column.getIsSorted()
                const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined
                const filter = !system ? meta?.filter : undefined
                const canFilter = Boolean(filter)
                const title = flexRender(header.column.columnDef.header, header.getContext())
                return (
                  <TableHead
                    key={header.id}
                    data-pinned={isPinnedLeft ? 'left' : undefined}
                    className={meta?.headerClassName}
                    aria-sort={
                      canSort
                        ? sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : canSort || canFilter || canHide ? (
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
                        filter={filter}
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
            <TableRow data-state-row="true" className="table-state-row hover:bg-transparent">
              <TableCell
                colSpan={columnCount}
                className={cn(stateCellHeight, 'whitespace-normal text-center text-muted-foreground')}
              >
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
                  加载中…
                </span>
              </TableCell>
            </TableRow>
          ) : rows.length > 0 ? (
            <>
              {paddingTop > 0 && (
                <tr aria-hidden="true" className="table-virtual-spacer">
                  <td colSpan={columnCount} style={{ height: paddingTop }} />
                </tr>
              )}
              {virtualItems.map(virtualRow => {
                const row = rows[virtualRow.index]
                return (
                  <TableRow
                    key={row.id}
                    data-index={virtualRow.index}
                    data-last-row={virtualRow.index === rows.length - 1 ? 'true' : undefined}
                    ref={rowVirtualizer.measureElement}
                    aria-rowindex={virtualRow.index + 2}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={
                      [onRowClick ? 'cursor-pointer' : '', rowClassName?.(row.original) ?? '']
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    onClick={onRowClick ? event => onRowClick(row.original, event) : undefined}
                  >
                    {row.getVisibleCells().map(cell => {
                      const isPinnedLeft = cell.column.id === 'select'
                      const meta = cell.column.columnDef.meta as { cellClassName?: string } | undefined
                      return (
                        <TableCell
                          key={cell.id}
                          data-pinned={isPinnedLeft ? 'left' : undefined}
                          className={meta?.cellClassName}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden="true" className="table-virtual-spacer">
                  <td colSpan={columnCount} style={{ height: paddingBottom }} />
                </tr>
              )}
            </>
          ) : (
            <TableRow data-state-row="true" className="table-state-row hover:bg-transparent">
              <TableCell
                colSpan={columnCount}
                className={cn(stateCellHeight, 'whitespace-normal text-center text-sm text-muted-foreground')}
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {resolvedShowFooter && (
        <TableFooterBar
          total={totalCount}
          selectedCount={selectedCount}
          unit={resolvedUnit}
          extra={resolvedExtra}
        />
      )}
    </div>
  )
}
