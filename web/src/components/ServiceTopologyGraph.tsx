import { useMemo } from 'react'
import { Link2 } from 'lucide-react'
import type { Asset, Link, Service } from '../api'
import type { Facilities, Rack, Room } from '../facilities'
import { uRange } from '../facilities'
import { ServiceIcon } from './ServiceIcon'
import { TopologyCanvas, type TopoEdgeInput, type TopoItem, type TopoTier } from './TopologyCanvas'
import { Button } from './ui/button'

interface Props {
  service: Service
  assets: Asset[]
  links: Link[]
  facilities: Facilities
  dark: boolean
  editable: boolean
  onOpenAsset: (assetId: number) => void
  onOpenRoom: (roomId: number) => void
  onManageAssets: () => void
}

const statusMap: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'idle' }> = {
  online: { label: '在线', tone: 'ok' },
  running: { label: '运行中', tone: 'ok' },
  paused: { label: '已暂停', tone: 'warn' },
  offline: { label: '离线', tone: 'bad' },
  stopped: { label: '已停止', tone: 'idle' },
  unknown: { label: '未知', tone: 'idle' },
}

export interface TopologySummary {
  boundCount: number
  vmCount: number
  hostCount: number
  roomCount: number
  boundAssets: Asset[]
  hostByVmId: Map<number, Asset>
  locationByAssetId: Map<number, { room: Room; rack: Rack; uText: string }>
}

export function buildTopologySummary(
  service: Service,
  assets: Asset[],
  links: Link[],
  facilities: Facilities,
): TopologySummary {
  const assetById = new Map(assets.map(a => [a.id, a]))
  const rackById = new Map(facilities.racks.map(r => [r.id, r]))
  const roomById = new Map(facilities.rooms.map(r => [r.id, r]))

  const hostByVmId = new Map<number, Asset>()
  for (const link of links) {
    if (link.kind !== 'hosts') continue
    const host = assetById.get(link.fromId)
    if (host && !hostByVmId.has(link.toId)) hostByVmId.set(link.toId, host)
  }

  const locationByAssetId = new Map<number, { room: Room; rack: Rack; uText: string }>()
  for (const placement of facilities.placements) {
    const rack = rackById.get(placement.rackId)
    const room = rack && roomById.get(rack.roomId)
    if (rack && room) {
      locationByAssetId.set(placement.assetId, { room, rack, uText: uRange(placement) })
    }
  }
  for (const [vmId, host] of hostByVmId) {
    const loc = locationByAssetId.get(host.id)
    if (loc && !locationByAssetId.has(vmId)) locationByAssetId.set(vmId, loc)
  }

  const boundAssets = (service.assetIds ?? [])
    .map(id => assetById.get(id))
    .filter((a): a is Asset => Boolean(a))

  const vmSet = new Set<number>()
  const hostSet = new Set<number>()
  const roomSet = new Set<number>()

  for (const asset of boundAssets) {
    if (asset.kind === 'vm') {
      vmSet.add(asset.id)
      const parent = hostByVmId.get(asset.id)
      if (parent) {
        hostSet.add(parent.id)
        const loc = locationByAssetId.get(parent.id)
        if (loc) roomSet.add(loc.room.id)
      }
    } else {
      hostSet.add(asset.id)
      const loc = locationByAssetId.get(asset.id)
      if (loc) roomSet.add(loc.room.id)
    }
  }

  return {
    boundCount: boundAssets.length,
    vmCount: vmSet.size,
    hostCount: hostSet.size,
    roomCount: roomSet.size,
    boundAssets,
    hostByVmId,
    locationByAssetId,
  }
}

export function ServiceTopologyGraph({
  service,
  assets,
  links,
  facilities,
  dark,
  editable,
  onOpenAsset,
  onOpenRoom,
  onManageAssets,
}: Props) {
  const { tiers, edges, boundCount } = useMemo(() => {
    const summary = buildTopologySummary(service, assets, links, facilities)
    const regionById = new Map(facilities.regions.map(r => [r.id, r.name]))
    const edges: TopoEdgeInput[] = []
    const svcId = `svc-${service.id}`

    const vmNodes: TopoItem[] = []
    const hostMap = new Map<number, Asset>()
    const roomMap = new Map<number, { room: Room; hosts: Set<number>; racks: Set<string> }>()

    for (const asset of summary.boundAssets) {
      if (asset.kind === 'vm') {
        const st = asset.lifecycle === 'retired'
          ? { label: '已退役', tone: 'idle' as const }
          : (statusMap[asset.status] ?? statusMap.unknown)
        vmNodes.push({
          id: `vm-${asset.id}`,
          kind: 'vm',
          title: asset.name,
          subtitle: asset.address || '虚拟机',
          statusTone: st.tone,
          statusLabel: st.label,
          onClick: () => onOpenAsset(asset.id),
        })
        edges.push({ source: svcId, target: `vm-${asset.id}` })
        const host = summary.hostByVmId.get(asset.id)
        if (host) {
          hostMap.set(host.id, host)
          edges.push({ source: `vm-${asset.id}`, target: `host-${host.id}` })
        }
      } else {
        hostMap.set(asset.id, asset)
        edges.push({ source: svcId, target: `host-${asset.id}` })
      }
    }

    const hostNodes: TopoItem[] = []
    for (const host of hostMap.values()) {
      const st = host.lifecycle === 'retired'
        ? { label: '已退役', tone: 'idle' as const }
        : (statusMap[host.status] ?? statusMap.unknown)
      const loc = summary.locationByAssetId.get(host.id)
      hostNodes.push({
        id: `host-${host.id}`,
        kind: host.kind,
        title: host.name,
        subtitle: [host.address, loc ? `${loc.rack.name} ${loc.uText}` : '未上架'].filter(Boolean).join(' · '),
        statusTone: st.tone,
        statusLabel: st.label,
        onClick: () => onOpenAsset(host.id),
      })
      if (loc) {
        const rEntry = roomMap.get(loc.room.id) ?? { room: loc.room, hosts: new Set<number>(), racks: new Set<string>() }
        rEntry.hosts.add(host.id)
        rEntry.racks.add(loc.rack.name)
        roomMap.set(loc.room.id, rEntry)
        edges.push({ source: `host-${host.id}`, target: `room-${loc.room.id}` })
      }
    }

    const roomNodes: TopoItem[] = Array.from(roomMap.values()).map(entry => {
      const region = entry.room.regionId ? regionById.get(entry.room.regionId) : ''
      return {
        id: `room-${entry.room.id}`,
        kind: 'room',
        title: entry.room.name,
        subtitle: [region, `${entry.hosts.size} 台主机`].filter(Boolean).join(' · '),
        onClick: () => onOpenRoom(entry.room.id),
      }
    })

    const tiers: TopoTier[] = [
      {
        key: 'service',
        label: '服务',
        nodes: [{
          id: svcId,
          kind: 'service',
          title: service.name,
          subtitle: service.category || `关联 ${summary.boundCount} 台资产`,
          serviceName: service.name,
          serviceCategory: service.category,
          isRoot: true,
        }],
      },
      { key: 'vm', label: '虚拟机', nodes: vmNodes },
      { key: 'host', label: hostNodes.some(n => n.kind !== 'host') ? '服务器 / 网络设备' : '服务器', nodes: hostNodes },
      { key: 'room', label: '数据中心', nodes: roomNodes },
    ]

    return { tiers, edges, boundCount: summary.boundCount }
  }, [assets, facilities, links, onOpenAsset, onOpenRoom, service])

  return (
    <TopologyCanvas
      graphKey={`service-${service.id}-${(service.assetIds ?? []).join(',')}`}
      tiers={tiers}
      links={edges}
      dark={dark}
      ariaLabel={`${service.name} 部署拓扑图`}
      emptyState={boundCount === 0 ? (
        <>
          <div className="mb-1"><ServiceIcon name={service.name} category={service.category} /></div>
          <p className="text-sm font-medium text-foreground">暂未关联承载资产</p>
          <p className="text-xs text-muted-foreground">关联运行该服务的虚拟机或服务器后，可在此查看完整部署拓扑。</p>
          {editable && (
            <Button size="sm" variant="outline" className="mt-2" onClick={onManageAssets}>
              <Link2 />关联资产
            </Button>
          )}
        </>
      ) : undefined}
    />
  )
}
