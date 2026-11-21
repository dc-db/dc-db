import { useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import {
  getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { Building2, Cable, LocateFixed, Network, Plus, Split } from 'lucide-react'
import { api, APIError } from '../api'
import type { Asset, Link, Subnet, VLAN } from '../api'
import { assetLocations, uRange, type Facilities } from '../facilities'
import { Select } from './AppControls'
import { DataTable } from './DataTable'
import { IPAddressView } from './IPAddressView'
import { IpamView } from './IpamView'
import { OperatorTowerIcon } from './MetadataIcons'
import { MetadataManager } from './MetadataManager'
import { PageHeader } from './PageHeader'
import { RowIconBox } from './ServiceIcon'
import { VLANView } from './VLANView'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'

export type NetworkTab = 'subnets' | 'ips' | 'vlans' | 'devices' | 'operators'

interface Props {
  tab: NetworkTab
  onTabChange: (tab: NetworkTab) => void
  editable: boolean
  assets: Asset[]
  links: Link[]
  facilities: Facilities
  subnets: Subnet[]
  openSubnetId: number | null
  onSubnetOpened: () => void
  bookmarkedSubnets: number[]
  onToggleSubnetBookmark: (id: number) => void
  onOpenAsset: (id: number) => void
  onOpenRoom: (roomId: number) => void
  onStartSwitch: () => void
  onSessionError: (error: unknown) => void
  onChanged: () => void
}

const deviceStatusMeta: Record<string, { label: string; className: string }> = {
  online: { label: '在线', className: 'border-info-border bg-info-soft text-info' },
  running: { label: '运行中', className: 'border-success-border bg-success-soft text-success' },
  paused: { label: '已暂停', className: 'border-warning-border bg-warning-soft text-warning' },
  offline: { label: '离线', className: 'border-danger-border bg-danger-soft text-danger' },
  stopped: { label: '已停止', className: 'border-border bg-muted text-muted-foreground' },
  unknown: { label: '未知', className: 'border-border bg-muted text-muted-foreground' },
}

export function NetworkView({
  tab,
  onTabChange,
  editable,
  assets,
  links,
  facilities,
  subnets,
  openSubnetId,
  onSubnetOpened,
  bookmarkedSubnets,
  onToggleSubnetBookmark,
  onOpenAsset,
  onOpenRoom,
  onStartSwitch,
  onSessionError,
  onChanged,
}: Props) {
  const [vlanCount, setVlanCount] = useState(0)
  const [operatorCount, setOperatorCount] = useState(0)
  const [filterSubnetId, setFilterSubnetId] = useState<number | null>(null)

  // Network devices (switches) tab state
  const [deviceSearch, setDeviceSearch] = useState('')
  const [deviceStatus, setDeviceStatus] = useState('')
  const [deviceSorting, setDeviceSorting] = useState<SortingState>([])

  async function loadCounts() {
    try {
      const [vlans, counts] = await Promise.all([
        api<VLAN[]>('/vlans'),
        api<Record<string, number>>('/reference/counts'),
      ])
      setVlanCount(vlans.length)
      setOperatorCount(counts.operator ?? 0)
    } catch (value) {
      if (value instanceof APIError && value.status === 401) onSessionError(value)
    }
  }

  useEffect(() => { void loadCounts() }, [subnets.length])

  useEffect(() => {
    if (openSubnetId == null) return
    setFilterSubnetId(openSubnetId)
    onTabChange('ips')
    onSubnetOpened()
  }, [openSubnetId, onSubnetOpened, onTabChange])

  const switches = useMemo(() => assets.filter(asset => asset.kind === 'switch'), [assets])
  const onlineSwitches = useMemo(
    () => switches.filter(item => item.lifecycle !== 'retired' && (item.status === 'online' || item.status === 'running')).length,
    [switches],
  )
  const locations = useMemo(() => assetLocations(facilities, links), [facilities, links])

  const ipStats = useMemo(() => {
    let usable = 0
    let used = 0
    let free = 0
    for (const subnet of subnets) {
      usable += subnet.usable
      used += subnet.used
      free += subnet.free
    }
    const percent = usable > 0 ? Math.min(100, Math.round((used / usable) * 100)) : 0
    return { usable, used, free, percent }
  }, [subnets])

  const visibleSwitches = useMemo(() => {
    const query = deviceSearch.trim().toLowerCase()
    return switches.filter(item =>
      (!deviceStatus || item.status === deviceStatus) &&
      (!query || [item.name, item.address, item.owner, item.notes, locations.get(item.id)?.room.name]
        .some(value => value?.toLowerCase().includes(query))))
  }, [deviceSearch, deviceStatus, locations, switches])

  const deviceColumns = useMemo<ColumnDef<Asset>[]>(() => [
    {
      accessorKey: 'name',
      header: '设备名称',
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'zh-CN'),
      meta: { headerClassName: 'w-[22%]', cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="table-name-cell">
          <RowIconBox><Cable className="size-3.5" /></RowIconBox>
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const meta = row.original.lifecycle === 'retired'
          ? { label: '已退役', className: 'border-border bg-muted text-muted-foreground' }
          : (deviceStatusMeta[row.original.status] ?? deviceStatusMeta.unknown)
        return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
      },
    },
    {
      accessorKey: 'address',
      header: '管理地址 / IP',
      sortingFn: (a, b) => a.original.address.localeCompare(b.original.address, undefined, { numeric: true }),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => row.original.address
        ? <span className="font-mono text-xs tabular-nums">{row.original.address}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'location',
      header: '数据中心 / 机柜',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const loc = locations.get(row.original.id)
        if (!loc) return <span className="text-muted-foreground">未上架</span>
        return (
          <Button
            variant="link" className="h-auto p-0 text-sm"
            onClick={event => { event.stopPropagation(); onOpenRoom(loc.room.id) }}
          >
            <Building2 className="size-3.5" />
            {loc.room.name} · {loc.rack.name} ({uRange(loc.placement)})
          </Button>
        )
      },
    },
    {
      accessorKey: 'owner',
      header: '负责人',
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => row.original.owner || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'notes',
      header: '备注',
      enableSorting: false,
      cell: ({ row }) => row.original.notes
        ? <span className="text-muted-foreground">{row.original.notes}</span>
        : <span className="text-muted-foreground">—</span>,
    },
  ], [locations, onOpenRoom])

  const deviceTable = useReactTable({
    data: visibleSwitches,
    columns: deviceColumns,
    state: { sorting: deviceSorting },
    onSortingChange: setDeviceSorting,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const tabs: { key: NetworkTab; label: string; count: number; icon: ComponentType<{ className?: string }> }[] = [
    { key: 'subnets', label: '网段', count: subnets.length, icon: Network },
    { key: 'ips', label: 'IP 地址', count: ipStats.used, icon: LocateFixed },
    { key: 'vlans', label: 'VLAN', count: vlanCount, icon: Split },
    { key: 'devices', label: '网络设备', count: switches.length, icon: Cable },
    { key: 'operators', label: '运营商', count: operatorCount, icon: OperatorTowerIcon },
  ]

  function handleDataChanged() {
    onChanged()
    void loadCounts()
  }

  return (
    <div className="network-page">
      <div className="network-head">
        <h2 className="asset-view-title">网络</h2>
      </div>

      <div className="network-summary" role="region" aria-label="网络概览">
        <button type="button" className={`network-stat${tab === 'subnets' ? ' is-active' : ''}`} onClick={() => onTabChange('subnets')}>
          <span className="network-stat-label">网段</span>
          <strong className="network-stat-value">{subnets.length}</strong>
          <span className="network-stat-sub">总利用率 {ipStats.percent}%</span>
        </button>
        <button type="button" className={`network-stat${tab === 'ips' ? ' is-active' : ''}`} onClick={() => onTabChange('ips')}>
          <span className="network-stat-label">空闲 IP</span>
          <strong className="network-stat-value">{ipStats.free.toLocaleString('zh-CN')}</strong>
          <span className="network-stat-sub">已用 {ipStats.used.toLocaleString('zh-CN')}</span>
        </button>
        <button type="button" className={`network-stat${tab === 'vlans' ? ' is-active' : ''}`} onClick={() => onTabChange('vlans')}>
          <span className="network-stat-label">VLAN</span>
          <strong className="network-stat-value">{vlanCount}</strong>
          <span className="network-stat-sub">二层网络规划</span>
        </button>
        <button type="button" className={`network-stat${tab === 'devices' ? ' is-active' : ''}`} onClick={() => onTabChange('devices')}>
          <span className="network-stat-label">网络设备</span>
          <strong className="network-stat-value">{switches.length}</strong>
          <span className="network-stat-sub">在线 {onlineSwitches} 台</span>
        </button>
        <button type="button" className={`network-stat${tab === 'operators' ? ' is-active' : ''}`} onClick={() => onTabChange('operators')}>
          <span className="network-stat-label">运营商</span>
          <strong className="network-stat-value">{operatorCount}</strong>
          <span className="network-stat-sub">线路与出口</span>
        </button>
      </div>

      <nav className="network-tabs" role="tablist" aria-label="网络模块">
        {tabs.map(item => {
          const Icon = item.icon
          const active = item.key === tab
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`network-tab${active ? ' is-active' : ''}`}
              onClick={() => onTabChange(item.key)}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
              <span className="network-tab-count">{item.count}</span>
            </button>
          )
        })}
      </nav>

      <div className="network-panel" role="tabpanel">
        {tab === 'subnets' && (
          <IpamView
            hideTitle
            editable={editable}
            openSubnetId={null}
            onSubnetOpened={() => {}}
            onSelectSubnet={id => { setFilterSubnetId(id); onTabChange('ips') }}
            bookmarkedSubnets={bookmarkedSubnets}
            onToggleSubnetBookmark={onToggleSubnetBookmark}
            onSessionError={onSessionError}
            onChanged={handleDataChanged}
          />
        )}

        {tab === 'ips' && (
          <IPAddressView
            hideTitle
            editable={editable}
            initialSubnetId={filterSubnetId}
            onInitialSubnetConsumed={() => setFilterSubnetId(null)}
            assets={assets}
            subnets={subnets}
            onOpenAsset={onOpenAsset}
            onOpenSubnet={id => setFilterSubnetId(id)}
            onSessionError={onSessionError}
            onChanged={handleDataChanged}
          />
        )}

        {tab === 'vlans' && (
          <VLANView
            hideTitle
            editable={editable}
            rooms={facilities.rooms}
            onSessionError={onSessionError}
            onChanged={handleDataChanged}
          />
        )}

        {tab === 'devices' && (
          <>
            <PageHeader
              filters={<>
                <Input
                  className="max-w-sm"
                  placeholder="搜索交换机名称、管理 IP、机房或负责人"
                  value={deviceSearch}
                  onChange={event => setDeviceSearch(event.target.value)}
                />
                <Select
                  style={{ width: 130 }} allowClear searchable={false} placeholder="全部状态"
                  value={deviceStatus || undefined}
                  onChange={(value: string | undefined) => setDeviceStatus(value ?? '')}
                  options={Object.entries(deviceStatusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                />
              </>}
              actions={editable && <Button onClick={onStartSwitch}><Plus />新增交换机</Button>}
            />
            <DataTable
              table={deviceTable}
              onRowClick={(asset, event) => {
                if ((event.target as HTMLElement).closest('button, a')) return
                onOpenAsset(asset.id)
              }}
              emptyMessage={deviceSearch || deviceStatus ? '没有匹配的网络设备' : '还没有登记交换机等网络设备'}
              pagerExtra={<span>点击设备行查看端口连线与机柜位置</span>}
            />
          </>
        )}

        {tab === 'operators' && (
          <MetadataManager
            hideTitle
            kind="operator"
            title="运营商"
            editable={editable}
            onSessionError={onSessionError}
            onChanged={() => void loadCounts()}
          />
        )}
      </div>
    </div>
  )
}
