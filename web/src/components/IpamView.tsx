import { useEffect, useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronRight, Download, Plus, RefreshCw, Star, X } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Progress } from './ui/progress'
import { Textarea } from './ui/textarea'
import { SearchableSelect } from './SearchableSelect'
import { Select } from './AppControls'
import { api, APIError } from '../api'
import { downloadCSV } from '../csv'
import type { Subnet, SubnetDetail, SubnetFields, VLAN } from '../api'

interface Props {
  editable: boolean
  openSubnetId: number | null
  onSubnetOpened: () => void
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

export function IpamView({ editable, openSubnetId, onSubnetOpened, bookmarkedSubnets, onToggleSubnetBookmark, onSessionError, onChanged }: Props) {
  const [subnets, setSubnets] = useState<Subnet[]>([])
  const [vlans, setVLANs] = useState<VLAN[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<SubnetDetail | null>(null)
  const [draft, setDraft] = useState<SubnetDraft | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [subnetSearch, setSubnetSearch] = useState('')
  const [subnetStatus, setSubnetStatus] = useState<string | undefined>()
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const selected = subnets.find(item => item.id === selectedId) ?? null
  const subnetTree = useMemo(() => buildSubnetTree(subnets), [subnets])
  const subnetRows = useMemo(() => flattenSubnetTree(subnetTree, collapsed), [subnetTree, collapsed])
  const visibleSubnetRows = useMemo(() => {
    const query = subnetSearch.trim().toLowerCase()
    return subnetRows
      .filter(row => !subnetStatus || row.subnet.status === subnetStatus)
      .filter(row => !query || [row.subnet.name, row.subnet.cidr, row.subnet.gateway, row.subnet.vlan,
        row.subnet.vlanName, row.subnet.role].some(value => value?.toLowerCase().includes(query)))
      .map(row => query || subnetStatus ? ({ ...row, depth: 0, children: 0 }) : row)
  }, [subnetRows, subnetSearch, subnetStatus])
  const utilization = detail && detail.usable > 0 ? Math.min(100, Math.round(detail.used / detail.usable * 100)) : 0
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
    void load(openSubnetId).then(() => onSubnetOpened())
  }, [openSubnetId])

  function report(e: unknown) {
    if (e instanceof APIError && e.status === 401) {
      onSessionError(e)
      return
    }
    setError(e instanceof Error ? e.message : '操作失败')
  }


  async function loadDetail(id: number | null) {
    if (!id) {
      setDetail(null)
      return
    }
    setDetail(await api<SubnetDetail>(`/subnets/${id}/addresses`))
  }

  async function load(preferredId?: number | null) {
    setLoading(true)
    setError('')
    try {
      const [nextSubnets, nextVLANs] = await Promise.all([
        api<Subnet[]>('/subnets'), api<VLAN[]>('/vlans'),
      ])
      setSubnets(nextSubnets)
      setVLANs(nextVLANs)
      const wanted = preferredId === undefined ? selectedId : preferredId
      const nextId = nextSubnets.some(item => item.id === wanted) ? wanted : (nextSubnets[0]?.id ?? null)
      setSelectedId(nextId)
      await loadDetail(nextId)
    } catch (e) {
      report(e)
    } finally {
      setLoading(false)
    }
  }

  async function selectSubnet(id: number) {
    if (id === selectedId) return
    setSelectedId(id)
    setDraft(null)
    setError('')
    setFeedback('')
    try {
      await loadDetail(id)
    } catch (e) {
      report(e)
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

  function addSubnet() {
    setDraft({ name: '', cidr: '', gateway: '', vlan: '', notes: '', status: 'active', role: '' })
    setFeedback('')
  }

  function editSubnet() {
    if (!selected) return
    setDraft({
      id: selected.id, version: selected.version, name: selected.name, cidr: selected.cidr,
      gateway: selected.gateway, vlan: selected.vlan, notes: selected.notes,
      status: selected.status, role: selected.role,
    })
  }

  async function saveSubnet() {
    if (!draft) return
    const wasEdit = !!draft.id
    setBusy(true)
    setError('')
    try {
      const body = {
        name: draft.name, cidr: draft.cidr, gateway: draft.gateway, vlan: draft.vlan,
        notes: draft.notes, status: draft.status, role: draft.role, version: draft.version ?? 0,
      }
      const saved = draft.id
        ? await api<Subnet>(`/subnets/${draft.id}`, 'PUT', body)
        : await api<Subnet>('/subnets', 'POST', body)
      setSelectedId(saved.id)
      setDraft(null)
      await load(saved.id)
      setFeedback(wasEdit ? '网段已更新' : '网段已创建')
      onChanged()
    } catch (e) {
      report(e)
    } finally {
      setBusy(false)
    }
  }

  async function deleteSubnet() {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      await api(`/subnets/${selected.id}?version=${selected.version}`, 'DELETE')
      setSelectedId(null)
      await load()
      setFeedback('网段已删除')
      onChanged()
    } catch (e) {
      report(e)
    } finally {
      setBusy(false)
    }
  }


  const selectBaseClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const selectClass = `${selectBaseClass} w-full`
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

  return <Card className="border-0 bg-transparent shadow-none"><div className="ipam-actions"><div className="flex gap-2"><Button variant="outline" disabled={!subnetRows.length} onClick={exportSubnets}><Download />导出 CSV</Button><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw />刷新</Button>{editable && <Button onClick={addSubnet}><Plus />新增网段</Button>}</div></div><CardContent>
    {error && <div role="alert" className="mb-4 flex justify-between rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {feedback && <div role="status" className="mb-4 flex justify-between rounded-md border border-success-border bg-success-soft p-3 text-sm text-success">{feedback}<button aria-label="关闭" onClick={() => setFeedback('')}>×</button></div>}
    {draft && <Card className="mb-4"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>{draft.id ? '编辑网段' : '新增网段'}</CardTitle><Button variant="ghost" size="icon" aria-label="关闭" onClick={() => setDraft(null)}><X /></Button></CardHeader><CardContent><form onSubmit={event => { event.preventDefault(); void saveSubnet() }}><div className="grid grid-cols-2 gap-3">
      <label className={labelClass}>网段名称<Input required value={draft.name} maxLength={160} placeholder="例如：办公网" onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className={labelClass}>CIDR<Input required value={draft.cidr} maxLength={64} placeholder="例如：192.0.2.0/24" onChange={event => setDraft({ ...draft, cidr: event.target.value })} /></label>
      <label className={labelClass}>状态<select className={selectClass} value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>{Object.entries(subnetStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
      <label className={labelClass}>用途 / 角色<Input value={draft.role} maxLength={80} placeholder="例如：办公、服务器、互联" onChange={event => setDraft({ ...draft, role: event.target.value })} /></label>
      <div className={labelClass}><span>VLAN</span><SearchableSelect label="VLAN" placeholder="可选" value={draft.vlan} onChange={value => setDraft({ ...draft, vlan: value })} options={vlanOptions} />{!vlans.length && <span className="text-xs font-normal text-muted-foreground">请先在「VLAN」页面登记 VLAN</span>}</div>
      <label className={labelClass}>网关<Input value={draft.gateway} maxLength={64} placeholder="例如：192.0.2.1" onChange={event => setDraft({ ...draft, gateway: event.target.value })} /></label>
      <label className={`${labelClass} col-span-2`}>备注<Textarea rows={2} maxLength={2000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
    </div><div className="mt-4 flex gap-2"><Button type="submit" disabled={busy}>保存网段</Button><Button type="button" variant="outline" onClick={() => setDraft(null)}>取消</Button></div></form></CardContent></Card>}
    {!subnets.length ? <div className="py-12 text-center text-muted-foreground">{loading ? '正在加载 IPAM 数据…' : '暂无网段，新增一个网段开始管理 IP 地址'}</div> : <>
      <div className="ipam-summary">
        <div className="ipam-summary-card"><span>网段数</span><strong>{subnets.length}</strong></div>
        <div className="ipam-summary-card"><span>地址总数</span><strong>{count(subnets.reduce((sum, item) => sum + item.usable, 0))}</strong></div>
        <div className="ipam-summary-card"><span>已分配</span><strong>{count(subnets.reduce((sum, item) => sum + item.used, 0))}</strong></div>
        <div className="ipam-summary-card"><span>空闲</span><strong>{count(subnets.reduce((sum, item) => sum + item.free, 0))}</strong></div>
      </div>
      <div className="ipam-subnet-toolbar">
        <Input className="max-w-sm" placeholder="搜索名称、CIDR、VLAN、用途" value={subnetSearch} onChange={event => setSubnetSearch(event.target.value)} />
        <Select
          style={{ width: 140 }} allowClear searchable={false} placeholder="全部状态" value={subnetStatus}
          onChange={(value: string | undefined) => setSubnetStatus(value ?? undefined)}
          options={Object.entries(subnetStatusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="facility-table ipam-subnet-table">
          <thead><tr><th>网段名称</th><th>CIDR</th><th>VLAN</th><th>网关</th><th>地址数</th><th>已用</th><th>空闲</th><th>利用率</th></tr></thead>
          <tbody>
            {visibleSubnetRows.length ? visibleSubnetRows.map(({ subnet: item, depth, children }) => {
              const total = item.usable
              const usedPct = total > 0 ? Math.min(100, Math.round(item.used / total * 100)) : 0
              return (
                <tr key={item.id} className={item.id === selectedId ? 'is-selected' : undefined} onClick={() => void selectSubnet(item.id)}>
                  <td style={{ paddingLeft: 12 + depth * 16 }}>
                    <span className="ipam-subnet-name">
                      {children > 0
                        ? <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`${collapsed.has(item.id) ? '展开' : '收起'} ${item.name} 的子网`} aria-expanded={!collapsed.has(item.id)} onClick={event => { event.stopPropagation(); toggleSubnet(item.id) }}>{collapsed.has(item.id) ? <ChevronRight /> : <ChevronDown />}</Button>
                        : <span className="w-6 shrink-0" />}
                      <strong>{item.name}</strong>
                      {children > 0 && <Badge variant="secondary">{children}</Badge>}
                    </span>
                  </td>
                  <td className="font-mono">{item.cidr}</td>
                  <td>{item.vlan ? (item.vlanName ? `${item.vlan} ${item.vlanName}` : item.vlan) : '—'}</td>
                  <td className="font-mono">{item.gateway || '—'}</td>
                  <td>{count(item.usable)}</td>
                  <td>{count(item.used)}</td>
                  <td>{count(item.free)}</td>
                  <td><span className="ipam-util"><Progress value={usedPct} aria-label={`${item.name} 地址使用率`} /><span>{usedPct}%</span></span></td>
                </tr>
              )
            }) : <tr><td colSpan={8} className="facility-table-empty">没有匹配的网段</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-6">{detail ? <><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{detail.name}</h2><div className="my-2 flex gap-1"><Badge variant="secondary">{subnetStatusMeta[detail.status]?.label ?? detail.status}</Badge>{detail.role && <Badge variant="outline">{detail.role}</Badge>}{detail.vlan && <Badge variant="outline">VLAN {detail.vlan}{detail.vlanName ? ` · ${detail.vlanName}` : ''}</Badge>}</div><p className="font-mono text-sm text-muted-foreground">{detail.cidr} · 网关 {detail.gateway || '—'}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onToggleSubnetBookmark(detail.id)}><Star className={bookmarkedSubnets.includes(detail.id) ? 'fill-current' : ''} />{bookmarkedSubnets.includes(detail.id) ? '已收藏' : '收藏'}</Button>{editable && <><Button variant="outline" size="sm" onClick={editSubnet}>编辑</Button><Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={() => setDeleting(true)}>删除</Button></>}</div></div>
      {detail.notes && <p className="mt-3 text-sm text-muted-foreground">{detail.notes}</p>}<div className="mt-4 grid grid-cols-3 gap-3">{[['可用地址', detail.usable], ['已占用', detail.used], ['空闲', detail.free]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><div className="text-sm text-muted-foreground">{label}</div><div className="text-xl font-semibold">{value}</div></div>)}</div><div className="mt-2 flex items-center gap-2"><Progress aria-label="地址使用率" value={utilization} /><span className="text-xs text-muted-foreground">{utilization}%</span></div>
      </> : <div className="py-12 text-center text-muted-foreground">选择上方网段查看地址</div>}</div></>}
  </CardContent><Dialog open={deleting} onOpenChange={next => { if (!busy) setDeleting(next) }}><DialogContent><DialogHeader><DialogTitle>确定删除该网段？</DialogTitle><DialogDescription>确认删除 {selected?.name}。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(false)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { setDeleting(false); void deleteSubnet() }}>删除</Button></DialogFooter></DialogContent></Dialog>
  </Card>
}
