import { useMemo } from 'react'
import type { Asset, Link } from '../api'
import { kindLabel } from '../kinds'
import { TopologyCanvas, type TopoEdgeInput, type TopoItem, type TopoTier } from './TopologyCanvas'

interface Props {
  asset: Asset
  links: Link[]
  assets: Asset[]
  dark: boolean
  onOpenAsset?: (assetId: number) => void
}

const statusMap: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'idle' }> = {
  online: { label: '在线', tone: 'ok' },
  running: { label: '运行中', tone: 'ok' },
  paused: { label: '已暂停', tone: 'warn' },
  offline: { label: '离线', tone: 'bad' },
  stopped: { label: '已停止', tone: 'idle' },
  unknown: { label: '未知', tone: 'idle' },
}

function toTopoItem(asset: Asset, isRoot: boolean, onOpenAsset?: (id: number) => void): TopoItem {
  const st = asset.lifecycle === 'retired'
    ? { label: '已退役', tone: 'idle' as const }
    : (statusMap[asset.status] ?? statusMap.unknown)
  return {
    id: `asset-${asset.id}`,
    kind: asset.kind,
    title: asset.name,
    subtitle: [asset.address, kindLabel(asset.kind)].filter(Boolean).join(' · '),
    statusTone: st.tone,
    statusLabel: st.label,
    isRoot,
    onClick: isRoot || !onOpenAsset ? undefined : () => onOpenAsset(asset.id),
  }
}

export function AssetRelationGraph({ asset, links, assets, dark, onOpenAsset }: Props) {
  const { tiers, edges } = useMemo(() => {
    const byId = new Map(assets.map(item => [item.id, item]))
    const upstream: Asset[] = []
    const downstream: Asset[] = []
    const seen = new Set<number>([asset.id])

    for (const link of links) {
      if (link.toId === asset.id) {
        const parent = byId.get(link.fromId)
        if (parent && !seen.has(parent.id)) {
          seen.add(parent.id)
          upstream.push(parent)
        }
      } else if (link.fromId === asset.id) {
        const child = byId.get(link.toId)
        if (child && !seen.has(child.id)) {
          seen.add(child.id)
          downstream.push(child)
        }
      }
    }

    const edges: TopoEdgeInput[] = [
      ...upstream.map(item => ({ source: `asset-${item.id}`, target: `asset-${asset.id}` })),
      ...downstream.map(item => ({ source: `asset-${asset.id}`, target: `asset-${item.id}` })),
    ]

    const tiers: TopoTier[] = [
      ...(upstream.length > 0 ? [{
        key: 'upstream',
        label: '所在宿主机',
        nodes: upstream.map(item => toTopoItem(item, false, onOpenAsset)),
      }] : []),
      {
        key: 'current',
        label: '当前资产',
        nodes: [toTopoItem(asset, true)],
      },
      ...(downstream.length > 0 ? [{
        key: 'downstream',
        label: '承载虚拟机',
        nodes: downstream.map(item => toTopoItem(item, false, onOpenAsset)),
      }] : []),
    ]
    return { tiers, edges }
  }, [asset, assets, links, onOpenAsset])

  return (
    <div className="mb-4">
      <TopologyCanvas
        graphKey={`asset-${asset.id}-${links.length}`}
        tiers={tiers}
        links={edges}
        dark={dark}
        compact
        ariaLabel={`${asset.name} 的关系拓扑`}
      />
    </div>
  )
}
