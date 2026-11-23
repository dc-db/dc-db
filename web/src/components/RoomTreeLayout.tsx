import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Facilities, Region, Room } from '../facilities'
import { Input } from './ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

export type RoomFilter = 'all' | 'unassigned' | number

export interface RoomFilterCounts {
  all?: number
  unassigned?: number
  byRoom?: Map<number, number>
}

interface Props {
  facilities: Facilities
  value: RoomFilter
  onChange: (next: RoomFilter) => void
  showUnassigned?: boolean
  unassignedLabel?: string
  counts?: RoomFilterCounts
  children: ReactNode
}

export function RoomTreeLayout({
  facilities,
  value,
  onChange,
  showUnassigned = true,
  unassignedLabel = '未分配',
  counts,
  children,
}: Props) {
  const [roomSearch, setRoomSearch] = useState('')
  const [treeWidth, setTreeWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem('dc-db-tree-width'))
    return saved >= 180 && saved <= 420 ? saved : 260
  })
  const [treeCollapsed, setTreeCollapsed] = useState(
    () => window.localStorage.getItem('dc-db-tree-collapsed') === '1',
  )

  useEffect(() => {
    window.localStorage.setItem('dc-db-tree-width', String(treeWidth))
  }, [treeWidth])

  useEffect(() => {
    window.localStorage.setItem('dc-db-tree-collapsed', treeCollapsed ? '1' : '0')
  }, [treeCollapsed])

  useEffect(() => {
    if (typeof value === 'number' && facilities.rooms.length > 0 && !facilities.rooms.some(room => room.id === value)) {
      onChange('all')
    }
  }, [facilities.rooms, onChange, value])

  function startResize(event: React.MouseEvent) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = treeWidth
    const handle = event.currentTarget as HTMLElement
    handle.classList.add('is-active')
    const move = (moveEvent: MouseEvent) => {
      setTreeWidth(Math.min(420, Math.max(180, startWidth + moveEvent.clientX - startX)))
    }
    const up = () => {
      handle.classList.remove('is-active')
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const sortedRooms = useMemo(
    () => facilities.rooms.slice().sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    [facilities.rooms],
  )

  const filteredRooms = useMemo(() => {
    const needle = roomSearch.trim().toLowerCase()
    return needle ? sortedRooms.filter(item => item.name.toLowerCase().includes(needle)) : sortedRooms
  }, [roomSearch, sortedRooms])

  const groupedRooms = useMemo(() => {
    const groups: { key: string; region?: Region; rooms: Room[] }[] = []
    for (const region of facilities.regions) {
      const inRegion = filteredRooms.filter(item => item.regionId === region.id)
      if (inRegion.length) groups.push({ key: 'region-' + region.id, region, rooms: inRegion })
    }
    const ungrouped = filteredRooms.filter(item => !facilities.regions.some(region => region.id === item.regionId))
    if (ungrouped.length) groups.push({ key: 'ungrouped', rooms: ungrouped })
    return groups
  }, [facilities.regions, filteredRooms])

  function renderRoomItem(item: Room) {
    const count = counts?.byRoom?.get(item.id)
    return (
      <div key={item.id} className="facility-tree-room">
        <button
          type="button"
          className={`facility-tree-item${value === item.id ? ' active' : ''}`}
          title={item.name}
          onClick={() => onChange(item.id)}
        >
          <span className="facility-tree-name">{item.name}</span>
          {count !== undefined && <span className="facility-tree-count tabular-nums">{count}</span>}
        </button>
      </div>
    )
  }

  return (
    <div
      className={treeCollapsed ? 'facility-layout is-collapsed' : 'facility-layout'}
      style={{ gridTemplateColumns: `${treeCollapsed ? 0 : treeWidth}px 6px minmax(0, 1fr)` }}
    >
      <aside className="facility-sidebar" aria-hidden={treeCollapsed}>
        <div className="facility-sidebar-search">
          <Input
            type="search"
            placeholder="搜索数据中心"
            aria-label="搜索数据中心"
            value={roomSearch}
            onChange={event => setRoomSearch(event.target.value)}
          />
        </div>
        <div className="facility-tree">
          <button
            type="button"
            className={`facility-tree-item${value === 'all' ? ' active' : ''}`}
            onClick={() => onChange('all')}
          >
            <span className="facility-tree-name">全部数据中心</span>
            {counts?.all !== undefined && <span className="facility-tree-count tabular-nums">{counts.all}</span>}
          </button>
          {showUnassigned && (
            <button
              type="button"
              className={`facility-tree-item${value === 'unassigned' ? ' active' : ''}`}
              onClick={() => onChange('unassigned')}
            >
              <span className="facility-tree-name">{unassignedLabel}</span>
              {counts?.unassigned !== undefined && (
                <span className="facility-tree-count tabular-nums">{counts.unassigned}</span>
              )}
            </button>
          )}
          {groupedRooms.map(group =>
            group.region ? (
              <div key={group.key} className="facility-tree-group">
                <div className="facility-tree-region">
                  <span className="facility-tree-region-name">{group.region.name}</span>
                </div>
                <div className="facility-tree-children">{group.rooms.map(renderRoomItem)}</div>
              </div>
            ) : (
              group.rooms.map(renderRoomItem)
            ),
          )}
          {!filteredRooms.length && <div className="facility-tree-empty">暂无匹配的数据中心</div>}
        </div>
      </aside>
      <div
        className="facility-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整导航宽度"
        onMouseDown={treeCollapsed ? undefined : startResize}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={treeCollapsed ? 'sider-handle is-collapsed' : 'sider-handle'}
              aria-label={treeCollapsed ? '展开' : '收起'}
              onMouseDown={event => event.stopPropagation()}
              onClick={() => setTreeCollapsed(current => !current)}
            >
              <svg viewBox="0 0 10 16" aria-hidden="true" focusable="false">
                <path
                  d={treeCollapsed ? 'M2.5 2.5 L7.5 8 L2.5 13.5' : 'M7.5 2.5 L2.5 8 L7.5 13.5'}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>
            {treeCollapsed ? '展开' : '收起'}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="facility-main">{children}</div>
    </div>
  )
}
