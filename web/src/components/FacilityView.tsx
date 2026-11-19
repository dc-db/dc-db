import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Boxes, Columns3, Download, List, MoreHorizontal, Pencil, Plus } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Input } from './ui/input'
import { Progress } from './ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { api, APIError } from '../api'
import type { Asset, Link } from '../api'
import { assetLocations, isMountKind, locationLabel, mountKinds, occupiedUnits, placementsConflict } from '../facilities'
import type { AssetLocation, Facilities, MountKind, Placement, PlacementDepth, Rack, RackFace, RackFields, Region, Room, RoomFields } from '../facilities'
import { downloadRackSvg, rackElevationSvg } from '../rackExport'
import { RackDetailDrawer } from './RackDetailDrawer'
import { RoomScene } from './RoomScene'

interface Props {
  roomId: number | null
  onRoomChange: (id: number) => void
  openRackId: number | null
  onRackOpened: () => void
  layout: Facilities
  assets: Asset[]
  links: Link[]
  editable: boolean
  dark: boolean
  focus: AssetLocation | null
  reload: () => Promise<void>
  onOpenAsset: (id: number) => void
  bookmarkedRacks: number[]
  onToggleRackBookmark: (id: number) => void
  onSessionError: (error: unknown) => void
}

type RoomDraft = RoomFields & { id?: number; version: number }
type RackDraft = RackFields & { id?: number; version: number }
interface MountDraft {
  mode: 'existing' | 'new'
  assetId: number
  version: number
  kind: MountKind
  name: string
  address: string
  startU: number
  units: number
  face: RackFace
  depth: PlacementDepth
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm"><span>{label}</span>{children}</label>
}

function Choice<T extends string | number>({ label, value, options, onChange, disabled, className }: { label: string; value?: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean; className?: string }) {
  return <Select value={value === undefined ? undefined : String(value)} onValueChange={selected => { const option = options.find(item => String(item.value) === selected); if (option) onChange(option.value) }} disabled={disabled}><SelectTrigger aria-label={label} className={className}><SelectValue placeholder="请选择" /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={String(option.value)} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent></Select>
}

function ConfirmDelete({ title, disabled, onConfirm, children }: { title: string; disabled: boolean; onConfirm: () => void; children: ReactNode }) {
  return <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="destructive" disabled={disabled}>{children}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>此操作无法撤销。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
}

export function FacilityView({ roomId, onRoomChange, openRackId, onRackOpened, layout, assets, links, editable, dark, focus, reload, onOpenAsset, bookmarkedRacks, onToggleRackBookmark, onSessionError }: Props) {
  const [rackId, setRackId] = useState<number | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const [view, setView] = useState<'table' | 'elevations' | '3d'>('elevations')
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null)
  const [regionDraft, setRegionDraft] = useState<{ id?: number; version: number; name: string } | null>(null)
  const [rackDraft, setRackDraft] = useState<RackDraft | null>(null)
  const [mountDraft, setMountDraft] = useState<MountDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [roomSearch, setRoomSearch] = useState('')
  const [rackKeyword, setRackKeyword] = useState('')
  const [rackDrawerOpen, setRackDrawerOpen] = useState(false)
  const [treeWidth, setTreeWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem('dc-db-tree-width'))
    return saved >= 180 && saved <= 420 ? saved : 260
  })

  useEffect(() => { window.localStorage.setItem('dc-db-tree-width', String(treeWidth)) }, [treeWidth])

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

  const rooms = layout.rooms
  const activeRoomId = roomId ?? rooms[0]?.id ?? null
  const room = rooms.find(item => item.id === activeRoomId)
  const sortedRooms = useMemo(() => rooms.slice().sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')), [rooms])
  const filteredRooms = roomSearch.trim()
    ? sortedRooms.filter(item => item.name.toLowerCase().includes(roomSearch.trim().toLowerCase()))
    : sortedRooms
  const groupedRooms = useMemo(() => {
    const groups: { key: string; region?: Region; rooms: Room[] }[] = []
    for (const region of layout.regions) {
      const inRegion = filteredRooms.filter(item => item.regionId === region.id)
      if (inRegion.length) groups.push({ key: 'region-' + region.id, region, rooms: inRegion })
    }
    const ungrouped = filteredRooms.filter(item => !layout.regions.some(region => region.id === item.regionId))
    if (ungrouped.length) groups.push({ key: 'ungrouped', rooms: ungrouped })
    return groups
  }, [filteredRooms, layout.regions])
  const racks = useMemo(() => layout.racks.filter(item => item.roomId === activeRoomId), [layout.racks, activeRoomId])
  const rack = racks.find(item => item.id === rackId)
  const rackIds = useMemo(() => new Set(racks.map(item => item.id)), [racks])
  const roomPlacements = useMemo(() => layout.placements.filter(item => rackIds.has(item.rackId)), [layout.placements, rackIds])
  const rackRows = useMemo(() => {
    const needle = rackKeyword.trim().toLowerCase()
    return needle ? racks.filter(item => item.name.toLowerCase().includes(needle) || item.zone.toLowerCase().includes(needle)) : racks
  }, [racks, rackKeyword])
  const devices = roomPlacements.filter(item => item.rackId === rackId)
  const totalRoomU = racks.reduce((sum, item) => sum + item.heightU, 0)
  const usedRoomU = racks.reduce((sum, item) =>
    sum + occupiedUnits(roomPlacements.filter(placement => placement.rackId === item.id)).size, 0)
  const roomUtilization = totalRoomU ? Math.round(usedRoomU / totalRoomU * 100) : 0
  const byId = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets])
  const locations = useMemo(() => assetLocations(layout, links), [layout, links])
  const mounted = useMemo(() => new Map(layout.placements.map(placement => [placement.assetId, placement])), [layout.placements])
  const candidates = assets.filter(asset => asset.lifecycle === 'active' && isMountKind(asset.kind))
  const searchResults = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return []
    return assets.flatMap(asset => {
      const location = locations.get(asset.id)
      return location && [asset.name, asset.address, location.room.name, location.rack.name]
        .some(value => value.toLowerCase().includes(keyword)) ? [{ asset, location }] : []
    }).slice(0, 8)
  }, [assets, locations, search])
  const cells = useMemo(() => {
    if (!room) return []
    const byCell = new Map(racks.map(item => [item.row + ':' + item.column, item]))
    return Array.from({ length: room.columns * room.rows }, (_, index) => {
      const column = index % room.columns + 1
      const row = Math.floor(index / room.columns) + 1
      const key = row + ':' + column
      return { key, row, column, rack: byCell.get(key) }
    })
  }, [room, racks])
  const mountLocation = mountDraft?.assetId ? locations.get(mountDraft.assetId) : undefined

  useEffect(() => {
    if (roomId && !rooms.some(item => item.id === roomId)) {
      const next = rooms[0]?.id
      if (next !== undefined) onRoomChange(next)
    }
  }, [roomId, rooms, onRoomChange])

  useEffect(() => {
    if (!racks.some(item => item.id === rackId)) setRackId(racks[0]?.id ?? null)
  }, [racks, rackId])

  useEffect(() => {
    if (!openRackId) return
    const target = layout.racks.find(item => item.id === openRackId && item.roomId === activeRoomId)
    if (!target) return
    setRackId(target.id)
    setRackDrawerOpen(true)
    onRackOpened()
  }, [openRackId, activeRoomId, layout.racks, onRackOpened])

  useEffect(() => {
    if (focus) showLocation(focus)
  }, [focus])

  function resetForms() {
    setRoomDraft(null)
    setRackDraft(null)
    setMountDraft(null)
    setError('')
    setFeedback('')
  }

  function selectRoom(id: number) {
    if (id === activeRoomId && roomId !== null) return
    resetForms()
    setRackDrawerOpen(false)
    onRoomChange(id)
    setRackId(layout.racks.find(item => item.roomId === id)?.id ?? null)
    setFocused(null)
  }

  function selectRack(id: number) {
    if (id === rackId) return
    resetForms()
    setRackId(id)
    setFocused(null)
  }

  function openRack(id: number) {
    selectRack(id)
    setRackDrawerOpen(true)
  }

  function closeRackDrawer() {
    setRackDrawerOpen(false)
    setMountDraft(null)
    setFeedback('')
  }

  function showLocation(location: AssetLocation) {
    resetForms()
    setRackDrawerOpen(false)
    onRoomChange(location.room.id)
    setRackId(location.rack.id)
    setFocused(location.placement.assetId)
    setView('3d')
    setSearch('')
  }

  function openSceneDevice(assetId: number, cabinetId: number) {
    selectRack(cabinetId)
    setFocused(assetId)
    onOpenAsset(assetId)
  }

  async function mutate<T>(action: () => Promise<T>, done: (result: T) => void, notice: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      const result = await action()
      await reload()
      done(result)
      setFeedback(notice)
    } catch (e) {
      if (e instanceof APIError && e.status === 401) onSessionError(e)
      else setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  function editRoom(value?: Room) {
    resetForms()
    setRoomDraft(value ? { ...value } : { name: '', regionId: 0, columns: 8, rows: 6, version: 0 })
  }

  function editRegion(value?: Region) {
    resetForms()
    setRegionDraft(value ? { id: value.id, version: value.version, name: value.name } : { name: '', version: 0 })
  }

  function saveRegion() {
    if (!regionDraft) return
    const { id, name, version } = regionDraft
    void mutate(
      () => api<Region>(id ? '/regions/' + id : '/regions', id ? 'PUT' : 'POST', { name, version }),
      () => setRegionDraft(null),
      '区域已保存',
    )
  }

  function removeRegion(value: Region) {
    void mutate(
      () => api('/regions/' + value.id + '?version=' + value.version, 'DELETE'),
      () => { setRegionDraft(null); resetForms() },
      '区域已删除',
    )
  }

  function saveRoom() {
    if (!roomDraft) return
    const { id, ...fields } = roomDraft
    void mutate(() => api<Room>(id ? '/rooms/' + id : '/rooms', id ? 'PUT' : 'POST', fields), saved => {
      onRoomChange(saved.id)
      setRoomDraft(null)
    }, '数据中心已保存')
  }

  function removeRoom(value: Room) {
    void mutate(() => api('/rooms/' + value.id + '?version=' + value.version, 'DELETE'), resetForms, '数据中心已删除')
  }

  function editRack(value?: Rack) {
    resetForms()
    const free = cells.find(cell => !cell.rack)
    if (value) setRackDraft({ ...value })
    else if (free) setRackDraft({ name: '', zone: '', heightU: 42, column: free.column, row: free.row, rotation: 0, version: 0 })
    else setError('数据中心网格已占满，请先扩大布局')
  }

  function saveRack() {
    if (!rackDraft || !room) return
    const { id, name, heightU, column, row, rotation, version } = rackDraft
    const path = id ? '/racks/' + id : '/rooms/' + room.id + '/racks'
    void mutate(() => api<Rack>(path, id ? 'PUT' : 'POST', { name, heightU, column, row, rotation, version }), saved => {
      setRackId(saved.id)
      setRackDraft(null)
    }, '机柜已保存')
  }

  function removeRack(value: Rack) {
    void mutate(() => api('/racks/' + value.id + '?version=' + value.version, 'DELETE'), resetForms, '机柜已删除')
  }

  function freePosition(units: number, ignore = 0, face: RackFace = 'front', depth: PlacementDepth = 'full') {
    if (!rack) return 1
    for (let start = 1; start + units - 1 <= rack.heightU; start++) {
      const candidate = { assetId: ignore, startU: start, units, face, depth }
      if (!devices.some(item => placementsConflict(candidate, item))) return start
    }
    return 1
  }

  function editMount(value?: Placement) {
    resetForms()
    const asset = value && byId.get(value.assetId)
    const canMove = asset && candidates.some(item => item.id === asset.id)
    if (value && !canMove) return
    const face = value?.face ?? 'front'
    const depth = value?.depth ?? 'full'
    setMountDraft({
      mode: value || candidates.length ? 'existing' : 'new',
      assetId: value?.assetId ?? 0,
      version: value?.version ?? 0,
      kind: 'host',
      name: '',
      address: '',
      startU: value?.startU ?? freePosition(1, 0, face, depth),
      units: value?.units ?? 1,
      face,
      depth,
    })
  }

  function editMountAt(startU: number, face: RackFace) {
    resetForms()
    const units = 2
    const safeStart = rack ? Math.max(1, Math.min(startU, rack.heightU - units + 1)) : startU
    setMountDraft({
      mode: candidates.length ? 'existing' : 'new',
      assetId: 0,
      version: 0,
      kind: 'host',
      name: '',
      address: '',
      startU: safeStart,
      units,
      face,
      depth: 'full',
    })
  }

  function mountAt(target: Rack, startU: number) {
    resetForms()
    selectRack(target.id)
    setRackDrawerOpen(true)
    const units = 2
    setMountDraft({
      mode: candidates.length ? 'existing' : 'new',
      assetId: 0,
      version: 0,
      kind: 'host',
      name: '',
      address: '',
      startU: Math.max(1, Math.min(startU, target.heightU - units + 1)),
      units,
      face: 'front',
      depth: 'full',
    })
  }

  function changeDevice(next = mountDraft) {
    if (!next) return
    const previous = mounted.get(next.assetId)
    const face = previous?.face ?? next.face
    const depth = previous?.depth ?? next.depth
    const units = previous?.units ?? next.units
    const startU = previous?.rackId === rackId
      ? previous.startU
      : (!rack || next.startU + units - 1 <= rack.heightU ? next.startU : freePosition(units, next.assetId, face, depth))
    setMountDraft({
      ...next,
      version: previous?.version ?? 0,
      units,
      face,
      depth,
      startU,
    })
  }

  function changeMountMode(next = mountDraft) {
    if (!next) return
    if (next.mode === 'existing') {
      changeDevice(next)
    } else {
      const units = next.kind === 'switch' ? 1 : 2
      setMountDraft({ ...next, units, startU: freePosition(units, 0, next.face, next.depth) })
    }
  }

  function saveMount() {
    if (!mountDraft || !rack) return
    const { startU, units, mode, assetId, version, kind, name, address, face, depth } = mountDraft
    const fields = { rackId: rack.id, startU, units, face, depth }
    const create = mode === 'new'
    if (!create && !assetId) return
    void mutate(() => create
      ? api<Placement>('/placements', 'POST', { ...fields, newAsset: { kind, name, address } })
      : api<Placement>('/assets/' + assetId + '/placement', 'PUT', { ...fields, version }), placed => {
      setMountDraft(null)
      setFocused(placed.assetId)
    }, create || !version ? '设备已上架' : '设备位置已更新')
  }

  function unmountDevice(value: Placement) {
    void mutate(() => api('/assets/' + value.assetId + '/placement?version=' + value.version, 'DELETE'), () => {
      setMountDraft(null)
      if (focused === value.assetId) setFocused(null)
    }, '设备已下架')
  }

  function moveDevice(value: Placement, startU: number) {
    if (!rack) return
    void mutate(() => api<Placement>('/assets/' + value.assetId + '/placement', 'PUT', {
      rackId: rack.id, startU, units: value.units, face: value.face, depth: value.depth, version: value.version,
    }), placed => setFocused(placed.assetId), '设备位置已更新')
  }

  const mountForm = rack && mountDraft ? (
    <form className="facility-form mount-form flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); saveMount() }}>
      <Field label="录入方式"><Choice label="录入方式" value={mountDraft.mode} onChange={mode => changeMountMode({ ...mountDraft, mode })} options={[{ value: 'existing', label: '关联已有资产' }, { value: 'new', label: '新建资产并上架' }]} /></Field>
      {mountDraft.mode === 'existing' ? <>
        <Field label="选择设备"><Choice label="选择设备" value={mountDraft.assetId} onChange={assetId => changeDevice({ ...mountDraft, assetId })} options={[{ value: 0, label: '请选择资产' }, ...candidates.map(asset => ({ value: asset.id, label: `${asset.name} · ${mountKinds[asset.kind as MountKind]} #${asset.id}${mounted.has(asset.id) ? ' · 已上架' : ''}` }))]} /></Field>
        {mountLocation && <div className="text-sm">当前位置：{locationLabel(mountLocation)}</div>}
      </> : <>
        <Field label="设备类型"><Choice label="设备类型" value={mountDraft.kind} onChange={kind => changeMountMode({ ...mountDraft, kind })} options={Object.entries(mountKinds).map(([value, label]) => ({ value: value as MountKind, label }))} /></Field>
        <Field label="设备名称"><Input value={mountDraft.name} maxLength={160} onChange={event => setMountDraft({ ...mountDraft, name: event.target.value })} /></Field>
        <Field label="管理地址 / IP"><Input value={mountDraft.address} maxLength={160} onChange={event => setMountDraft({ ...mountDraft, address: event.target.value })} /></Field>
      </>}
      <Field label="起始 U 位"><Input type="number" className="w-24" min={1} max={rack.heightU} value={mountDraft.startU} onChange={event => setMountDraft({ ...mountDraft, startU: Number(event.target.value) || 1 })} /></Field>
      <Field label="占用 U 数"><Input type="number" className="w-24" min={1} max={rack.heightU} value={mountDraft.units} onChange={event => setMountDraft({ ...mountDraft, units: Number(event.target.value) || 1 })} /></Field>
      <Field label="安装面"><Choice label="安装面" value={mountDraft.face} onChange={face => setMountDraft({ ...mountDraft, face })} options={[{ value: 'front', label: '前面' }, { value: 'rear', label: '后面' }]} /></Field>
      <Field label="深度"><Choice label="深度" value={mountDraft.depth} onChange={depth => setMountDraft({ ...mountDraft, depth })} options={[{ value: 'full', label: '全深设备' }, { value: 'half', label: '半深设备' }]} /></Field>
      <div className="flex gap-2"><Button type="submit" disabled={busy || (mountDraft.mode === 'existing' && !mountDraft.assetId)}>{mountDraft.mode === 'existing' && mountDraft.version ? '保存位置' : '保存上架'}</Button><Button type="button" variant="outline" onClick={() => setMountDraft(null)}>取消</Button></div>
    </form>
  ) : null

  return (
    <div className="facilities">
      <div className="facility-layout" style={{ gridTemplateColumns: `${treeWidth}px 6px minmax(0, 1fr)` }}>
        <aside className="facility-sidebar">
          <div className="facility-sidebar-head">
            <div className="facility-sidebar-title"><strong>数据中心</strong></div>
          </div>
          <div className="facility-sidebar-search">
            <Input type="search" placeholder="搜索数据中心" aria-label="搜索数据中心" value={roomSearch} onChange={event => setRoomSearch(event.target.value)} />
            {editable && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="数据中心操作"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => editRegion()}><Plus />新增区域</DropdownMenuItem><DropdownMenuItem onSelect={() => editRoom()}><Plus />新增数据中心</DropdownMenuItem><DropdownMenuItem disabled={!room} onSelect={() => { if (room) editRoom(room) }}><Pencil />编辑当前数据中心</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
          </div>
          <div className="facility-tree">
            {groupedRooms.map(group => (
              <div key={group.key} className="facility-tree-group">
                {group.region && (
                  <div className="facility-tree-region">
                    <span className="facility-tree-region-name">{group.region.name}</span>
                    {editable && (
                      <button type="button" className="facility-tree-region-action" aria-label={`编辑区域 ${group.region.name}`} onClick={() => editRegion(group.region)}>
                        <Pencil size={12} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
                {group.rooms.map(item => (
                  <button key={item.id} type="button" className={`facility-tree-item${item.id === activeRoomId ? ' active' : ''}`} title={item.name} onClick={() => selectRoom(item.id)}><span className="facility-tree-name">{item.name}</span></button>
                ))}
              </div>
            ))}
            {!filteredRooms.length && <div className="facility-tree-empty">暂无匹配的数据中心</div>}
          </div>
        </aside>
        <div className="facility-resizer" role="separator" aria-orientation="vertical" aria-label="拖动调整导航宽度" onMouseDown={startResize} />
        <div className="facility-main">
          {error && <div role="alert" className="mb-3 rounded-md border border-destructive p-3 text-destructive">{error}</div>}
          {feedback && <div role="status" className="mb-3 rounded-md border border-border p-3">{feedback}</div>}
          {!room ? <Card><CardContent className="p-6 text-center text-muted-foreground"><p>暂无数据中心</p>{editable && <Button onClick={() => editRoom()}>新增数据中心</Button>}</CardContent></Card> : (
            <div className="facility-workspace">
              <div className="dc-summary">
                <div className="dc-heading">
                  <h2 className="dc-title">{room.name}</h2>
                </div>
                <div className="dc-stat"><span className="dc-stat-label">机柜</span><strong className="dc-stat-value">{racks.length}</strong></div>
                <div className="dc-stat"><span className="dc-stat-label">设备</span><strong className="dc-stat-value">{roomPlacements.length}</strong></div>
                <div className="dc-stat"><span className="dc-stat-label">利用率</span><strong className="dc-stat-value">{roomUtilization}%</strong></div>
              </div>
              <Card className="floor-panel">
                <CardContent>
                  {rackDraft && <form className="facility-form rack-form flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); saveRack() }}>
                    <Field label="机柜编号"><Input value={rackDraft.name} placeholder="例如：A-01" maxLength={80} onChange={event => setRackDraft({ ...rackDraft, name: event.target.value })} /></Field>
                    <Field label="区域 / 排"><Input value={rackDraft.zone} placeholder="例如：A 区" maxLength={40} onChange={event => setRackDraft({ ...rackDraft, zone: event.target.value })} /></Field>
                    <Field label="高度（U）"><Input type="number" className="w-24" min={1} max={80} value={rackDraft.heightU} onChange={event => setRackDraft({ ...rackDraft, heightU: Number(event.target.value) || 1 })} /></Field>
                    <Field label="列"><Input type="number" className="w-20" min={1} max={room.columns} value={rackDraft.column} onChange={event => setRackDraft({ ...rackDraft, column: Number(event.target.value) || 1 })} /></Field>
                    <Field label="行"><Input type="number" className="w-20" min={1} max={room.rows} value={rackDraft.row} onChange={event => setRackDraft({ ...rackDraft, row: Number(event.target.value) || 1 })} /></Field>
                    <Field label="朝向"><Choice label="朝向" value={rackDraft.rotation} onChange={rotation => setRackDraft({ ...rackDraft, rotation })} options={[{ value: 0, label: '向下' }, { value: 90, label: '向左' }, { value: 180, label: '向上' }, { value: 270, label: '向右' }]} /></Field>
                    <div className="flex gap-2"><Button type="submit" disabled={busy}>保存机柜</Button><Button type="button" variant="outline" onClick={() => setRackDraft(null)}>取消</Button>{rackDraft.id && rack?.id === rackDraft.id && !devices.length && <ConfirmDelete title="删除该空机柜？" disabled={busy} onConfirm={() => removeRack(rack)}>删除空机柜</ConfirmDelete>}</div>
                  </form>}
                  <div className="floor-toolbar">
                    <div className="floor-toolbar-search">
                      {view === '3d' ? <Input type="search" className="w-[320px]" aria-label="搜索已上架资产、数据中心或机柜" placeholder="搜索已上架资产、数据中心或机柜…" value={search} onChange={event => setSearch(event.target.value)} /> : <Input type="search" className="w-[320px]" aria-label="搜索机柜名称" placeholder="搜索机柜名称…" value={rackKeyword} onChange={event => setRackKeyword(event.target.value)} />}
                      {view === '3d' && racks.length > 0 && <><span className="muted">机柜</span><Choice label="机柜" className="w-[140px]" value={rackId ?? undefined} disabled={busy} onChange={openRack} options={racks.map(item => ({ value: item.id, label: item.name }))} /></>}
                    </div>
                    <div className="floor-toolbar-actions">
                      <div className="view-toggle">
                        <Button variant={view === 'table' ? 'default' : 'outline'} size="icon-sm" aria-label="表格" title="表格" onClick={() => setView('table')}><List /></Button>
                        <Button variant={view === 'elevations' ? 'default' : 'outline'} size="icon-sm" aria-label="立面图" title="立面图" onClick={() => setView('elevations')}><Columns3 /></Button>
                        <Button variant={view === '3d' ? 'default' : 'outline'} size="icon-sm" aria-label="3D 总览" title="3D 总览" onClick={() => setView('3d')}><Boxes /></Button>
                      </div>
                      {editable && <Button size="sm" disabled={busy} onClick={() => editRack()}><Plus />新增机柜</Button>}
                    </div>
                  </div>
                  {view === '3d' && search.trim() && <div className="location-results">{searchResults.length ? searchResults.map(({ asset, location }) => <div key={asset.id} className="border-b py-1"><Button variant="link" className="location-result" onClick={() => showLocation(location)}><strong>{asset.name}</strong><span className="muted">{locationLabel(location)}</span></Button></div>) : <div className="p-3 text-sm text-muted-foreground">暂无匹配的上架位置</div>}</div>}
                  {view === 'table' ? (
                    <div className="facility-table-wrap">
                      <table className="facility-table">
                        <thead><tr><th>机柜</th><th>区域 / 排</th><th>U 位总数</th><th>已用</th><th>空闲</th><th>占用率</th><th>设备数</th><th aria-label="操作" /></tr></thead>
                        <tbody>
                          {rackRows.map(item => {
                            const placements = roomPlacements.filter(entry => entry.rackId === item.id)
                            const used = occupiedUnits(placements).size
                            const free = Math.max(0, item.heightU - used)
                            const rate = item.heightU > 0 ? Math.round((used / item.heightU) * 100) : 0
                            return (
                              <tr key={item.id} onClick={() => openRack(item.id)}>
                                <td><strong>{item.name}</strong></td>
                                <td>{item.zone || '—'}</td>
                                <td>{item.heightU}U</td>
                                <td>{used}U</td>
                                <td>{free}U</td>
                                <td>{rate}%</td>
                                <td>{placements.length}</td>
                                <td className="text-right"><Button size="sm" variant="outline" onClick={event => { event.stopPropagation(); editRack(item) }}>编辑</Button></td>
                              </tr>
                            )
                          })}
                          {!rackRows.length && <tr><td colSpan={8} className="facility-table-empty">{rackKeyword ? '没有匹配的机柜' : '还没有机柜，点右上角「新增机柜」开始'}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  ) : view === 'elevations' ? (
                    <div className="rack-board">
                      {rackRows.map(item => {
                        const placements = roomPlacements.filter(entry => entry.rackId === item.id)
                        const preview = rackElevationSvg(item, placements, byId, 'front', { interactive: editable })
                        return (
                          <div key={item.id} className="rack-board-item">
                            <div className="rack-board-head">
                              <strong>{item.name}</strong>
                              {item.zone && <span className="rack-board-role">{item.zone}</span>}
                            </div>
                            <div
                              className="rack-board-figure" role="button" tabIndex={0}
                              aria-label={`打开 ${item.name}`}
                              onClick={event => {
                                const target = event.target as Element
                                const assetId = target.closest('[data-asset]')?.getAttribute('data-asset')
                                if (assetId) {
                                  onOpenAsset(Number(assetId))
                                  return
                                }
                                const unit = target.closest('[data-unit]')?.getAttribute('data-unit')
                                if (unit && editable) {
                                  mountAt(item, Number(unit))
                                  return
                                }
                                openRack(item.id)
                              }}
                              onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  openRack(item.id)
                                }
                              }}
                              dangerouslySetInnerHTML={{ __html: preview.svg }}
                            />
                            <Button size="sm" variant="outline" onClick={() => downloadRackSvg(rackElevationSvg(item, placements, byId, 'front'))}><Download />下载 SVG 文件</Button>
                          </div>
                        )
                      })}
                      {!rackRows.length && <p className="muted">当前数据中心还没有机柜</p>}
                    </div>
                  ) : <RoomScene room={room} racks={racks} placements={roomPlacements} assets={byId} selectedRack={rackId} selectedAsset={focused} dark={dark} onRack={openRack} onDevice={openSceneDevice} />}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
      <Dialog open={!!roomDraft} onOpenChange={open => { if (!open) setRoomDraft(null) }}>
        <DialogContent><DialogHeader><DialogTitle>{roomDraft?.id ? '编辑数据中心' : '新增数据中心'}</DialogTitle><DialogDescription>维护数据中心名称。</DialogDescription></DialogHeader>
          {roomDraft && <form className="space-y-4" onSubmit={event => { event.preventDefault(); saveRoom() }}><Field label="数据中心名称"><Input required value={roomDraft.name} placeholder="例如：北京数据中心" maxLength={160} onChange={event => setRoomDraft({ ...roomDraft, name: event.target.value })} /></Field><Field label="所属区域（可选）"><Select value={roomDraft.regionId ? String(roomDraft.regionId) : 'none'} onValueChange={value => setRoomDraft({ ...roomDraft, regionId: value === 'none' ? 0 : Number(value) })}><SelectTrigger><SelectValue placeholder="不归入区域" /></SelectTrigger><SelectContent><SelectItem value="none">不归入区域</SelectItem>{layout.regions.map(region => <SelectItem key={region.id} value={String(region.id)}>{region.name}</SelectItem>)}</SelectContent></Select></Field><div className="room-modal-actions flex flex-wrap gap-2"><Button type="submit" disabled={busy}>保存数据中心</Button><Button type="button" variant="outline" onClick={() => setRoomDraft(null)}>取消</Button>{roomDraft.id && room?.id === roomDraft.id && !racks.length && <ConfirmDelete title="删除该空数据中心？" disabled={busy} onConfirm={() => removeRoom(room)}>删除空数据中心</ConfirmDelete>}</div></form>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!regionDraft} onOpenChange={open => { if (!open) setRegionDraft(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{regionDraft?.id ? '编辑区域' : '新增区域'}</DialogTitle>
            <DialogDescription>区域用于按城市或片区归类数据中心；可以不建区域，直接创建数据中心。</DialogDescription>
          </DialogHeader>
          {regionDraft && (
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); saveRegion() }}>
              <Field label="区域名称"><Input required value={regionDraft.name} placeholder="例如：华北、北京" maxLength={80} onChange={event => setRegionDraft({ ...regionDraft, name: event.target.value })} /></Field>
              <div className="room-modal-actions flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>保存区域</Button>
                <Button type="button" variant="outline" onClick={() => setRegionDraft(null)}>取消</Button>
                {regionDraft.id && <ConfirmDelete title={`删除区域「${regionDraft.name}」？`} disabled={busy} onConfirm={() => removeRegion({ id: regionDraft.id!, name: regionDraft.name, version: regionDraft.version })}>删除区域</ConfirmDelete>}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <RackDetailDrawer open={rackDrawerOpen} rack={rack ?? null} room={room ?? null} devices={devices} assets={byId} editable={editable} busy={busy} bookmarked={!!rack && bookmarkedRacks.includes(rack.id)} onToggleBookmark={() => { if (rack) onToggleRackBookmark(rack.id) }} focused={focused} feedback={feedback} error={error} mountForm={mountForm} onClose={closeRackDrawer} onOpenAsset={onOpenAsset} onEditRack={value => { setRackDrawerOpen(false); editRack(value) }} onMount={() => editMount()} onEditPlacement={value => editMount(value)} onUnmount={unmountDevice} onMove={moveDevice} onMountAt={editMountAt} />
    </div>
  )
}
