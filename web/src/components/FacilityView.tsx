import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Download, MoreHorizontal, Pencil, Plus, Settings2, Upload } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Input } from './ui/input'
import { UsageBar } from './UsageBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { api, APIError } from '../api'
import type { Asset, Link } from '../api'
import { assetLocations, isMountKind, locationLabel, mountKinds, occupiedUnits, placementsConflict } from '../facilities'
import { isNetworkKind } from '../kinds'
import type { AssetLocation, Facilities, MountKind, Placement, PlacementDepth, Rack, RackFace, RackFields, Region, Room, RoomFields } from '../facilities'
import { rackElevationSvg } from '../rackExport'
import { downloadCSV } from '../csv'
import { RackDetailDrawer } from './RackDetailDrawer'

interface Props {
  roomId: number | null
  onRoomChange: (id: number) => void
  openRackId: number | null
  onRackOpened: () => void
  layout: Facilities
  assets: Asset[]
  links: Link[]
  editable: boolean
  focus: AssetLocation | null
  reload: () => Promise<void>
  onOpenAsset: (id: number) => void
  bookmarkedRacks: number[]
  onToggleRackBookmark: (id: number) => void
  onSessionError: (error: unknown) => void
}

const rackColumns = [
  { key: 'name', label: '机柜' },
  { key: 'zone', label: '区域 / 排' },
  { key: 'height', label: 'U 位总数' },
  { key: 'used', label: '已用' },
  { key: 'free', label: '空闲' },
  { key: 'usage', label: '占用率' },
  { key: 'devices', label: '设备数' },
] as const

type RackColumn = typeof rackColumns[number]['key']
const defaultRackColumns: RackColumn[] = rackColumns.map(column => column.key)
const rackColumnsStorageKey = 'dc-db-columns:racks'

function loadRackColumns(): RackColumn[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(rackColumnsStorageKey) ?? 'null')
    if (Array.isArray(stored)) {
      const selected = defaultRackColumns.filter(key => stored.includes(key))
      if (selected.length) return selected
    }
  } catch {
    // Use defaults when storage is unavailable or invalid.
  }
  return defaultRackColumns
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

export function FacilityView({ roomId, onRoomChange, openRackId, onRackOpened, layout, assets, links, editable, focus, reload, onOpenAsset, bookmarkedRacks, onToggleRackBookmark, onSessionError }: Props) {
  const [rackId, setRackId] = useState<number | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const [view, setView] = useState<'table' | 'elevations'>('table')
  const [visibleRackColumns, setVisibleRackColumns] = useState<RackColumn[]>(loadRackColumns)
  const [face, setFace] = useState<RackFace>('front')
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null)
  const [regionDraft, setRegionDraft] = useState<{ id?: number; version: number; name: string } | null>(null)
  const [rackDraft, setRackDraft] = useState<RackDraft | null>(null)
  const [mountDraft, setMountDraft] = useState<MountDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [roomSearch, setRoomSearch] = useState('')
  const [rackKeyword, setRackKeyword] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [rackDrawerOpen, setRackDrawerOpen] = useState(false)
  const [treeWidth, setTreeWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem('dc-db-tree-width'))
    return saved >= 180 && saved <= 420 ? saved : 260
  })

  useEffect(() => { window.localStorage.setItem('dc-db-tree-width', String(treeWidth)) }, [treeWidth])

  function updateRackColumns(columns: RackColumn[]) {
    if (!columns.length) return
    setVisibleRackColumns(columns)
    try {
      localStorage.setItem(rackColumnsStorageKey, JSON.stringify(columns))
    } catch {
      // Keep the selection for this session when storage is unavailable.
    }
  }


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
    onRoomChange(location.room.id)
    setRackId(location.rack.id)
    setFocused(location.placement.assetId)
    setRackDrawerOpen(true)
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
    setRoomDraft(value ? { ...value } : { name: '', regionId: 0, version: 0 })
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
    if (value) setRackDraft({ ...value })
    else setRackDraft({ name: '', zone: '', heightU: 42, version: 0 })
  }

  function saveRack() {
    if (!rackDraft || !room) return
    const { id, name, zone, heightU, version } = rackDraft
    const path = id ? '/racks/' + id : '/rooms/' + room.id + '/racks'
    void mutate(() => api<Rack>(path, id ? 'PUT' : 'POST', { name, zone, heightU, version }), saved => {
      setRackId(saved.id)
      setRackDraft(null)
    }, '机柜已保存')
  }

  function exportRacks() {
    if (!room) return
    const rows: (string | number)[][] = [['机柜编号', '区域/排', '高度（U）', '已用U位', '空闲U位', '占用率', '设备数']]
    for (const item of rackRows) {
      const placements = roomPlacements.filter(entry => entry.rackId === item.id)
      const used = occupiedUnits(placements).size
      const rate = item.heightU > 0 ? Math.round((used / item.heightU) * 100) : 0
      rows.push([item.name, item.zone, item.heightU, used, Math.max(0, item.heightU - used), `${rate}%`, placements.length])
    }
    downloadCSV(`${room.name}-机柜.csv`, rows)
  }

  async function submitImport() {
    if (!room || !importFile || importBusy) return
    setImportBusy(true)
    setImportError('')
    try {
      const text = await importFile.text()
      const response = await fetch(`/api/rooms/${room.id}/racks/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: text,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const details = Array.isArray(payload?.errors) && payload.errors.length
          ? payload.errors.map((item: { row: number; message: string }) => `第 ${item.row} 行：${item.message}`).join('；')
          : ''
        setImportError(details || payload?.error || '导入失败')
        return
      }
      setImportOpen(false)
      setImportFile(null)
      setFeedback(`已导入 ${payload.created ?? 0} 个机柜`)
      await reload()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败')
    } finally {
      setImportBusy(false)
    }
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
      const units = isNetworkKind(next.kind) ? 1 : 2
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
      {rackDrawerOpen && rack ? (
      <RackDetailDrawer rack={rack ?? null} room={room ?? null} devices={devices} assets={byId} editable={editable} busy={busy} bookmarked={!!rack && bookmarkedRacks.includes(rack.id)} onToggleBookmark={() => { if (rack) onToggleRackBookmark(rack.id) }} focused={focused} feedback={feedback} error={error} mountForm={mountForm} onClose={closeRackDrawer} onOpenAsset={onOpenAsset} onEditRack={value => { setRackDrawerOpen(false); editRack(value) }} onMount={() => editMount()} onEditPlacement={value => editMount(value)} onUnmount={unmountDevice} onMove={moveDevice} onMountAt={editMountAt} />
      ) : (
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
                <div className="facility-tree-region">
                  <span className="facility-tree-region-name">{group.region ? group.region.name : '未分组'}</span>
                  {editable && group.region && (
                    <button type="button" className="facility-tree-region-action" aria-label={`编辑区域 ${group.region.name}`} onClick={() => editRegion(group.region)}>
                      <Pencil size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {group.rooms.length > 0 && (
                  <div className="facility-tree-children">
                    {group.rooms.map(item => (
                      <button key={item.id} type="button" className={`facility-tree-item${item.id === activeRoomId ? ' active' : ''}`} title={item.name} onClick={() => selectRoom(item.id)}><span className="facility-tree-name">{item.name}</span></button>
                    ))}
                  </div>
                )}
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
                  <div className="floor-toolbar">
                    <div className="floor-toolbar-search">
                      <Input type="search" className="w-[320px]" aria-label="搜索机柜名称" placeholder="搜索机柜名称…" value={rackKeyword} onChange={event => setRackKeyword(event.target.value)} />
                      <div className="view-toggle view-switch" role="tablist" aria-label="机柜视图">
                        <button
                          type="button" role="tab" aria-selected={view === 'table'}
                          className={view === 'table' ? 'is-active' : ''}
                          onClick={() => setView('table')}
                        >列表</button>
                        <button
                          type="button" role="tab" aria-selected={view === 'elevations'}
                          className={view === 'elevations' ? 'is-active' : ''}
                          onClick={() => setView('elevations')}
                        >立面图</button>
                      </div>
                      {view === 'elevations' && (
                        <div className="view-switch view-switch-face" role="group" aria-label="安装面">
                          <button
                            type="button" aria-pressed={face === 'front'} aria-label="前视图" title="前视图"
                            className={face === 'front' ? 'is-active' : ''}
                            onClick={() => setFace('front')}
                          >前</button>
                          <button
                            type="button" aria-pressed={face === 'rear'} aria-label="后视图" title="后视图"
                            className={face === 'rear' ? 'is-active' : ''}
                            onClick={() => setFace('rear')}
                          >后</button>
                        </div>
                      )}
                    </div>
                    <div className="floor-toolbar-actions">
                      {view === 'table' && <Popover>
                        <PopoverTrigger asChild><Button size="sm" variant="outline" aria-label="选择机柜表格列"><Settings2 />列</Button></PopoverTrigger>
                        <PopoverContent align="end" className="w-44">
                          <div className="column-options">
                            {rackColumns.map(column => <label key={column.key} className="flex cursor-pointer items-center gap-2 text-sm">
                              <Checkbox checked={visibleRackColumns.includes(column.key)} disabled={visibleRackColumns.length === 1 && visibleRackColumns.includes(column.key)} onCheckedChange={checked => {
                                const selected = checked === true
                                  ? [...visibleRackColumns, column.key]
                                  : visibleRackColumns.filter(key => key !== column.key)
                                updateRackColumns(selected)
                              }} />
                              {column.label}
                            </label>)}
                            <Button variant="link" size="sm" onClick={() => updateRackColumns(defaultRackColumns)}>恢复默认</Button>
                          </div>
                        </PopoverContent>
                      </Popover>}
                      {editable && <Button size="sm" variant="outline" onClick={() => { setImportOpen(true); setImportFile(null); setImportError('') }}><Download />导入</Button>}
                      <Button size="sm" variant="outline" disabled={!rackRows.length} onClick={exportRacks}><Upload />导出</Button>
                      {editable && <Button size="sm" disabled={busy} onClick={() => editRack()}><Plus />新增机柜</Button>}
                    </div>
                  </div>
                  {view === 'table' ? (
                    <div className="facility-table-wrap">
                      <table className="facility-table facility-table-clickable">
                        <thead><tr>{rackColumns.filter(column => visibleRackColumns.includes(column.key)).map(column => <th key={column.key}>{column.label}</th>)}<th>操作</th></tr></thead>
                        <tbody>
                          {rackRows.map(item => {
                            const placements = roomPlacements.filter(entry => entry.rackId === item.id)
                            const used = occupiedUnits(placements).size
                            const free = Math.max(0, item.heightU - used)
                            const rate = item.heightU > 0 ? Math.round((used / item.heightU) * 100) : 0
                            return (
                              <tr key={item.id} onClick={() => openRack(item.id)}>
                                {visibleRackColumns.includes('name') && <td><strong>{item.name}</strong></td>}
                                {visibleRackColumns.includes('zone') && <td>{item.zone || '—'}</td>}
                                {visibleRackColumns.includes('height') && <td>{item.heightU}U</td>}
                                {visibleRackColumns.includes('used') && <td>{used}U</td>}
                                {visibleRackColumns.includes('free') && <td>{free}U</td>}
                                {visibleRackColumns.includes('usage') && <td><UsageBar value={rate} label={`${item.name} 机柜占用率`} /></td>}
                                {visibleRackColumns.includes('devices') && <td>{placements.length}</td>}
                                <td><Button size="sm" variant="outline" onClick={event => { event.stopPropagation(); editRack(item) }}>编辑</Button></td>
                              </tr>
                            )
                          })}
                          {!rackRows.length && <tr><td colSpan={visibleRackColumns.length + 1} className="facility-table-empty">{rackKeyword ? '没有匹配的机柜' : '还没有机柜，点右上角「新增机柜」开始'}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rack-board">
                      {rackRows.map(item => {
                        const placements = roomPlacements.filter(entry => entry.rackId === item.id)
                        const preview = rackElevationSvg(item, placements, byId, face)
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
                            <Button size="sm" variant="outline" onClick={() => {
                              const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
                              const link = document.createElement('a')
                              link.href = `/api/racks/${item.id}/elevation.svg?face=${face}&theme=${theme}`
                              link.download = `${item.name}-${face === 'rear' ? '后视图' : '前视图'}.svg`
                              document.body.appendChild(link)
                              link.click()
                              link.remove()
                            }}><Download />下载 SVG 文件</Button>
                          </div>
                        )
                      })}
                      {!rackRows.length && <p className="muted">当前数据中心还没有机柜</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
      )}
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
      <Dialog open={importOpen} onOpenChange={open => { if (!open) { setImportOpen(false); setImportBusy(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center">导入机柜</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submitImport() }}>
            <p className="text-sm text-muted-foreground">
              CSV 需包含「机柜编号」列，可选「区域/排」「高度（U）」；高度留空按 42U。导入到当前数据中心：{room?.name ?? '—'}
            </p>
            <Input
              type="file" accept=".csv,text/csv"
              onChange={event => setImportFile(event.target.files?.[0] ?? null)}
            />
            {importError && <div role="alert" className="text-sm text-destructive">{importError}</div>}
            <div className="room-modal-actions flex flex-wrap gap-2">
              <Button type="submit" disabled={importBusy || !importFile}>{importBusy ? '导入中…' : '导入'}</Button>
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>取消</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!rackDraft} onOpenChange={open => { if (!open) setRackDraft(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center">{rackDraft?.id ? '编辑机柜' : '新增机柜'}</DialogTitle>
          </DialogHeader>
          {rackDraft && (
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); saveRack() }}>
              <Field label="机柜编号"><Input required value={rackDraft.name} placeholder="例如：A-01" maxLength={80} onChange={event => setRackDraft({ ...rackDraft, name: event.target.value })} /></Field>
              <Field label="高度（U）"><Input type="number" className="w-28" min={1} max={60} value={rackDraft.heightU} onChange={event => setRackDraft({ ...rackDraft, heightU: Number(event.target.value) || 1 })} /></Field>
              <Field label="区域 / 排"><Input value={rackDraft.zone} placeholder="例如：A 区" maxLength={40} onChange={event => setRackDraft({ ...rackDraft, zone: event.target.value })} /></Field>
              <div className="room-modal-actions flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>{rackDraft.id ? '保存机柜' : '新增机柜'}</Button>
                <Button type="button" variant="outline" onClick={() => setRackDraft(null)}>取消</Button>
                {rackDraft.id && rack?.id === rackDraft.id && !devices.length && <ConfirmDelete title="删除该空机柜？" disabled={busy} onConfirm={() => removeRack(rack)}>删除空机柜</ConfirmDelete>}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
