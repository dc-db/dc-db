import { useState, type ReactNode } from 'react'
import { ArrowLeft, Plus, Settings, Star, Trash2 } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import type { Asset } from '../api'
import { mountKinds, occupiedUnits, placementFaceLabel, uRange } from '../facilities'
import type { MountKind, Placement, Rack, RackFace, Room } from '../facilities'
import { RackElevation } from './RackElevation'

interface Props {
  rack: Rack | null
  room: Room | null
  devices: Placement[]
  assets: Map<number, Asset>
  editable: boolean
  busy: boolean
  focused: number | null
  feedback?: string
  error?: string
  mountForm?: ReactNode
  onClose: () => void
  onOpenAsset: (assetId: number) => void
  onEditRack: (rack: Rack) => void
  onMount: () => void
  onEditPlacement: (placement: Placement) => void
  onUnmount: (placement: Placement) => void
  onMove: (placement: Placement, startU: number) => void
  onMountAt: (startU: number, face: RackFace) => void
  bookmarked: boolean
  onToggleBookmark: () => void
}

function nameOf(assets: Map<number, Asset>, id: number) {
  return assets.get(id)?.name ?? '资产 #' + id
}

const statusLabels: Record<string, string> = {
  online: '在线', offline: '离线', running: '运行中', stopped: '已停止', paused: '已暂停', unknown: '未知',
}

function statusLabel(status?: string) {
  return status ? statusLabels[status] ?? status : '未知'
}

export function RackDetailDrawer({
  rack, room, devices, assets, editable, busy, focused, feedback, error, mountForm,
  onClose, onOpenAsset, onEditRack, onMount, onEditPlacement, onUnmount, onMove, onMountAt,
  bookmarked, onToggleBookmark,
}: Props) {
  if (!rack) return null

  const occupied = occupiedUnits(devices)
  const used = occupied.size
  const frontUsed = occupiedUnits(devices.filter(item => item.depth === 'full' || item.face === 'front')).size
  const rearUsed = occupiedUnits(devices.filter(item => item.depth === 'full' || item.face === 'rear')).size
  const percent = Math.round(used / rack.heightU * 100)
  const hostCount = devices.filter(item => assets.get(item.assetId)?.kind === 'host').length
  const switchCount = devices.filter(item => assets.get(item.assetId)?.kind === 'switch').length
  const fullDepthCount = devices.filter(item => item.depth === 'full').length
  const halfDepthCount = devices.length - fullDepthCount

  const details = [
    ['机柜编号', rack.name], ['所属数据中心', room?.name ?? '—'],
    ['机柜高度', rack.heightU + 'U'],
    ['已用 U 位', used + 'U'],
    ['前视占用', frontUsed + 'U'], ['后视占用', rearUsed + 'U'],
    ['安装深度', `全深 ${fullDepthCount} · 半深 ${halfDepthCount}`], ['剩余 U 位', (rack.heightU - used) + 'U'],
    ['利用率', percent + '%'],
  ]

  return (
    <div className="rack-detail-page">
      <header className="rack-detail-head">
        <div className="rack-detail-title">
          <Button variant="outline" onClick={onClose}><ArrowLeft /> 返回</Button>
          <div><strong>{rack.name}</strong><span>{room?.name ?? '未绑定数据中心'} · {rack.heightU}U 机柜</span></div>
        </div>
        <div className="rack-detail-actions">
          <Button variant="outline" onClick={onToggleBookmark}><Star fill={bookmarked ? 'currentColor' : 'none'} />{bookmarked ? '已收藏' : '收藏'}</Button>
          {editable && <><Button variant="outline" disabled={busy} onClick={() => onEditRack(rack)}><Settings />编辑机柜</Button><Button disabled={busy} onClick={onMount}><Plus />上架设备</Button></>}
        </div>
      </header>

      {(error || feedback) && <div className="rack-detail-alert"><div role={error ? 'alert' : 'status'} className={error ? 'rounded-md border border-destructive p-3 text-destructive' : 'rounded-md border border-border p-3'}>{error || feedback}</div></div>}

      <div className="rack-detail-stats">
        <div><span>设备</span><strong>{devices.length}</strong><small>台</small></div>
        <div><span>U 位</span><strong>{rack.heightU}</strong><small>U</small></div>
        <div><span>已用</span><strong>{used}</strong><small>U</small></div>
        <div><span>空闲</span><strong>{rack.heightU - used}</strong><small>U</small></div>
        <div className="rack-detail-stat-usage"><span>利用率</span><strong>{percent}%</strong><Progress value={percent} aria-label="机柜利用率" /></div>
      </div>

      <div className="rack-detail-body">
        <div className="rack-detail-canvas">
          {mountForm}
          <RackElevation
            rack={rack} devices={devices} assets={assets} focused={focused}
            editable={editable} busy={busy} onOpen={onOpenAsset} onMove={onMove}
            onMountAt={editable ? onMountAt : undefined}
          />
        </div>
        <aside className="rack-detail-side">
          <section className="rack-side-section">
            <h3>机柜内设备 <span>{devices.length}</span></h3>
            {devices.length ? (
              <ul className="rack-side-devices">
                {devices.map(item => {
                  const asset = assets.get(item.assetId)
                  return (
                    <li key={item.assetId}>
                      <span className={`rack-drawer-device-dot ${asset?.status ?? ''}`} />
                      <div className="rack-side-device-main">
                        <Button variant="link" onClick={() => onOpenAsset(item.assetId)}>{nameOf(assets, item.assetId)}</Button>
                        <span className="rack-side-device-meta">
                          {asset ? mountKinds[asset.kind as MountKind] : '设备'} · {uRange(item)} · {placementFaceLabel(item)}
                        </span>
                      </div>
                      {editable && (
                        <div className="rack-side-device-actions">
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => onEditPlacement(item)}>调整</Button>
                          <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={busy}><Trash2 />下架</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>下架该设备？</AlertDialogTitle><AlertDialogDescription>资产台账会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => onUnmount(item)}>下架</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : <p className="rack-side-empty">机柜内还没有设备</p>}
          </section>
          <details className="rack-side-more">
            <summary>机柜详情</summary>
            <dl className="rack-side-detail">
              {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </details>
          <div className="rack-side-legend">
            <span><i className="rack-legend-dot host" />物理机</span>
            <span><i className="rack-legend-dot switch" />交换机</span>
            <span><i className="rack-legend-dot" />空 U 位</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
