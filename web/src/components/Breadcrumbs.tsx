import { Fragment } from 'react'

type BreadcrumbItem = { label: string; onClick?: () => void }

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumbs" aria-label="当前位置">
      <ol>
        {items.map((item, index) => (
          <Fragment key={index}>
            {index > 0 && <li className="breadcrumbs-separator" aria-hidden="true">/</li>}
            <li>{item.onClick ? <button type="button" onClick={item.onClick}>{item.label}</button> : <span>{item.label}</span>}</li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
