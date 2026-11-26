import { OptionSelect } from './OptionSelect'
import type { ReactNode } from 'react'
import type { Table } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from './ui/button'


// Shared footer for TanStack DataTables: count (+ optional left note), page size, paging.
export function TablePager<T>({ table, extra, unit = '条' }: { table: Table<T>; extra?: ReactNode; unit?: string }) {
  const { pageIndex, pageSize } = table.getState().pagination
  const total = table.getFilteredRowModel().rows.length
  const selectedCount = typeof table.getFilteredSelectedRowModel === 'function'
    ? table.getFilteredSelectedRowModel().rows.length
    : 0
  const hasSelection = selectedCount > 0 || (
    typeof table.getAllLeafColumns === 'function' &&
    table.getAllLeafColumns().some(column => column.id === 'select')
  )
  const lastPage = Math.max(1, table.getPageCount())
  return (
    <div className="table-pager flex flex-wrap items-center justify-between gap-4 px-1 py-0.5 text-xs text-muted-foreground tabular-nums">
      <div className="table-pager-left flex items-center gap-2 tabular-nums">
        <span className="table-pager-info tabular-nums">
          {hasSelection ? (
            <>
              已选 <strong className="font-medium text-foreground tabular-nums">{selectedCount}</strong> / 共{' '}
              <strong className="font-medium text-foreground tabular-nums">{total}</strong> {unit}
            </>
          ) : (
            <>
              共 <strong className="font-medium text-foreground tabular-nums">{total}</strong> {unit}
            </>
          )}
        </span>
        {extra && <span className="table-pager-extra">{extra}</span>}
      </div>
      <div className="table-pager-right flex items-center gap-4 sm:gap-6 tabular-nums">
        <label className="table-pager-size flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          每页
          <OptionSelect label="每页条数" size="sm" value={String(pageSize)} onChange={value => table.setPageSize(Number(value))} options={[10, 20, 50].map(size => ({ value: String(size), label: String(size) }))} />
          条
        </label>
        <span className="table-pager-info whitespace-nowrap font-medium text-foreground tabular-nums">第 {pageIndex + 1} / {lastPage} 页</span>
        <div className="table-pager-buttons flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" aria-label="第一页" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}><ChevronsLeft className="size-3.5" /></Button>
          <Button variant="outline" size="icon-sm" aria-label="上一页" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft className="size-3.5" /></Button>
          <Button variant="outline" size="icon-sm" aria-label="下一页" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight className="size-3.5" /></Button>
          <Button variant="outline" size="icon-sm" aria-label="最后一页" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(lastPage - 1)}><ChevronsRight className="size-3.5" /></Button>
        </div>
      </div>
    </div>
  )
}
