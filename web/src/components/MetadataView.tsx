import { useEffect, useState } from 'react'
import { api, APIError } from '../api'
import type { Group, Tag } from '../api'
import type { Page } from '../types'
import { GroupManager } from './GroupManager'
import { ServiceManager } from './ServiceManager'
import { TagManager } from './TagManager'
import { MetadataManager } from './MetadataManager'

interface Props {
  page: Page
  editable: boolean
  onSessionError: (error: unknown) => void
  onGroupsChanged: (groups: Group[]) => void
  onTagsChanged: (tags: Tag[]) => void
}

type CategoryKey = 'groups' | 'services' | 'tags' | 'owner' | 'operator'

const categories: { key: CategoryKey; label: string; kind?: string }[] = [
  { key: 'groups', label: '群组' },
  { key: 'services', label: '服务' },
  { key: 'tags', label: '标签' },
  { key: 'owner', label: '负责人', kind: 'owner' },
  { key: 'operator', label: '运营商', kind: 'operator' },
]

function categoryForPage(page: Page): CategoryKey {
  if (page === 'tags') return 'tags'
  if (page === 'services') return 'services'
  if (page === 'groups') return 'groups'
  return 'groups'
}

// 基础数据: a category list on the left, the selected dictionary on the right.
export function MetadataView({ page, editable, onSessionError, onGroupsChanged, onTagsChanged }: Props) {
  const [selected, setSelected] = useState<CategoryKey>(() => categoryForPage(page))
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => { setSelected(categoryForPage(page)) }, [page])
  useEffect(() => { void loadCounts() }, [page])

  async function loadCounts() {
    try {
      setCounts(await api<Record<string, number>>('/reference/counts'))
    } catch (value) {
      if (value instanceof APIError && value.status === 401) onSessionError(value)
    }
  }

  return (
    <div className="metadata-layout">
      <aside className="metadata-side">
        <h2 className="asset-view-title">基础数据</h2>
        <nav className="metadata-nav" aria-label="基础数据分类">
          {categories.map(item => (
            <button
              key={item.key} type="button"
              className={`metadata-nav-item${item.key === selected ? ' is-active' : ''}`}
              onClick={() => setSelected(item.key)}
            >
              <span>{item.label}</span>
              <span className="metadata-nav-count">{counts[item.kind ?? item.key] ?? 0}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="metadata-divider" aria-hidden="true" />
      <section className="metadata-main">
        {selected === 'groups' && (
          <GroupManager hideTitle editable={editable} onSessionError={onSessionError} onChanged={groups => { onGroupsChanged(groups); void loadCounts() }} />
        )}
        {selected === 'services' && (
          <ServiceManager hideTitle editable={editable} onSessionError={onSessionError} />
        )}
        {selected === 'tags' && (
          <TagManager hideTitle editable={editable} onSessionError={onSessionError} onChanged={tags => { onTagsChanged(tags); void loadCounts() }} />
        )}
        {selected === 'owner' && (
          <MetadataManager kind="owner" title="负责人" hideTitle editable={editable} onSessionError={onSessionError} onChanged={() => void loadCounts()} />
        )}
        {selected === 'operator' && (
          <MetadataManager kind="operator" title="运营商" hideTitle editable={editable} onSessionError={onSessionError} onChanged={() => void loadCounts()} />
        )}
      </section>
    </div>
  )
}
