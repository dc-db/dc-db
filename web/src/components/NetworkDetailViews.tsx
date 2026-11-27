import { useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowLeft, Building2, ChevronLeft, ChevronRight, List, Network, Split } from 'lucide-react'
import { api, APIError } from '../api'
import { downloadCSV } from '../csv'
import type { Asset, AvailableIPs, IPAddress, IPUsage, Link, Subnet, SubnetDetail, VLAN } from '../api'
import { assetLocations, uRange, type Facilities } from '../facilities'
import { DataTable } from './DataTable'
import { RowIconBox } from './ServiceIcon'
import { buildFacetedOptions, ClearFiltersButton, DataTableViewOptions, matchesMultiFilter } from './TableColumnControls'
import { BulkActionBar, createRowSelectionColumn } from './TableSelectionControls'
import { TopologyCanvas, type TopoEdgeInput, type TopoItem, type TopoTier } from './TopologyCanvas'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { UsageBar } from './UsageBar'

const subnetStatusMeta: Record<string, { label: string; className: string }> = {
  container: { label: '聚合', className: 'border-border bg-secondary text-secondary-foreground' },
  active: { label: '启用', className: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-success before:content-[""]' },
  reserved: { label: '预留', className: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-warning before:content-[""]' },
  deprecated: { label: '停用', className: 'border-border bg-muted/60 text-muted-foreground' },
}

const ipStateMeta: Record<string, { label: string; className: string }> = {
  active: { label: '启用', className: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-success before:content-[""]' },
  reserved: { label: '预留', className: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-warning before:content-[""]' },
  deprecated: { label: '停用', className: 'border-border bg-muted/60 text-muted-foreground' },
  dhcp: { label: 'DHCP', className: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-foreground before:content-[""]' },
  slaac: { label: 'SLAAC', className: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-foreground before:content-[""]' },
}
const ipSourceMeta: Record<string, string> = {
  allocated: '手工分配', asset: '资产地址', gateway: '网关',
}
const ipRoleLabels: Record<string, string> = {
  loopback: '环回', secondary: '辅助', vip: 'VIP', vrrp: 'VRRP', hsrp: 'HSRP', glbp: 'GLBP', anycast: 'Anycast',
}
const assetStatusMap: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'idle' }> = {
  online: { label: '在线', tone: 'ok' },
  running: { label: '运行中', tone: 'ok' },
  paused: { label: '已暂停', tone: 'warn' },
  offline: { label: '离线', tone: 'bad' },
  stopped: { label: '已停止', tone: 'idle' },
  unknown: { label: '未知', tone: 'idle' },
}

function ipv4Number(address: string): number | null {
  const parts = address.trim().split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

function subnetRange(cidr: string): { start: number; prefix: number } | null {
  const [address, prefixText] = cidr.trim().split('/')
  if (!address || !prefixText) return null
  const prefix = Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null
  const ip = ipv4Number(address)
  if (ip === null) return null
  const size = 2 ** (32 - prefix)
  return { start: Math.floor(ip / size) * size, prefix }
}

function compareIP(left?: string | null, right?: string | null): number {
  const l = (left ?? '').trim()
  const r = (right ?? '').trim()
  const ln = ipv4Number(l)
  const rn = ipv4Number(r)
  if (ln !== null && rn !== null) return ln - rn
  if (ln !== null) return -1
  if (rn !== null) return 1
  return l.localeCompare(r, undefined, { numeric: true })
}

function compareCIDR(left: string, right: string): number {
  const lr = subnetRange(left)
  const rr = subnetRange(right)
  if (lr && rr) return lr.start - rr.start || lr.prefix - rr.prefix
  if (lr) return -1
  if (rr) return 1
  return left.localeCompare(right, undefined, { numeric: true })
}

function compareText(left?: string | null, right?: string | null): number {
  return (left ?? '').localeCompare(right ?? '', 'zh-CN', { numeric: true })
}

function ipUsageRowId(row: IPUsage): string {
  return row.allocationId ? `alloc-${row.allocationId}` : `${row.source}-${row.ip}-${row.assetId ?? 0}`
}

interface SubnetDetailProps {
  subnet: Subnet
  assets: Asset[]
  links: Link[]
  facilities: Facilities
  dark: boolean
  onBack: () => void
  onOpenAsset: (id: number) => void
  onOpenRoom: (roomId: number) => void
  onOpenIPsForSubnet: (subnetId: number) => void
  onSessionError: (error: unknown) => void
}

export function SubnetDetailView({
  subnet,
  assets,
  links,
  facilities,
  dark,
  onBack,
  onOpenAsset,
  onOpenRoom,
  onOpenIPsForSubnet,
  onSessionError,
}: SubnetDetailProps) {
  const [view, setView] = useState<'details' | 'topology'>('details')
  const [detail, setDetail] = useState<SubnetDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [freePage, setFreePage] = useState(0)
  const [freeIPs, setFreeIPs] = useState<AvailableIPs | null>(null)
  const [usedSorting, setUsedSorting] = useState<SortingState>([])
  const [usedColumnVisibility, setUsedColumnVisibility] = useState<VisibilityState>({})
  const [usedRowSelection, setUsedRowSelection] = useState<RowSelectionState>({})
  const [usedStateFilter, setUsedStateFilter] = useState<string[]>([])
  const [usedSourceFilter, setUsedSourceFilter] = useState<string[]>([])
  const [usedRoleFilter, setUsedRoleFilter] = useState<string[]>([])
  const freePageSize = 10

  useEffect(() => {
    setView('details')
    setFreePage(0)
    setUsedRowSelection({})
    setUsedStateFilter([])
    setUsedSourceFilter([])
    setUsedRoleFilter([])
  }, [subnet.id])

  useEffect(() => {
    const validIds = new Set((detail?.usedIps ?? []).map(ipUsageRowId))
    setUsedRowSelection(prev => {
      const next: RowSelectionState = {}
      let changed = false
      for (const [id, selected] of Object.entries(prev)) {
        if (selected && validIds.has(id)) next[id] = true
        else changed = true
      }
      return changed ? next : prev
    })
  }, [detail?.usedIps])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api<SubnetDetail>(`/subnets/${subnet.id}/addresses`)
      .then(data => { if (active) setDetail(data) })
      .catch(err => {
        if (!active) return
        if (err instanceof APIError && err.status === 401) onSessionError(err)
        else setError(err instanceof Error ? err.message : '加载网段详情失败')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [onSessionError, subnet.id])

  useEffect(() => {
    let active = true
    api<AvailableIPs>(`/subnets/${subnet.id}/available-ips?offset=${freePage * freePageSize}&limit=${freePageSize}`)
      .then(data => { if (active) setFreeIPs(data) })
      .catch(() => { if (active) setFreeIPs(null) })
    return () => { active = false }
  }, [freePage, subnet.id])

  const current = detail ?? subnet
  const usedPct = current.usable > 0 ? Math.min(100, Math.round((current.used / current.usable) * 100)) : 0
  const statusInfo = subnetStatusMeta[current.status] ?? subnetStatusMeta.active

  const usedIps = useMemo(() => detail?.usedIps ?? [], [detail?.usedIps])
  const usedActiveFilterCount = usedStateFilter.length + usedSourceFilter.length + usedRoleFilter.length
  const ipStateCatalog = useMemo(
    () => Object.entries(ipStateMeta).map(([value, meta]) => ({ value, label: meta.label })),
    [],
  )
  const ipSourceCatalog = useMemo(
    () => Object.entries(ipSourceMeta).map(([value, label]) => ({ value, label })),
    [],
  )
  const ipRoleCatalog = useMemo(
    () => Object.entries(ipRoleLabels).map(([value, label]) => ({ value, label })),
    [],
  )
  const usedStateOptions = useMemo(() => buildFacetedOptions({
    items: usedIps.filter(row =>
      matchesMultiFilter(usedSourceFilter, row.source)
      && matchesMultiFilter(usedRoleFilter, row.role),
    ),
    getEntries: row => ({
      value: row.state,
      label: ipStateMeta[row.state]?.label ?? row.state,
    }),
    catalog: ipStateCatalog,
    includeZeroCatalog: true,
    selectedValues: usedStateFilter,
  }), [ipStateCatalog, usedIps, usedRoleFilter, usedSourceFilter, usedStateFilter])
  const usedSourceOptions = useMemo(() => buildFacetedOptions({
    items: usedIps.filter(row =>
      matchesMultiFilter(usedStateFilter, row.state)
      && matchesMultiFilter(usedRoleFilter, row.role),
    ),
    getEntries: row => ({
      value: row.source,
      label: ipSourceMeta[row.source] ?? row.source,
    }),
    catalog: ipSourceCatalog,
    includeZeroCatalog: true,
    selectedValues: usedSourceFilter,
  }), [ipSourceCatalog, usedIps, usedRoleFilter, usedSourceFilter, usedStateFilter])
  const usedRoleOptions = useMemo(() => buildFacetedOptions({
    items: usedIps.filter(row =>
      matchesMultiFilter(usedStateFilter, row.state)
      && matchesMultiFilter(usedSourceFilter, row.source),
    ),
    getEntries: row => {
      const role = row.role?.trim()
      return role ? { value: role, label: ipRoleLabels[role] ?? role } : null
    },
    catalog: ipRoleCatalog,
    includeEmpty: true,
    emptyLabel: '未设置',
    selectedValues: usedRoleFilter,
  }), [ipRoleCatalog, usedIps, usedRoleFilter, usedSourceFilter, usedStateFilter])
  const filteredUsedIps = useMemo(
    () => usedIps.filter(row =>
      matchesMultiFilter(usedStateFilter, row.state)
      && matchesMultiFilter(usedSourceFilter, row.source)
      && matchesMultiFilter(usedRoleFilter, row.role),
    ),
    [usedIps, usedRoleFilter, usedSourceFilter, usedStateFilter],
  )

  const usedColumns = useMemo<ColumnDef<IPUsage>[]>(() => [
    createRowSelectionColumn<IPUsage>({
      selectAllLabel: '全选当前页已用 IP',
      getRowLabel: row => `选择 IP ${row.ip}`,
    }),
    {
      accessorKey: 'ip',
      header: 'IP 地址',
      sortingFn: (a, b) => compareIP(a.original.ip, b.original.ip),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="font-mono text-xs font-medium tabular-nums">{row.original.ip}</span>,
    },
    {
      id: 'state',
      accessorFn: row => ipStateMeta[row.state]?.label ?? row.state,
      header: '状态',
      enableSorting: false,
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: {
          options: usedStateOptions,
          selectedValues: usedStateFilter,
          onChange: setUsedStateFilter,
          searchPlaceholder: '搜索状态',
        },
      },
      cell: ({ row }) => {
        const meta = ipStateMeta[row.original.state]
        return <Badge variant="outline" className={meta?.className}>{meta?.label ?? row.original.state}</Badge>
      },
    },
    {
      id: 'source',
      accessorFn: row => ipSourceMeta[row.source] ?? row.source,
      header: '来源',
      enableSorting: false,
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: {
          options: usedSourceOptions,
          selectedValues: usedSourceFilter,
          onChange: setUsedSourceFilter,
          searchPlaceholder: '搜索来源',
        },
      },
      cell: ({ row }) => <Badge variant="secondary">{ipSourceMeta[row.original.source] ?? row.original.source}</Badge>,
    },
    {
      id: 'dnsName',
      accessorFn: row => row.dnsName?.trim() || undefined,
      header: 'DNS 名称',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => row.original.dnsName
        ? <span className="font-mono text-xs">{row.original.dnsName}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'role',
      accessorFn: row => (ipRoleLabels[row.role ?? ''] ?? row.role)?.trim() || undefined,
      header: '角色',
      enableSorting: false,
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: {
          options: usedRoleOptions,
          selectedValues: usedRoleFilter,
          onChange: setUsedRoleFilter,
          searchPlaceholder: '搜索角色',
        },
      },
      cell: ({ row }) => ipRoleLabels[row.original.role ?? ''] ?? (row.original.role || <span className="text-muted-foreground">—</span>),
    },
    {
      id: 'asset',
      accessorFn: row => [row.assetName, row.label].filter(Boolean).join(' / ') || undefined,
      header: '关联资产 / 用途',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span>
          {row.original.assetId && row.original.assetName
            ? <Button variant="link" className="h-auto p-0 text-sm" onClick={() => onOpenAsset(row.original.assetId!)}>{row.original.assetName}</Button>
            : (row.original.label || <span className="text-muted-foreground">—</span>)}
          {row.original.assetId && row.original.label && <span className="text-muted-foreground"> / {row.original.label}</span>}
        </span>
      ),
    },
    {
      id: 'notes',
      accessorFn: row => row.notes?.trim() || undefined,
      header: '备注',
      enableSorting: false,
      cell: ({ row }) => row.original.notes
        ? <span className="text-muted-foreground">{row.original.notes}</span>
        : <span className="text-muted-foreground">—</span>,
    },
  ], [onOpenAsset, usedRoleFilter, usedRoleOptions, usedSourceFilter, usedSourceOptions, usedStateFilter, usedStateOptions])

  const usedTable = useReactTable({
    data: filteredUsedIps,
    columns: usedColumns,
    getRowId: ipUsageRowId,
    enableRowSelection: true,
    state: { sorting: usedSorting, columnVisibility: usedColumnVisibility, rowSelection: usedRowSelection },
    onSortingChange: setUsedSorting,
    onColumnVisibilityChange: setUsedColumnVisibility,
    onRowSelectionChange: setUsedRowSelection,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  const selectedUsedIps = usedTable.getSelectedRowModel().rows.map(row => row.original)

  function exportSelectedUsedIPsCSV() {
    if (!selectedUsedIps.length) return
    downloadCSV(`dc-db-subnet-${current.id}-used-ips.csv`, [
      ['IP 地址', '来源', '状态', 'DNS 名称', '角色', '网段', '资产', '用途', '备注'],
      ...selectedUsedIps.map(item => [
        item.ip,
        ipSourceMeta[item.source] ?? item.source,
        ipStateMeta[item.state]?.label ?? item.state,
        item.dnsName ?? '',
        ipRoleLabels[item.role ?? ''] ?? (item.role || ''),
        current.name,
        item.assetName ?? '',
        item.label ?? '',
        item.notes ?? '',
      ]),
    ])
  }

  // Build layered topology: [VLAN?] → 网段 → 虚拟机/直接承载资产 → 服务器 → 数据中心
  const topo = useMemo(() => {
    const assetById = new Map(assets.map(a => [a.id, a]))
    const locations = assetLocations(facilities, links)
    const regionById = new Map(facilities.regions.map(r => [r.id, r.name]))
    const hostByVmId = new Map<number, Asset>()
    for (const link of links) {
      if (link.kind !== 'hosts') continue
      const host = assetById.get(link.fromId)
      if (host && !hostByVmId.has(link.toId)) hostByVmId.set(link.toId, host)
    }

    const subnetNodeId = `subnet-${current.id}`
    const edges: TopoEdgeInput[] = []
    const vlanNodes: TopoItem[] = []
    if (current.vlan) {
      vlanNodes.push({
        id: `vlan-${current.vlan}`,
        kind: 'vlan',
        title: `VLAN ${current.vlan}`,
        subtitle: current.vlanName || '关联二层网络',
      })
      edges.push({ source: `vlan-${current.vlan}`, target: subnetNodeId })
    }

    const seenAsset = new Set<number>()
    const vmNodes: TopoItem[] = []
    const hostMap = new Map<number, Asset>()
    const roomMap = new Map<number, { id: number; name: string; regionId: number; count: number }>()

    for (const usage of detail?.usedIps ?? []) {
      if (!usage.assetId || seenAsset.has(usage.assetId)) continue
      const asset = assetById.get(usage.assetId)
      if (!asset) continue
      seenAsset.add(asset.id)
      const st = asset.lifecycle === 'retired'
        ? { label: '已退役', tone: 'idle' as const }
        : (assetStatusMap[asset.status] ?? assetStatusMap.unknown)
      if (asset.kind === 'vm') {
        vmNodes.push({
          id: `vm-${asset.id}`,
          kind: 'vm',
          title: asset.name,
          subtitle: usage.ip || asset.address || '虚拟机',
          statusTone: st.tone,
          statusLabel: st.label,
          onClick: () => onOpenAsset(asset.id),
        })
        edges.push({ source: subnetNodeId, target: `vm-${asset.id}` })
        const host = hostByVmId.get(asset.id)
        if (host) {
          hostMap.set(host.id, host)
          edges.push({ source: `vm-${asset.id}`, target: `host-${host.id}` })
        }
      } else {
        hostMap.set(asset.id, asset)
        edges.push({ source: subnetNodeId, target: `host-${asset.id}` })
      }
    }

    const hostNodes: TopoItem[] = []
    for (const host of hostMap.values()) {
      const st = host.lifecycle === 'retired'
        ? { label: '已退役', tone: 'idle' as const }
        : (assetStatusMap[host.status] ?? assetStatusMap.unknown)
      const loc = locations.get(host.id)
      hostNodes.push({
        id: `host-${host.id}`,
        kind: host.kind,
        title: host.name,
        subtitle: [host.address, loc ? `${loc.rack.name} ${uRange(loc.placement)}` : '未分配'].filter(Boolean).join(' · '),
        statusTone: st.tone,
        statusLabel: st.label,
        onClick: () => onOpenAsset(host.id),
      })
      if (loc) {
        const cur = roomMap.get(loc.room.id) ?? { id: loc.room.id, name: loc.room.name, regionId: loc.room.regionId, count: 0 }
        cur.count += 1
        roomMap.set(loc.room.id, cur)
        edges.push({ source: `host-${host.id}`, target: `room-${loc.room.id}` })
      }
    }

    const roomNodes: TopoItem[] = Array.from(roomMap.values()).map(r => ({
      id: `room-${r.id}`,
      kind: 'room',
      title: r.name,
      subtitle: [r.regionId ? regionById.get(r.regionId) : '', `${r.count} 台设备`].filter(Boolean).join(' · '),
      onClick: () => onOpenRoom(r.id),
    }))

    const tiers: TopoTier[] = [
      ...(vlanNodes.length ? [{ key: 'vlan', label: 'VLAN', nodes: vlanNodes }] : []),
      {
        key: 'subnet',
        label: '网段',
        nodes: [{
          id: subnetNodeId,
          kind: 'subnet',
          title: current.name,
          subtitle: `${current.cidr} · 已用 ${current.used}/${current.usable}`,
          isRoot: true,
        }],
      },
      { key: 'vm', label: '虚拟机', nodes: vmNodes },
      { key: 'host', label: '服务器 / 网络设备', nodes: hostNodes },
      { key: 'room', label: '数据中心', nodes: roomNodes },
    ]
    return { tiers, edges, linkedAssets: seenAsset.size }
  }, [assets, current, detail?.usedIps, facilities, links, onOpenAsset, onOpenRoom])

  const freeTotalPages = freeIPs ? Math.max(1, Math.ceil(freeIPs.total / freePageSize)) : 1

  return (
    <div className="svc-detail-page">
      <div className="svc-detail-head">
        <div className="svc-detail-title">
          <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft />返回网段</Button>
          <RowIconBox><Network className="size-3.5" /></RowIconBox>
          <div className="svc-detail-heading">
            <div className="svc-detail-name-row">
              <h2>{current.name}</h2>
              <Badge variant="outline" className="font-mono text-xs">{current.cidr}</Badge>
              <Badge variant="outline" className={statusInfo.className}>{statusInfo.label}</Badge>
            </div>
            {current.notes && <p className="svc-detail-desc">{current.notes}</p>}
          </div>
        </div>
        <div className="svc-detail-actions">
          <div className="view-switch" role="group" aria-label="切换详情或拓扑视图">
            <button type="button" className={view === 'details' ? 'is-active' : ''} onClick={() => setView('details')}>
              <List className="size-3.5" aria-hidden="true" />详情信息
            </button>
            <button type="button" className={view === 'topology' ? 'is-active' : ''} onClick={() => setView('topology')}>
              <Network className="size-3.5" aria-hidden="true" />关系拓扑
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenIPsForSubnet(current.id)}>在 IP 地址中管理</Button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {view === 'details' ? (
        <>
          <div className="svc-detail-stats">
            <div><span>网关</span><strong className="font-mono text-base">{current.gateway || '—'}</strong></div>
            <div><span>VLAN</span><strong className="text-base">{current.vlan ? `VLAN ${current.vlan}${current.vlanName ? ` · ${current.vlanName}` : ''}` : '—'}</strong></div>
            <div><span>用途</span><strong className="text-base">{current.role || '—'}</strong></div>
            <div><span>已用 / 可用</span><strong>{current.used} / {current.usable}</strong></div>
            <div><span>空闲</span><strong>{current.free}</strong></div>
            <div className="min-w-[160px] flex-1 items-center">
              <span>利用率</span>
              <UsageBar value={usedPct} label="网段地址利用率" className="w-full" barClassName="min-w-0 max-w-[140px] flex-1" />
            </div>
          </div>

          <section className="svc-bound-section">
            <div className="svc-bound-head items-center">
              <div className="flex flex-wrap items-center gap-2">
                <h3>已用 IP 清单</h3>
                <DataTableViewOptions align="start" table={usedTable} />
                <ClearFiltersButton
                  count={usedActiveFilterCount}
                  onReset={() => {
                    setUsedStateFilter([])
                    setUsedSourceFilter([])
                    setUsedRoleFilter([])
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {usedActiveFilterCount > 0 ? `匹配 ${filteredUsedIps.length} / 共 ${usedIps.length} 个` : `共 ${usedIps.length} 个`}
              </span>
            </div>
            <DataTable
              table={usedTable}
              loading={loading}
              emptyMessage={usedActiveFilterCount > 0 ? '没有匹配的已用 IP 地址' : '该网段暂无已用 IP 地址'}
            />
          </section>
          <BulkActionBar
            count={selectedUsedIps.length}
            unit="条地址"
            onClear={() => setUsedRowSelection({})}
            onExport={exportSelectedUsedIPsCSV}
          />

          {freeIPs && freeIPs.total > 0 && (
            <section className="svc-bound-section">
              <div className="svc-bound-head">
                <h3>空闲 IP 地址</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  <span>共 {freeIPs.total.toLocaleString('zh-CN')} 个可用 · 第 {freePage + 1} / {freeTotalPages} 页</span>
                  <Button variant="outline" size="icon-sm" aria-label="上一页空闲 IP" disabled={freePage <= 0} onClick={() => setFreePage(p => Math.max(0, p - 1))}><ChevronLeft /></Button>
                  <Button variant="outline" size="icon-sm" aria-label="下一页空闲 IP" disabled={freePage + 1 >= freeTotalPages} onClick={() => setFreePage(p => p + 1)}><ChevronRight /></Button>
                </div>
              </div>
              <div className="net-free-grid">
                {freeIPs.items.map(ip => (
                  <span key={ip} className="net-free-chip">{ip}</span>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <TopologyCanvas
          graphKey={`subnet-${current.id}-${topo.linkedAssets}`}
          tiers={topo.tiers}
          links={topo.edges}
          dark={dark}
          ariaLabel={`${current.name} 网段关系拓扑`}
          emptyState={topo.linkedAssets === 0 && !current.vlan ? (
            <>
              <p className="text-sm font-medium text-foreground">该网段暂无关联资产或 VLAN</p>
              <p className="text-xs text-muted-foreground">当资产配置了该网段内的 IP 或手动分配关联资产后，会自动展示关系拓扑。</p>
            </>
          ) : undefined}
        />
      )}
    </div>
  )
}

interface VLANDetailProps {
  vlan: VLAN
  subnets: Subnet[]
  assets: Asset[]
  links: Link[]
  facilities: Facilities
  dark: boolean
  onBack: () => void
  onOpenSubnetDetail: (subnet: Subnet) => void
  onOpenAsset: (id: number) => void
  onOpenRoom: (roomId: number) => void
}

export function VLANDetailView({
  vlan,
  subnets,
  assets,
  links,
  facilities,
  dark,
  onBack,
  onOpenSubnetDetail,
  onOpenAsset,
  onOpenRoom,
}: VLANDetailProps) {
  const [view, setView] = useState<'details' | 'topology'>('details')
  const [allIPs, setAllIPs] = useState<IPAddress[]>([])
  const [subnetSorting, setSubnetSorting] = useState<SortingState>([])
  const [subnetColumnVisibility, setSubnetColumnVisibility] = useState<VisibilityState>({})
  const [subnetRowSelection, setSubnetRowSelection] = useState<RowSelectionState>({})
  const [subnetStatusFilter, setSubnetStatusFilter] = useState<string[]>([])

  useEffect(() => {
    setView('details')
    setSubnetRowSelection({})
    setSubnetStatusFilter([])
  }, [vlan.id])
  useEffect(() => {
    let active = true
    api<IPAddress[]>('/ip-addresses').then(data => { if (active) setAllIPs(data) }).catch(() => {})
    return () => { active = false }
  }, [vlan.id])

  const relatedSubnets = useMemo(
    () => subnets.filter(s => s.vlan === String(vlan.vid)),
    [subnets, vlan.vid],
  )
  useEffect(() => {
    const validIds = new Set(relatedSubnets.map(s => String(s.id)))
    setSubnetRowSelection(prev => {
      const next: RowSelectionState = {}
      let changed = false
      for (const [id, selected] of Object.entries(prev)) {
        if (selected && validIds.has(id)) next[id] = true
        else changed = true
      }
      return changed ? next : prev
    })
  }, [relatedSubnets])
  const statusInfo = subnetStatusMeta[vlan.status] ?? subnetStatusMeta.active
  const subnetStatusCatalog = useMemo(
    () => Object.entries(subnetStatusMeta).map(([value, meta]) => ({ value, label: meta.label })),
    [],
  )
  const subnetStatusOptions = useMemo(() => buildFacetedOptions({
    items: relatedSubnets,
    getEntries: row => ({
      value: row.status,
      label: subnetStatusMeta[row.status]?.label ?? row.status,
    }),
    catalog: subnetStatusCatalog,
    includeZeroCatalog: true,
    selectedValues: subnetStatusFilter,
  }), [relatedSubnets, subnetStatusCatalog, subnetStatusFilter])
  const filteredRelatedSubnets = useMemo(
    () => relatedSubnets.filter(row => matchesMultiFilter(subnetStatusFilter, row.status)),
    [relatedSubnets, subnetStatusFilter],
  )

  const subnetColumns = useMemo<ColumnDef<Subnet>[]>(() => [
    createRowSelectionColumn<Subnet>({
      selectAllLabel: '全选关联网段',
      getRowLabel: row => `选择网段 ${row.cidr}`,
    }),
    {
      accessorKey: 'name',
      header: '网段名称',
      sortingFn: (a, b) => compareText(a.original.name, b.original.name),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'cidr',
      header: 'CIDR',
      sortingFn: (a, b) => compareCIDR(a.original.cidr, b.original.cidr),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="font-mono text-xs tabular-nums">{row.original.cidr}</span>,
    },
    {
      id: 'status',
      accessorFn: row => subnetStatusMeta[row.status]?.label ?? row.status,
      header: '状态',
      enableSorting: false,
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: {
          options: subnetStatusOptions,
          selectedValues: subnetStatusFilter,
          onChange: setSubnetStatusFilter,
          searchPlaceholder: '搜索状态',
        },
      },
      cell: ({ row }) => {
        const meta = subnetStatusMeta[row.original.status] ?? { label: row.original.status, className: '' }
        return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
      },
    },
    {
      id: 'gateway',
      accessorFn: row => row.gateway?.trim() || undefined,
      header: '网关',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => row.original.gateway ? <span className="font-mono text-xs tabular-nums">{row.original.gateway}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'usage',
      accessorFn: row => (row.usable > 0 ? row.used / row.usable : 0),
      header: '已用 / 可用',
      sortingFn: (a, b) => {
        const lRatio = a.original.usable > 0 ? a.original.used / a.original.usable : 0
        const rRatio = b.original.usable > 0 ? b.original.used / b.original.usable : 0
        return lRatio - rRatio || a.original.used - b.original.used || a.original.usable - b.original.usable
      },
      meta: { cellClassName: 'whitespace-nowrap tabular-nums' },
      cell: ({ row }) => `${row.original.used} / ${row.original.usable}`,
    },
    {
      id: 'notes',
      accessorFn: row => row.notes?.trim() || undefined,
      header: '备注',
      enableSorting: false,
      cell: ({ row }) => row.original.notes ? <span className="text-muted-foreground">{row.original.notes}</span> : <span className="text-muted-foreground">—</span>,
    },
  ], [subnetStatusFilter, subnetStatusOptions])

  const subnetTable = useReactTable({
    data: filteredRelatedSubnets,
    columns: subnetColumns,
    getRowId: row => String(row.id),
    enableRowSelection: true,
    state: { sorting: subnetSorting, columnVisibility: subnetColumnVisibility, rowSelection: subnetRowSelection },
    onSortingChange: setSubnetSorting,
    onColumnVisibilityChange: setSubnetColumnVisibility,
    onRowSelectionChange: setSubnetRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const selectedRelatedSubnets = subnetTable.getSelectedRowModel().rows.map(row => row.original)

  function exportSelectedSubnetsCSV() {
    if (!selectedRelatedSubnets.length) return
    downloadCSV(`dc-db-vlan-${vlan.vid}-subnets.csv`, [
      ['网段名称', 'CIDR', '网关', 'VLAN', '状态', '用途', '可用地址', '已用', '空闲', '备注'],
      ...selectedRelatedSubnets.map(item => [
        item.name,
        item.cidr,
        item.gateway,
        item.vlan,
        subnetStatusMeta[item.status]?.label ?? item.status,
        ipRoleLabels[item.role ?? ''] ?? (item.role || ''),
        item.usable,
        item.used,
        item.free,
        item.notes,
      ]),
    ])
  }

  // Build layered topology: [数据中心?] → VLAN → 关联网段 → 关联资产
  const topo = useMemo(() => {
    const assetById = new Map(assets.map(a => [a.id, a]))
    const locations = assetLocations(facilities, links)
    const vlanNodeId = `vlan-${vlan.id}`
    const edges: TopoEdgeInput[] = []

    const roomNodes: TopoItem[] = []
    if (vlan.roomId && vlan.roomName) {
      roomNodes.push({
        id: `room-${vlan.roomId}`,
        kind: 'room',
        title: vlan.roomName,
        subtitle: '所属数据中心',
        onClick: () => onOpenRoom(vlan.roomId!),
      })
      edges.push({ source: `room-${vlan.roomId}`, target: vlanNodeId })
    }

    const subnetIdSet = new Set(relatedSubnets.map(s => s.id))
    const subnetNodes: TopoItem[] = relatedSubnets.map(s => ({
      id: `subnet-${s.id}`,
      kind: 'subnet',
      title: s.name,
      subtitle: `${s.cidr} · 已用 ${s.used}/${s.usable}`,
      onClick: () => onOpenSubnetDetail(s),
    }))
    relatedSubnets.forEach(s => edges.push({ source: vlanNodeId, target: `subnet-${s.id}` }))

    const assetNodeMap = new Map<number, TopoItem>()
    for (const entry of allIPs) {
      if (!subnetIdSet.has(entry.subnetId) || !entry.assetId) continue
      const asset = assetById.get(entry.assetId)
      if (!asset) continue
      if (!assetNodeMap.has(asset.id)) {
        const st = asset.lifecycle === 'retired'
          ? { label: '已退役', tone: 'idle' as const }
          : (assetStatusMap[asset.status] ?? assetStatusMap.unknown)
        const loc = locations.get(asset.id)
        assetNodeMap.set(asset.id, {
          id: `asset-${asset.id}`,
          kind: asset.kind,
          title: asset.name,
          subtitle: [entry.ip, loc?.room.name].filter(Boolean).join(' · '),
          statusTone: st.tone,
          statusLabel: st.label,
          onClick: () => onOpenAsset(asset.id),
        })
      }
      edges.push({ source: `subnet-${entry.subnetId}`, target: `asset-${asset.id}` })
    }

    const tiers: TopoTier[] = [
      ...(roomNodes.length ? [{ key: 'room', label: '数据中心', nodes: roomNodes }] : []),
      {
        key: 'vlan',
        label: 'VLAN',
        nodes: [{
          id: vlanNodeId,
          kind: 'vlan',
          title: `VLAN ${vlan.vid}`,
          subtitle: vlan.name,
          isRoot: true,
        }],
      },
      { key: 'subnets', label: '关联网段', nodes: subnetNodes },
      { key: 'assets', label: '关联资产', nodes: Array.from(assetNodeMap.values()) },
    ]
    return { tiers, edges, hasNeighbors: roomNodes.length > 0 || subnetNodes.length > 0 }
  }, [allIPs, assets, facilities, links, onOpenAsset, onOpenRoom, onOpenSubnetDetail, relatedSubnets, vlan])

  return (
    <div className="svc-detail-page">
      <div className="svc-detail-head">
        <div className="svc-detail-title">
          <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft />返回 VLAN</Button>
          <RowIconBox><Split className="size-3.5" /></RowIconBox>
          <div className="svc-detail-heading">
            <div className="svc-detail-name-row">
              <h2>VLAN {vlan.vid} · {vlan.name}</h2>
              <Badge variant="outline" className={statusInfo.className}>{statusInfo.label}</Badge>
            </div>
            {vlan.description && <p className="svc-detail-desc">{vlan.description}</p>}
          </div>
        </div>
        <div className="svc-detail-actions">
          <div className="view-switch" role="group" aria-label="切换详情或拓扑视图">
            <button type="button" className={view === 'details' ? 'is-active' : ''} onClick={() => setView('details')}>
              <List className="size-3.5" aria-hidden="true" />详情信息
            </button>
            <button type="button" className={view === 'topology' ? 'is-active' : ''} onClick={() => setView('topology')}>
              <Network className="size-3.5" aria-hidden="true" />关系拓扑
            </button>
          </div>
        </div>
      </div>

      {view === 'details' ? (
        <>
          <div className="svc-detail-stats">
            <div><span>VLAN ID</span><strong className="font-mono">{vlan.vid}</strong></div>
            <div>
              <span>所属数据中心</span>
              <strong className="text-base">
                {vlan.roomId && vlan.roomName ? (
                  <Button variant="link" className="h-auto p-0 text-base font-semibold" onClick={() => onOpenRoom(vlan.roomId!)}>
                    <Building2 className="size-4" />{vlan.roomName}
                  </Button>
                ) : '—'}
              </strong>
            </div>
            <div><span>关联网段</span><strong>{relatedSubnets.length}</strong></div>
          </div>

          <section className="svc-bound-section">
            <div className="svc-bound-head items-center">
              <div className="flex flex-wrap items-center gap-2">
                <h3>关联网段清单</h3>
                <DataTableViewOptions align="start" table={subnetTable} />
                <ClearFiltersButton
                  count={subnetStatusFilter.length}
                  onReset={() => setSubnetStatusFilter([])}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {subnetStatusFilter.length > 0
                  ? `匹配 ${filteredRelatedSubnets.length} / 共 ${relatedSubnets.length} 个 · 点击查看网段详情`
                  : `共 ${relatedSubnets.length} 个 · 点击查看网段详情`}
              </span>
            </div>
            <DataTable
              table={subnetTable}
              showPager={false}
              onRowClick={(item, event) => {
                if ((event.target as HTMLElement).closest('button, a, [role="checkbox"], [role="menuitem"], [data-slot="dropdown-menu-content"]')) return
                onOpenSubnetDetail(item)
              }}
              emptyMessage={subnetStatusFilter.length > 0 ? '没有匹配的关联网段' : '尚未有网段关联此 VLAN'}
            />
          </section>
          <BulkActionBar
            count={selectedRelatedSubnets.length}
            unit="个网段"
            onClear={() => setSubnetRowSelection({})}
            onExport={exportSelectedSubnetsCSV}
          />
        </>
      ) : (
        <TopologyCanvas
          graphKey={`vlan-${vlan.id}-${relatedSubnets.length}`}
          tiers={topo.tiers}
          links={topo.edges}
          dark={dark}
          ariaLabel={`VLAN ${vlan.vid} 关系拓扑`}
          emptyState={!topo.hasNeighbors ? (
            <>
              <p className="text-sm font-medium text-foreground">该 VLAN 暂未关联数据中心或网段</p>
              <p className="text-xs text-muted-foreground">为 VLAN 指定数据中心或在网段中选择该 VLAN 后，将自动展示关系拓扑。</p>
            </>
          ) : undefined}
        />
      )}
    </div>
  )
}
