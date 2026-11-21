import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow,
  useEdgesState, useNodesState,
  type Edge, type Node, type NodeMouseHandler, type NodeProps, type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/style.css'
import { Building2, Cable, ChevronRight, Link2, Monitor, Server } from 'lucide-react'
import type { Asset, Link, Service } from '../api'
import type { Facilities, Rack, Room } from '../facilities'
import { uRange } from '../facilities'
import { ServiceIcon } from './ServiceIcon'
import { Badge } from './ui/badge'
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

type TierKind = 'service' | 'vm' | 'host' | 'room'

interface TopoNodeData extends Record<string, unknown> {
  tier: TierKind
  title: string
  eyebrow: string
  subtitle: string
  detail?: string
  statusText?: string
  statusTone?: 'ok' | 'warn' | 'bad' | 'idle'
  assetId?: number
  roomId?: number
  assetKind?: Asset['kind']
  serviceName?: string
  serviceCategory?: string
  hasLeft?: boolean
  hasRight?: boolean
  clickable?: boolean
  dimmed?: boolean
  highlighted?: boolean
}

type TopoNode = Node<TopoNodeData, 'topo'>

const statusMap: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'idle' }> = {
  online: { label: '在线', tone: 'ok' },
  running: { label: '运行中', tone: 'ok' },
  paused: { label: '已暂停', tone: 'warn' },
  offline: { label: '离线', tone: 'bad' },
  stopped: { label: '已停止', tone: 'idle' },
  unknown: { label: '未知', tone: 'idle' },
}

function platformText(platform: Asset['platform']) {
  return platform === 'pve' ? 'Proxmox VE' : platform === 'kvm' ? 'KVM' : ''
}

function specText(asset: Asset) {
  const parts: string[] = []
  if (asset.cpu > 0) parts.push(`${asset.cpu}C`)
  if (asset.memoryMiB > 0) parts.push(`${Math.round(asset.memoryMiB / 1024)}G`)
  return parts.join(' · ')
}

function TopoCard({ data }: NodeProps<TopoNode>) {
  const className = [
    'svc-topo-node',
    `is-${data.tier}`,
    data.clickable ? 'is-clickable' : '',
    data.highlighted ? 'is-highlighted' : '',
    data.dimmed ? 'is-dimmed' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className}>
      {data.hasLeft && <Handle type="target" position={Position.Left} className="svc-topo-handle" />}
      <div className="svc-topo-eyebrow">
        <span>{data.eyebrow}</span>
        {data.statusText && (
          <span className={`svc-topo-status is-${data.statusTone ?? 'idle'}`}>
            <i aria-hidden="true" />
            {data.statusText}
          </span>
        )}
      </div>
      <div className="svc-topo-main">
        {data.tier === 'service' ? (
          <ServiceIcon name={data.serviceName ?? data.title} category={data.serviceCategory} />
        ) : (
          <span className="svc-topo-icon" aria-hidden="true">
            {data.tier === 'vm' && <Monitor className="size-3.5" />}
            {data.tier === 'host' && (data.assetKind === 'switch' ? <Cable className="size-3.5" /> : <Server className="size-3.5" />)}
            {data.tier === 'room' && <Building2 className="size-3.5" />}
          </span>
        )}
        <div className="svc-topo-copy">
          <strong title={data.title}>{data.title}</strong>
          <span title={data.subtitle}>{data.subtitle}</span>
        </div>
        {data.clickable && <ChevronRight className="svc-topo-chevron" aria-hidden="true" />}
      </div>
      {data.detail && <div className="svc-topo-detail" title={data.detail}>{data.detail}</div>}
      {data.hasRight && <Handle type="source" position={Position.Right} className="svc-topo-handle" />}
    </div>
  )
}

const nodeTypes = { topo: TopoCard } satisfies NodeTypes

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
  // VMs inherit their host's physical location.
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
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const baseGraph = useMemo(() => {
    const summary = buildTopologySummary(service, assets, links, facilities)
    const regionById = new Map(facilities.regions.map(r => [r.id, r.name]))
    const rawEdges: { id: string; source: string; target: string }[] = []

    const vms: Asset[] = []
    const hostMap = new Map<number, { asset: Asset; direct: boolean; upstreamOrder: number[] }>()
    const roomMap = new Map<number, { room: Room; hosts: Set<number>; racks: Set<string>; upstreamOrder: number[] }>()

    const serviceNodeId = `svc-${service.id}`

    for (const asset of summary.boundAssets) {
      if (asset.kind === 'vm') {
        const vmIdx = vms.length
        vms.push(asset)
        const vmNodeId = `vm-${asset.id}`
        rawEdges.push({ id: `e-${serviceNodeId}-${vmNodeId}`, source: serviceNodeId, target: vmNodeId })
        const host = summary.hostByVmId.get(asset.id)
        if (host) {
          const entry = hostMap.get(host.id) ?? { asset: host, direct: false, upstreamOrder: [] }
          entry.upstreamOrder.push(vmIdx)
          hostMap.set(host.id, entry)
          rawEdges.push({ id: `e-${vmNodeId}-host-${host.id}`, source: vmNodeId, target: `host-${host.id}` })
        }
      } else {
        const entry = hostMap.get(asset.id) ?? { asset, direct: true, upstreamOrder: [] }
        entry.direct = true
        entry.upstreamOrder.push(vms.length + 0.5)
        hostMap.set(asset.id, entry)
        rawEdges.push({ id: `e-${serviceNodeId}-host-${asset.id}`, source: serviceNodeId, target: `host-${asset.id}` })
      }
    }

    // Barycenter sort hosts so edges from VMs stay clean and uncrossed.
    const hosts = Array.from(hostMap.values()).sort((a, b) => {
      const avgA = a.upstreamOrder.length ? a.upstreamOrder.reduce((s, v) => s + v, 0) / a.upstreamOrder.length : 0
      const avgB = b.upstreamOrder.length ? b.upstreamOrder.reduce((s, v) => s + v, 0) / b.upstreamOrder.length : 0
      return avgA - avgB || a.asset.name.localeCompare(b.asset.name, 'zh-CN')
    })

    hosts.forEach((entry, hostIdx) => {
      const loc = summary.locationByAssetId.get(entry.asset.id)
      if (!loc) return
      const rEntry = roomMap.get(loc.room.id) ?? {
        room: loc.room,
        hosts: new Set<number>(),
        racks: new Set<string>(),
        upstreamOrder: [],
      }
      rEntry.hosts.add(entry.asset.id)
      rEntry.racks.add(loc.rack.name)
      rEntry.upstreamOrder.push(hostIdx)
      roomMap.set(loc.room.id, rEntry)
      rawEdges.push({
        id: `e-host-${entry.asset.id}-room-${loc.room.id}`,
        source: `host-${entry.asset.id}`,
        target: `room-${loc.room.id}`,
      })
    })

    const rooms = Array.from(roomMap.values()).sort((a, b) => {
      const avgA = a.upstreamOrder.length ? a.upstreamOrder.reduce((s, v) => s + v, 0) / a.upstreamOrder.length : 0
      const avgB = b.upstreamOrder.length ? b.upstreamOrder.reduce((s, v) => s + v, 0) / b.upstreamOrder.length : 0
      return avgA - avgB || a.room.name.localeCompare(b.room.name, 'zh-CN')
    })

    // Determine active columns left-to-right (skip empty VM column for bare-metal-only services).
    const activeTiers: TierKind[] = ['service']
    if (vms.length > 0) activeTiers.push('vm')
    if (hosts.length > 0) activeTiers.push('host')
    if (rooms.length > 0) activeTiers.push('room')
    const colX = new Map<TierKind, number>()
    const COL_GAP = 300
    activeTiers.forEach((tier, idx) => colX.set(tier, idx * COL_GAP))

    const ROW_GAP = 108
    const maxRows = Math.max(1, vms.length, hosts.length, rooms.length)
    const totalHeight = (maxRows - 1) * ROW_GAP
    const yFor = (index: number, count: number) => {
      const colHeight = (count - 1) * ROW_GAP
      return (totalHeight - colHeight) / 2 + index * ROW_GAP
    }

    const nodes: TopoNode[] = []

    // Service root node
    nodes.push({
      id: serviceNodeId,
      type: 'topo',
      position: { x: colX.get('service') ?? 0, y: yFor(0, 1) },
      style: { width: 232 },
      data: {
        tier: 'service',
        title: service.name,
        eyebrow: service.category || '服务',
        subtitle: service.description || `已关联 ${summary.boundCount} 台资产`,
        detail: `关联 ${summary.boundCount} 台资产 · 覆盖 ${summary.roomCount} 个数据中心`,
        serviceName: service.name,
        serviceCategory: service.category,
        hasLeft: false,
        hasRight: summary.boundCount > 0,
        clickable: false,
      },
    })

    // VM nodes
    vms.forEach((vm, idx) => {
      const st = vm.lifecycle === 'retired'
        ? { label: '已退役', tone: 'idle' as const }
        : (statusMap[vm.status] ?? statusMap.unknown)
      const hasHost = summary.hostByVmId.has(vm.id)
      const specs = specText(vm)
      nodes.push({
        id: `vm-${vm.id}`,
        type: 'topo',
        position: { x: colX.get('vm') ?? COL_GAP, y: yFor(idx, vms.length) },
        style: { width: 228 },
        data: {
          tier: 'vm',
          assetId: vm.id,
          assetKind: vm.kind,
          title: vm.name,
          eyebrow: platformText(vm.platform) ? `虚拟机 · ${platformText(vm.platform)}` : '虚拟机',
          subtitle: vm.address || '未配置 IP',
          detail: [specs, !hasHost ? '未关联宿主机' : ''].filter(Boolean).join(' · ') || undefined,
          statusText: st.label,
          statusTone: st.tone,
          hasLeft: true,
          hasRight: hasHost,
          clickable: true,
        },
      })
    })

    // Host / Switch nodes
    hosts.forEach((entry, idx) => {
      const host = entry.asset
      const st = host.lifecycle === 'retired'
        ? { label: '已退役', tone: 'idle' as const }
        : (statusMap[host.status] ?? statusMap.unknown)
      const loc = summary.locationByAssetId.get(host.id)
      const kindLabel = host.kind === 'switch' ? '交换机' : '物理机'
      const plat = platformText(host.platform)
      nodes.push({
        id: `host-${host.id}`,
        type: 'topo',
        position: { x: colX.get('host') ?? COL_GAP * 2, y: yFor(idx, hosts.length) },
        style: { width: 236 },
        data: {
          tier: 'host',
          assetId: host.id,
          assetKind: host.kind,
          title: host.name,
          eyebrow: [kindLabel, plat].filter(Boolean).join(' · '),
          subtitle: host.address || '未配置管理 IP',
          detail: loc ? `${loc.rack.name} · ${loc.uText}` : '未上架机柜',
          statusText: st.label,
          statusTone: st.tone,
          hasLeft: true,
          hasRight: Boolean(loc),
          clickable: true,
        },
      })
    })

    // Data center room nodes
    rooms.forEach((entry, idx) => {
      const region = entry.room.regionId ? regionById.get(entry.room.regionId) : ''
      const rackList = Array.from(entry.racks).sort((a, b) => a.localeCompare(b, 'zh-CN'))
      const rackSummary = rackList.length > 2
        ? `${rackList.slice(0, 2).join('、')} 等 ${rackList.length} 个机柜`
        : rackList.join('、')
      nodes.push({
        id: `room-${entry.room.id}`,
        type: 'topo',
        position: { x: colX.get('room') ?? COL_GAP * 3, y: yFor(idx, rooms.length) },
        style: { width: 232 },
        data: {
          tier: 'room',
          roomId: entry.room.id,
          title: entry.room.name,
          eyebrow: region ? `数据中心 · ${region}` : '数据中心',
          subtitle: `${entry.hosts.size} 台承载主机`,
          detail: rackSummary ? `机柜：${rackSummary}` : undefined,
          hasLeft: true,
          hasRight: false,
          clickable: true,
        },
      })
    })

    // Deduplicate edges
    const seenEdge = new Set<string>()
    const dedupEdges = rawEdges.filter(e => {
      if (seenEdge.has(e.id)) return false
      seenEdge.add(e.id)
      return true
    })

    return { nodes, rawEdges: dedupEdges, summary, activeTiers }
  }, [assets, facilities, links, service])

  // Compute upstream + downstream connected chain when hovering a node.
  const activeChain = useMemo(() => {
    if (!hoveredId) return null
    const nodeIds = new Set<string>([hoveredId])
    const edgeIds = new Set<string>()

    // Walk downstream
    const downQueue = [hoveredId]
    while (downQueue.length) {
      const cur = downQueue.shift()!
      for (const e of baseGraph.rawEdges) {
        if (e.source === cur) {
          edgeIds.add(e.id)
          if (!nodeIds.has(e.target)) {
            nodeIds.add(e.target)
            downQueue.push(e.target)
          }
        }
      }
    }
    // Walk upstream
    const upQueue = [hoveredId]
    while (upQueue.length) {
      const cur = upQueue.shift()!
      for (const e of baseGraph.rawEdges) {
        if (e.target === cur) {
          edgeIds.add(e.id)
          if (!nodeIds.has(e.source)) {
            nodeIds.add(e.source)
            upQueue.push(e.source)
          }
        }
      }
    }
    return { nodeIds, edgeIds }
  }, [baseGraph.rawEdges, hoveredId])

  const styledNodes = useMemo<TopoNode[]>(() => {
    if (!activeChain) return baseGraph.nodes
    return baseGraph.nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        highlighted: activeChain.nodeIds.has(node.id),
        dimmed: !activeChain.nodeIds.has(node.id),
      },
    }))
  }, [activeChain, baseGraph.nodes])

  const styledEdges = useMemo<Edge[]>(() => {
    const baseStroke = dark ? '#3e4452' : '#c6c5bf'
    const activeStroke = dark ? '#60a5fa' : '#2563eb'
    return baseGraph.rawEdges.map(edge => {
      const isHighlighted = activeChain ? activeChain.edgeIds.has(edge.id) : false
      const isDimmed = activeChain ? !isHighlighted : false
      const stroke = isHighlighted ? activeStroke : baseStroke
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        pathOptions: { borderRadius: 14 },
        style: {
          stroke,
          strokeWidth: isHighlighted ? 2 : 1.5,
          opacity: isDimmed ? 0.25 : 0.95,
          transition: 'stroke 150ms ease, opacity 150ms ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: stroke,
        },
      }
    })
  }, [activeChain, baseGraph.rawEdges, dark])

  const [nodes, setNodes, onNodesChange] = useNodesState<TopoNode>(styledNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(styledEdges)

  useEffect(() => {
    setNodes(prev => {
      const posById = new Map(prev.map(n => [n.id, n.position]))
      // Preserve dragged positions when only hover styling changes; reset on graph structure changes
      const sameStructure = prev.length === styledNodes.length && prev.every((n, i) => n.id === styledNodes[i]?.id)
      if (!sameStructure) return styledNodes
      return styledNodes.map(n => ({ ...n, position: posById.get(n.id) ?? n.position }))
    })
  }, [styledNodes, setNodes])

  useEffect(() => {
    setEdges(styledEdges)
  }, [styledEdges, setEdges])

  const onNodeClick: NodeMouseHandler<TopoNode> = useCallback((_, node) => {
    if (node.data.assetId) onOpenAsset(node.data.assetId)
    else if (node.data.roomId) onOpenRoom(node.data.roomId)
  }, [onOpenAsset, onOpenRoom])

  const onNodeMouseEnter: NodeMouseHandler<TopoNode> = useCallback((_, node) => {
    setHoveredId(node.id)
  }, [])

  const onNodeMouseLeave = useCallback(() => {
    setHoveredId(null)
  }, [])

  const tierLabels: Record<TierKind, { label: string; count: number }> = {
    service: { label: '服务', count: 1 },
    vm: { label: '虚拟机', count: baseGraph.summary.vmCount },
    host: { label: '物理机', count: baseGraph.summary.hostCount },
    room: { label: '数据中心', count: baseGraph.summary.roomCount },
  }

  return (
    <section className="svc-topo-card" aria-label={`${service.name} 部署拓扑`}>
      <div className="svc-topo-head">
        <div className="svc-topo-tiers">
          {baseGraph.activeTiers.map((tier, idx) => (
            <span key={tier} className="svc-topo-tier-item">
              {idx > 0 && <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden="true" />}
              <span>{tierLabels[tier].label}</span>
              <Badge variant="secondary" className="tabular-nums">{tierLabels[tier].count}</Badge>
            </span>
          ))}
        </div>
        <span className="svc-topo-hint">悬停节点高亮依赖链路 · 点击节点查看详情</span>
      </div>

      {baseGraph.summary.boundCount === 0 ? (
        <div className="svc-topo-empty">
          <div className="svc-topo-empty-icon" aria-hidden="true">
            <ServiceIcon name={service.name} category={service.category} />
          </div>
          <p className="text-sm font-medium text-foreground">暂未关联承载资产</p>
          <p className="text-xs text-muted-foreground">关联运行该服务的虚拟机或物理机后，会自动绘制从服务到宿主机与数据中心的部署拓扑。</p>
          {editable && (
            <Button size="sm" variant="outline" className="mt-2" onClick={onManageAssets}>
              <Link2 />关联资产
            </Button>
          )}
        </div>
      ) : (
        <div className="svc-topo-canvas">
          <ReactFlow<TopoNode, Edge>
            key={`${service.id}:${(service.assetIds ?? []).join(',')}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.35}
            maxZoom={1.5}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            forceColorMode={dark ? 'dark' : 'light'}
            aria-label={`${service.name} 服务部署拓扑图`}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.1}
              color={dark ? '#282d38' : '#d8d7d0'}
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
    </section>
  )
}
