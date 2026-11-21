import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Boxes, FolderTree, Globe, Tags, UserRound } from 'lucide-react'
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

const categories: { key: CategoryKey; label: string; kind?: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'groups', label: '群组', icon: FolderTree },
  { key: 'services', label: '服务', icon: Boxes },
  { key: 'tags', label: '标签', icon: Tags },
  { key: 'owner', label: '负责人', kind: 'owner', icon: UserRound },
  { key: 'operator', label: '运营商', kind: 'operator', icon: Globe },
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
          {categories.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.key} type="button"
                className={`metadata-nav-item${item.key === selected ? ' is-active' : ''}`}
                aria-current={item.key === selected ? 'page' : undefined}
                onClick={() => setSelected(item.key)}
              >
                <span className="metadata-nav-label">
                  <Icon className="metadata-nav-icon" />
                  <span>{item.label}</span>
                </span>
                <span className="metadata-nav-count">{counts[item.kind ?? item.key] ?? 0}</span>
              </button>
            )
          })}
        </nav>
      </aside>
      <div className="metadata-divider" aria-hidden="true" />
      <section className="metadata-main">
        {selected === 'groups' && (
          <GroupManager editable={editable} onSessionError={onSessionError} onChanged={groups => { onGroupsChanged(groups); void loadCounts() }} />
        )}
        {selected === 'services' && (
          <ServiceManager editable={editable} onSessionError={onSessionError} onChanged={() => void loadCounts()} />
        )}
        {selected === 'tags' && (
          <TagManager editable={editable} onSessionError={onSessionError} onChanged={tags => { onTagsChanged(tags); void loadCounts() }} />
        )}
        {selected === 'owner' && (
          <MetadataManager kind="owner" title="负责人" editable={editable} onSessionError={onSessionError} onChanged={() => void loadCounts()} />
        )}
        {selected === 'operator' && (
          <MetadataManager kind="operator" title="运营商" editable={editable} onSessionError={onSessionError} onChanged={() => void loadCounts()} />
        )}
      </section>
    </div>
  )
}
