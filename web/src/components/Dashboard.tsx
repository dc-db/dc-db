import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeftRight, Building2, Globe, HardDrive, List, Monitor, Server, Star } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Progress } from './ui/progress'
import type { EChartsOption } from 'echarts'
import type { Asset, Change, Subnet, Tag } from '../api'
import type { Facilities } from '../facilities'
import type { Page } from '../types'
import { Chart } from './Chart'
import { ChangeList } from './ChangeList'

interface Props {
  assets: Asset[]
  subnets: Subnet[]
  facilities: Facilities
  changes: Change[]
  bookmarks: number[]
  rackBookmarks: number[]
  subnetBookmarks: number[]
  tags: Tag[]
  dark: boolean
  onGo: (page: Page) => void
  onOpenAsset: (id: number) => void
  onOpenRack: (roomId: number, rackId: number) => void
  onOpenSubnet: (id: number) => void
}

const chartColors = (dark: boolean) => dark
  ? ['#60a5fa', '#2dd4bf', '#fbbf24', '#fb7185', '#a78bfa']
  : ['#2563eb', '#0d9488', '#d97706', '#e11d48', '#7c3aed']

function statusChartColor(status: string, dark: boolean) {
  if (status === 'online') return dark ? '#60a5fa' : '#2563eb'
  if (status === 'running') return dark ? '#34d399' : '#047857'
  if (status === 'paused') return dark ? '#fbbf24' : '#b45309'
  if (status === 'offline') return dark ? '#f87171' : '#b91c1c'
  if (status === 'stopped') return dark ? '#737373' : '#a3a3a3'
  return dark ? '#525252' : '#d4d4d4'
}

function DashboardCard({ children, title, extra }: { children: ReactNode; title: ReactNode; extra?: ReactNode }) {
  return <Card className="h-full gap-0 py-0"><CardHeader className="flex min-h-11 flex-row items-center justify-between gap-3 border-b px-4 py-2"><CardTitle>{title}</CardTitle>{extra}</CardHeader><CardContent className="p-4">{children}</CardContent></Card>
}

function Empty({ description }: { description: string }) {
  return <div className="p-6 text-center text-sm text-muted-foreground">{description}</div>
}

export function Dashboard({ assets, subnets, facilities, changes, bookmarks, rackBookmarks, subnetBookmarks, tags, dark, onGo, onOpenAsset, onOpenRack, onOpenSubnet }: Props) {
  const stats = useMemo(() => {
    const active = assets.filter(asset => asset.lifecycle === 'active')
    const hosts = active.filter(asset => asset.kind === 'host')
    const vms = active.filter(asset => asset.kind === 'vm')
    const switches = active.filter(asset => asset.kind === 'switch')
    return {
      active,
      hosts,
      vms,
      switches,
      running: vms.filter(asset => asset.status === 'running').length,
      usable: subnets.reduce((sum, item) => sum + item.usable, 0),
      used: subnets.reduce((sum, item) => sum + item.used, 0),
      free: subnets.reduce((sum, item) => sum + item.free, 0),
    }
  }, [assets, subnets])

  const bookmarked = useMemo(() => assets.filter(asset => bookmarks.includes(asset.id)), [assets, bookmarks])
  const bookmarkedRacks = useMemo(() => facilities.racks.filter(rack => rackBookmarks.includes(rack.id)), [facilities.racks, rackBookmarks])
  const bookmarkedSubnets = useMemo(() => subnets.filter(subnet => subnetBookmarks.includes(subnet.id)), [subnets, subnetBookmarks])
  const favoriteCount = bookmarked.length + bookmarkedRacks.length + bookmarkedSubnets.length
  const typeOption = useMemo<EChartsOption>(() => ({
    tooltip: {
      trigger: 'item',
      backgroundColor: dark ? '#171717' : '#ffffff',
      borderColor: dark ? '#262626' : '#e5e5e5',
      textStyle: { color: dark ? '#fafafa' : '#0a0a0a' },
    },
    legend: {
      bottom: 0, left: 'center',
      textStyle: { color: dark ? '#a1a1a1' : '#737373' },
    },
    color: chartColors(dark),
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: dark ? '#0a0a0a' : '#fff', borderWidth: 2 },
      label: { show: false },
      data: [
        { value: stats.hosts.length, name: '物理机' },
        { value: stats.vms.length, name: '虚拟机' },
        { value: stats.switches.length, name: '交换机' },
      ],
    }],
  }), [dark, stats])

  const vmStatusOption = useMemo<EChartsOption>(() => {
    const labels: Record<string, string> = {
      running: '运行中', stopped: '已停止', paused: '已暂停', offline: '离线', online: '在线', unknown: '未知',
    }
    const counts = new Map<string, number>()
    for (const vm of stats.vms) counts.set(vm.status, (counts.get(vm.status) ?? 0) + 1)
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: dark ? '#171717' : '#ffffff',
        borderColor: dark ? '#262626' : '#e5e5e5',
        textStyle: { color: dark ? '#fafafa' : '#0a0a0a' },
      },
      legend: {
        bottom: 0, left: 'center',
        textStyle: { color: dark ? '#a1a1a1' : '#737373' },
      },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '44%'],
        itemStyle: { borderColor: dark ? '#0a0a0a' : '#fff', borderWidth: 2 },
        label: { show: false },
        data: Array.from(counts, ([key, value]) => ({ value, name: labels[key] ?? key, itemStyle: { color: statusChartColor(key, dark) } })),
      }],
    }
  }, [dark, stats.vms])

  const platformOption = useMemo<EChartsOption>(() => {
    const labels: Record<string, string> = { pve: 'Proxmox VE', kvm: 'KVM / libvirt', '': '未指定' }
    const counts = new Map<string, number>()
    for (const asset of [...stats.hosts, ...stats.vms]) counts.set(asset.platform, (counts.get(asset.platform) ?? 0) + 1)
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: dark ? '#171717' : '#ffffff',
        borderColor: dark ? '#262626' : '#e5e5e5',
        textStyle: { color: dark ? '#fafafa' : '#0a0a0a' },
      },
      grid: { left: 8, right: 12, bottom: 8, top: 20, containLabel: true },
      xAxis: {
        type: 'category', data: Array.from(counts.keys(), key => labels[key] ?? key), axisTick: { show: false },
        axisLabel: { color: dark ? '#a1a1a1' : '#737373' },
      },
      yAxis: {
        type: 'value', minInterval: 1,
        axisLabel: { color: dark ? '#a1a1a1' : '#737373' },
        splitLine: { lineStyle: { color: dark ? '#262626' : '#e5e5e5' } },
      },
      series: [{
        type: 'bar',
        barMaxWidth: 42,
        itemStyle: { color: dark ? '#60a5fa' : '#2563eb', borderRadius: [4, 4, 0, 0] },
        data: Array.from(counts.values()),
      }],
    }
  }, [dark, stats.hosts, stats.vms])

  const subnetOption = useMemo<EChartsOption>(() => {
    const top = [...subnets].sort((a, b) => b.used / Math.max(1, b.usable) - a.used / Math.max(1, a.usable)).slice(0, 6).reverse()
    return {
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: dark ? '#171717' : '#ffffff',
        borderColor: dark ? '#262626' : '#e5e5e5',
        textStyle: { color: dark ? '#fafafa' : '#0a0a0a' },
      },
      grid: { left: 8, right: 24, bottom: 8, top: 10, containLabel: true },
      xAxis: {
        type: 'value', max: 100, axisLabel: { formatter: '{value}%', color: dark ? '#a1a1a1' : '#737373' },
        splitLine: { lineStyle: { color: dark ? '#262626' : '#e5e5e5' } },
      },
      yAxis: {
        type: 'category', data: top.map(item => `${item.name} ${item.cidr}`),
        axisLabel: { color: dark ? '#a1a1a1' : '#737373' },
      },
      series: [{
        type: 'bar',
        barMaxWidth: 20,
        itemStyle: { color: dark ? '#60a5fa' : '#2563eb', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', formatter: '{c}%', color: dark ? '#a1a1a1' : '#0a0a0a' },
        data: top.map(item => Math.round(item.used / Math.max(1, item.usable) * 100)),
      }],
    }
  }, [dark, subnets])

  const tagOption = useMemo<EChartsOption>(() => {
    const top = tags
      .filter(tag => (tag.assetCount ?? 0) > 0)
      .sort((left, right) => (right.assetCount ?? 0) - (left.assetCount ?? 0))
      .slice(0, 8)
      .reverse()
    return {
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: dark ? '#171717' : '#ffffff',
        borderColor: dark ? '#262626' : '#e5e5e5',
        textStyle: { color: dark ? '#fafafa' : '#0a0a0a' },
      },
      grid: { left: 8, right: 34, bottom: 8, top: 10, containLabel: true },
      xAxis: {
        type: 'value', minInterval: 1,
        axisLabel: { color: dark ? '#a1a1a1' : '#737373' },
        splitLine: { lineStyle: { color: dark ? '#262626' : '#e5e5e5' } },
      },
      yAxis: {
        type: 'category', data: top.map(tag => tag.name),
        axisLabel: { color: dark ? '#a1a1a1' : '#737373' },
      },
      series: [{
        type: 'bar', barMaxWidth: 18,
        label: { show: true, position: 'right', color: dark ? '#a1a1a1' : '#0a0a0a' },
        data: top.map(tag => ({
          value: tag.assetCount ?? 0,
          itemStyle: { color: tag.color, borderRadius: [0, 4, 4, 0] },
        })),
      }],
    }
  }, [dark, tags])

  const ipPercent = stats.usable ? Math.round(stats.used / stats.usable * 100) : 0

  return (
    <div>
      <div className="metric-row grid grid-cols-3 gap-4 xl:grid-cols-6">
        {[
          { label: '资产总数', value: stats.active.length, icon: <HardDrive size="1em" aria-hidden="true" />, hint: '在册资产', target: 'assets' as Page, tone: 'neutral' },
          { label: '物理机', value: stats.hosts.length, icon: <Server size="1em" aria-hidden="true" />, hint: '独立主机与虚拟化节点', target: 'host' as Page, tone: 'blue' },
          { label: '虚拟机', value: stats.vms.length, icon: <Monitor size="1em" aria-hidden="true" />, hint: `${stats.running} 台运行中`, target: 'vm' as Page, tone: 'teal' },
          { label: '交换机', value: stats.switches.length, icon: <ArrowLeftRight size="1em" aria-hidden="true" />, hint: '网络设备', target: 'switch' as Page, tone: 'amber' },
          { label: '数据中心', value: facilities.rooms.length, icon: <Building2 size="1em" aria-hidden="true" />, hint: `${facilities.racks.length} 台机柜`, target: 'facilities' as Page, tone: 'violet' },
          { label: 'IP 空闲', value: stats.free, icon: <Globe size="1em" aria-hidden="true" />, hint: `${subnets.length} 个网段 · 使用率 ${ipPercent}%`, target: 'ipam' as Page, tone: 'green' },
        ].map(item => (
          <div key={item.label} className="min-w-0">
            <button type="button" className="metric-card w-full cursor-pointer border-0 bg-transparent p-0 text-left" onClick={() => onGo(item.target)}>
              <Card className="h-full"><CardContent>
                <span className={`metric-icon tone-${item.tone}`}>{item.icon}</span>
                <div className="mb-1 text-muted-foreground">{item.label}</div>
                <div className="text-2xl font-semibold">{item.value.toLocaleString()}</div>
                <div className="metric-hint">{item.hint}</div>
              </CardContent></Card>
            </button>
          </div>
        ))}
      </div>

      <div className="dashboard-section grid grid-cols-12 gap-4">
        <div className="col-span-7 min-w-0">
          <DashboardCard title={`我的收藏${favoriteCount ? ` (${favoriteCount})` : ''}`}>
            {favoriteCount ? (
              <>
                {bookmarked.length > 0 && (
                  <div className="bookmark-grid">
                    {bookmarked.slice(0, 8).map(asset => (
                      <button key={asset.id} type="button" className="bookmark-item" onClick={() => onOpenAsset(asset.id)}>
                        <span className="bookmark-icon">{asset.kind === 'host' ? <Server size="1em" aria-hidden="true" /> : asset.kind === 'switch' ? <ArrowLeftRight size="1em" aria-hidden="true" /> : <Monitor size="1em" aria-hidden="true" />}</span>
                        <span className="bookmark-copy">
                          <strong>{asset.name}</strong>
                          <small>{asset.kind === 'host' ? '物理机' : asset.kind === 'switch' ? '交换机' : '虚拟机'} · {asset.address || asset.owner || '—'}</small>
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
                            <small>{facilities.rooms.find(room => room.id === rack.roomId)?.name ?? '未绑定数据中心'} · {rack.heightU}U</small>
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
              </>
            ) : (
              <div className="bookmark-empty"><Star size="1em" aria-hidden="true" /> 在资产、机柜或网段详情点击星标，收藏常用对象。</div>
            )}
          </DashboardCard>
        </div>
        <div className="col-span-5 min-w-0">
          <DashboardCard
            title="标签使用"
            extra={<Button variant="link" size="sm" onClick={() => onGo('tags')}>管理标签</Button>}
          >
            {tags.some(tag => (tag.assetCount ?? 0) > 0)
              ? <Chart option={tagOption} height={220} dark={dark} />
              : <div className="dashboard-chart-empty"><Empty description="暂无标签数据" /></div>}
          </DashboardCard>
        </div>
      </div>

      <div className="dashboard-grid mt-4 grid grid-cols-3 gap-4">
        <div className="min-w-0">
          <DashboardCard title="资源类型">
            {stats.active.length ? <Chart option={typeOption} dark={dark} /> : <div className="dashboard-chart-empty"><Empty description="暂无资产" /></div>}
          </DashboardCard>
        </div>
        <div className="min-w-0">
          <DashboardCard title="虚拟机状态">
            {stats.vms.length ? <Chart option={vmStatusOption} dark={dark} /> : <div className="dashboard-chart-empty"><Empty description="暂无虚拟机" /></div>}
          </DashboardCard>
        </div>
        <div className="min-w-0">
          <DashboardCard title="平台分布">
            {stats.hosts.length + stats.vms.length ? <Chart option={platformOption} dark={dark} /> : <div className="dashboard-chart-empty"><Empty description="暂无物理机或虚拟机" /></div>}
          </DashboardCard>
        </div>
      </div>

      <div className="dashboard-section grid grid-cols-12 gap-4">
        <div className="col-span-7 min-w-0">
          <DashboardCard title="网段使用率">
            {subnets.length ? <Chart option={subnetOption} height={280} dark={dark} /> : <div className="dashboard-chart-empty"><Empty description="暂无网段" /></div>}
            <div style={{ marginTop: 12 }}>
              <div className="mb-1 flex items-center gap-2"><Progress value={Math.min(100, Math.max(0, ipPercent))} aria-label="IP 使用率" className={ipPercent > 85 ? '[&>div]:bg-destructive' : undefined} /><span>{ipPercent}%</span></div>
              <div className="muted">可用 {stats.usable.toLocaleString()} · 已用 {stats.used.toLocaleString()} · 空闲 {stats.free.toLocaleString()}</div>
            </div>
          </DashboardCard>
        </div>
        <div className="col-span-5 min-w-0">
          <DashboardCard title="最近变更">
            {changes.length ? <ChangeList changes={changes.slice(0, 6)} onOpen={onOpenAsset} /> : <Empty description="暂无变更记录" />}
          </DashboardCard>
        </div>
      </div>
    </div>
  )
}
