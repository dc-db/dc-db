import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow,
  useEdgesState, useNodesState,
  type Edge, type Node, type NodeMouseHandler, type NodeProps, type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/style.css'
import {
  ArrowLeftRight, ArrowUpRight, Building2, ChevronRight, Globe, Maximize2, Minimize2,
  Monitor, Network, Router, Scale, Server, Shield, Split,
} from 'lucide-react'
import { ServiceIcon } from './ServiceIcon'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

export type TopoEntityKind = 'service' | 'subnet' | 'vlan' | 'vm' | 'host' | 'switch' | 'router' | 'firewall' | 'load_balancer' | 'room'

export interface TopoItem {
  id: string
  kind: TopoEntityKind
  title: string
  subtitle: string
  statusTone?: 'ok' | 'warn' | 'bad' | 'idle'
  statusLabel?: string
  serviceName?: string
  serviceCategory?: string
  isRoot?: boolean
  onClick?: () => void
}

export interface TopoTier {
  key: string
  label: string
  nodes: TopoItem[]
}

export interface TopoEdgeInput {
  source: string
  target: string
}

interface Props {
  graphKey: string
  tiers: TopoTier[]
  links: TopoEdgeInput[]
  dark: boolean
  ariaLabel: string
  emptyState?: ReactNode
  compact?: boolean
}

interface CanvasNodeData extends Record<string, unknown> {
  item: TopoItem
  hasLeft: boolean
  hasRight: boolean
  highlighted: boolean
  dimmed: boolean
}

type CanvasNode = Node<CanvasNodeData, 'entity'>

function EntityIcon({ item }: { item: TopoItem }) {
  if (item.kind === 'service') {
    return <ServiceIcon name={item.serviceName ?? item.title} category={item.serviceCategory} />
  }
  const Icon = item.kind === 'vm'
    ? Monitor
    : item.kind === 'switch'
      ? ArrowLeftRight
      : item.kind === 'router'
        ? Router
        : item.kind === 'firewall'
          ? Shield
          : item.kind === 'load_balancer'
            ? Scale
            : item.kind === 'room'
              ? Building2
              : item.kind === 'subnet'
                ? Network
                : item.kind === 'vlan'
                  ? Split
                  : item.kind === 'host'
                    ? Server
                    : Globe
  return (
    <span className="topo-node-icon" aria-hidden="true">
      <Icon className="size-3.5" />
    </span>
  )
}

function EntityCard({ data }: NodeProps<CanvasNode>) {
  const { item, hasLeft, hasRight, highlighted, dimmed } = data
  const clickable = Boolean(item.onClick)
  const className = [
    'topo-node',
    item.isRoot ? 'is-root' : '',
    highlighted ? 'is-highlighted' : '',
    dimmed ? 'is-dimmed' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className}>
      {hasLeft && <Handle type="target" position={Position.Left} className="topo-handle" />}
      <div className="topo-node-body">
        <EntityIcon item={item} />
        <div className="topo-node-text">
          <div className="topo-node-title-row">
            <strong title={item.title}>{item.title}</strong>
            {item.statusTone && (
              <span
                className={`topo-dot is-${item.statusTone}`}
                title={item.statusLabel}
                aria-label={item.statusLabel}
              />
            )}
          </div>
          <span className="topo-node-sub" title={item.subtitle}>{item.subtitle}</span>
        </div>
        {clickable && <ArrowUpRight className="topo-node-arrow" aria-hidden="true" />}
      </div>
      {hasRight && <Handle type="source" position={Position.Right} className="topo-handle" />}
    </div>
  )
}

const nodeTypes = { entity: EntityCard } satisfies NodeTypes

const NODE_WIDTH = 228
const COL_GAP = 376 // 148px open horizontal breathing room between cards
const ROW_GAP = 108 // ~46px open vertical whitespace between 62px cards

export function TopologyCanvas({
  graphKey,
  tiers,
  links,
  dark,
  ariaLabel,
  emptyState,
  compact = false,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const draggingRef = useRef(false)
  const draggedNodeRef = useRef(false)

  // Allow Escape to exit fullscreen smoothly
  useEffect(() => {
    if (!fullscreen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  // Compute deterministic, airy, low-crossing layered layout
  const layout = useMemo(() => {
    const activeTiers = tiers.filter(t => t.nodes.length > 0)
    const dedupLinks: { id: string; source: string; target: string }[] = []
    const seen = new Set<string>()
    const incomingById = new Map<string, string[]>()
    const outgoingById = new Map<string, string[]>()

    for (const link of links) {
      const id = `${link.source}__${link.target}`
      if (seen.has(id) || link.source === link.target) continue
      seen.add(id)
      dedupLinks.push({ id, source: link.source, target: link.target })
      incomingById.set(link.target, [...(incomingById.get(link.target) ?? []), link.source])
      outgoingById.set(link.source, [...(outgoingById.get(link.source) ?? []), link.target])
    }

    // Order each tier by upstream barycenter to minimize edge crossings
    const orderInPrev = new Map<string, number>()
    const orderedTiers = activeTiers.map((tier, tierIdx) => {
      let ordered = [...tier.nodes]
      if (tierIdx > 0) {
        ordered.sort((a, b) => {
          const parentsA = (incomingById.get(a.id) ?? []).map(id => orderInPrev.get(id)).filter((v): v is number => v !== undefined)
          const parentsB = (incomingById.get(b.id) ?? []).map(id => orderInPrev.get(id)).filter((v): v is number => v !== undefined)
          const avgA = parentsA.length ? parentsA.reduce((s, v) => s + v, 0) / parentsA.length : 999
          const avgB = parentsB.length ? parentsB.reduce((s, v) => s + v, 0) / parentsB.length : 999
          return avgA - avgB || a.title.localeCompare(b.title, 'zh-CN')
        })
      }
      ordered.forEach((item, idx) => orderInPrev.set(item.id, idx))
      return { ...tier, nodes: ordered }
    })

    const maxRows = Math.max(1, ...orderedTiers.map(t => t.nodes.length))
    const totalHeight = (maxRows - 1) * ROW_GAP
    const nodes: CanvasNode[] = []

    orderedTiers.forEach((tier, colIdx) => {
      const colHeight = (tier.nodes.length - 1) * ROW_GAP
      const startY = (totalHeight - colHeight) / 2
      tier.nodes.forEach((item, rowIdx) => {
        nodes.push({
          id: item.id,
          type: 'entity',
          position: { x: colIdx * COL_GAP, y: startY + rowIdx * ROW_GAP },
          style: { width: NODE_WIDTH },
          data: {
            item,
            hasLeft: (incomingById.get(item.id)?.length ?? 0) > 0,
            hasRight: (outgoingById.get(item.id)?.length ?? 0) > 0,
            highlighted: false,
            dimmed: false,
          },
        })
      })
    })

    return { nodes, links: dedupLinks, activeTiers: orderedTiers }
  }, [links, tiers])

  // Compute connected upstream + downstream chain for hovered node
  const activeChain = useMemo(() => {
    if (!hoveredId) return null
    const nodeIds = new Set<string>([hoveredId])
    const edgeIds = new Set<string>()

    const walk = (dir: 'down' | 'up') => {
      const queue = [hoveredId]
      while (queue.length) {
        const cur = queue.shift()!
        for (const e of layout.links) {
          const match = dir === 'down' ? e.source === cur : e.target === cur
          if (!match) continue
          edgeIds.add(e.id)
          const next = dir === 'down' ? e.target : e.source
          if (!nodeIds.has(next)) {
            nodeIds.add(next)
            queue.push(next)
          }
        }
      }
    }
    walk('down')
    walk('up')
    return { nodeIds, edgeIds }
  }, [hoveredId, layout.links])

  const styledNodes = useMemo<CanvasNode[]>(() => {
    if (!activeChain) return layout.nodes
    return layout.nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        highlighted: activeChain.nodeIds.has(node.id),
        dimmed: !activeChain.nodeIds.has(node.id),
      },
    }))
  }, [activeChain, layout.nodes])

  const styledEdges = useMemo<Edge[]>(() => {
    const baseStroke = dark ? '#404040' : '#d4d4d4'
    const activeStroke = dark ? '#fafafa' : '#171717'
    return layout.links.map(edge => {
      const isHighlighted = activeChain ? activeChain.edgeIds.has(edge.id) : false
      const isDimmed = activeChain ? !isHighlighted : false
      const stroke = isHighlighted ? activeStroke : baseStroke
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default', // classic smooth cubic bezier
        style: {
          stroke,
          strokeWidth: isHighlighted ? 2 : 1.5,
          opacity: isDimmed ? 0.2 : 0.9,
          transition: 'stroke 160ms ease, opacity 160ms ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 11,
          height: 11,
          color: stroke,
        },
      }
    })
  }, [activeChain, dark, layout.links])

  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(styledNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(styledEdges)

  useEffect(() => {
    if (draggingRef.current) return
    setNodes(prev => {
      const same = prev.length === styledNodes.length && prev.every((n, i) => n.id === styledNodes[i]?.id)
      if (!same) return styledNodes
      const pos = new Map(prev.map(n => [n.id, n.position]))
      return styledNodes.map(n => ({ ...n, position: pos.get(n.id) ?? n.position }))
    })
  }, [styledNodes, setNodes])

  useEffect(() => {
    if (draggingRef.current) return
    setEdges(styledEdges)
  }, [styledEdges, setEdges])

  // Prevent hover thrashing & cursor flicker while dragging or panning
  const onNodeDragStart = useCallback(() => {
    draggingRef.current = true
    draggedNodeRef.current = true
  }, [])

  const onNodeDragStop = useCallback(() => {
    draggingRef.current = false
    setTimeout(() => { draggedNodeRef.current = false }, 80)
  }, [])

  const onMoveStart = useCallback(() => {
    draggingRef.current = true
  }, [])

  const onMoveEnd = useCallback(() => {
    draggingRef.current = false
  }, [])

  const onNodeMouseEnter: NodeMouseHandler<CanvasNode> = useCallback((_, node) => {
    if (draggingRef.current) return
    setHoveredId(node.id)
  }, [])

  const onNodeMouseLeave = useCallback(() => {
    if (draggingRef.current) return
    setHoveredId(null)
  }, [])

  const onNodeClick: NodeMouseHandler<CanvasNode> = useCallback((_, node) => {
    if (draggedNodeRef.current) return
    node.data.item.onClick?.()
  }, [])

  const hasContent = layout.nodes.length > 1 || (layout.nodes.length === 1 && !emptyState)

  return (
    <section className={`topo-card${fullscreen ? ' is-fullscreen' : ''}${compact ? ' is-compact' : ''}`} aria-label={ariaLabel}>
      <div className="topo-head">
        <div className="topo-tiers">
          {layout.activeTiers.map((tier, idx) => (
            <span key={tier.key} className="topo-tier-item">
              {idx > 0 && <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden="true" />}
              <span>{tier.label}</span>
              <Badge variant="secondary" className="tabular-nums">{tier.nodes.length}</Badge>
            </span>
          ))}
        </div>
        <div className="topo-head-right">
          <span className="topo-hint">拖拽画布或节点调整视野 · 点击节点打开详情</span>
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => setFullscreen(value => !value)}
            aria-label={fullscreen ? '退出全屏' : '全屏查看拓扑'}
          >
            {fullscreen ? <><Minimize2 />退出全屏</> : <><Maximize2 />全屏</>}
          </Button>
        </div>
      </div>

      {!hasContent && emptyState ? (
        <div className="topo-empty">{emptyState}</div>
      ) : (
        <div className="topo-canvas">
          <ReactFlow<CanvasNode, Edge>
            key={`${graphKey}:${fullscreen ? 'full' : 'inline'}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onMoveStart={onMoveStart}
            onMoveEnd={onMoveEnd}
            fitView
            fitViewOptions={{ padding: 0.24, maxZoom: 1.05 }}
            minZoom={0.35}
            maxZoom={1.5}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            forceColorMode={dark ? 'dark' : 'light'}
            aria-label={ariaLabel}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color={dark ? '#262626' : '#e5e5e5'}
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
    </section>
  )
}
