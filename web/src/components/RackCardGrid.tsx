import { ChevronRight, Network, Server } from 'lucide-react'
import { Progress } from './ui/progress'
import type { Asset } from '../api'
import { occupiedUnits, placementFaceLabel } from '../facilities'
import type { Placement, Rack } from '../facilities'

interface Props {
  racks: Rack[]
  placements: Placement[]
  assets: Map<number, Asset>
  keyword: string
  onOpen: (rackId: number) => void
}

export function RackCardGrid({ racks, placements, assets, keyword, onOpen }: Props) {
  const needle = keyword.trim().toLowerCase()
  const filtered = needle ? racks.filter(rack => rack.name.toLowerCase().includes(needle)) : racks

  if (!racks.length) {
    return <p className="muted text-center py-8">当前数据中心还没有机柜</p>
  }
  if (!filtered.length) {
    return <p className="muted text-center py-8">没有匹配的机柜</p>
  }

  return (
    <div className="rack-card-grid">
      {filtered.map(rack => {
        const devices = placements.filter(item => item.rackId === rack.id)
        const used = occupiedUnits(devices).size
        const percent = Math.round(used / rack.heightU * 100)
        return (
          <button key={rack.id} type="button" className="rack-card" onClick={() => onOpen(rack.id)}>
            <div className="rack-card-head">
              <span className="rack-card-name">{rack.name}</span>
              {rack.zone && <span className="rack-card-zone">{rack.zone}</span>}
              <span className="rack-card-height">{rack.heightU}U</span>
            </div>

            <div className="rack-card-visual">
              <div className="mini-rack">
                <div className="mini-rack-top" />
                <div className="mini-rack-body">
                  {devices.map(device => {
                    const asset = assets.get(device.assetId)
                    const top = (rack.heightU - (device.startU + device.units - 1)) / rack.heightU * 100
                    const height = device.units / rack.heightU * 100
                    const half = device.depth === 'half'
                    return (
                      <span
                        key={device.assetId}
                        className={`mini-rack-device ${asset?.kind === 'switch' ? 'switch' : 'host'} ${device.face}`}
                        style={{
                          top: `${top}%`, height: `${height}%`,
                          left: half && device.face === 'rear' ? '50%' : 0,
                          right: 'auto',
                          width: half ? '50%' : '100%',
                        }}
                        title={`${asset?.name ?? '设备'} · ${placementFaceLabel(device)}`}
                      />
                    )
                  })}
                </div>
                <div className="mini-rack-foot" />
              </div>
            </div>

            <div className="rack-card-meta">
              <span><Server size={14} /> {devices.length} 台设备</span>
              <span className="muted">{used} / {rack.heightU}U</span>
            </div>
            <Progress value={percent} className="h-2" />
            <div className="rack-card-foot">
              <span><Network size={14} /> 机柜详情</span>
              <span>查看详情 <ChevronRight size={14} /></span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
