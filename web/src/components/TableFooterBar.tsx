import type { ReactNode } from 'react'

export interface TableFooterBarProps {
  total: number
  selectedCount?: number
  unit?: string
  extra?: ReactNode
}

export function TableFooterBar({
  total,
  selectedCount,
  unit = '条',
  extra,
}: TableFooterBarProps) {
  const hasSelection = typeof selectedCount === 'number' && selectedCount > 0

  return (
    <div className="table-frame-footer">
      <div className="table-frame-footer-left">
        <span className="table-frame-footer-count">
          {hasSelection ? (
            <>
              已选 <strong className="table-frame-footer-num">{selectedCount}</strong> / 共{' '}
              <strong className="table-frame-footer-num">{total}</strong> {unit}
            </>
          ) : (
            <>
              共 <strong className="table-frame-footer-num">{total}</strong> {unit}
            </>
          )}
        </span>
      </div>
      {extra ? <div className="table-frame-footer-extra">{extra}</div> : null}
    </div>
  )
}
