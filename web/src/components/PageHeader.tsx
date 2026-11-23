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
        <h2 className="asset-view-title">
          <span>{title}</span>
          {scope && (
            <>
              <span className="page-scope-slash" aria-hidden="true">
                /
              </span>
              <span>{scope.label}</span>
            </>
          )}
        </h2>
      )}
      {(filters || actions) && (
        <div className="table-toolbar">
          <div className="page-header-filters">{filters}</div>
          <div className="page-header-actions">{actions}</div>
        </div>
      )}
    </>
  )
}
