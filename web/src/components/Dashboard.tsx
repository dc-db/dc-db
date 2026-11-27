import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, Building2, Globe, List, Monitor, Server, Star } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { UsageBar } from './UsageBar'
import type { Asset, Change, Subnet } from '../api'
import { assetLocations, occupiedUnits, type Facilities, type Placement } from '../facilities'
import { isNetworkKind, KIND_LABELS, KIND_SHORT_LABELS, kindLabel, NETWORK_KINDS } from '../kinds'
import type { Page } from '../types'
import { Chart } from './Chart'
import { ChangeList } from './ChangeList'
import { AssetKindIcon, NetworkDeviceIcon } from './MetadataIcons'
import {
  buildAssetTypeOption, buildPlatformOption, buildRoomDistOption, buildUsageBarOption,
  buildVmStatusOption, formatComputeMemory, type NameCount, type RoomAssetDist, type UsageItem,
} from './dashboardCharts'

interface Props {
  assets: Asset[]
  subnets: Subnet[]
  facilities: Facilities
  changes: Change[]
  bookmarks: number[]
  rackBookmarks: number[]
  subnetBookmarks: number[]
  dark: boolean
  onGo: (page: Page) => void
  onOpenAsset: (id: number) => void
  onOpenRack: (roomId: number, rackId: number) => void
  onOpenSubnet: (id: number) => void
}

const VM_STATUS_LABELS: Record<string, string> = {
  running: '运行中', stopped: '已停止', paused: '已暂停', offline: '离线', online: '在线', unknown: '未知',
}
const PLATFORM_LABELS: Record<string, string> = { pve: 'Proxmox VE', kvm: 'KVM', esxi: 'VMware ESXi', '': '未分配' }

function DashboardCard({ children, title, extra }: { children: ReactNode; title: ReactNode; extra?: ReactNode }) {
  return (
    <Card className="h-full gap-0 py-0">
      <CardHeader className="flex min-h-11 flex-row items-center justify-between gap-3 border-b px-4 py-2 [.border-b]:pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {extra}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}

function Empty({ description }: { description: string }) {
  return <div className="p-6 text-center text-sm text-muted-foreground">{description}</div>
}

function Dot({ tone }: { tone: 'success' | 'danger' }) {
  return <span className={`inline-block size-1.5 shrink-0 rounded-full ${tone === 'success' ? 'bg-success' : 'bg-danger'}`} aria-hidden="true" />
}

function SegmentSwitch<T extends string>({ value, options, label, onChange }: {
  value: T
  options: readonly { value: T; label: string }[]
  label: string
  onChange: (next: T) => void
}) {
  return (
    <div className="view-switch [&>button]:px-2.5! [&>button]:py-1! [&>button]:text-xs!" role="tablist" aria-label={label}>
      {options.map(opt => (
        <button key={opt.value} type="button" role="tab" aria-selected={value === opt.value}
          className={value === opt.value ? 'is-active' : ''} onClick={() => onChange(opt.value)}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function Dashboard({
  assets, subnets, facilities, changes, bookmarks, rackBookmarks, subnetBookmarks,
  dark, onGo, onOpenAsset, onOpenRack, onOpenSubnet,
}: Props) {
  const [vmTab, setVmTab] = useState<'status' | 'platform'>('status')
  const [capacityTab, setCapacityTab] = useState<'subnet' | 'rack'>('subnet')

  const stats = useMemo(() => {
    const active = assets.filter(asset => asset.lifecycle === 'active')
    const hosts = active.filter(asset => asset.kind === 'host')
    const vms = active.filter(asset => asset.kind === 'vm')
    const networkDevices = active.filter(asset => isNetworkKind(asset.kind))
    const networkBreakdown = NETWORK_KINDS
      .map(kind => ({ kind, count: networkDevices.filter(asset => asset.kind === kind).length }))
      .filter(item => item.count > 0)

    const hostCpu = hosts.reduce((sum, item) => sum + (item.cpu || 0), 0)
    const hostMem = hosts.reduce((sum, item) => sum + (item.memoryMiB || 0), 0)
    const vmCpu = vms.reduce((sum, item) => sum + (item.cpu || 0), 0)
    const vmMem = vms.reduce((sum, item) => sum + (item.memoryMiB || 0), 0)
    const running = vms.filter(item => item.status === 'running').length

    const probeTargets = active.filter(item => item.probeEnabled && Boolean(item.address))
    const reachable = probeTargets.filter(item => item.probeStatus === 'reachable').length
    const unreachable = probeTargets.filter(item => item.probeStatus === 'unreachable' || item.probeStatus === 'error').length
    const probed = reachable + unreachable
    const reachRate = probed > 0 ? Math.round((reachable / probed) * 100) : 0

    const placementsByRack = new Map<number, Placement[]>()
    for (const p of facilities.placements) {
      const list = placementsByRack.get(p.rackId)
      if (list) list.push(p)
      else placementsByRack.set(p.rackId, [p])
    }
    const totalU = facilities.racks.reduce((sum, rack) => sum + Math.max(0, rack.heightU), 0)
    const usedU = facilities.racks.reduce((sum, rack) => sum + occupiedUnits(placementsByRack.get(rack.id) ?? []).size, 0)
    const rackPercent = totalU > 0 ? Math.round((usedU / totalU) * 100) : 0

    const usable = subnets.reduce((sum, item) => sum + item.usable, 0)
    const used = subnets.reduce((sum, item) => sum + item.used, 0)
    const free = subnets.reduce((sum, item) => sum + item.free, 0)
    const ipPercent = usable > 0 ? Math.round((used / usable) * 100) : 0

    return {
      active, hosts, vms, networkDevices, networkBreakdown,
      hostCpu, hostMem, vmCpu, vmMem, running,
      probeTargetCount: probeTargets.length, probed, reachable, unreachable, reachRate,
      placementsByRack, totalU, usedU, rackPercent, usable, used, free, ipPercent,
    }
  }, [assets, facilities.placements, facilities.racks, subnets])

  const roomNames = useMemo(() => new Map(facilities.rooms.map(room => [room.id, room.name])), [facilities.rooms])
  const bookmarked = useMemo(() => assets.filter(asset => bookmarks.includes(asset.id)), [assets, bookmarks])
  const bookmarkedRacks = useMemo(() => facilities.racks.filter(rack => rackBookmarks.includes(rack.id)), [facilities.racks, rackBookmarks])
  const bookmarkedSubnets = useMemo(() => subnets.filter(subnet => subnetBookmarks.includes(subnet.id)), [subnets, subnetBookmarks])
  const favoriteCount = bookmarked.length + bookmarkedRacks.length + bookmarkedSubnets.length

  const typeOption = useMemo(() => {
    const items: NameCount[] = []
    if (stats.hosts.length > 0) items.push({ key: 'host', name: KIND_LABELS.host, value: stats.hosts.length })
    if (stats.vms.length > 0) items.push({ key: 'vm', name: KIND_LABELS.vm, value: stats.vms.length })
    for (const item of stats.networkBreakdown) items.push({ key: item.kind, name: KIND_LABELS[item.kind], value: item.count })
    return buildAssetTypeOption(items, stats.active.length, dark)
  }, [dark, stats.active.length, stats.hosts.length, stats.networkBreakdown, stats.vms.length])

  const roomDist = useMemo<RoomAssetDist[]>(() => {
    const locations = assetLocations(facilities, [])
    const byRoom = new Map<number, RoomAssetDist>(
      facilities.rooms.map(room => [room.id, { roomId: room.id, roomName: room.name, hosts: 0, vms: 0, network: 0 }]),
    )
    for (const asset of stats.active) {
      const rid = locations.get(asset.id)?.room.id ?? (asset.roomId > 0 ? asset.roomId : null)
      const bucket = rid ? byRoom.get(rid) : undefined
      if (!bucket) continue
      if (asset.kind === 'host') bucket.hosts++
      else if (asset.kind === 'vm') bucket.vms++
      else if (isNetworkKind(asset.kind)) bucket.network++
    }
    return Array.from(byRoom.values())
      .filter(room => room.hosts + room.vms + room.network > 0)
      .sort((a, b) => (b.hosts + b.vms + b.network) - (a.hosts + a.vms + a.network))
  }, [facilities, stats.active])

  const vmStatusOption = useMemo(() => {
    const counts = new Map<string, number>()
    for (const vm of stats.vms) counts.set(vm.status || 'unknown', (counts.get(vm.status || 'unknown') ?? 0) + 1)
    const items: NameCount[] = Array.from(counts, ([key, value]) => ({ key, name: VM_STATUS_LABELS[key] ?? key, value }))
      .sort((a, b) => b.value - a.value)
    return buildVmStatusOption(items, stats.running, stats.vms.length, dark)
  }, [dark, stats.running, stats.vms])

  const platformOption = useMemo(() => {
    const counts = new Map<string, number>()
    for (const asset of [...stats.hosts, ...stats.vms]) counts.set(asset.platform, (counts.get(asset.platform) ?? 0) + 1)
    const items: NameCount[] = Array.from(counts, ([key, value]) => ({ key, name: PLATFORM_LABELS[key] ?? key, value }))
      .sort((a, b) => b.value - a.value)
    return buildPlatformOption(items, dark)
  }, [dark, stats.hosts, stats.vms])

  const topSubnets = useMemo<UsageItem[]>(() => (
    [...subnets]
      .sort((a, b) => (b.used / Math.max(1, b.usable)) - (a.used / Math.max(1, a.usable)) || b.used - a.used)
      .slice(0, 8)
      .map(item => ({
        id: item.id, label: `${item.name} ${item.cidr}`, used: item.used, total: item.usable,
        percent: item.usable > 0 ? Math.round((item.used / item.usable) * 100) : 0,
        detail: `已用 ${item.used.toLocaleString()} / ${item.usable.toLocaleString()} IP`,
      }))
  ), [subnets])

  const topRacks = useMemo<(UsageItem & { roomId: number })[]>(() => (
    facilities.racks.map(rack => {
      const used = occupiedUnits(stats.placementsByRack.get(rack.id) ?? []).size
      const total = Math.max(0, rack.heightU)
      const roomName = roomNames.get(rack.roomId)
      return {
        id: rack.id, roomId: rack.roomId, label: roomName ? `${rack.name} · ${roomName}` : rack.name,
        used, total, percent: total > 0 ? Math.round((used / total) * 100) : 0, detail: `已用 ${used} / ${total}U`,
      }
    }).sort((a, b) => (b.used / Math.max(1, b.total)) - (a.used / Math.max(1, a.total)) || b.used - a.used).slice(0, 8)
  ), [facilities.racks, roomNames, stats.placementsByRack])

  const roomOption = useMemo(() => buildRoomDistOption(roomDist, dark), [dark, roomDist])
  const subnetOption = useMemo(() => buildUsageBarOption(topSubnets, dark), [dark, topSubnets])
  const rackOption = useMemo(() => buildUsageBarOption(topRacks, dark), [dark, topRacks])

  const hasCompute = stats.hosts.length + stats.vms.length > 0
  const iconCls = 'size-4 shrink-0 text-muted-foreground'
  const kpis: { label: string; value: string; icon: ReactNode; sub: ReactNode; target: Page }[] = [
    {
      label: '服务器', value: stats.hosts.length.toLocaleString(), icon: <Server className={iconCls} aria-hidden="true" />, target: 'host',
      sub: <span className="min-w-0 truncate">{stats.hostCpu.toLocaleString()} 核 · {formatComputeMemory(stats.hostMem)}</span>,
    },
    {
      label: '虚拟机', value: stats.vms.length.toLocaleString(), icon: <Monitor className={iconCls} aria-hidden="true" />, target: 'vm',
      sub: <><Dot tone="success" /><span className="min-w-0 truncate">{stats.running} 运行 · {stats.vmCpu.toLocaleString()} 核 · {formatComputeMemory(stats.vmMem)}</span></>,
    },
    {
      label: '网络设备', value: stats.networkDevices.length.toLocaleString(), icon: <NetworkDeviceIcon className={iconCls} />, target: 'network_devices',
      sub: <span className="min-w-0 truncate">{stats.networkBreakdown.length ? stats.networkBreakdown.map(i => `${KIND_SHORT_LABELS[i.kind]} ${i.count}`).join(' · ') : '交换机 / 路由 / 防火墙 / LB'}</span>,
    },
    {
      label: '存活探测', value: stats.probed > 0 ? `${stats.reachRate}%` : '—', icon: <Activity className={iconCls} aria-hidden="true" />, target: 'host',
      sub: stats.probed > 0
        ? <><Dot tone="success" /><span>{stats.reachable} 可达</span><span aria-hidden="true">·</span><Dot tone="danger" /><span className="min-w-0 truncate">{stats.unreachable} 不可达</span></>
        : <span className="min-w-0 truncate">{stats.probeTargetCount > 0 ? `${stats.probeTargetCount} 台待探测` : '暂未开启探测'}</span>,
    },
    {
      label: '机柜 U 位', value: stats.totalU > 0 ? `${stats.rackPercent}%` : `${facilities.racks.length} 柜`, icon: <Building2 className={iconCls} aria-hidden="true" />, target: 'facilities',
      sub: <span className="min-w-0 truncate">{facilities.rooms.length} 机房 · {stats.usedU}/{stats.totalU}U</span>,
    },
    {
      label: 'IP 地址池', value: stats.usable > 0 ? `${stats.ipPercent}%` : '0%', icon: <Globe className={iconCls} aria-hidden="true" />, target: 'subnets',
      sub: <span className="min-w-0 truncate">{subnets.length} 网段 · 空闲 {stats.free.toLocaleString()}</span>,
    },
  ]

  const isSubnetCap = capacityTab === 'subnet'
  const capPercent = isSubnetCap ? stats.ipPercent : stats.rackPercent

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map(item => (
          <button key={item.label} type="button" onClick={() => onGo(item.target)}
            className="min-w-0 cursor-pointer rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] text-muted-foreground">{item.label}</span>
              {item.icon}
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{item.value}</div>
            <div className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground tabular-nums">{item.sub}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-4">
          <DashboardCard title="资产类型">
            {stats.active.length ? (
              <Chart option={typeOption} height={240} dark={dark} onClick={({ name }) => {
                if (name === KIND_LABELS.host) onGo('host')
                else if (name === KIND_LABELS.vm) onGo('vm')
                else if (name) onGo('network_devices')
              }} />
            ) : <div className="dashboard-chart-empty"><Empty description="暂无资产" /></div>}
          </DashboardCard>
        </div>

        <div className="min-w-0 lg:col-span-4">
          <DashboardCard title={roomDist.length > 0 || !hasCompute ? '数据中心分布' : '平台分布'}>
            {roomDist.length > 0
              ? <Chart option={roomOption} height={240} dark={dark} onClick={() => onGo('facilities')} />
              : hasCompute
                ? <Chart option={platformOption} height={240} dark={dark} />
                : <div className="dashboard-chart-empty"><Empty description="暂无数据中心资产" /></div>}
          </DashboardCard>
        </div>

        <div className="min-w-0 lg:col-span-4">
          <DashboardCard title="虚拟机概览" extra={
            <SegmentSwitch value={vmTab} label="切换虚拟机图表" onChange={setVmTab}
              options={[{ value: 'status', label: '状态' }, { value: 'platform', label: '平台' }]} />
          }>
            {vmTab === 'status'
              ? (stats.vms.length ? <Chart option={vmStatusOption} height={240} dark={dark} /> : <div className="dashboard-chart-empty"><Empty description="暂无虚拟机" /></div>)
              : (hasCompute ? <Chart option={platformOption} height={240} dark={dark} /> : <div className="dashboard-chart-empty"><Empty description="暂无服务器或虚拟机" /></div>)}
          </DashboardCard>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <DashboardCard title="容量 Top 8" extra={
            <SegmentSwitch value={capacityTab} label="切换容量维度" onChange={setCapacityTab}
              options={[{ value: 'subnet', label: '网段 IP' }, { value: 'rack', label: '机柜 U 位' }]} />
          }>
            {isSubnetCap ? (
              subnets.length ? (
                <Chart option={subnetOption} height={280} dark={dark} onClick={({ dataIndex }) => {
                  const target = typeof dataIndex === 'number' ? topSubnets[topSubnets.length - 1 - dataIndex] : undefined
                  if (target) onOpenSubnet(target.id)
                }} />
              ) : <div className="dashboard-chart-empty"><Empty description="暂无网段" /></div>
            ) : (
              facilities.racks.length ? (
                <Chart option={rackOption} height={280} dark={dark} onClick={({ dataIndex }) => {
                  const target = typeof dataIndex === 'number' ? topRacks[topRacks.length - 1 - dataIndex] : undefined
                  if (target) onOpenRack(target.roomId, target.id)
                }} />
              ) : <div className="dashboard-chart-empty"><Empty description="暂无机柜" /></div>
            )}
            <div className="mt-3 border-t border-border pt-3">
              <UsageBar value={capPercent} label={isSubnetCap ? 'IP 使用率' : '机柜 U 位使用率'} className="mb-1 w-full"
                barClassName={capPercent >= 85 ? 'min-w-0 flex-1 [&>div]:bg-destructive' : 'min-w-0 flex-1'} />
              <div className="text-xs text-muted-foreground tabular-nums">
                {isSubnetCap
                  ? `可用 ${stats.usable.toLocaleString()} · 已用 ${stats.used.toLocaleString()} · 空闲 ${stats.free.toLocaleString()}`
                  : `机柜 ${facilities.racks.length} 台 · 总计 ${stats.totalU}U · 已用 ${stats.usedU}U · 空闲 ${Math.max(0, stats.totalU - stats.usedU)}U`}
              </div>
            </div>
          </DashboardCard>
        </div>

        <div className="min-w-0 lg:col-span-5">
          <DashboardCard title="最近变更" extra={
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onGo('changes')}>查看全部</Button>
          }>
            {changes.length ? <ChangeList changes={changes.slice(0, 7)} onOpen={onOpenAsset} /> : <Empty description="暂无变更记录" />}
          </DashboardCard>
        </div>
      </div>

      <div className="mt-4">
        {favoriteCount > 0 ? (
          <DashboardCard title={`我的收藏 (${favoriteCount})`}>
            {bookmarked.length > 0 && (
              <div className="bookmark-grid">
                {bookmarked.slice(0, 8).map(asset => (
                  <button key={asset.id} type="button" className="bookmark-item" onClick={() => onOpenAsset(asset.id)}>
                    <span className="bookmark-icon"><AssetKindIcon kind={asset.kind} /></span>
                    <span className="bookmark-copy">
                      <strong>{asset.name}</strong>
                      <small>{kindLabel(asset.kind)} · {asset.address || asset.owner || '—'}</small>
                    </span>
                    <Star size="1em" className="bookmark-star" fill="currentColor" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
            {bookmarkedRacks.length > 0 && (
              <div className="favorite-group">
                <span className="favorite-group-title">机柜</span>
                <div className="favorite-chips">
                  {bookmarkedRacks.slice(0, 8).map(rack => (
                    <button key={rack.id} type="button" className="favorite-chip" onClick={() => onOpenRack(rack.roomId, rack.id)}>
                      <span className="favorite-chip-icon"><List size="1em" aria-hidden="true" /></span>
                      <span className="favorite-chip-copy">
                        <strong>{rack.name}</strong>
                        <small>{roomNames.get(rack.roomId) ?? '未绑定数据中心'} · {rack.heightU}U</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {bookmarkedSubnets.length > 0 && (
              <div className="favorite-group">
                <span className="favorite-group-title">网段</span>
                <div className="favorite-chips">
                  {bookmarkedSubnets.slice(0, 8).map(subnet => (
                    <button key={subnet.id} type="button" className="favorite-chip" onClick={() => onOpenSubnet(subnet.id)}>
                      <span className="favorite-chip-icon"><Globe size="1em" aria-hidden="true" /></span>
                      <span className="favorite-chip-copy">
                        <strong>{subnet.name}</strong>
                        <small className="mono">{subnet.cidr} · 已用 {subnet.used}/{subnet.usable}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </DashboardCard>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-xs text-muted-foreground">
            <Star className="size-3.5 shrink-0" aria-hidden="true" />
            <span>我的收藏：在资产、机柜或网段详情点击星标，即可固定常用对象。</span>
          </div>
        )}
      </div>
    </div>
  )
}
