import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Download, Plus } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { UsageBar } from './UsageBar'
import { SearchableSelect } from './SearchableSelect'
import { api, APIError } from '../api'
import type { Asset, Link } from '../api'
import { assetLocations, buildRoomCounts, isMountKind, locationLabel, mountKinds, occupiedUnits, placementsConflict } from '../facilities'
import type { AssetLocation, Facilities, MountKind, Placement, PlacementDepth, Rack, RackFace, RackFields } from '../facilities'
import { rackElevationSvg } from '../rackExport'
import { formatDateTime } from '../lib/date'
import { downloadCSV } from '../csv'
import { PageHeader } from './PageHeader'
import { OptionSelect } from './OptionSelect'
import { RackDetailDrawer } from './RackDetailDrawer'
import { RoomTreeLayout, type RoomFilter } from './RoomTreeLayout'
import { RowActionsMenu } from './RowActionsMenu'
import {
  buildFacetedOptions,
  ClearFiltersButton,
  ColumnHeaderMenu,
  DataTableViewOptions,
  matchesMultiFilter,
} from './TableColumnControls'
import type { ColumnFilterConfig, SortDirection } from './TableColumnControls'
import { BulkActionBar, RowIndexSelectCell, RowIndexSelectHeader } from './TableSelectionControls'

interface Props {
  roomId: number | null
  onRoomChange: (id: number | null) => void
  openRackId: number | null
  onRackChange: (id: number | null) => void
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
  { key: 'room', label: '数据中心' },
  { key: 'devices', label: '设备数' },
  { key: 'zone', label: '区域 / 排' },
  { key: 'height', label: '高度' },
  { key: 'used', label: '已用' },
  { key: 'free', label: '空闲' },
  { key: 'usage', label: '占用率' },
  { key: 'createdAt', label: '创建时间' },
  { key: 'updatedAt', label: '修改时间' },
] as const

type RackColumn = typeof rackColumns[number]['key']
type RackSortColumn = Exclude<RackColumn, 'room' | 'zone' | 'height'>

function isRackSortColumn(key: RackColumn): key is RackSortColumn {
  return key !== 'room' && key !== 'zone' && key !== 'height'
}
const defaultRackColumns: RackColumn[] = rackColumns.map(column => column.key)
const rackColumnsStorageKey = 'dc-db-columns:racks-v3'
const prevRackColumnsStorageKey = 'dc-db-columns:racks-v2'
const legacyRackColumnsStorageKey = 'dc-db-columns:racks'

function loadRackColumns(): RackColumn[] {
  try {
    const current = localStorage.getItem(rackColumnsStorageKey)
    const prev = current === null ? localStorage.getItem(prevRackColumnsStorageKey) : null
    const legacy = current === null && prev === null ? localStorage.getItem(legacyRackColumnsStorageKey) : null
    const stored: unknown = JSON.parse(current ?? prev ?? legacy ?? 'null')
    if (Array.isArray(stored)) {
      const selected = defaultRackColumns.filter(key =>
        stored.includes(key)
        || (current === null && key === 'room')
        || (current === null && prev === null && (key === 'createdAt' || key === 'updatedAt')),
      )
      if (selected.length) return selected
    }
  } catch {
    // Use defaults when storage is unavailable or invalid.
  }
  return defaultRackColumns
}

type RackDraft = RackFields & { id?: number; roomId: number; version: number }
interface MountDraft {
  assetId: number
  version: number
  startU: number
  units: number
  face: RackFace
  depth: PlacementDepth
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm"><span>{label}</span>{children}</label>
}

function ConfirmDelete({ title, disabled, onConfirm, children }: { title: string; disabled: boolean; onConfirm: () => void; children: ReactNode }) {
  return <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="destructive" disabled={disabled}>{children}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>此操作无法撤销。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onConfirm}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
}

export function FacilityView({ roomId, onRoomChange, openRackId, onRackChange, layout, assets, links, editable, focus, reload, onOpenAsset, bookmarkedRacks, onToggleRackBookmark, onSessionError }: Props) {
  const [rackId, setRackId] = useState<number | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const [view, setView] = useState<'table' | 'elevations'>('table')
  const [visibleRackColumns, setVisibleRackColumns] = useState<RackColumn[]>(loadRackColumns)
  const [rackSort, setRackSort] = useState<{ key: RackSortColumn; direction: 'asc' | 'desc' } | null>(null)
  const [face, setFace] = useState<RackFace>('front')
  const [rackDraft, setRackDraft] = useState<RackDraft | null>(null)
  const [mountDraft, setMountDraft] = useState<MountDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [rackKeyword, setRackKeyword] = useState('')
  const [rackFilters, setRackFilters] = useState<{ room: string[]; zone: string[]; height: string[] }>({ room: [], zone: [], height: [] })
  const [importOpen, setImportOpen] = useState(false)
  const [importRoomId, setImportRoomId] = useState<number>(0)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [rackDrawerOpen, setRackDrawerOpen] = useState(false)
  const [pendingDeleteRack, setPendingDeleteRack] = useState<Rack | null>(null)
  const [selectedRackIds, setSelectedRackIds] = useState<number[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  function updateRackColumns(columns: RackColumn[]) {
    const ordered = defaultRackColumns.filter(key => columns.includes(key))
    if (!ordered.length) return
    setVisibleRackColumns(ordered)
    setRackSort(current => current && !ordered.includes(current.key) ? null : current)
    try {
      localStorage.setItem(rackColumnsStorageKey, JSON.stringify(ordered))
    } catch {
      // Keep the selection for this session when storage is unavailable.
    }
  }

  const rooms = layout.rooms
  const roomById = useMemo(() => new Map(rooms.map(item => [item.id, item])), [rooms])
  const sortedRooms = useMemo(
    () => rooms.slice().sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    [rooms],
  )
  const roomOptions = useMemo(
    () => sortedRooms.map(item => ({ value: String(item.id), label: item.name })),
    [sortedRooms],
  )
  const roomFilter: RoomFilter = roomId ?? 'all'
  const activeRoomId = typeof roomFilter === 'number' ? roomFilter : null
  const room = activeRoomId !== null ? (roomById.get(activeRoomId) ?? null) : null
  const singleRoom = activeRoomId !== null
  const defaultTargetRoomId = room?.id ?? sortedRooms[0]?.id ?? 0
  const rackRoomCounts = useMemo(() => buildRoomCounts(layout.racks, item => item.roomId), [layout.racks])
  const racks = useMemo(
    () => activeRoomId === null ? layout.racks : layout.racks.filter(item => item.roomId === activeRoomId),
    [layout.racks, activeRoomId],
  )
  const rack = racks.find(item => item.id === rackId) ?? null
  const rackRoom = rack ? (roomById.get(rack.roomId) ?? null) : null
  const rackRoomRacks = useMemo(
    () => rack ? layout.racks.filter(item => item.roomId === rack.roomId) : racks,
    [layout.racks, rack, racks],
  )
  const rackIds = useMemo(() => new Set(racks.map(item => item.id)), [racks])
  const roomPlacements = useMemo(() => layout.placements.filter(item => rackIds.has(item.rackId)), [layout.placements, rackIds])
  const keywordRackRows = useMemo(() => {
    const needle = rackKeyword.trim().toLowerCase()
    if (!needle) return racks
    return racks.filter(item => {
      const roomName = roomById.get(item.roomId)?.name ?? ''
      return item.name.toLowerCase().includes(needle)
        || item.zone.toLowerCase().includes(needle)
        || roomName.toLowerCase().includes(needle)
    })
  }, [racks, rackKeyword, roomById])
  const heightCatalog = useMemo(
    () => Array.from(new Set(racks.map(item => item.heightU)))
      .sort((a, b) => a - b)
      .map(heightU => ({ value: String(heightU), label: `${heightU}U` })),
    [racks],
  )
  const roomFilterOptions = useMemo(() => {
    const items = keywordRackRows.filter(item =>
      matchesMultiFilter(rackFilters.zone, item.zone)
      && matchesMultiFilter(rackFilters.height, String(item.heightU)),
    )
    return buildFacetedOptions({
      items,
      getEntries: item => {
        const label = roomById.get(item.roomId)?.name
        return label ? { value: String(item.roomId), label } : []
      },
      catalog: roomOptions,
      selectedValues: rackFilters.room,
    })
  }, [keywordRackRows, roomById, roomOptions, rackFilters.zone, rackFilters.height, rackFilters.room])
  const zoneFilterOptions = useMemo(() => {
    const items = keywordRackRows.filter(item =>
      matchesMultiFilter(rackFilters.room, String(item.roomId))
      && matchesMultiFilter(rackFilters.height, String(item.heightU)),
    )
    return buildFacetedOptions({
      items,
      getEntries: item => item.zone,
      includeEmpty: true,
      emptyLabel: '未分区',
      selectedValues: rackFilters.zone,
    })
  }, [keywordRackRows, rackFilters.room, rackFilters.height, rackFilters.zone])
  const heightFilterOptions = useMemo(() => {
    const items = keywordRackRows.filter(item =>
      matchesMultiFilter(rackFilters.room, String(item.roomId))
      && matchesMultiFilter(rackFilters.zone, item.zone),
    )
    return buildFacetedOptions({
      items,
      getEntries: item => ({ value: String(item.heightU), label: `${item.heightU}U` }),
      catalog: heightCatalog,
      selectedValues: rackFilters.height,
    })
  }, [keywordRackRows, heightCatalog, rackFilters.room, rackFilters.zone, rackFilters.height])
  const activeRackFilterCount = rackFilters.room.length + rackFilters.zone.length + rackFilters.height.length
  const hasRackFilter = Boolean(rackKeyword.trim()) || activeRackFilterCount > 0
  const clearRackFilters = () => setRackFilters({ room: [], zone: [], height: [] })
  const rackRows = useMemo(() => {
    if (!activeRackFilterCount) return keywordRackRows
    return keywordRackRows.filter(item =>
      matchesMultiFilter(rackFilters.room, String(item.roomId))
      && matchesMultiFilter(rackFilters.zone, item.zone)
      && matchesMultiFilter(rackFilters.height, String(item.heightU)),
    )
  }, [keywordRackRows, activeRackFilterCount, rackFilters])
  const rackMetrics = useMemo(() => {
    const placementsByRack = new Map<number, Placement[]>()
    for (const placement of roomPlacements) {
      const entries = placementsByRack.get(placement.rackId) ?? []
      entries.push(placement)
      placementsByRack.set(placement.rackId, entries)
    }
    return new Map(racks.map(item => {
      const placements = placementsByRack.get(item.id) ?? []
      const used = occupiedUnits(placements).size
      return [item.id, {
        used,
        free: Math.max(0, item.heightU - used),
        usage: item.heightU > 0 ? Math.round(used / item.heightU * 100) : 0,
        devices: placements.length,
      }]
    }))
  }, [racks, roomPlacements])
  const sortedRackRows = useMemo(() => {
    if (!rackSort) return rackRows
    const factor = rackSort.direction === 'asc' ? 1 : -1
    return [...rackRows].sort((a, b) => {
      switch (rackSort.key) {
        case 'name':
          return factor * a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
        case 'createdAt':
          return factor * ((a.createdAt ? Date.parse(a.createdAt) : 0) - (b.createdAt ? Date.parse(b.createdAt) : 0))
        case 'updatedAt':
          return factor * ((a.updatedAt ? Date.parse(a.updatedAt) : 0) - (b.updatedAt ? Date.parse(b.updatedAt) : 0))
        default:
          return factor * (rackMetrics.get(a.id)![rackSort.key] - rackMetrics.get(b.id)![rackSort.key])
      }
    })
  }, [rackRows, rackMetrics, rackSort])
  const selectedRackIdSet = useMemo(() => new Set(selectedRackIds), [selectedRackIds])
  const selectedRacks = useMemo(() => {
    const orderedVisible = sortedRackRows.filter(item => selectedRackIdSet.has(item.id))
    const visibleIds = new Set(orderedVisible.map(item => item.id))
    const hiddenSelected = racks.filter(item => selectedRackIdSet.has(item.id) && !visibleIds.has(item.id))
    return [...orderedVisible, ...hiddenSelected]
  }, [racks, sortedRackRows, selectedRackIdSet])
  const deletableSelectedRacks = useMemo(
    () => selectedRacks.filter(item => (rackMetrics.get(item.id)?.devices ?? 0) === 0),
    [selectedRacks, rackMetrics],
  )
  const nonEmptySelectedCount = selectedRacks.length - deletableSelectedRacks.length
  const visibleRackIds = useMemo(() => sortedRackRows.map(item => item.id), [sortedRackRows])
  const allVisibleRacksSelected = visibleRackIds.length > 0 && visibleRackIds.every(id => selectedRackIdSet.has(id))
  const someVisibleRacksSelected = visibleRackIds.some(id => selectedRackIdSet.has(id))
  const rackHeaderChecked: boolean | 'indeterminate' = allVisibleRacksSelected
    ? true
    : someVisibleRacksSelected
      ? 'indeterminate'
      : false
  const devices = roomPlacements.filter(item => item.rackId === rackId)
  const byId = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets])
  const locations = useMemo(() => assetLocations(layout, links), [layout, links])
  const mounted = useMemo(() => new Map(layout.placements.map(placement => [placement.assetId, placement])), [layout.placements])
  const candidates = assets.filter(asset => asset.lifecycle === 'active' && isMountKind(asset.kind))
  const mountLocation = mountDraft?.assetId ? locations.get(mountDraft.assetId) : undefined

  useEffect(() => {
    if (roomId !== null && rooms.length > 0 && !roomById.has(roomId)) {
      onRoomChange(null)
    }
  }, [roomId, rooms.length, roomById, onRoomChange])

  useEffect(() => {
    if (!racks.some(item => item.id === rackId)) setRackId(racks[0]?.id ?? null)
  }, [racks, rackId])

  useEffect(() => {
    setSelectedRackIds([])
    setBulkDeleteOpen(false)
    setRackFilters({ room: [], zone: [], height: [] })
  }, [activeRoomId])

  useEffect(() => {
    setSelectedRackIds(current => {
      const next = current.filter(id => rackIds.has(id))
      return next.length === current.length ? current : next
    })
  }, [rackIds])

  useEffect(() => {
    if (!openRackId) return
    const target = racks.find(item => item.id === openRackId)
    if (!target) {
      if (rooms.length > 0 && (activeRoomId === null || roomById.has(activeRoomId))) onRackChange(null)
      return
    }
    setRackId(target.id)
    setRackDrawerOpen(true)
  }, [openRackId, activeRoomId, racks, rooms.length, roomById, onRackChange])

  useEffect(() => {
    if (focus) showLocation(focus)
  }, [focus])

  function resetForms() {
    setRackDraft(null)
    setMountDraft(null)
    setError('')
    setFeedback('')
  }

  function selectRoomFilter(next: RoomFilter) {
    const nextRoomId = typeof next === 'number' ? next : null
    if (nextRoomId === activeRoomId) return
    resetForms()
    setRackDrawerOpen(false)
    onRackChange(null)
    onRoomChange(nextRoomId)
    const nextRacks = nextRoomId === null ? layout.racks : layout.racks.filter(item => item.roomId === nextRoomId)
    setRackId(nextRacks[0]?.id ?? null)
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
    onRackChange(id)
  }

  function closeRackDrawer() {
    setRackDrawerOpen(false)
    onRackChange(null)
    setMountDraft(null)
    setFeedback('')
  }

  function showLocation(location: AssetLocation) {
    resetForms()
    onRoomChange(location.room.id)
    setRackId(location.rack.id)
    onRackChange(location.rack.id)
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

  function editRack(value?: Rack) {
    resetForms()
    if (value) setRackDraft({ ...value })
    else setRackDraft({ name: '', zone: '', heightU: 42, roomId: defaultTargetRoomId, version: 0 })
  }

  function saveRack() {
    if (!rackDraft) return
    const { id, roomId: targetRoomId, name, zone, heightU, version } = rackDraft
    if (!id && !targetRoomId) return
    const path = id ? '/racks/' + id : '/rooms/' + targetRoomId + '/racks'
    void mutate(() => api<Rack>(path, id ? 'PUT' : 'POST', { name, zone, heightU, version }), saved => {
      setRackId(saved.id)
      setRackDraft(null)
    }, '机柜已保存')
  }

  function exportSelectedRacksCSV() {
    if (!selectedRacks.length) return
    const rows: (string | number)[][] = [['机柜', '数据中心', '区域', '设备数', '高度(U)', '已用(U)', '空闲(U)', '利用率(%)', '创建时间', '更新时间']]
    for (const item of selectedRacks) {
      const metrics = rackMetrics.get(item.id)
      const used = metrics?.used ?? 0
      const free = metrics?.free ?? item.heightU
      const usage = metrics?.usage ?? 0
      const deviceCount = metrics?.devices ?? 0
      rows.push([
        item.name,
        roomById.get(item.roomId)?.name ?? '',
        item.zone,
        deviceCount,
        item.heightU,
        used,
        free,
        usage,
        formatDateTime(item.createdAt),
        formatDateTime(item.updatedAt),
      ])
    }
    downloadCSV(`${room ? room.name : '全部数据中心'}-已选机柜.csv`, rows)
  }

  async function confirmBulkDeleteRacks() {
    if (bulkDeleting || busy || !deletableSelectedRacks.length) return
    const targets = [...deletableSelectedRacks]
    const skippedCount = selectedRacks.length - targets.length
    setBulkDeleting(true)
    setError('')
    setFeedback('')
    const deletedIds: number[] = []
    const failed: string[] = []
    try {
      for (const item of targets) {
        try {
          await api('/racks/' + item.id + '?version=' + item.version, 'DELETE')
          deletedIds.push(item.id)
        } catch (e) {
          if (e instanceof APIError && e.status === 401) {
            setBulkDeleteOpen(false)
            onSessionError(e)
            return
          }
          failed.push(`${item.name}（${e instanceof Error ? e.message : '删除失败'}）`)
        }
      }
      setBulkDeleteOpen(false)
      if (deletedIds.length > 0) {
        if (openRackId && deletedIds.includes(openRackId)) closeRackDrawer()
        await reload()
        setSelectedRackIds(current => current.filter(id => !deletedIds.includes(id)))
      }
      if (deletedIds.length > 0) {
        setFeedback(
          skippedCount > 0
            ? `已删除 ${deletedIds.length} 个空机柜，跳过 ${skippedCount} 个含已上架设备的机柜`
            : `已删除 ${deletedIds.length} 个空机柜`,
        )
      }
      if (failed.length > 0) {
        setError(`以下 ${failed.length} 个机柜删除失败：${failed.join('；')}`)
      }
    } finally {
      setBulkDeleting(false)
    }
  }

  async function submitImport() {
    const targetRoomId = singleRoom ? activeRoomId : importRoomId
    if (!targetRoomId || !importFile || importBusy) return
    setImportBusy(true)
    setImportError('')
    try {
      const text = await importFile.text()
      const response = await fetch(`/api/rooms/${targetRoomId}/racks/import`, {
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
    void mutate(() => api('/racks/' + value.id + '?version=' + value.version, 'DELETE'), () => { resetForms(); if (openRackId === value.id) closeRackDrawer() }, '机柜已删除')
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
      assetId: value?.assetId ?? 0,
      version: value?.version ?? 0,
      startU: value?.startU ?? freePosition(1, 0, face, depth),
      units: value?.units ?? 1,
      face,
      depth,
    })
  }

  function editMountAt(startU: number, face: RackFace) {
    resetForms()
    const units = 1
    const safeStart = rack ? Math.max(1, Math.min(startU, rack.heightU - units + 1)) : startU
    setMountDraft({
      assetId: 0,
      version: 0,
      startU: safeStart,
      units,
      face,
      depth: 'full',
    })
  }

  function mountAt(target: Rack, startU: number, face: RackFace) {
    resetForms()
    selectRack(target.id)
    setRackDrawerOpen(true)
    onRackChange(target.id)
    const units = 1
    setMountDraft({
      assetId: 0,
      version: 0,
      startU: Math.max(1, Math.min(startU, target.heightU - units + 1)),
      units,
      face,
      depth: 'full',
    })
  }

  function changeDevice(next = mountDraft) {
    if (!next) return
    const previous = mounted.get(next.assetId)
    const face = previous?.rackId === rackId ? previous.face : next.face
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

  function saveMount() {
    if (!mountDraft || !rack) return
    const { startU, units, assetId, version, face, depth } = mountDraft
    if (!assetId) return
    const fields = { rackId: rack.id, startU, units, face, depth }
    void mutate(() => api<Placement>('/assets/' + assetId + '/placement', 'PUT', { ...fields, version }), placed => {
      setMountDraft(null)
      setFocused(placed.assetId)
    }, !version ? '设备已上架' : '设备位置已更新')
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
    <form className="mount-device-form" onSubmit={event => { event.preventDefault(); saveMount() }}>
      <Field label="关联设备"><SearchableSelect label="关联设备" value={mountDraft.assetId ? String(mountDraft.assetId) : ''} placeholder="搜索并选择设备" allowClear={false} onChange={value => changeDevice({ ...mountDraft, assetId: Number(value) })} options={candidates.map(asset => ({ value: String(asset.id), label: `${asset.name} · ${mountKinds[asset.kind as MountKind]}${mounted.has(asset.id) ? ' · 已上架' : ''}` }))} /></Field>
      {mountLocation && <p className="mount-device-hint">当前位置：{locationLabel(mountLocation)}</p>}
      {!candidates.length && <p className="mount-device-hint">暂无可关联的设备，请先添加设备。</p>}
      <div className="mount-device-grid">
        <Field label="起始 U 位"><Input required type="number" min={1} max={rack.heightU} value={mountDraft.startU} onChange={event => setMountDraft({ ...mountDraft, startU: Number(event.target.value) || 1 })} /></Field>
        <Field label="结束 U 位"><Input required type="number" min={mountDraft.startU} max={rack.heightU} value={mountDraft.startU + mountDraft.units - 1} onChange={event => setMountDraft({ ...mountDraft, units: Number(event.target.value) - mountDraft.startU + 1 })} /></Field>
      </div>
      <p className="mount-device-hint">{mountDraft.units > 0 ? `共占用 ${mountDraft.units}U，包含起始和结束 U 位。` : '结束 U 位不能小于起始 U 位。'}</p>
      <div className="mount-device-actions"><Button type="button" variant="outline" onClick={() => setMountDraft(null)}>取消</Button><Button type="submit" disabled={busy || !mountDraft.assetId || mountDraft.units < 1 || mountDraft.startU + mountDraft.units - 1 > rack.heightU}>{mountDraft.version ? '保存位置' : '保存上架'}</Button></div>
    </form>
  ) : null

  const editingRack = rackDraft?.id ? racks.find(item => item.id === rackDraft.id) ?? null : null
  const editingRackDevices = editingRack ? (rackMetrics.get(editingRack.id)?.devices ?? 0) : 0
  const effectiveImportRoomId = singleRoom ? activeRoomId : importRoomId

  return (
    <div className="facilities">
      {rackDrawerOpen && rack ? (
      <RackDetailDrawer rack={rack} racks={rackRoomRacks} onSelectRack={openRack} room={rackRoom} regionName={layout.regions.find(item => item.id === rackRoom?.regionId)?.name} devices={devices} assets={byId} editable={editable} busy={busy} bookmarked={bookmarkedRacks.includes(rack.id)} onToggleBookmark={() => onToggleRackBookmark(rack.id)} focused={focused} feedback={feedback} error={error} mountForm={mountForm} onClose={closeRackDrawer} onOpenAsset={onOpenAsset} onEditRack={value => editRack(value)} onCancelMount={() => setMountDraft(null)} onEditPlacement={value => editMount(value)} onUnmount={unmountDevice} onMove={moveDevice} onMountAt={editMountAt} />
      ) : (
      <RoomTreeLayout
        facilities={layout}
        value={roomFilter}
        onChange={selectRoomFilter}
        editable={editable}
        showAll={true}
        showUnassigned={false}
        counts={rackRoomCounts}
        onReload={reload}
        onSessionError={onSessionError}
      >
          {error && <div role="alert" className="mb-3 rounded-md border border-destructive p-3 text-destructive">{error}</div>}
          {feedback && <div role="status" className="mb-3 rounded-md border border-border p-3">{feedback}</div>}
          {!rooms.length ? <Card><CardContent className="p-6 text-center text-muted-foreground"><p>暂无数据中心，请在左侧数据中心操作中新增</p></CardContent></Card> : (
            <div className="facility-workspace">
              <PageHeader
                title="机柜"
                filters={<>
                  <Input type="search" className="h-8 w-[200px]" aria-label="搜索机柜" placeholder={singleRoom ? '搜索机柜…' : '搜索机柜、数据中心…'} value={rackKeyword} onChange={event => setRackKeyword(event.target.value)} />
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
                  {view === 'table' && (
                    <>
                      <DataTableViewOptions
                        align="start"
                        columns={rackColumns.map(column => ({
                          id: column.key,
                          label: column.label,
                          visible: visibleRackColumns.includes(column.key),
                        }))}
                        onToggle={(columnId, nextVisible) => {
                          const key = columnId as RackColumn
                          const selected = nextVisible
                            ? [...visibleRackColumns, key]
                            : visibleRackColumns.filter(item => item !== key)
                          updateRackColumns(selected)
                        }}
                      />
                      <ClearFiltersButton count={activeRackFilterCount} onReset={clearRackFilters} />
                    </>
                  )}
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
                </>}
                actions={<>
                  {editable && <Button size="sm" variant="outline" onClick={() => { setImportRoomId(defaultTargetRoomId); setImportOpen(true); setImportFile(null); setImportError('') }}><Download />导入</Button>}
                  {editable && <Button size="sm" disabled={busy} onClick={() => editRack()}><Plus />新增机柜</Button>}
                </>}
              />
              <Card className="floor-panel">
                <CardContent>
                  {view === 'table' ? (
                    <div className="shared-table-wrap">
                      <table className="shared-table facility-table-clickable">
                        <thead><tr>
                          <th className="col-select">
                            <RowIndexSelectHeader
                              checked={rackHeaderChecked}
                              disabled={visibleRackIds.length === 0}
                              ariaLabel="全选当前列表机柜"
                              onCheckedChange={checked => {
                                setSelectedRackIds(current => checked
                                  ? Array.from(new Set([...current, ...visibleRackIds]))
                                  : current.filter(id => !visibleRackIds.includes(id)))
                              }}
                            />
                          </th>
                          {rackColumns.filter(column => visibleRackColumns.includes(column.key)).map(column => {
                          const sortKey = isRackSortColumn(column.key) ? column.key : null
                          const sortDirection: SortDirection = sortKey && rackSort?.key === sortKey ? rackSort.direction : false
                          const filter: ColumnFilterConfig | undefined = column.key === 'room'
                            ? (!singleRoom ? {
                                options: roomFilterOptions,
                                selectedValues: rackFilters.room,
                                onChange: next => setRackFilters(current => ({ ...current, room: next })),
                                searchPlaceholder: '搜索数据中心…',
                              } : undefined)
                            : column.key === 'zone'
                              ? {
                                  options: zoneFilterOptions,
                                  selectedValues: rackFilters.zone,
                                  onChange: next => setRackFilters(current => ({ ...current, zone: next })),
                                  searchPlaceholder: '搜索区域…',
                                }
                              : column.key === 'height'
                                ? {
                                    options: heightFilterOptions,
                                    selectedValues: rackFilters.height,
                                    onChange: next => setRackFilters(current => ({ ...current, height: next })),
                                    searchPlaceholder: '搜索高度…',
                                  }
                                : undefined
                          return <th key={column.key} aria-sort={sortKey ? (sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none') : undefined}>
                            <ColumnHeaderMenu
                              title={column.label}
                              sortable={Boolean(sortKey)}
                              sortDirection={sortDirection}
                              onSortChange={sortKey ? next => setRackSort(next === false ? null : { key: sortKey, direction: next }) : undefined}
                              filter={filter}
                              hideable={visibleRackColumns.length > 1}
                              onHide={() => {
                                if (visibleRackColumns.length <= 1) return
                                updateRackColumns(visibleRackColumns.filter(key => key !== column.key))
                              }}
                            />
                          </th>
                        })}{editable && <th className="w-10"><span className="sr-only">操作</span></th>}</tr></thead>
                        <tbody>
                          {sortedRackRows.map((item, index) => {
                            const { used, free, usage: rate, devices: deviceCount } = rackMetrics.get(item.id)!
                            const isSelected = selectedRackIdSet.has(item.id)
                            return (
                              <tr
                                key={item.id}
                                className="group/row"
                                data-state={isSelected ? 'selected' : undefined}
                                onClick={() => openRack(item.id)}
                              >
                                <td className="col-select group/select-cell" onClick={event => event.stopPropagation()}>
                                  <RowIndexSelectCell
                                    rowNumber={index + 1}
                                    selected={isSelected}
                                    ariaLabel={`选择机柜 ${item.name}`}
                                    onToggle={checked => {
                                      setSelectedRackIds(current => checked
                                        ? Array.from(new Set([...current, item.id]))
                                        : current.filter(id => id !== item.id))
                                    }}
                                  />
                                </td>
                                {visibleRackColumns.includes('name') && <td><strong>{item.name}</strong></td>}
                                {visibleRackColumns.includes('room') && <td>{roomById.get(item.roomId)?.name ?? '—'}</td>}
                                {visibleRackColumns.includes('devices') && <td>{deviceCount}</td>}
                                {visibleRackColumns.includes('zone') && <td>{item.zone || '—'}</td>}
                                {visibleRackColumns.includes('height') && <td>{item.heightU}U</td>}
                                {visibleRackColumns.includes('used') && <td>{used}U</td>}
                                {visibleRackColumns.includes('free') && <td>{free}U</td>}
                                {visibleRackColumns.includes('usage') && <td><UsageBar value={rate} label={`${item.name} 机柜占用率`} /></td>}
                                {visibleRackColumns.includes('createdAt') && <td className="whitespace-nowrap">{formatDateTime(item.createdAt)}</td>}
                                {visibleRackColumns.includes('updatedAt') && <td className="whitespace-nowrap">{formatDateTime(item.updatedAt)}</td>}
                                {editable && (
                                  <td className="w-10 text-right" onClick={event => event.stopPropagation()}>
                                    <div className="flex justify-end">
                                      <RowActionsMenu
                                        ariaLabel={`更多操作：${item.name}`}
                                        onEdit={() => editRack(item)}
                                        editDisabled={busy}
                                        onDelete={() => setPendingDeleteRack(item)}
                                        deleteDisabled={busy || deviceCount > 0}
                                      />
                                    </div>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                          {!rackRows.length && <tr><td colSpan={visibleRackColumns.length + 1 + (editable ? 1 : 0)} className="facility-table-empty">{hasRackFilter ? '没有匹配的机柜' : '还没有机柜，点右上角「新增机柜」开始'}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rack-board">
                      {rackRows.map(item => {
                        const placements = roomPlacements.filter(entry => entry.rackId === item.id)
                        const preview = rackElevationSvg(item, placements, byId, face, { interactive: true, allowMount: editable && !busy })
                        const itemRoomName = roomById.get(item.roomId)?.name
                        return (
                          <div key={item.id} className="rack-board-item">
                            <div className="rack-board-head">
                              <strong>{item.name}</strong>
                              {((!singleRoom && itemRoomName) || item.zone) && (
                                <div className="flex flex-wrap items-center justify-center gap-1">
                                  {!singleRoom && itemRoomName && <span className="rack-board-role">{itemRoomName}</span>}
                                  {item.zone && <span className="rack-board-role">{item.zone}</span>}
                                </div>
                              )}
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
                                  mountAt(item, Number(unit), face)
                                  return
                                }
                                openRack(item.id)
                              }}
                              onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  const target = event.target as Element
                                  const assetId = target.closest('[data-asset]')?.getAttribute('data-asset')
                                  const unit = target.closest('[data-unit]')?.getAttribute('data-unit')
                                  if (assetId) onOpenAsset(Number(assetId))
                                  else if (unit && editable && !busy) mountAt(item, Number(unit), face)
                                  else openRack(item.id)
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
                      {!rackRows.length && <p className="muted">{hasRackFilter ? '没有匹配的机柜' : singleRoom ? '当前数据中心还没有机柜' : '还没有机柜，点右上角「新增机柜」开始'}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
              {view === 'table' && (
                <BulkActionBar
                  count={selectedRacks.length}
                  unit="个机柜"
                  onClear={() => setSelectedRackIds([])}
                  onExport={exportSelectedRacksCSV}
                  onDelete={editable ? () => setBulkDeleteOpen(true) : undefined}
                  deleteDisabled={busy || deletableSelectedRacks.length === 0}
                  deleting={bulkDeleting}
                />
              )}
            </div>
          )}
      </RoomTreeLayout>
      )}
      <Dialog open={importOpen} onOpenChange={open => { if (!open) { setImportOpen(false); setImportBusy(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center">导入机柜</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submitImport() }}>
            {singleRoom ? (
              <p className="text-sm text-muted-foreground">
                CSV 需包含「机柜编号」列，可选「区域/排」「高度（U）」；高度留空按 42U。导入到当前数据中心：{room?.name ?? '—'}
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  CSV 需包含「机柜编号」列，可选「区域/排」「高度（U）」；高度留空按 42U。
                </p>
                <Field label="目标数据中心">
                  <OptionSelect
                    id="rack-import-room"
                    className="w-full"
                    label="目标数据中心"
                    value={importRoomId ? String(importRoomId) : ''}
                    onChange={value => setImportRoomId(Number(value) || 0)}
                    options={roomOptions}
                  />
                </Field>
              </>
            )}
            <Input
              type="file" accept=".csv,text/csv"
              onChange={event => setImportFile(event.target.files?.[0] ?? null)}
            />
            {importError && <div role="alert" className="text-sm text-destructive">{importError}</div>}
            <div className="room-modal-actions flex flex-wrap gap-2">
              <Button type="submit" disabled={importBusy || !importFile || !effectiveImportRoomId}>{importBusy ? '导入中…' : '导入'}</Button>
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
              {!rackDraft.id && !singleRoom && (
                <Field label="数据中心">
                  <OptionSelect
                    id="rack-room"
                    className="w-full"
                    label="数据中心"
                    value={rackDraft.roomId ? String(rackDraft.roomId) : ''}
                    onChange={value => setRackDraft({ ...rackDraft, roomId: Number(value) || 0 })}
                    options={roomOptions}
                  />
                </Field>
              )}
              <Field label="机柜编号"><Input required value={rackDraft.name} placeholder="例如：A-01" maxLength={80} onChange={event => setRackDraft({ ...rackDraft, name: event.target.value })} /></Field>
              <Field label="高度（U）"><Input type="number" className="w-28" min={1} max={60} value={rackDraft.heightU} onChange={event => setRackDraft({ ...rackDraft, heightU: Number(event.target.value) || 1 })} /></Field>
              <Field label="区域 / 排"><Input value={rackDraft.zone} placeholder="例如：A 区" maxLength={40} onChange={event => setRackDraft({ ...rackDraft, zone: event.target.value })} /></Field>
              <div className="room-modal-actions flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || (!rackDraft.id && !rackDraft.roomId)}>{rackDraft.id ? '保存机柜' : '新增机柜'}</Button>
                <Button type="button" variant="outline" onClick={() => setRackDraft(null)}>取消</Button>
                {editingRack && editingRackDevices === 0 && <ConfirmDelete title="删除该空机柜？" disabled={busy} onConfirm={() => removeRack(editingRack)}>删除空机柜</ConfirmDelete>}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingDeleteRack !== null} onOpenChange={open => { if (!open) setPendingDeleteRack(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除机柜「{pendingDeleteRack?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>删除后该空机柜将无法恢复，此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteRack) {
                  const target = pendingDeleteRack
                  setPendingDeleteRack(null)
                  removeRack(target)
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={bulkDeleteOpen} onOpenChange={open => { if (!open && !bulkDeleting) setBulkDeleteOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除机柜？</AlertDialogTitle>
            <AlertDialogDescription>
              {nonEmptySelectedCount > 0
                ? `已选择 ${selectedRacks.length} 个机柜，其中 ${deletableSelectedRacks.length} 个空机柜将被永久删除，其余 ${nonEmptySelectedCount} 个含已上架设备的机柜将自动跳过。此操作无法撤销。`
                : `已选择 ${selectedRacks.length} 个空机柜，确认后将全部永久删除。此操作无法撤销。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={bulkDeleting || deletableSelectedRacks.length === 0}
              onClick={event => {
                event.preventDefault()
                void confirmBulkDeleteRacks()
              }}
            >
              {bulkDeleting ? '删除中…' : `删除 ${deletableSelectedRacks.length} 个空机柜`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
