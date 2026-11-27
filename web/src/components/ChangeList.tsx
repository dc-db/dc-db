import { useMemo, useState } from 'react'
import { Upload } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import type { Change } from '../api'
import { downloadCSV } from '../csv'

interface Props {
  changes: Change[]
  hideAsset?: boolean
  filterable?: boolean
  onOpen?: (id: number) => void
}

const actionLabels: Record<string, string> = {
  create: '创建', update: '编辑', discover: '自动发现', sync: '配置同步', move: '宿主机变更',
  service_assets: '服务关联变更', asset_services: '运行服务变更', 'probe.settings': '探测间隔变更',
  'service.create': '新增服务', 'service.update': '更新服务', 'service.delete': '删除服务',
  missing: '连续未发现', link: '关联资源', unlink: '解除关系',
  room_create: '新增数据中心', room_update: '编辑数据中心', room_delete: '删除数据中心',
  rack_create: '新增机柜', rack_update: '编辑机柜', rack_delete: '删除机柜',
  mount: '设备上架', relocate: '上架位置变更', unmount: '设备下架',
  subnet_create: '新增网段', subnet_update: '编辑网段', subnet_delete: '删除网段',
  ip_allocate: '分配 IP', ip_update: '编辑 IP', ip_release: '释放 IP',
  vlan_create: '新增 VLAN', vlan_update: '编辑 VLAN', vlan_delete: '删除 VLAN',
  user_create: '新增账号', user_update: '编辑账号', user_delete: '删除账号',
}
const fieldLabels: Record<string, string> = {
  probeEnabled: '存活探测',
  name: '名称', status: '状态', lifecycle: '生命周期', platform: '平台', owner: '负责人', groupId: '所属项目', teamId: '运维团队', personId: '负责人编号',
  environment: '环境', address: '地址', brand: '品牌', model: '型号', cpu: 'CPU', memoryMiB: '内存（MiB）', disks: '硬盘', notes: '备注',
  observed: '采集信息', missingCount: '缺失次数',
  heightU: '机柜高度（U）',
  cidr: 'CIDR', gateway: '网关', vlan: 'VLAN', ip: 'IP 地址', assetId: '关联资产', label: '用途',
  role: '角色', dnsName: 'DNS 名称', vid: 'VLAN ID', description: '描述', roomId: '所属数据中心',
  face: '安装面', depth: '安装深度', passwordReset: '重置密码',
}
const userRoleLabels: Record<string, string> = { admin: '管理员', operator: '运维', viewer: '只读' }
const relationLabels: Record<string, string> = { hosts: '承载' }

function summary(change: Change) {
  if (change.action === 'asset_services') return '运行服务已更新'
  if (change.action === 'service_assets') {
    const before = Array.isArray(change.before) ? change.before.map(String) : []
    const after = Array.isArray(change.after) ? change.after.map(String) : []
    const added = after.filter(name => !before.includes(name))
    const removed = before.filter(name => !after.includes(name))
    return [
      added.length ? `新增：${added.join('、')}` : '',
      removed.length ? `移除：${removed.join('、')}` : '',
    ].filter(Boolean).join(' · ') || '关联未变化'
  }
  if (change.action === 'move') return String(change.before?.fromName ?? '—') + ' → ' + String(change.after?.fromName ?? '—')
  if (change.action === 'link' || change.action === 'unlink') {
    const relation = change.after ?? change.before
    return String(relation?.fromName ?? '—') + ' · ' + (relationLabels[String(relation?.kind)] ?? '关系') + ' · ' + String(relation?.toName ?? '—')
  }
  if (change.action === 'missing') return '请核查平台中的资源状态'
  if (change.action.startsWith('subnet_')) {
    const subnet = change.after ?? change.before
    return [subnet?.name, subnet?.cidr].filter(Boolean).map(String).join(' · ')
  }
  if (change.action === 'ip_allocate' || change.action === 'ip_update' || change.action === 'ip_release') {
    const allocation = change.after ?? change.before
    return [allocation?.ip, allocation?.dnsName, allocation?.assetName || allocation?.label]
      .filter(Boolean).map(String).join(' · ')
  }
  if (change.action.startsWith('vlan_')) {
    const vlan = change.after ?? change.before
    return [vlan?.vid ? `VLAN ${vlan.vid}` : '', vlan?.name, vlan?.description]
      .filter(Boolean).map(String).join(' · ')
  }
  if (change.action.startsWith('user_')) {
    const user = change.after ?? change.before
    return [
      user?.username,
      userRoleLabels[String(user?.role)] ?? user?.role,
      change.after?.passwordReset ? '已重置密码' : '',
    ].filter(Boolean).map(String).join(' · ')
  }
  if (change.action === 'mount' || change.action === 'relocate' || change.action === 'unmount') {
    const position = (value: Change['before']) => {
      if (!value) return ''
      const start = Number(value.startU)
      const end = start + Number(value.units) - 1
      const units = start === end ? 'U' + start : 'U' + start + '–U' + end
      const mounting = [value.face === 'rear' ? '后面' : '前面', value.depth === 'half' ? '半深' : '全深'].join(' · ')
      return [value.roomName, value.rackName, units, mounting].join(' / ')
    }
    return [position(change.before), position(change.after)].filter(Boolean).join(' → ')
  }
  return ''
}

function display(value: unknown): string {
  if (value === '' || value === undefined || value === null) return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function differences(change: Change) {
  if (!change.before || !change.after ||
    !['update', 'sync', 'room_update', 'rack_update', 'subnet_update', 'ip_update', 'vlan_update', 'user_update'].includes(change.action)) return []
  const ignored = new Set(['id', 'version', 'subnetId', 'assetId', 'assetName', 'subnetName'])
  return Object.entries(change.after)
    .filter(([key, after]) => !ignored.has(key) && display(change.before?.[key]) !== display(after))
    .map(([key, after]) => ({ field: fieldLabels[key] ?? key, before: display(change.before?.[key]), after: display(after) }))
}

function date(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function downloadChanges(changes: Change[]) {
  const rows: (string | number)[][] = [['时间', '动作', '资产', '操作人', '摘要', '变更字段']]
  for (const change of changes) {
    rows.push([
      date(change.createdAt),
      actionLabels[change.action] ?? change.action,
      change.assetName,
      change.actor,
      summary(change),
      differences(change).map(diff => `${diff.field}: ${diff.before} → ${diff.after}`).join('; '),
    ])
  }
  downloadCSV('dc-db-changes.csv', rows)
}

export function ChangeList({ changes, hideAsset, filterable, onOpen }: Props) {
  const [keyword, setKeyword] = useState('')
  const [action, setAction] = useState<string | undefined>()
  const actions = useMemo(() => Array.from(new Set(changes.map(change => change.action)))
    .sort((left, right) => (actionLabels[left] ?? left).localeCompare(actionLabels[right] ?? right, 'zh-CN')), [changes])
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return changes.filter(change => {
      if (action && change.action !== action) return false
      if (!query) return true
      return [change.assetName, change.actor, actionLabels[change.action] ?? change.action, summary(change)]
        .some(value => value?.toLowerCase().includes(query))
    })
  }, [action, changes, keyword])

  if (!changes.length) return <div className="p-6 text-center text-sm text-muted-foreground">暂无变更记录</div>

  return (
    <>
      {filterable && (
        <div className="change-toolbar flex flex-wrap items-center gap-2">
          <Input
            type="search" className="h-8 w-[240px]" placeholder="搜索变更记录" aria-label="搜索变更记录"
            value={keyword} onChange={event => setKeyword(event.target.value)}
          />
          <Select value={action ?? '__all__'} onValueChange={value => setAction(value === '__all__' ? undefined : value)}>
            <SelectTrigger size="sm" className="w-[160px]" aria-label="筛选动作"><SelectValue placeholder="全部动作" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部动作</SelectItem>
              {actions.map(item => <SelectItem key={item} value={item}>{actionLabels[item] ?? item}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="muted text-xs tabular-nums">共 {visible.length} 条</span>
          <Button variant="outline" size="sm" className="ml-auto" disabled={!visible.length} onClick={() => downloadChanges(visible)}><Upload aria-hidden="true" />导出当前结果</Button>
        </div>
      )}
      {visible.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">没有匹配的变更记录</div> : (
        <ol className="m-0 list-none p-0">
          {visible.map((change, index) => (
            <li key={`${change.id}-${index}`} className="relative ml-1 border-l border-border pb-5 pl-5 last:border-transparent last:pb-0">
              <span aria-hidden="true" className="absolute -left-[5px] top-1.5 size-[9px] rounded-full bg-primary" />
              <div className="change-head">
                <Badge variant="outline">{actionLabels[change.action] ?? change.action}</Badge>
                {!hideAsset && change.assetId ? (
                  <Button variant="link" size="sm" onClick={() => onOpen?.(change.assetId)}>{change.assetName}</Button>
                ) : !hideAsset ? <strong>{change.assetName}</strong> : null}
                <span className="muted">{change.actor} · {date(change.createdAt)}</span>
              </div>
              {summary(change) && <p className="change-summary">{summary(change)}</p>}
              {differences(change).map(diff => (
                <div key={diff.field} className="change-field">
                  <span className="muted">{diff.field}</span>
                  <del>{diff.before}</del>
                  <span aria-hidden="true">→</span>
                  <ins>{diff.after}</ins>
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
