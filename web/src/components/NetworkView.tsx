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
import { SubnetDetailView, VLANDetailView } from './NetworkDetailViews'
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
  dark: boolean
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
  dark,
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
  const [selectedSubnetId, setSelectedSubnetId] = useState<number | null>(null)
  const [selectedVLAN, setSelectedVLAN] = useState<VLAN | null>(null)

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
    setSelectedVLAN(null)
    setSelectedSubnetId(openSubnetId)
    onTabChange('subnets')
    onSubnetOpened()
  }, [openSubnetId, onSubnetOpened, onTabChange])

  const selectedSubnet = useMemo(
    () => (selectedSubnetId ? subnets.find(s => s.id === selectedSubnetId) ?? null : null),
    [selectedSubnetId, subnets],
  )

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

  const sections: {
    key: NetworkTab
    label: string
    value: string | number
    sub: string
    icon: ComponentType<{ className?: string }>
  }[] = [
    { key: 'subnets', label: '网段', value: subnets.length, sub: `总利用率 ${ipStats.percent}%`, icon: Network },
    { key: 'ips', label: 'IP 地址', value: ipStats.used.toLocaleString('zh-CN'), sub: `空闲 ${ipStats.free.toLocaleString('zh-CN')} 个`, icon: LocateFixed },
    { key: 'vlans', label: 'VLAN', value: vlanCount, sub: '二层广播域', icon: Split },
    { key: 'devices', label: '网络设备', value: switches.length, sub: `在线 ${onlineSwitches} 台`, icon: Cable },
    { key: 'operators', label: '运营商', value: operatorCount, sub: '线路与出口', icon: OperatorTowerIcon },
  ]

  function switchTab(next: NetworkTab) {
    setSelectedSubnetId(null)
    setSelectedVLAN(null)
    onTabChange(next)
  }

  function handleDataChanged() {
    onChanged()
    void loadCounts()
  }

  // Dedicated full-page Subnet Detail (details table default + toggleable topology)
  if (selectedSubnet) {
    return (
      <SubnetDetailView
        subnet={selectedSubnet}
        assets={assets}
        links={links}
        facilities={facilities}
        dark={dark}
        onBack={() => setSelectedSubnetId(null)}
        onOpenAsset={onOpenAsset}
        onOpenRoom={onOpenRoom}
        onOpenIPsForSubnet={id => {
          setSelectedSubnetId(null)
          setFilterSubnetId(id)
          onTabChange('ips')
        }}
        onSessionError={onSessionError}
      />
    )
  }

  // Dedicated full-page VLAN Detail (details table default + toggleable topology)
  if (selectedVLAN) {
    return (
      <VLANDetailView
        vlan={selectedVLAN}
        subnets={subnets}
        assets={assets}
        links={links}
        facilities={facilities}
        dark={dark}
        onBack={() => setSelectedVLAN(null)}
        onOpenSubnetDetail={subnet => {
          setSelectedVLAN(null)
          setSelectedSubnetId(subnet.id)
          onTabChange('subnets')
        }}
        onOpenAsset={onOpenAsset}
        onOpenRoom={onOpenRoom}
      />
    )
  }

  const activeSection = sections.find(s => s.key === tab) ?? sections[0]
  const ActiveIcon = activeSection.icon

  return (
    <div className="network-page">
      <div className="network-head">
        <h2 className="asset-view-title">网络</h2>
      </div>

      {/* Single unified switcher: KPI overview + unmistakable active tab */}
      <nav className="network-switcher" role="tablist" aria-label="网络功能区">
        {sections.map(item => {
          const Icon = item.icon
          const active = item.key === tab
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`network-card${active ? ' is-active' : ''}`}
              onClick={() => switchTab(item.key)}
            >
              <div className="network-card-top">
                <span className="network-card-label">
                  <Icon className="network-card-icon" />
                  <span>{item.label}</span>
                </span>
                {active && <span className="network-card-active-dot" aria-hidden="true" />}
              </div>
              <strong className="network-card-value">{item.value}</strong>
              <span className="network-card-sub">{item.sub}</span>
            </button>
          )
        })}
      </nav>

      <div className="network-panel" role="tabpanel" aria-label={activeSection.label}>
        <div className="network-section-bar">
          <ActiveIcon className="size-4 text-info" />
          <h3>{activeSection.label}</h3>
          <span className="text-xs text-muted-foreground">{activeSection.sub}</span>
        </div>

        {tab === 'subnets' && (
          <IpamView
            hideTitle
            editable={editable}
            openSubnetId={null}
            onSubnetOpened={() => {}}
            onSelectSubnet={id => setSelectedSubnetId(id)}
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
            onOpenSubnet={id => setSelectedSubnetId(id)}
            onSessionError={onSessionError}
            onChanged={handleDataChanged}
          />
        )}

        {tab === 'vlans' && (
          <VLANView
            hideTitle
            editable={editable}
            rooms={facilities.rooms}
            onSelectVLAN={vlan => setSelectedVLAN(vlan)}
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
