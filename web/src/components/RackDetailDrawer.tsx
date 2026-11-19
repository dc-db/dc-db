import { useState, type ReactNode } from 'react'
import { List, Plus, Settings, Star, Trash2, X } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import type { Asset } from '../api'
import { mountKinds, occupiedUnits, placementFaceLabel, uRange } from '../facilities'
import type { MountKind, Placement, Rack, RackFace, Room } from '../facilities'
import { RackElevation } from './RackElevation'

interface Props {
  open: boolean
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
  open, rack, room, devices, assets, editable, busy, focused, feedback, error, mountForm,
  onClose, onOpenAsset, onEditRack, onMount, onEditPlacement, onUnmount, onMove, onMountAt,
  bookmarked, onToggleBookmark,
}: Props) {
  const [tab, setTab] = useState('rack')
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
    <Sheet open={open} onOpenChange={next => { if (!next && !busy) onClose() }}>
      <SheetContent side="right" showCloseButton={false} className="rack-detail-drawer w-[min(1020px,calc(100vw-32px))] max-w-none gap-0 p-0 sm:max-w-none">
        <SheetTitle className="sr-only">{rack.name}</SheetTitle>
        <SheetDescription className="sr-only">机柜视图、设备列表与机柜详情</SheetDescription>
        <div className="rack-drawer-shell">
          <header className="rack-drawer-head">
            <div className="rack-drawer-title">
              <span className="rack-drawer-icon"><List size="1em" aria-hidden="true" /></span>
              <div><strong>{rack.name}</strong><span>{room?.name ?? '未绑定数据中心'} · {rack.heightU}U 机柜</span></div>
            </div>
            <div className="rack-drawer-actions">
              <Button variant="outline" onClick={onToggleBookmark}><Star fill={bookmarked ? 'currentColor' : 'none'} />{bookmarked ? '已收藏' : '收藏'}</Button>
              {editable && <><Button variant="outline" disabled={busy} onClick={() => onEditRack(rack)}><Settings />编辑机柜</Button><Button disabled={busy} onClick={onMount}><Plus />上架设备</Button></>}
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭"><X /></Button>
            </div>
          </header>
          {(error || feedback) && <div className="rack-drawer-alert"><div role={error ? 'alert' : 'status'} className={error ? 'rounded-md border border-destructive p-3 text-destructive' : 'rounded-md border border-border p-3'}>{error || feedback}</div></div>}
          <div className="rack-drawer-stats">
            <div><span>设备数</span><strong>{devices.length}</strong><small>台设备</small></div>
            <div><span>U 位总数</span><strong>{rack.heightU}</strong><small>U</small></div>
            <div><span>已使用</span><strong>{used}</strong><small>U</small></div>
            <div className="rack-drawer-usage"><div><span>利用率</span><strong>{percent}%</strong></div><Progress value={percent} aria-label="机柜利用率" /><small>物理机 {hostCount} · 交换机 {switchCount} · 全深 {fullDepthCount}</small></div>
          </div>
          <Tabs className="rack-drawer-tabs" value={tab} onValueChange={setTab}>
            <TabsList><TabsTrigger value="rack">机柜视图</TabsTrigger><TabsTrigger value="devices">设备列表{devices.length ? ` (${devices.length})` : ''}</TabsTrigger><TabsTrigger value="detail">机柜详情</TabsTrigger></TabsList>
            <TabsContent value="rack" className="min-h-0 flex-1 overflow-auto"><div className="rack-drawer-tab">{mountForm}<RackElevation rack={rack} devices={devices} assets={assets} focused={focused} editable={editable} busy={busy} onOpen={onOpenAsset} onMove={onMove} onMountAt={editable ? onMountAt : undefined} /></div></TabsContent>
            <TabsContent value="devices" className="min-h-0 flex-1 overflow-auto">
              {devices.length ? <ul className="rack-drawer-devices m-0 list-none p-0">{devices.map(item => {
                const asset = assets.get(item.assetId)
                return <li key={item.assetId} className="flex items-center justify-between gap-3 border-b py-3">
                  <div className="rack-drawer-device"><span className={`rack-drawer-device-dot ${asset?.status ?? ''}`} /><div><Button variant="link" onClick={() => onOpenAsset(item.assetId)}>{nameOf(assets, item.assetId)}</Button><span className="muted">{asset ? mountKinds[asset.kind as MountKind] : '设备'} · {uRange(item)} · {placementFaceLabel(item)}</span></div><Badge variant="secondary">{statusLabel(asset?.status)}</Badge></div>
                  {editable && <div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => onEditPlacement(item)}>调整</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={busy}><Trash2 />下架</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>下架该设备？</AlertDialogTitle><AlertDialogDescription>资产台账会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => onUnmount(item)}>下架</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
                </li>
              })}</ul> : <div className="p-6 text-center text-sm text-muted-foreground">机柜内还没有设备</div>}
            </TabsContent>
            <TabsContent value="detail" className="min-h-0 flex-1 overflow-auto"><dl className="rack-drawer-detail grid grid-cols-2 gap-0 overflow-hidden rounded-md border">{details.map(([label, value]) => <div key={label} className="grid grid-cols-2 border-b last:border-b-0"><dt className="bg-muted p-2 text-muted-foreground">{label}</dt><dd className="m-0 p-2">{value}</dd></div>)}</dl></TabsContent>
          </Tabs>
          <footer className="rack-drawer-foot"><span><i className="rack-legend-dot host" />物理机</span><span><i className="rack-legend-dot switch" />交换机</span><span><i className="rack-legend-dot" />空 U 位</span><span className="rack-drawer-foot-hint">拖动设备可调整 U 位，松开后保存</span></footer>
        </div>
      </SheetContent>
    </Sheet>
  )
}
