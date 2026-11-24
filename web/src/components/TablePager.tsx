import { OptionSelect } from './OptionSelect'
import type { ReactNode } from 'react'
import type { Table } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from './ui/button'


// Shared footer for TanStack DataTables: count (+ optional left note), page size, paging.
export function TablePager<T>({ table, extra, unit = '条' }: { table: Table<T>; extra?: ReactNode; unit?: string }) {
  const { pageIndex, pageSize } = table.getState().pagination
  const total = table.getFilteredRowModel().rows.length
  const lastPage = Math.max(1, table.getPageCount())
  return (
    <div className="table-pager">
      <div className="table-pager-left">
        <span className="table-pager-info">共 <strong className="font-medium text-foreground tabular-nums">{total}</strong> {unit}</span>
        {extra && <span className="table-pager-extra">{extra}</span>}
      </div>
      <div className="table-pager-right">
        <label className="table-pager-size">
          每页
          <OptionSelect label="每页条数" size="sm" value={String(pageSize)} onChange={value => table.setPageSize(Number(value))} options={[10, 20, 50].map(size => ({ value: String(size), label: String(size) }))} />
          条
        </label>
        <span className="table-pager-info tabular-nums">第 {pageIndex + 1} / {lastPage} 页</span>
        <div className="table-pager-buttons">
          <Button variant="outline" size="icon-sm" aria-label="第一页" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}><ChevronsLeft /></Button>
          <Button variant="outline" size="icon-sm" aria-label="上一页" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft /></Button>
          <Button variant="outline" size="icon-sm" aria-label="下一页" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight /></Button>
          <Button variant="outline" size="icon-sm" aria-label="最后一页" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(lastPage - 1)}><ChevronsRight /></Button>
        </div>
      </div>
    </div>
  )
}
