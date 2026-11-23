import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { MoreHorizontal, Pencil, Plus } from 'lucide-react'
import { api, APIError } from '../api'
import type { Facilities, Region, Room, RoomFields } from '../facilities'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

export type RoomFilter = 'all' | 'unassigned' | number

export interface RoomFilterCounts {
  all?: number
  unassigned?: number
  byRoom?: Map<number, number>
}

type RoomDraft = RoomFields & { id?: number; version: number }
type RegionDraft = { id?: number; version: number; name: string }

interface Props {
  facilities: Facilities
  value: RoomFilter
  onChange: (next: RoomFilter) => void
  editable?: boolean
  showAll?: boolean
  showUnassigned?: boolean
  unassignedLabel?: string
  counts?: RoomFilterCounts
  onReload?: () => Promise<void> | void
  onSessionError?: (error: unknown) => void
  children: ReactNode
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      {children}
    </label>
  )
}

function ConfirmDelete({
  title,
  disabled,
  onConfirm,
  children,
}: {
  title: string
  disabled: boolean
  onConfirm: () => void
  children: ReactNode
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={disabled}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>此操作无法撤销。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function RoomTreeLayout({
  facilities,
  value,
  onChange,
  editable = true,
  showAll = true,
  showUnassigned = true,
  unassignedLabel = '未分配',
  counts,
  onReload,
  onSessionError,
  children,
}: Props) {
  const [roomSearch, setRoomSearch] = useState('')
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null)
  const [regionDraft, setRegionDraft] = useState<RegionDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [modalError, setModalError] = useState('')

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
      if (showAll) onChange('all')
      else if (facilities.rooms[0]) onChange(facilities.rooms[0].id)
    }
  }, [facilities.rooms, onChange, showAll, value])

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

  async function notifyReload() {
    if (onReload) await onReload()
    window.dispatchEvent(new CustomEvent('dc-db-facilities-changed'))
  }

  async function mutate<T>(action: () => Promise<T>, done: (result: T) => void) {
    if (busy) return
    setBusy(true)
    setModalError('')
    try {
      const result = await action()
      await notifyReload()
      done(result)
    } catch (e) {
      if (e instanceof APIError && e.status === 401 && onSessionError) onSessionError(e)
      else setModalError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  function editRoom(target?: Room) {
    setModalError('')
    setRoomDraft(target ? { ...target } : { name: '', regionId: 0, version: 0 })
  }

  function editRegion(target?: Region) {
    setModalError('')
    setRegionDraft(target ? { id: target.id, version: target.version, name: target.name } : { name: '', version: 0 })
  }

  function saveRegion() {
    if (!regionDraft) return
    const { id, name, version } = regionDraft
    void mutate(
      () => api<Region>(id ? '/regions/' + id : '/regions', id ? 'PUT' : 'POST', { name, version }),
      () => setRegionDraft(null),
    )
  }

  function removeRegion(target: Region) {
    void mutate(
      () => api('/regions/' + target.id + '?version=' + target.version, 'DELETE'),
      () => setRegionDraft(null),
    )
  }

  function saveRoom() {
    if (!roomDraft) return
    const { id, ...fields } = roomDraft
    void mutate(
      () => api<Room>(id ? '/rooms/' + id : '/rooms', id ? 'PUT' : 'POST', fields),
      saved => {
        onChange(saved.id)
        setRoomDraft(null)
      },
    )
  }

  function removeRoom(target: Room) {
    void mutate(
      () => api('/rooms/' + target.id + '?version=' + target.version, 'DELETE'),
      () => setRoomDraft(null),
    )
  }

  const editingRoom = facilities.rooms.find(item => item.id === roomDraft?.id)

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
        {editable && (
          <button
            type="button"
            className="facility-tree-room-action"
            aria-label={`编辑数据中心 ${item.name}`}
            title={`编辑 ${item.name}`}
            onClick={() => editRoom(item)}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }

  return (
    <>
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
            {editable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="数据中心操作">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => editRegion()}>
                    <Plus />
                    新增区域
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => editRoom()}>
                    <Plus />
                    新增数据中心
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="facility-tree">
            {showAll && (
              <button
                type="button"
                className={`facility-tree-item${value === 'all' ? ' active' : ''}`}
                onClick={() => onChange('all')}
              >
                <span className="facility-tree-name">全部数据中心</span>
                {counts?.all !== undefined && <span className="facility-tree-count tabular-nums">{counts.all}</span>}
              </button>
            )}
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
                    {editable && (
                      <button
                        type="button"
                        className="facility-tree-region-action"
                        aria-label={`编辑区域 ${group.region.name}`}
                        onClick={() => editRegion(group.region)}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                    )}
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

      <Dialog open={!!roomDraft} onOpenChange={open => { if (!open) setRoomDraft(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{roomDraft?.id ? '编辑数据中心' : '新增数据中心'}</DialogTitle>
            <DialogDescription>维护数据中心名称。</DialogDescription>
          </DialogHeader>
          {modalError && <div role="alert" className="text-sm text-destructive">{modalError}</div>}
          {roomDraft && (
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); saveRoom() }}>
              <Field label="数据中心名称">
                <Input
                  required
                  value={roomDraft.name}
                  placeholder="例如：北京数据中心"
                  maxLength={160}
                  onChange={event => setRoomDraft({ ...roomDraft, name: event.target.value })}
                />
              </Field>
              <Field label="所属区域（可选）">
                <Select
                  value={roomDraft.regionId ? String(roomDraft.regionId) : 'none'}
                  onValueChange={next => setRoomDraft({ ...roomDraft, regionId: next === 'none' ? 0 : Number(next) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="不归入区域" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不归入区域</SelectItem>
                    {facilities.regions.map(region => (
                      <SelectItem key={region.id} value={String(region.id)}>
                        {region.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="room-modal-actions flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  保存数据中心
                </Button>
                <Button type="button" variant="outline" onClick={() => setRoomDraft(null)}>
                  取消
                </Button>
                {editingRoom && !facilities.racks.some(item => item.roomId === editingRoom.id) && (
                  <ConfirmDelete
                    title="删除该空数据中心？"
                    disabled={busy}
                    onConfirm={() => removeRoom(editingRoom)}
                  >
                    删除空数据中心
                  </ConfirmDelete>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!regionDraft} onOpenChange={open => { if (!open) setRegionDraft(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{regionDraft?.id ? '编辑区域' : '新增区域'}</DialogTitle>
            <DialogDescription>区域用于按城市或片区归类数据中心；可以不建区域，直接创建数据中心。</DialogDescription>
          </DialogHeader>
          {modalError && <div role="alert" className="text-sm text-destructive">{modalError}</div>}
          {regionDraft && (
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); saveRegion() }}>
              <Field label="区域名称">
                <Input
                  required
                  value={regionDraft.name}
                  placeholder="例如：华北、北京"
                  maxLength={80}
                  onChange={event => setRegionDraft({ ...regionDraft, name: event.target.value })}
                />
              </Field>
              <div className="room-modal-actions flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  保存区域
                </Button>
                <Button type="button" variant="outline" onClick={() => setRegionDraft(null)}>
                  取消
                </Button>
                {regionDraft.id && (
                  <ConfirmDelete
                    title={`删除区域「${regionDraft.name}」？`}
                    disabled={busy}
                    onConfirm={() =>
                      removeRegion({ id: regionDraft.id!, name: regionDraft.name, version: regionDraft.version })
                    }
                  >
                    删除区域
                  </ConfirmDelete>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
