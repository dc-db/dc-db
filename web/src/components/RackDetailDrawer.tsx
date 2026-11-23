import { useState, type ReactNode } from 'react'
import { ArrowLeft, Plus, Settings, Star, Trash2 } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { UsageBar } from './UsageBar'
import type { Asset } from '../api'
import { mountKinds, occupiedUnits, placementFaceLabel, uRange } from '../facilities'
import type { MountKind, Placement, Rack, RackFace, Room } from '../facilities'
import { rackElevationSvg } from '../rackExport'

interface Props {
  rack: Rack | null
  room: Room | null
  regionName?: string
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
  rack, room, regionName, devices, assets, editable, busy, focused, feedback, error, mountForm,
  onClose, onOpenAsset, onEditRack, onMount, onEditPlacement, onUnmount, onMove, onMountAt,
  bookmarked, onToggleBookmark,
}: Props) {
  const [devicesOpen, setDevicesOpen] = useState(false)
  if (!rack) return null

  const occupied = occupiedUnits(devices)
  const used = occupied.size
  const percent = Math.round(used / rack.heightU * 100)
  return (
    <div className="rack-detail-page">
      <nav className="rack-detail-breadcrumb" aria-label="当前位置">
        <Button variant="outline" size="sm" onClick={onClose}><ArrowLeft />返回</Button>
        <button type="button" onClick={onClose}>数据中心</button>
        {regionName && <><span aria-hidden="true">/</span><span>{regionName}</span></>}
        {room && <><span aria-hidden="true">/</span><button type="button" onClick={onClose}>{room.name}</button></>}
      </nav>
      <header className="rack-detail-head">
        <div className="rack-detail-title">
          <div><strong>{rack.name}</strong><span>{room?.name ?? '未绑定数据中心'} · {rack.heightU}U 机柜</span></div>
        </div>
        <div className="rack-detail-actions">
          <Button variant="outline" onClick={onToggleBookmark}><Star fill={bookmarked ? 'currentColor' : 'none'} />{bookmarked ? '已收藏' : '收藏'}</Button>
          {editable && <><Button variant="outline" disabled={busy} onClick={() => onEditRack(rack)}><Settings />编辑机柜</Button><Button disabled={busy} onClick={onMount}><Plus />上架设备</Button></>}
        </div>
      </header>

      {(error || feedback) && <div className="rack-detail-alert"><div role={error ? 'alert' : 'status'} className={error ? 'rounded-md border border-destructive p-3 text-destructive' : 'rounded-md border border-border p-3'}>{error || feedback}</div></div>}

      <Dialog open={devicesOpen} onOpenChange={setDevicesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>机柜内设备</DialogTitle><DialogDescription>查看和维护当前机柜内的设备。</DialogDescription></DialogHeader>
          {devices.length ? (
            <ul className="rack-side-devices">
              {devices.map(item => {
                const asset = assets.get(item.assetId)
                return (
                  <li key={item.assetId}>
                    <span className={`rack-drawer-device-dot ${asset?.status ?? ''}`} />
                    <div className="rack-side-device-main">
                      <Button variant="link" onClick={() => { setDevicesOpen(false); onOpenAsset(item.assetId) }}>{nameOf(assets, item.assetId)}</Button>
                      <span className="rack-side-device-meta">
                        {asset ? mountKinds[asset.kind as MountKind] : '设备'} · {uRange(item)} · {placementFaceLabel(item)}
                      </span>
                    </div>
                    {editable && (
                      <div className="rack-side-device-actions">
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => { setDevicesOpen(false); onEditPlacement(item) }}>调整</Button>
                        <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={busy}><Trash2 />下架</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>下架该设备？</AlertDialogTitle><AlertDialogDescription>资产台账会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => onUnmount(item)}>下架</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : <p className="rack-side-empty">机柜内还没有设备</p>}
        </DialogContent>
      </Dialog>

      <div className="rack-detail-body">
        <section className="rack-facts-panel">
          <dl className="rack-facts">
            <div><dt>数据中心</dt><dd>{room?.name ?? '—'}</dd></div>
            <div><dt>机柜编号</dt><dd>{rack.name}</dd></div>
            <div><dt>机柜高度</dt><dd>{rack.heightU}U</dd></div>
            <div><dt>已用 U 位</dt><dd>{used}U</dd></div>
            <div><dt>空闲 U 位</dt><dd>{rack.heightU - used}U</dd></div>
            <div><dt>设备数</dt><dd><button type="button" className="rack-device-count" onClick={() => setDevicesOpen(true)} aria-label={`查看机柜内 ${devices.length} 台设备`}>{devices.length}</button></dd></div>
            <div className="rack-facts-usage"><dt>利用率</dt><dd><UsageBar value={percent} label="机柜利用率" className="w-full" barClassName="min-w-0 flex-1" /></dd></div>
          </dl>
        </section>
        <section className="rack-detail-faces" aria-label="机柜立面图">
          {(['front', 'rear'] as RackFace[]).map(face => (
            <figure key={face} className="rack-detail-face">
              <figcaption className="rack-detail-face-label">{face === 'front' ? '前' : '后'}</figcaption>
              <div className="rack-detail-face-figure" dangerouslySetInnerHTML={{ __html: rackElevationSvg(rack, devices, assets, face, { interactive: false }).svg }} />
            </figure>
          ))}
        </section>
      </div>
    </div>
  )
}
