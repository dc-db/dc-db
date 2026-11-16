import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Panel, Position,
  ReactFlow, useEdgesState, useNodesState,
} from '@xyflow/react'
import type { Edge, Node, NodeMouseHandler, NodeProps, NodeTypes } from '@xyflow/react'
import '@xyflow/react/style.css'
import { Cable, Monitor, Network, Server } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Asset, Kind, Link } from '../api'

interface Props {
  asset: Asset
  links: Link[]
  assets: Asset[]
  dark: boolean
  onOpenAsset?: (assetId: number) => void
}

const MAX_GRAPH_NEIGHBORS = 12

const kindMeta: Record<Kind, { label: string; icon: LucideIcon; color: string }> = {
  host: { label: '物理机', icon: Server, color: 'var(--relation-host)' },
  vm: { label: '虚拟机', icon: Monitor, color: 'var(--relation-vm)' },
  switch: { label: '交换机', icon: Cable, color: 'var(--relation-switch)' },
}

const statusLabels: Record<string, string> = {
  online: '在线',
  offline: '离线',
  running: '运行中',
  stopped: '已停止',
  paused: '已暂停',
  unknown: '未知',
}

interface RelationNodeData extends Record<string, unknown> {
  asset: Asset
  center: boolean
  relation: string
}

type RelationNode = Node<RelationNodeData, 'asset'>

function kindOf(asset: Asset) {
  return kindMeta[asset.kind] ?? { label: asset.kind, icon: Server, color: '#8c8c8c' }
}

function relationFor(link: Link, center: Asset) {
  if (link.kind === 'hosts') {
    if (center.kind === 'host' && link.fromId === center.id) return '承载'
    if (center.kind === 'vm' && link.toId === center.id) return '宿主机'
  }
  return '关联'
}

function AssetRelationNode({ data }: NodeProps<RelationNode>) {
  const meta = kindOf(data.asset)
  const Icon = meta.icon
  const status = statusLabels[data.asset.status] ?? data.asset.status ?? '未知'
  return (
    <div
      className={`relation-node${data.center ? ' is-center' : ''}`}
      data-kind={data.asset.kind}
      data-status={data.asset.status}
      style={{ '--relation-color': meta.color } as CSSProperties}
    >
      {data.center
        ? <Handle type="source" position={Position.Bottom} className="relation-handle" />
        : <Handle type="target" position={Position.Top} className="relation-handle" />}
      <div className="relation-node-head">
        <span className="relation-node-icon" aria-hidden="true"><Icon size={15} /></span>
        <div className="relation-node-copy">
          <strong title={data.asset.name}>{data.asset.name}</strong>
          <span>{meta.label}{data.asset.address ? ` · ${data.asset.address}` : ''}</span>
        </div>
      </div>
      <div className="relation-node-foot">
        <span className="relation-node-relation">
          {data.center ? '当前资产' : data.relation}
        </span>
        <span className="relation-node-status">
          <i className="relation-status-dot" aria-hidden="true" />
          {status}
        </span>
      </div>
    </div>
  )
}

const nodeTypes = { asset: AssetRelationNode } satisfies NodeTypes

export function AssetRelationGraph({ asset, links, assets, dark, onOpenAsset }: Props) {
  const graph = useMemo(() => {
    const byID = new Map(assets.map(item => [item.id, item]))
    const neighbors = new Map<number, { asset: Asset; relation: string }>()
    for (const link of links) {
      const otherID = link.fromId === asset.id ? link.toId : link.fromId
      const other = byID.get(otherID)
      if (!other || neighbors.has(other.id)) continue
      neighbors.set(other.id, { asset: other, relation: relationFor(link, asset) })
    }
    const entries = Array.from(neighbors.values())
    const visible = entries.slice(0, MAX_GRAPH_NEIGHBORS)
    const count = Math.max(visible.length, 1)
    const radiusX = visible.length > 6 ? 330 : 255
    const radiusY = visible.length > 6 ? 215 : 165
    const nodes: RelationNode[] = [{
      id: `asset-${asset.id}`,
      type: 'asset',
      position: { x: -110, y: -48 },
      style: { width: 220 },
      data: { asset, center: true, relation: '' },
    }, ...visible.map((entry, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2
      return {
        id: `asset-${entry.asset.id}`,
        type: 'asset' as const,
        position: {
          x: Math.cos(angle) * radiusX - 95,
          y: Math.sin(angle) * radiusY - 42,
        },
        style: { width: 190 },
        data: { asset: entry.asset, center: false, relation: entry.relation },
      }
    })]
    const edges: Edge[] = visible.map(entry => ({
      id: `edge-${asset.id}-${entry.asset.id}`,
      source: `asset-${asset.id}`,
      target: `asset-${entry.asset.id}`,
      type: 'default',
      label: entry.relation,
      labelStyle: { fill: 'var(--muted)', fontSize: 11, fontWeight: 500 },
      labelBgStyle: { fill: 'var(--surface)', stroke: 'var(--line)' },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      style: { stroke: '#94a3b8', strokeWidth: 1.5, opacity: 0.9 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 13,
        height: 13,
        color: '#94a3b8',
      },
    }))
    return { nodes, edges, total: entries.length, hidden: Math.max(0, entries.length - visible.length) }
  }, [asset, assets, links])

  const [nodes, setNodes, onNodesChange] = useNodesState<RelationNode>(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setEdges, setNodes])

  const onNodeClick: NodeMouseHandler<RelationNode> = (_, node) => {
    if (!node.data.center) onOpenAsset?.(node.data.asset.id)
  }

  return (
    <section className="relation-topology" aria-label="资产关系拓扑">
      <div className="relation-topology-head">
        <div className="relation-topology-title">
          <Network size={15} aria-hidden="true" />
          <strong>关系拓扑</strong>
          <Badge variant="secondary">{graph.total}</Badge>
        </div>
        <span className="muted">拖动节点调整布局，点击节点打开资产</span>
      </div>
      <div className="relation-topology-canvas">
        <ReactFlow<RelationNode, Edge>
          key={`${asset.id}:${graph.total}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.3}
          maxZoom={1.6}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          forceColorMode={dark ? 'dark' : 'light'}
          aria-label={`${asset.name} 的关系拓扑`}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--line)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable zoomable
            style={{ width: 112, height: 72 }}
            bgColor="var(--surface)"
            maskColor={dark ? 'rgba(15, 23, 42, .55)' : 'rgba(241, 245, 249, .65)'}
            nodeStrokeColor="var(--line)"
            nodeStrokeWidth={2}
            nodeColor={node => kindOf((node.data as RelationNodeData).asset).color}
            className="relation-minimap"
          />
          {graph.hidden > 0 && (
            <Panel position="top-right" className="relation-more">
              仅显示前 {MAX_GRAPH_NEIGHBORS} 个关系，另有 {graph.hidden} 个
            </Panel>
          )}
        </ReactFlow>
      </div>
    </section>
  )
}
