import type { ReactNode } from 'react'
import { useRoomScope } from './RoomTreeLayout'

interface Props {
  title?: string
  filters?: ReactNode
  actions?: ReactNode
}

/**
 * Shared page header: the title row and the filter/action row used by every
 * list page, so the asset list and the 组织结构 pages stay in step.
 */
export function PageHeader({ title, filters, actions }: Props) {
  const scope = useRoomScope()
  return (
    <>
      {title && (
        <h2 className="asset-view-title flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
          <span>{title}</span>
          {scope && (
            <>
              <span className="page-scope-slash font-normal text-muted-foreground/60" aria-hidden="true">
                /
              </span>
              <span>{scope.label}</span>
            </>
          )}
        </h2>
      )}
      {(filters || actions) && (
        <div className="table-toolbar flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="page-header-filters flex flex-wrap items-center gap-2">{filters}</div>
          <div className="page-header-actions flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
    </>
  )
}
