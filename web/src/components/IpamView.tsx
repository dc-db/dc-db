import { OptionSelect } from './OptionSelect'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Download, Plus, Star, Upload } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { Input } from './ui/input'
import { UsageBar } from './UsageBar'
import { Textarea } from './ui/textarea'
import { SearchableSelect } from './SearchableSelect'
import { Select } from './AppControls'
import { api, apiCSV, APIError } from '../api'
import { downloadCSV } from '../csv'
import type { Subnet, SubnetFields, VLAN } from '../api'
import { buildRoomCounts, matchesRoomFilter } from '../facilities'
import type { Facilities } from '../facilities'
import { RoomTreeLayout, type RoomFilter } from './RoomTreeLayout'

interface Props {
  editable: boolean
  hideTitle?: boolean
  facilities: Facilities
  roomFilter: RoomFilter
  onRoomFilterChange: (next: RoomFilter) => void
  openSubnetId: number | null
  onSubnetOpened: () => void
  onSelectSubnet?: (subnetId: number) => void
  bookmarkedSubnets: number[]
  onToggleSubnetBookmark: (id: number) => void
  onSessionError: (error: unknown) => void
  onChanged: () => void
}

type SubnetDraft = SubnetFields & { id?: number; version?: number }

const subnetStatusMeta: Record<string, { label: string; color: string }> = {
  container: { label: '聚合', color: 'default' },
  active: { label: '启用', color: 'green' },
  reserved: { label: '预留', color: 'orange' },
  deprecated: { label: '停用', color: 'default' },
}
const roleLabels: Record<string, string> = {
  loopback: '环回', secondary: '辅助', vip: 'VIP', vrrp: 'VRRP',
  hsrp: 'HSRP', glbp: 'GLBP', anycast: 'Anycast',
}
function count(value: number) {
  return value.toLocaleString('zh-CN')
}

interface SubnetNode {
  subnet: Subnet
  children: SubnetNode[]
  depth: number
}

interface SubnetRow {
  subnet: Subnet
  depth: number
  children: number
}

function ipv4Number(address: string): number | null {
  const parts = address.trim().split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

function subnetRange(cidr: string): { start: number; end: number; prefix: number } | null {
  const [address, prefixText] = cidr.trim().split('/')
  if (!address || !prefixText) return null
  const prefix = Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null
  const ip = ipv4Number(address)
  if (ip === null) return null
  const size = 2 ** (32 - prefix)
  const start = Math.floor(ip / size) * size
  return { start, end: start + size - 1, prefix }
}

function buildSubnetTree(subnets: Subnet[]): SubnetNode[] {
  const entries = subnets.map(subnet => ({ subnet, range: subnetRange(subnet.cidr) }))
  entries.sort((left, right) => {
    if (left.range && right.range) {
      return left.range.prefix - right.range.prefix || left.range.start - right.range.start || left.subnet.name.localeCompare(right.subnet.name, 'zh-CN')
    }
    if (left.range) return -1
    if (right.range) return 1
    return left.subnet.name.localeCompare(right.subnet.name, 'zh-CN')
  })

  const nodes = new Map<number, SubnetNode>()
  for (const entry of entries) nodes.set(entry.subnet.id, { subnet: entry.subnet, children: [], depth: 0 })
  const roots: SubnetNode[] = []

  for (const entry of entries) {
    const node = nodes.get(entry.subnet.id)!
    let parent: SubnetNode | undefined
    if (entry.range) {
      for (const candidateEntry of entries) {
        if (candidateEntry.subnet.id === entry.subnet.id || !candidateEntry.range) continue
        if (candidateEntry.range.prefix >= entry.range.prefix) continue
        if (candidateEntry.range.start > entry.range.start || candidateEntry.range.end < entry.range.end) continue
        const candidate = nodes.get(candidateEntry.subnet.id)!
        if (!parent || candidateEntry.range.prefix > (subnetRange(parent.subnet.cidr)?.prefix ?? -1)) parent = candidate
      }
    }
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  function fillDepth(node: SubnetNode, depth: number) {
    node.depth = depth
    for (const child of node.children) fillDepth(child, depth + 1)
  }
  for (const root of roots) fillDepth(root, 0)
  return roots
}

function flattenSubnetTree(nodes: SubnetNode[], collapsed: Set<number>): SubnetRow[] {
  const rows: SubnetRow[] = []
  function visit(node: SubnetNode) {
    rows.push({ subnet: node.subnet, depth: node.depth, children: node.children.length })
    if (!collapsed.has(node.subnet.id)) for (const child of node.children) visit(child)
  }
  for (const node of nodes) visit(node)
  return rows
}

export function IpamView({ editable, hideTitle, facilities, roomFilter, onRoomFilterChange, openSubnetId, onSubnetOpened, onSelectSubnet, bookmarkedSubnets, onToggleSubnetBookmark, onSessionError, onChanged }: Props) {
  const [subnets, setSubnets] = useState<Subnet[]>([])
  const [vlans, setVLANs] = useState<VLAN[]>([])
  const [draft, setDraft] = useState<SubnetDraft | null>(null)
  const [draftError, setDraftError] = useState('')
  const draftTriggerRef = useRef<HTMLButtonElement>(null)
  const [deleting, setDeleting] = useState<Subnet | null>(null)
  const [subnetSearch, setSubnetSearch] = useState('')
  const [subnetStatus, setSubnetStatus] = useState<string | undefined>()
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')

  const roomCounts = useMemo(() => buildRoomCounts(subnets, subnet => subnet.roomId || null), [subnets])
  const scopedSubnets = useMemo(
    () => subnets.filter(subnet => matchesRoomFilter(subnet.roomId || null, roomFilter)),
    [roomFilter, subnets],
  )
  const subnetTree = useMemo(() => buildSubnetTree(scopedSubnets), [scopedSubnets])
  const subnetRows = useMemo(() => flattenSubnetTree(subnetTree, collapsed), [subnetTree, collapsed])
  const visibleSubnetRows = useMemo(() => {
    const query = subnetSearch.trim().toLowerCase()
    return subnetRows
      .filter(row => !subnetStatus || row.subnet.status === subnetStatus)
      .filter(row => !query || [row.subnet.name, row.subnet.cidr, row.subnet.gateway, row.subnet.vlan,
        row.subnet.vlanName, row.subnet.role].some(value => value?.toLowerCase().includes(query)))
      .map(row => query || subnetStatus ? ({ ...row, depth: 0, children: 0 }) : row)
  }, [subnetRows, subnetSearch, subnetStatus])
  const vlanOptions = useMemo(() => {
    const options = vlans.map(vlan => ({
      value: String(vlan.vid),
      label: `VLAN ${vlan.vid} · ${vlan.name}${vlan.status !== 'active' ? `（${subnetStatusMeta[vlan.status]?.label ?? vlan.status}）` : ''}`,
    }))
    if (draft?.vlan && !vlans.some(vlan => String(vlan.vid) === draft.vlan)) {
      options.push({ value: draft.vlan, label: `VLAN ${draft.vlan}（未登记）` })
    }
    return options
  }, [draft?.vlan, vlans])

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (openSubnetId == null) return
    void load().then(() => onSubnetOpened())
  }, [openSubnetId])

  function report(e: unknown) {
    if (e instanceof APIError && e.status === 401) {
      onSessionError(e)
      return
    }
    setError(e instanceof Error ? e.message : '操作失败')
  }


  async function load() {
    setLoading(true)
    setError('')
    try {
      const [nextSubnets, nextVLANs] = await Promise.all([
        api<Subnet[]>('/subnets'), api<VLAN[]>('/vlans'),
      ])
      setSubnets(nextSubnets)
      setVLANs(nextVLANs)
    } catch (e) {
      report(e)
    } finally {
      setLoading(false)
    }
  }

  function toggleSubnet(id: number) {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addSubnet(trigger: HTMLButtonElement) {
    draftTriggerRef.current = trigger
    setDraftError('')
    setDraft({
      name: '', cidr: '', gateway: '', vlan: '', notes: '', status: 'active', role: '',
      roomId: typeof roomFilter === 'number' ? roomFilter : undefined,
    })
    setFeedback('')
  }

  function editSubnet(subnet: Subnet, trigger?: HTMLButtonElement | null) {
    draftTriggerRef.current = trigger ?? null
    setDraftError('')
    setDraft({
      id: subnet.id, version: subnet.version, name: subnet.name, cidr: subnet.cidr,
      gateway: subnet.gateway, vlan: subnet.vlan, notes: subnet.notes,
      status: subnet.status, role: subnet.role, roomId: subnet.roomId || undefined,
    })
  }

  async function saveSubnet() {
    if (!draft || busy) return
    const wasEdit = !!draft.id
    setBusy(true)
    setDraftError('')
    try {
      const body = {
        name: draft.name, cidr: draft.cidr, gateway: draft.gateway, vlan: draft.vlan,
        notes: draft.notes, status: draft.status, role: draft.role, roomId: draft.roomId ?? 0,
        version: draft.version ?? 0,
      }
      if (draft.id) await api<Subnet>(`/subnets/${draft.id}`, 'PUT', body)
      else await api<Subnet>('/subnets', 'POST', body)
      setDraft(null)
      await load()
      setFeedback(wasEdit ? '网段已更新' : '网段已创建')
      onChanged()
    } catch (e) {
      if (e instanceof APIError && e.status === 401) onSessionError(e)
      else setDraftError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSubnet(subnet: Subnet) {
    setBusy(true)
    setError('')
    try {
      await api(`/subnets/${subnet.id}?version=${subnet.version}`, 'DELETE')
      setDeleting(null)
      await load()
      setFeedback('网段已删除')
      onChanged()
    } catch (e) {
      setDeleting(null)
      report(e)
    } finally {
      setBusy(false)
    }
  }


  function downloadSubnetTemplate() {
    downloadCSV('dc-db-subnet-template.csv', [
      ['网段名称', 'CIDR', '网关', 'VLAN', '状态', '用途', '备注'],
      ['办公网', '192.0.2.0/24', '192.0.2.1', '100', '启用', '办公', '示例行，可删除'],
    ])
  }

  async function importSubnets() {
    if (!importFile) { setImportError('请选择 CSV 文件'); return }
    setImportBusy(true)
    setImportError('')
    try {
      const result = await apiCSV<{ imported: number }>('/subnets/import', importFile)
      setImportOpen(false)
      setImportFile(null)
      await load()
      setFeedback(`已导入 ${result.imported} 个网段`)
      onChanged()
    } catch (e) {
      if (e instanceof APIError && e.status === 401) { onSessionError(e); return }
      setImportError(e instanceof Error ? e.message : '导入失败')
    } finally {
      setImportBusy(false)
    }
  }

  const labelClass = 'space-y-2 text-sm font-medium'
  function exportSubnets() {
    downloadCSV('dc-db-subnets.csv', [
      ['网段名称', 'CIDR', '网关', 'VLAN', '状态', '用途', '可用地址', '已用', '空闲', '备注'],
      ...subnetRows.map(row => {
        const subnet = row.subnet
        return [
          subnet.name, subnet.cidr, subnet.gateway, subnet.vlan,
          subnetStatusMeta[subnet.status]?.label ?? subnet.status,
          roleLabels[subnet.role ?? ''] ?? (subnet.role || ''), subnet.usable, subnet.used, subnet.free, subnet.notes,
        ]
      }),
    ])
  }

  return (
    <RoomTreeLayout
      facilities={facilities}
      value={roomFilter}
      onChange={onRoomFilterChange}
      editable={editable}
      counts={roomCounts}
      onSessionError={onSessionError}
    >
    <PageHeader
      title={hideTitle ? undefined : '网段'}
      filters={<>
        <Input className="h-8 w-[240px]" placeholder="搜索名称、CIDR、VLAN、用途" value={subnetSearch} onChange={event => setSubnetSearch(event.target.value)} />
        <Select
          size="small" style={{ width: 140 }} allowClear searchable={false} placeholder="全部状态" value={subnetStatus}
          onChange={(value: string | undefined) => setSubnetStatus(value ?? undefined)}
          options={Object.entries(subnetStatusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
        />
      </>}
      actions={<>
        {editable && <Button size="sm" variant="outline" onClick={() => { setImportFile(null); setImportError(''); setImportOpen(true) }}><Download />导入</Button>}
        <Button size="sm" variant="outline" disabled={!subnetRows.length} onClick={exportSubnets}><Upload />导出</Button>
        {editable && <Button size="sm" onClick={event => addSubnet(event.currentTarget)}><Plus />新增网段</Button>}
      </>}
    />
    {error && <div role="alert" className="mb-4 flex justify-between rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {feedback && <div role="status" className="mb-4 flex justify-between rounded-md border border-success-border bg-success-soft p-3 text-sm text-success">{feedback}<button aria-label="关闭" onClick={() => setFeedback('')}>×</button></div>}
    {!subnets.length ? <div className="py-12 text-center text-muted-foreground">{loading ? '正在加载 IPAM 数据…' : '暂无网段，新增一个网段开始管理 IP 地址'}</div> : <>

      <div className="shared-table-wrap">
        <table className="shared-table ipam-subnet-table">
          <thead><tr><th>网段名称</th><th>CIDR</th><th>VLAN</th><th>网关</th><th>地址数</th><th>已用</th><th>空闲</th><th>利用率</th><th className="w-10"><span className="sr-only">操作</span></th></tr></thead>
          <tbody>
            {visibleSubnetRows.length ? visibleSubnetRows.map(({ subnet: item, depth, children }) => {
              const total = item.usable
              const usedPct = total > 0 ? Math.min(100, Math.round(item.used / total * 100)) : 0
              const bookmarked = bookmarkedSubnets.includes(item.id)
              return (
                <tr
                  key={item.id}
                  onClick={onSelectSubnet ? event => {
                    if ((event.target as HTMLElement).closest('button, a, [role="menuitem"], [data-slot="dropdown-menu-content"]')) return
                    onSelectSubnet(item.id)
                  } : undefined}
                >
                  <td style={{ paddingLeft: 12 + depth * 16 }}>
                    <span className="ipam-subnet-name">
                      {children > 0
                        ? <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`${collapsed.has(item.id) ? '展开' : '收起'} ${item.name} 的子网`} aria-expanded={!collapsed.has(item.id)} onClick={event => { event.stopPropagation(); toggleSubnet(item.id) }}>{collapsed.has(item.id) ? <ChevronRight /> : <ChevronDown />}</Button>
                        : <span className="w-6 shrink-0" />}
                      <span className="font-medium">{item.name}</span>
                      {bookmarked && <Star className="size-3.5 shrink-0 fill-current text-warning" aria-label="已收藏" />}
                      {children > 0 && <Badge variant="secondary">{children}</Badge>}
                    </span>
                  </td>
                  <td><span className="font-mono text-xs tabular-nums">{item.cidr}</span></td>
                  <td>{item.vlan ? (item.vlanName ? `${item.vlan} ${item.vlanName}` : item.vlan) : <span className="text-muted-foreground">—</span>}</td>
                  <td>{item.gateway ? <span className="font-mono text-xs tabular-nums">{item.gateway}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="tabular-nums">{count(item.usable)}</td>
                  <td className="tabular-nums">{count(item.used)}</td>
                  <td className="tabular-nums">{count(item.free)}</td>
                  <td><UsageBar value={usedPct} label={`${item.name} 地址使用率`} /></td>
                  <td className="w-10" onClick={event => event.stopPropagation()}>
                    <div className="flex justify-end">
                      <RowActionsMenu
                        ariaLabel={`网段 ${item.name} 更多操作`}
                        onEdit={editable ? () => editSubnet(item) : undefined}
                        extraItems={[
                          {
                            key: 'bookmark',
                            label: bookmarked ? '取消收藏' : '收藏',
                            onSelect: () => onToggleSubnetBookmark(item.id),
                          },
                        ]}
                        onDelete={editable ? () => setDeleting(item) : undefined}
                      />
                    </div>
                  </td>
                </tr>
              )
            }) : <tr><td colSpan={9} className="facility-table-empty">没有匹配的网段</td></tr>}
          </tbody>
        </table>
      </div>
    </>}
    <Dialog open={draft !== null} onOpenChange={open => { if (!open && !busy) setDraft(null) }}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[600px]"
        aria-describedby={undefined}
        showCloseButton={!busy}
        onCloseAutoFocus={event => {
          if (draftTriggerRef.current?.isConnected) {
            event.preventDefault()
            draftTriggerRef.current.focus()
          }
        }}
      >
        <DialogHeader><DialogTitle>{draft?.id ? '编辑网段' : '新增网段'}</DialogTitle></DialogHeader>
        {draftError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{draftError}</div>}
        {draft && (
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void saveSubnet() }}>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>网段名称<Input required value={draft.name} maxLength={160} placeholder="例如：办公网" onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className={labelClass}>CIDR<Input required value={draft.cidr} maxLength={64} placeholder="例如：192.0.2.0/24" onChange={event => setDraft({ ...draft, cidr: event.target.value })} /></label>
              <label className={labelClass}>状态<OptionSelect className="w-full" label="状态" value={draft.status} onChange={value => setDraft({ ...draft, status: value })} options={Object.entries(subnetStatusMeta).map(([value, meta]) => ({ value, label: meta.label }))} /></label>
              <label className={labelClass}>用途 / 角色<Input value={draft.role} maxLength={80} placeholder="例如：办公、服务器、互联" onChange={event => setDraft({ ...draft, role: event.target.value })} /></label>
              <div className={labelClass}><span>VLAN</span><SearchableSelect label="VLAN" placeholder="可选" value={draft.vlan} onChange={value => setDraft({ ...draft, vlan: value })} options={vlanOptions} />{!vlans.length && <span className="text-xs font-normal text-muted-foreground">请先在「VLAN」页面登记 VLAN</span>}</div>
              <label className={labelClass}>网关<Input value={draft.gateway} maxLength={64} placeholder="例如：192.0.2.1" onChange={event => setDraft({ ...draft, gateway: event.target.value })} /></label>
              <label className={`${labelClass} col-span-2`}>所属数据中心<OptionSelect className="w-full" label="所属数据中心" value={String(draft.roomId ?? '')} onChange={value => setDraft({ ...draft, roomId: value ? Number(value) : undefined })} options={[{ value: '', label: '未分配' }, ...facilities.rooms.map(room => ({ value: String(room.id), label: room.name }))]} /></label>
              <label className={`${labelClass} col-span-2`}>备注<Textarea rows={2} maxLength={2000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>取消</Button>
              <Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存网段'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  <Dialog open={importOpen} onOpenChange={next => { if (!importBusy) setImportOpen(next) }}><DialogContent>
      <DialogHeader><DialogTitle>导入网段</DialogTitle><DialogDescription>CSV 表头：网段名称、CIDR、网关、VLAN、状态、用途、备注。</DialogDescription></DialogHeader>
      {importError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{importError}</div>}
      <div className="space-y-3">
        <div className="import-picker">
          <input
            ref={importRef} type="file" accept=".csv,text/csv" hidden aria-label="选择 CSV 文件"
            onChange={event => { setImportFile(event.target.files?.[0] ?? null); setImportError('') }}
          />
          <Button variant="outline" onClick={() => importRef.current?.click()}>{importFile ? '重新选择' : '选择 CSV 文件'}</Button>
          {importFile && <span className="import-picker-name" title={importFile.name}>{importFile.name}</span>}
        </div>
        <p className="text-sm text-muted-foreground">单次最多 500 行，UTF-8 编码</p>
        <Button type="button" variant="link" className="h-auto p-0" onClick={downloadSubnetTemplate}><Download />下载 CSV 模板</Button>
      </div>
      <DialogFooter><Button variant="outline" disabled={importBusy} onClick={() => setImportOpen(false)}>取消</Button><Button disabled={importBusy || !importFile} onClick={() => void importSubnets()}>{importBusy ? '正在导入…' : '导入'}</Button></DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确定删除该网段？</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除网段 {deleting?.name}{deleting?.cidr ? `（${deleting.cidr}）` : ''}？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={event => {
              event.preventDefault()
              if (deleting) void deleteSubnet(deleting)
            }}
          >
            {busy ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </RoomTreeLayout>
  )
}
