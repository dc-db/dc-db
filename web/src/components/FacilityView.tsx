import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Building2, Boxes, ChartPie, Grid2X2, LayoutGrid, MoreHorizontal, Pencil, Plus, Server } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Input } from './ui/input'
import { Progress } from './ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { api, APIError } from '../api'
import type { Asset, Link } from '../api'
import { assetLocations, isMountKind, locationLabel, mountKinds, occupiedUnits, placementsConflict } from '../facilities'
import type { AssetLocation, Facilities, MountKind, Placement, PlacementDepth, Rack, RackFace, RackFields, Room, RoomFields } from '../facilities'
import { RackCardGrid } from './RackCardGrid'
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
  const [view, setView] = useState<'cards' | 'floor' | '3d'>('cards')
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null)
  const [rackDraft, setRackDraft] = useState<RackDraft | null>(null)
  const [mountDraft, setMountDraft] = useState<MountDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [roomSearch, setRoomSearch] = useState('')
  const [rackKeyword, setRackKeyword] = useState('')
  const [dragRack, setDragRack] = useState<number | null>(null)
  const [rackDrawerOpen, setRackDrawerOpen] = useState(false)

  const rooms = layout.rooms
  const activeRoomId = roomId ?? rooms[0]?.id ?? null
  const room = rooms.find(item => item.id === activeRoomId)
  const sortedRooms = useMemo(() => rooms.slice().sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')), [rooms])
  const filteredRooms = roomSearch.trim()
    ? sortedRooms.filter(item => item.name.toLowerCase().includes(roomSearch.trim().toLowerCase()))
    : sortedRooms
  const racks = useMemo(() => layout.racks.filter(item => item.roomId === activeRoomId), [layout.racks, activeRoomId])
  const rack = racks.find(item => item.id === rackId)
  const rackIds = useMemo(() => new Set(racks.map(item => item.id)), [racks])
  const roomPlacements = useMemo(() => layout.placements.filter(item => rackIds.has(item.rackId)), [layout.placements, rackIds])
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
    setRoomDraft(value ? { ...value } : { name: '', columns: 8, rows: 6, version: 0 })
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
    else if (free) setRackDraft({ name: '', heightU: 42, column: free.column, row: free.row, rotation: 0, version: 0 })
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

  function startDrag(event: React.DragEvent, value: Rack) {
    if (!editable || busy || !event.dataTransfer) {
      event.preventDefault()
      return
    }
    setDragRack(value.id)
    event.dataTransfer.setData('text/plain', String(value.id))
    event.dataTransfer.effectAllowed = 'move'
  }

  function allowDrop(event: React.DragEvent, occupied: boolean) {
    if (!dragRack || occupied || !editable || busy) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  function moveRack(event: React.DragEvent, column: number, row: number, occupied: boolean) {
    const item = racks.find(value => value.id === dragRack)
    setDragRack(null)
    if (!editable || busy || occupied || !item || event.dataTransfer?.getData('text/plain') !== String(item.id)) return
    event.preventDefault()
    const { name, heightU, rotation, version } = item
    void mutate(() => api<Rack>('/racks/' + item.id, 'PUT', { name, heightU, column, row, rotation, version }), saved => {
      setRackId(saved.id)
      setRackDraft(null)
    }, '机柜位置已更新')
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
      <div className="facility-layout">
        <aside className="facility-sidebar">
          <div className="facility-sidebar-head">
            <div className="facility-sidebar-title"><Building2 size="1em" aria-hidden="true" /><strong>数据中心</strong><span>{rooms.length}</span></div>
            {editable && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="数据中心操作"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => editRoom()}><Plus />新增数据中心</DropdownMenuItem><DropdownMenuItem disabled={!room} onSelect={() => { if (room) editRoom(room) }}><Pencil />编辑当前数据中心</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
          </div>
          <Input type="search" placeholder="搜索数据中心" aria-label="搜索数据中心" value={roomSearch} onChange={event => setRoomSearch(event.target.value)} />
          <div className="facility-tree">
            {filteredRooms.map(item => {
              const count = layout.racks.filter(rack => rack.roomId === item.id).length
              return <button key={item.id} type="button" className={`facility-tree-item${item.id === activeRoomId ? ' active' : ''}`} title={`${item.name} · ${count} 台机柜`} onClick={() => selectRoom(item.id)}><Boxes size="1em" aria-hidden="true" /><span className="facility-tree-name">{item.name}</span><span className="facility-tree-count">{count}</span></button>
            })}
            {!filteredRooms.length && <div className="facility-tree-empty">暂无匹配的数据中心</div>}
          </div>
        </aside>
        <div className="facility-main">
          {error && <div role="alert" className="mb-3 rounded-md border border-destructive p-3 text-destructive">{error}</div>}
          {feedback && <div role="status" className="mb-3 rounded-md border border-border p-3">{feedback}</div>}
          {!room ? <Card><CardContent className="p-6 text-center text-muted-foreground"><p>暂无数据中心</p>{editable && <Button onClick={() => editRoom()}>新增数据中心</Button>}</CardContent></Card> : (
            <div className="facility-workspace">
              <div className="dc-summary">
                <div className="dc-stat"><div className="dc-stat-icon racks"><Boxes size="1em" aria-hidden="true" /></div><div className="dc-stat-copy"><span>机柜数</span><strong>{racks.length}</strong><small>台机柜</small></div></div>
                <div className="dc-stat"><div className="dc-stat-icon devices"><Server size="1em" aria-hidden="true" /></div><div className="dc-stat-copy"><span>设备数</span><strong>{roomPlacements.length}</strong><small>台设备</small></div></div>
                <div className="dc-stat dc-stat-usage"><div className="dc-stat-icon usage"><ChartPie size="1em" aria-hidden="true" /></div><div className="dc-stat-copy"><span>利用率</span><strong>{roomUtilization}%</strong><small>已用 {usedRoomU}U · 空闲 {Math.max(0, totalRoomU - usedRoomU)}U</small><Progress value={roomUtilization} aria-label="数据中心利用率" /></div></div>
              </div>
              <Card className="floor-panel">
                <CardHeader className="flex flex-row items-center justify-between"><CardTitle>{room.name}</CardTitle>{editable && <Button size="sm" disabled={busy} onClick={() => editRack()}><Plus />新增机柜</Button>}</CardHeader>
                <CardContent>
                  {rackDraft && <form className="facility-form rack-form flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); saveRack() }}>
                    <Field label="机柜编号"><Input value={rackDraft.name} placeholder="例如：A-01" maxLength={80} onChange={event => setRackDraft({ ...rackDraft, name: event.target.value })} /></Field>
                    <Field label="高度（U）"><Input type="number" className="w-24" min={1} max={80} value={rackDraft.heightU} onChange={event => setRackDraft({ ...rackDraft, heightU: Number(event.target.value) || 1 })} /></Field>
                    <Field label="列"><Input type="number" className="w-20" min={1} max={room.columns} value={rackDraft.column} onChange={event => setRackDraft({ ...rackDraft, column: Number(event.target.value) || 1 })} /></Field>
                    <Field label="行"><Input type="number" className="w-20" min={1} max={room.rows} value={rackDraft.row} onChange={event => setRackDraft({ ...rackDraft, row: Number(event.target.value) || 1 })} /></Field>
                    <Field label="朝向"><Choice label="朝向" value={rackDraft.rotation} onChange={rotation => setRackDraft({ ...rackDraft, rotation })} options={[{ value: 0, label: '向下' }, { value: 90, label: '向左' }, { value: 180, label: '向上' }, { value: 270, label: '向右' }]} /></Field>
                    <div className="flex gap-2"><Button type="submit" disabled={busy}>保存机柜</Button><Button type="button" variant="outline" onClick={() => setRackDraft(null)}>取消</Button>{rackDraft.id && rack?.id === rackDraft.id && !devices.length && <ConfirmDelete title="删除该空机柜？" disabled={busy} onConfirm={() => removeRack(rack)}>删除空机柜</ConfirmDelete>}</div>
                  </form>}
                  <div className="floor-toolbar">
                    <div className="flex gap-2"><Button variant={view === 'cards' ? 'default' : 'outline'} size="sm" onClick={() => setView('cards')}><Boxes />机柜视图</Button><Button variant={view === 'floor' ? 'default' : 'outline'} size="sm" onClick={() => setView('floor')}><Grid2X2 />平面布局</Button><Button variant={view === '3d' ? 'default' : 'outline'} size="sm" onClick={() => setView('3d')}><LayoutGrid />3D 总览</Button></div>
                    <div className="flex flex-wrap items-center gap-2">
                      {view === 'cards' ? <Input type="search" className="w-[300px]" aria-label="搜索机柜名称" placeholder="搜索机柜名称…" value={rackKeyword} onChange={event => setRackKeyword(event.target.value)} /> : <Input type="search" className="w-[300px]" aria-label="搜索已上架资产、数据中心或机柜" placeholder="搜索已上架资产、数据中心或机柜…" value={search} onChange={event => setSearch(event.target.value)} />}
                      {view !== 'cards' && racks.length > 0 && <><span className="muted">机柜</span><Choice label="机柜" className="w-[140px]" value={rackId ?? undefined} disabled={busy} onChange={openRack} options={racks.map(item => ({ value: item.id, label: item.name }))} /></>}
                    </div>
                  </div>
                  {view !== 'cards' && search.trim() && <div className="location-results">{searchResults.length ? searchResults.map(({ asset, location }) => <div key={asset.id} className="border-b py-1"><Button variant="link" className="location-result" onClick={() => showLocation(location)}><strong>{asset.name}</strong><span className="muted">{locationLabel(location)}</span></Button></div>) : <div className="p-3 text-sm text-muted-foreground">暂无匹配的上架位置</div>}</div>}
                  {view === 'cards' ? <RackCardGrid racks={racks} placements={roomPlacements} assets={byId} keyword={rackKeyword} onOpen={openRack} /> : view === 'floor' ? (
                    <div className="floor-scroll"><div className="floor-grid" style={{ gridTemplateColumns: `repeat(${room.columns}, minmax(54px, 1fr))` }}>{cells.map(cell => <div key={cell.key} className={`floor-cell${dragRack && !cell.rack ? ' drop-cell' : ''}`} title={`第 ${cell.row} 行，第 ${cell.column} 列`} onDragOver={event => allowDrop(event, !!cell.rack)} onDrop={event => moveRack(event, cell.column, cell.row, !!cell.rack)}>{cell.rack ? <button className="rack-tile" type="button" aria-pressed={cell.rack.id === rackId} draggable={editable && !busy} onClick={() => openRack(cell.rack!.id)} onDragStart={event => startDrag(event, cell.rack!)} onDragEnd={() => setDragRack(null)}><Server size="1em" aria-hidden="true" /><strong>{cell.rack.name}</strong><span className="rack-direction" aria-hidden="true" style={{ transform: `rotate(${cell.rack.rotation}deg)` }}>↓</span></button> : <span className="muted cell-dot" aria-hidden="true">·</span>}</div>)}</div>{editable && racks.length > 0 && <p className="floor-hint muted">拖动机柜到空格；点击机柜打开机柜视图，拖动设备调整 U 位。</p>}</div>
                  ) : <RoomScene room={room} racks={racks} placements={roomPlacements} assets={byId} selectedRack={rackId} selectedAsset={focused} dark={dark} onRack={openRack} onDevice={openSceneDevice} />}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
      <Dialog open={!!roomDraft} onOpenChange={open => { if (!open) setRoomDraft(null) }}>
        <DialogContent><DialogHeader><DialogTitle>{roomDraft?.id ? '编辑数据中心' : '新增数据中心'}</DialogTitle><DialogDescription>维护数据中心名称。</DialogDescription></DialogHeader>
          {roomDraft && <form className="space-y-4" onSubmit={event => { event.preventDefault(); saveRoom() }}><Field label="数据中心名称"><Input required value={roomDraft.name} placeholder="例如：北京数据中心" maxLength={160} onChange={event => setRoomDraft({ ...roomDraft, name: event.target.value })} /></Field><div className="room-modal-actions flex flex-wrap gap-2"><Button type="submit" disabled={busy}>保存数据中心</Button><Button type="button" variant="outline" onClick={() => setRoomDraft(null)}>取消</Button>{roomDraft.id && room?.id === roomDraft.id && !racks.length && <ConfirmDelete title="删除该空数据中心？" disabled={busy} onConfirm={() => removeRoom(room)}>删除空数据中心</ConfirmDelete>}</div></form>}
        </DialogContent>
      </Dialog>
      <RackDetailDrawer open={rackDrawerOpen} rack={rack ?? null} room={room ?? null} devices={devices} assets={byId} editable={editable} busy={busy} bookmarked={!!rack && bookmarkedRacks.includes(rack.id)} onToggleBookmark={() => { if (rack) onToggleRackBookmark(rack.id) }} focused={focused} feedback={feedback} error={error} mountForm={mountForm} onClose={closeRackDrawer} onOpenAsset={onOpenAsset} onEditRack={value => { setRackDrawerOpen(false); editRack(value) }} onMount={() => editMount()} onEditPlacement={value => editMount(value)} onUnmount={unmountDevice} onMove={moveDevice} onMountAt={editMountAt} />
    </div>
  )
}
