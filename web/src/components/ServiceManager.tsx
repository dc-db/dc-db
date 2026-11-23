import { useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { ArrowLeft, Building2, Link2, List, Network, Pencil, Plus, Trash2, Unlink } from 'lucide-react'
import { api, APIError } from '../api'
import type { Asset, Link, Service, ServiceFields } from '../api'
import { assetLocations, assetRoomId } from '../facilities'
import type { Facilities } from '../facilities'
import { isNetworkKind, kindLabel } from '../kinds'
import { Select } from './AppControls'
import { DataTable } from './DataTable'
import { AssetKindIcon } from './MetadataIcons'
import { PageHeader } from './PageHeader'
import { RoomTreeLayout, type RoomFilter } from './RoomTreeLayout'
import { ServiceIcon } from './ServiceIcon'
import { ServiceTopologyGraph, buildTopologySummary } from './ServiceTopologyGraph'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

interface Props {
  editable: boolean
  dark: boolean
  assets: Asset[]
  links: Link[]
  facilities: Facilities
  roomFilter: RoomFilter
  onRoomFilterChange: (next: RoomFilter) => void
  openServiceId?: number | null
  onServiceOpened?: () => void
  onOpenAsset: (assetId: number) => void
  onOpenRoom: (roomId: number) => void
  onSessionError: (error: unknown) => void
  onChanged?: (services: Service[]) => void
}

const emptyService: ServiceFields = { name: '', category: '', defaultPort: 0, description: '' }

const assetStatusMeta: Record<string, { label: string; className: string }> = {
  online: { label: '在线', className: 'border-info-border bg-info-soft text-info' },
  running: { label: '运行中', className: 'border-success-border bg-success-soft text-success' },
  paused: { label: '已暂停', className: 'border-warning-border bg-warning-soft text-warning' },
  offline: { label: '离线', className: 'border-danger-border bg-danger-soft text-danger' },
  stopped: { label: '已停止', className: 'border-border bg-muted text-muted-foreground' },
  unknown: { label: '未知', className: 'border-border bg-muted text-muted-foreground' },
}

function platformLabel(platform: Asset['platform']) {
  return platform === 'pve' ? 'Proxmox VE' : platform === 'kvm' ? 'KVM' : '—'
}

export function ServiceManager({
  editable,
  dark,
  assets,
  links,
  facilities,
  roomFilter,
  onRoomFilterChange,
  openServiceId,
  onServiceOpened,
  onOpenAsset,
  onOpenRoom,
  onSessionError,
  onChanged,
}: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailView, setDetailView] = useState<'details' | 'topology'>('details')

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [deleting, setDeleting] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [fields, setFields] = useState<ServiceFields>(emptyService)

  // Asset binding modal state
  const [bindOpen, setBindOpen] = useState(false)
  const [bindSaving, setBindSaving] = useState(false)
  const [bindError, setBindError] = useState('')
  const [bindSearch, setBindSearch] = useState('')
  const [bindKind, setBindKind] = useState<'' | 'vm' | 'host' | 'network'>('')
  const [bindIds, setBindIds] = useState<number[]>([])

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (openServiceId) {
      setSelectedId(openServiceId)
      setDetailView('details')
      onServiceOpened?.()
    }
  }, [openServiceId, onServiceOpened])

  function report(value: unknown) {
    if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
    setError(value instanceof Error ? value.message : '操作失败')
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const next = await api<Service[]>('/services')
      setServices(next)
      onChanged?.(next)
    } catch (value) { report(value) } finally { setLoading(false) }
  }

  const selectedService = useMemo(
    () => (selectedId ? services.find(item => item.id === selectedId) ?? null : null),
    [selectedId, services],
  )

  const byId = useMemo(() => new Map(assets.map(item => [item.id, item])), [assets])
  const locations = useMemo(() => assetLocations(facilities, links), [facilities, links])

  const roomCounts = useMemo(() => {
    const byRoom = new Map<number, number>()
    let unassigned = 0
    for (const service of services) {
      const ids = service.assetIds ?? []
      const roomsForService = new Set<number>()
      let hasUnassigned = ids.length === 0
      for (const id of ids) {
        const asset = byId.get(id)
        const rid = asset ? assetRoomId(asset, locations, byId, links) : null
        if (rid) roomsForService.add(rid)
        else hasUnassigned = true
      }
      for (const rid of roomsForService) {
        byRoom.set(rid, (byRoom.get(rid) ?? 0) + 1)
      }
      if (hasUnassigned) unassigned++
    }
    return { all: services.length, unassigned, byRoom }
  }, [byId, links, locations, services])

  const categories = useMemo(
    () => [...new Set(services.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [services],
  )

  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    const result: Service[] = []
    for (const item of services) {
      if (category && item.category !== category) continue
      if (query && ![item.name, item.category, item.description].some(value => value.toLowerCase().includes(query))) continue
      if (roomFilter === 'all') {
        result.push(item)
      } else if (roomFilter === 'unassigned') {
        const ids = item.assetIds ?? []
        const unassignedIds = ids.filter(id => {
          const asset = byId.get(id)
          return !(asset && assetRoomId(asset, locations, byId, links))
        })
        if (ids.length === 0 || unassignedIds.length > 0) {
          result.push({ ...item, assetCount: unassignedIds.length })
        }
      } else {
        const matchingIds = (item.assetIds ?? []).filter(id => {
          const asset = byId.get(id)
          return asset && assetRoomId(asset, locations, byId, links) === roomFilter
        })
        if (matchingIds.length > 0) {
          result.push({ ...item, assetCount: matchingIds.length })
        }
      }
    }
    return result
  }, [byId, category, keyword, links, locations, roomFilter, services])

  function showForm(service: Service | null) {
    setEditing(service)
    setFields(service
      ? { name: service.name, category: service.category, defaultPort: service.defaultPort, description: service.description }
      : emptyService)
    setModalError('')
    setOpen(true)
  }

  function showBindModal(service: Service) {
    setBindIds([...(service.assetIds ?? [])])
    setBindSearch('')
    setBindKind('')
    setBindError('')
    setBindOpen(true)
  }

  async function save() {
    if (!fields.name.trim()) { setModalError('请填写服务名称'); return }
    setSaving(true)
    setModalError('')
    try {
      if (editing) await api<Service>(`/services/${editing.id}`, 'PUT', fields)
      else await api<Service>('/services', 'POST', fields)
      setOpen(false)
      await load()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setModalError(value instanceof Error ? value.message : '保存失败')
    } finally { setSaving(false) }
  }

  async function saveBindings() {
    if (!selectedService) return
    setBindSaving(true)
    setBindError('')
    try {
      const updated = await api<Service>(`/services/${selectedService.id}/assets`, 'PUT', { assetIds: bindIds })
      const next = services.map(item => (item.id === updated.id ? updated : item))
      setServices(next)
      onChanged?.(next)
      setBindOpen(false)
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setBindError(value instanceof Error ? value.message : '保存关联失败')
    } finally { setBindSaving(false) }
  }

  async function unlinkAsset(assetId: number) {
    if (!selectedService || !editable) return
    const remaining = (selectedService.assetIds ?? []).filter(id => id !== assetId)
    setSaving(true)
    setError('')
    try {
      const updated = await api<Service>(`/services/${selectedService.id}/assets`, 'PUT', { assetIds: remaining })
      const next = services.map(item => (item.id === updated.id ? updated : item))
      setServices(next)
      onChanged?.(next)
    } catch (value) {
      report(value)
    } finally { setSaving(false) }
  }

  async function remove(service: Service) {
    setSaving(true)
    try {
      await api(`/services/${service.id}`, 'DELETE')
      setDeleting(null)
      if (selectedId === service.id) setSelectedId(null)
      await load()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setError(value instanceof Error ? value.message : '删除失败')
    } finally { setSaving(false) }
  }

  const columns = useMemo<ColumnDef<Service>[]>(() => [
    {
      accessorKey: 'name',
      header: '名称',
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'zh-CN'),
      meta: { headerClassName: 'w-[24%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="table-name-cell">
          <ServiceIcon name={row.original.name} category={row.original.category} />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: '分类',
      sortingFn: (a, b) => a.original.category.localeCompare(b.original.category, 'zh-CN'),
      meta: { headerClassName: 'w-[14%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => row.original.category
        ? <Badge variant="secondary">{row.original.category}</Badge>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'assetCount',
      header: '关联资产',
      meta: { headerClassName: 'w-[12%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const count = row.original.assetCount ?? 0
        return (
          <Badge variant={count ? 'secondary' : 'outline'} className="tabular-nums">
            {count}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'description',
      header: '备注',
      enableSorting: false,
      cell: ({ row }) => row.original.description
        ? <span className="text-muted-foreground">{row.original.description}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    ...(editable ? [{
      id: 'actions',
      enableSorting: false,
      meta: { headerClassName: 'w-[88px] text-right', cellClassName: 'w-[88px] whitespace-nowrap text-right' },
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }: { row: { original: Service } }) => (
        <div className="table-row-action flex justify-end gap-1">
          <Button
            variant="ghost" size="sm"
            onClick={event => { event.stopPropagation(); showForm(row.original) }}
          >
            <Pencil />编辑
          </Button>
        </div>
      ),
    }] : []),
  ], [editable])

  const table = useReactTable({
    data: visible,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  // Detail view summary & bound assets table
  const detailSummary = useMemo(
    () => (selectedService ? buildTopologySummary(selectedService, assets, links, facilities) : null),
    [assets, facilities, links, selectedService],
  )

  const boundColumns = useMemo<ColumnDef<Asset>[]>(() => [
    {
      accessorKey: 'name',
      header: '资产名称',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const asset = row.original
        return (
          <button
            type="button"
            className="table-name-cell text-left hover:underline"
            onClick={() => onOpenAsset(asset.id)}
          >
            <span className="row-icon-box" aria-hidden="true"><AssetKindIcon kind={asset.kind} className="size-3.5" /></span>
            <span className="font-medium text-foreground">{asset.name}</span>
          </button>
        )
      },
    },
    {
      accessorKey: 'kind',
      header: '类型',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <Badge variant="secondary">{kindLabel(row.original.kind)}</Badge>,
    },
    {
      accessorKey: 'status',
      header: '状态',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const meta = row.original.lifecycle === 'retired'
          ? { label: '已退役', className: 'border-border bg-muted text-muted-foreground' }
          : (assetStatusMeta[row.original.status] ?? assetStatusMeta.unknown)
        return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
      },
    },
    {
      accessorKey: 'address',
      header: '地址 / IP',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => row.original.address
        ? <span className="font-mono text-xs tabular-nums">{row.original.address}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'hostOrPlatform',
      header: '宿主机 / 平台',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const asset = row.original
        if (asset.kind === 'vm') {
          const parent = detailSummary?.hostByVmId.get(asset.id)
          if (parent) {
            return (
              <Button variant="link" className="h-auto p-0 text-sm" onClick={() => onOpenAsset(parent.id)}>
                {parent.name}
              </Button>
            )
          }
          return <span className="text-muted-foreground">未关联宿主机</span>
        }
        return <span className="text-muted-foreground">{platformLabel(asset.platform)}</span>
      },
    },
    {
      id: 'location',
      header: '数据中心 / 机柜',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const loc = detailSummary?.locationByAssetId.get(row.original.id)
        if (!loc) return <span className="text-muted-foreground">未上架</span>
        return (
          <Button variant="link" className="h-auto p-0 text-sm" onClick={() => onOpenRoom(loc.room.id)}>
            <Building2 className="size-3.5" />
            {loc.room.name} · {loc.rack.name} ({loc.uText})
          </Button>
        )
      },
    },
    ...(editable ? [{
      id: 'actions',
      enableSorting: false,
      meta: { headerClassName: 'w-[88px] text-right', cellClassName: 'w-[88px] whitespace-nowrap text-right' },
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }: { row: { original: Asset } }) => (
        <div className="table-row-action flex justify-end gap-1">
          <Button
            variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive"
            disabled={saving}
            onClick={() => void unlinkAsset(row.original.id)}
          >
            <Unlink />移除
          </Button>
        </div>
      ),
    }] : []),
  ], [detailSummary, editable, onOpenAsset, onOpenRoom, saving])

  const boundTable = useReactTable({
    data: detailSummary?.boundAssets ?? [],
    columns: boundColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  // Filtered assets inside the "管理关联资产" modal
  const pickerAssets = useMemo(() => {
    const query = bindSearch.trim().toLowerCase()
    const selectedSet = new Set(bindIds)
    return assets
      .filter(a => (!bindKind || (bindKind === 'network' ? isNetworkKind(a.kind) : a.kind === bindKind)) &&
        (!query || [a.name, a.address, a.owner].some(v => v.toLowerCase().includes(query))))
      .sort((a, b) => Number(selectedSet.has(b.id)) - Number(selectedSet.has(a.id)) || a.name.localeCompare(b.name, 'zh-CN'))
  }, [assets, bindIds, bindKind, bindSearch])

  function toggleBindId(assetId: number) {
    setBindIds(current => current.includes(assetId) ? current.filter(id => id !== assetId) : [...current, assetId])
  }

  const editAndDeleteDialogs = (
    <>
      <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next) }}><DialogContent>
        <DialogHeader><DialogTitle>{editing ? '编辑服务' : '新增服务'}</DialogTitle></DialogHeader>
        {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
          <div className="space-y-2">
            <label htmlFor="service-name" className="text-sm font-medium">服务名称</label>
            <div className="flex items-center gap-2.5">
              <ServiceIcon name={fields.name} category={fields.category} />
              <Input id="service-name" required maxLength={120} placeholder="例如：nginx、postgresql、redis" value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} />
            </div>
          </div>
          <div className="space-y-2"><label htmlFor="service-category" className="text-sm font-medium">分类</label><Input id="service-category" maxLength={40} placeholder="例如：Web 服务、数据库、缓存" value={fields.category} onChange={event => setFields({ ...fields, category: event.target.value })} /></div>
          <div className="space-y-2"><label htmlFor="service-description" className="text-sm font-medium">备注</label><Textarea id="service-description" maxLength={200} rows={3} placeholder="可选，一句话说明服务用途" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></div>
          <DialogFooter>
            {editing && <Button type="button" variant="destructive" className="mr-auto" disabled={saving} onClick={() => { setOpen(false); setDeleting(editing) }}><Trash2 />删除</Button>}
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </form>
      </DialogContent></Dialog>
      <Dialog open={!!deleting} onOpenChange={next => { if (!next && !saving) setDeleting(null) }}><DialogContent>
        <DialogHeader><DialogTitle>删除服务「{deleting?.name}」？</DialogTitle><DialogDescription>只从服务目录里移除并解除关联，不影响资产本身。</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={saving} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter>
      </DialogContent></Dialog>
    </>
  )

  if (selectedService && detailSummary) {
    return (
      <div className="svc-detail-page">
        <div className="svc-detail-head">
          <div className="svc-detail-title">
            <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
              <ArrowLeft />返回服务
            </Button>
            <ServiceIcon name={selectedService.name} category={selectedService.category} />
            <div className="svc-detail-heading">
              <div className="svc-detail-name-row">
                <h2>{selectedService.name}</h2>
                {selectedService.category && <Badge variant="secondary">{selectedService.category}</Badge>}
              </div>
              {selectedService.description && <p className="svc-detail-desc">{selectedService.description}</p>}
            </div>
          </div>
          <div className="svc-detail-actions">
            <div className="view-switch" role="group" aria-label="切换详情或拓扑视图">
              <button
                type="button"
                className={detailView === 'details' ? 'is-active' : ''}
                onClick={() => setDetailView('details')}
              >
                <List className="size-3.5" aria-hidden="true" />详情信息
              </button>
              <button
                type="button"
                className={detailView === 'topology' ? 'is-active' : ''}
                onClick={() => setDetailView('topology')}
              >
                <Network className="size-3.5" aria-hidden="true" />关系拓扑
              </button>
            </div>
            {editable && (
              <>
                <Button variant="outline" size="sm" onClick={() => showForm(selectedService)}><Pencil />编辑</Button>
                <Button size="sm" onClick={() => showBindModal(selectedService)}><Link2 />关联资产</Button>
              </>
            )}
          </div>
        </div>

        {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        {detailView === 'details' ? (
          <>
            <div className="svc-detail-stats">
              <div><span>关联资产</span><strong>{detailSummary.boundCount}</strong></div>
              <div><span>虚拟机</span><strong>{detailSummary.vmCount}</strong></div>
              <div><span>服务器</span><strong>{detailSummary.hostCount}</strong></div>
              <div><span>覆盖数据中心</span><strong>{detailSummary.roomCount}</strong></div>
            </div>

            <section className="svc-bound-section">
              <div className="svc-bound-head">
                <h3>关联资产清单</h3>
                <span className="text-xs text-muted-foreground tabular-nums">共 {detailSummary.boundCount} 台</span>
              </div>
              <DataTable
                table={boundTable}
                showPager={false}
                emptyMessage="尚未关联资产，点击右上角「关联资产」绑定运行该服务的虚拟机或服务器"
              />
            </section>
          </>
        ) : (
          <ServiceTopologyGraph
            service={selectedService}
            assets={assets}
            links={links}
            facilities={facilities}
            dark={dark}
            editable={editable}
            onOpenAsset={onOpenAsset}
            onOpenRoom={onOpenRoom}
            onManageAssets={() => showBindModal(selectedService)}
          />
        )}

        <Dialog open={bindOpen} onOpenChange={next => { if (!bindSaving) setBindOpen(next) }}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>关联资产 · {selectedService.name}</DialogTitle>
              <DialogDescription>勾选运行该服务的虚拟机或服务器，系统会自动关联其宿主机与所在数据中心。</DialogDescription>
            </DialogHeader>
            {bindError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{bindError}</div>}
            <div className="svc-picker-filters">
              <Input
                placeholder="搜索资产名称、IP 或负责人"
                value={bindSearch}
                onChange={event => setBindSearch(event.target.value)}
              />
              <div className="svc-picker-kinds" role="group" aria-label="按类型筛选">
                {([['', '全部'], ['vm', '虚拟机'], ['host', '服务器'], ['network', '网络设备']] as const).map(([value, label]) => (
                  <button
                    key={value || 'all'} type="button"
                    className={`svc-picker-kind${bindKind === value ? ' is-active' : ''}`}
                    onClick={() => setBindKind(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="svc-picker-list">
              {pickerAssets.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">没有匹配的资产</div>
              ) : pickerAssets.map(asset => {
                const checked = bindIds.includes(asset.id)
                const loc = detailSummary.locationByAssetId.get(asset.id)
                return (
                  <label key={asset.id} className={`svc-picker-row${checked ? ' is-checked' : ''}`}>
                    <Checkbox checked={checked} onCheckedChange={() => toggleBindId(asset.id)} />
                    <div className="svc-picker-copy">
                      <strong>{asset.name}</strong>
                      <span>
                        {kindLabel(asset.kind)}
                        {asset.address ? ` · ${asset.address}` : ''}
                        {loc ? ` · ${loc.room.name}` : ''}
                      </span>
                    </div>
                  </label>
                )
              })}
            </div>
            <DialogFooter className="items-center">
              <span className="mr-auto text-xs text-muted-foreground tabular-nums">已选 {bindIds.length} 台资产</span>
              <Button type="button" variant="outline" disabled={bindSaving} onClick={() => setBindOpen(false)}>取消</Button>
              <Button type="button" disabled={bindSaving} onClick={() => void saveBindings()}>
                {bindSaving ? '保存中…' : '保存关联'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {editAndDeleteDialogs}
      </div>
    )
  }

  return (
    <RoomTreeLayout
      facilities={facilities}
      value={roomFilter}
      onChange={onRoomFilterChange}
      unassignedLabel="未部署"
      counts={roomCounts}
    >
      <PageHeader
        title="服务"
        filters={<>
          <Input className="max-w-sm" placeholder="搜索服务名称、分类或备注" value={keyword} onChange={event => setKeyword(event.target.value)} />
          <Select
            style={{ width: 140 }} allowClear searchable={false} placeholder="全部分类"
            value={category || undefined}
            onChange={(value: string | undefined) => setCategory(value ?? '')}
            options={categories.map(item => ({ value: item, label: item }))}
          />
        </>}
        actions={editable && <Button onClick={() => showForm(null)}><Plus />新增服务</Button>}
      />
      {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <DataTable
        table={table}
        loading={loading}
        onRowClick={(service, event) => {
          if ((event.target as HTMLElement).closest('button, a')) return
          setSelectedId(service.id)
          setDetailView('details')
        }}
        emptyMessage={keyword || category || roomFilter !== 'all' ? '没有匹配的服务' : '还没有服务，新增一个开始维护'}
        pagerExtra={
          <span>
            点击任一服务查看详情与部署拓扑 · 开源图标基于 <a href="/licenses/simple-icons.txt" target="_blank" rel="noreferrer">Simple Icons (CC0 1.0)</a>
          </span>
        }
      />
      {editAndDeleteDialogs}
    </RoomTreeLayout>
  )
}
