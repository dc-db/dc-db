import { useEffect, useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Plus, RefreshCw, Star, X } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Progress } from './ui/progress'
import { Textarea } from './ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { SearchableSelect } from './SearchableSelect'
import { api, APIError } from '../api'
import { downloadCSV } from '../csv'
import type { Allocation, Asset, AvailableIPs, IPUsage, Subnet, SubnetDetail, SubnetFields, VLAN } from '../api'

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
const allocationStateMeta: Record<string, { label: string; color: string }> = {
  active: { label: '启用', color: 'green' },
  reserved: { label: '预留', color: 'orange' },
  deprecated: { label: '停用', color: 'default' },
  dhcp: { label: 'DHCP', color: 'blue' },
  slaac: { label: 'SLAAC', color: 'default' },
}
const sourceMeta: Record<string, { label: string; color: string }> = {
  gateway: { label: '网关', color: 'orange' },
  asset: { label: '资产地址', color: 'default' },
  allocated: { label: '手工分配', color: 'blue' },
}
const roleLabels: Record<string, string> = {
  loopback: '环回', secondary: '辅助', vip: 'VIP', vrrp: 'VRRP',
  hsrp: 'HSRP', glbp: 'GLBP', anycast: 'Anycast',
}
function sourceLabel(source: string) {
  return sourceMeta[source]?.label ?? source
}
function stateLabel(state: string) {
  return allocationStateMeta[state]?.label ?? state
}
function count(value: number) {
  return value.toLocaleString('zh-CN')
}
function assetLabel(asset: Asset) {
  return `${asset.name}（${asset.kind === 'vm' ? '虚拟机' : asset.kind === 'switch' ? '交换机' : '物理机'}）`
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
  const [assets, setAssets] = useState<Asset[]>([])
  const [vlans, setVLANs] = useState<VLAN[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<SubnetDetail | null>(null)
  const [draft, setDraft] = useState<SubnetDraft | null>(null)
  const [allocation, setAllocation] = useState({ ip: '', assetId: 0, label: '', notes: '', status: 'active', dnsName: '', role: '' })
  const [editingAllocation, setEditingAllocation] = useState<IPUsage | null>(null)
  const [allocationError, setAllocationError] = useState('')
  const [editFields, setEditFields] = useState({ assetId: 0, label: '', notes: '', status: 'active', dnsName: '', role: '' })
  const [releasing, setReleasing] = useState<IPUsage | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [subnetSearch, setSubnetSearch] = useState('')
  const [subnetStatus, setSubnetStatus] = useState<string | undefined>()
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [freeItems, setFreeItems] = useState<string[]>([])
  const [freeTotal, setFreeTotal] = useState(0)
  const [freePage, setFreePage] = useState(1)
  const [freePageSize, setFreePageSize] = useState(10)
  const [freeLoading, setFreeLoading] = useState(false)
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
  const usage = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = detail?.usedIps ?? []
    if (!query) return rows
    return rows.filter(row => [row.ip, row.assetName, row.label, row.notes, row.dnsName, row.role,
      sourceLabel(row.source), stateLabel(row.state)]
      .some(value => value?.toLowerCase().includes(query)))
  }, [detail, search])
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

  async function loadFree(id: number, page: number, size: number) {
    setFreeLoading(true)
    try {
      const result = await api<AvailableIPs>(`/subnets/${id}/available-ips?offset=${(page - 1) * size}&limit=${size}`)
      setFreeItems(result.items)
      setFreeTotal(result.total)
    } catch (e) {
      report(e)
    } finally {
      setFreeLoading(false)
    }
  }

  async function loadDetail(id: number | null) {
    if (!id) {
      setDetail(null)
      setFreeItems([])
      setFreeTotal(0)
      return
    }
    const next = await api<SubnetDetail>(`/subnets/${id}/addresses`)
    setDetail(next)
    setFreePage(1)
    await loadFree(next.id, 1, freePageSize)
  }

  async function load(preferredId?: number | null) {
    setLoading(true)
    setError('')
    try {
      const [nextSubnets, nextAssets, nextVLANs] = await Promise.all([
        api<Subnet[]>('/subnets'), api<Asset[]>('/assets'), api<VLAN[]>('/vlans'),
      ])
      setSubnets(nextSubnets)
      setAssets(nextAssets)
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

  function changeFreePage(page: number, size: number) {
    if (!detail) return
    const nextSize = size || freePageSize
    const nextPage = nextSize !== freePageSize ? 1 : page
    setFreePage(nextPage)
    setFreePageSize(nextSize)
    void loadFree(detail.id, nextPage, nextSize)
  }

  function chooseFreeIP(ip: string) {
    setAllocation({ ...allocation, ip })
    document.getElementById('allocate-ip-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

  async function allocate() {
    if (!detail) return
    if (!allocation.ip.trim()) {
      setError('请填写要分配的 IP 地址')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api(`/subnets/${detail.id}/allocations`, 'POST', {
        ip: allocation.ip.trim(), assetId: allocation.assetId || 0,
        label: allocation.label.trim(), notes: allocation.notes.trim(),
        status: allocation.status, dnsName: allocation.dnsName.trim(), role: allocation.role,
      })
      setAllocation({ ip: '', assetId: 0, label: '', notes: '', status: 'active', dnsName: '', role: '' })
      await load()
      setFeedback('IP 已分配')
      onChanged()
    } catch (e) {
      report(e)
    } finally {
      setBusy(false)
    }
  }

  function editAllocation(row: IPUsage) {
    setEditingAllocation(row)
    setError('')
    setAllocationError('')
    setEditFields({
      status: row.state, dnsName: row.dnsName ?? '', role: row.role ?? '',
      assetId: row.assetId || 0, label: row.label ?? '', notes: row.notes ?? '',
    })
  }

  async function updateAllocation() {
    if (!editingAllocation?.allocationId) return
    const values = editFields
    setBusy(true)
    setAllocationError('')
    try {
      await api<Allocation>(`/allocations/${editingAllocation.allocationId}`, 'PUT', {
        ip: editingAllocation.ip,
        assetId: values.assetId ?? 0,
        label: values.label ?? '',
        notes: values.notes ?? '',
        status: values.status,
        dnsName: values.dnsName ?? '',
        role: values.role ?? '',
        version: editingAllocation.version ?? 0,
      })
      setEditingAllocation(null)
      await load()
      setFeedback('IP 地址记录已更新')
      onChanged()
    } catch (e) {
      if (e instanceof APIError && e.status === 401) onSessionError(e)
      else setAllocationError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function release(row: IPUsage) {
    if (!row.allocationId || !row.version) return
    setBusy(true)
    setError('')
    try {
      await api(`/allocations/${row.allocationId}?version=${row.version}`, 'DELETE')
      setReleasing(null)
      await load()
      setFeedback('IP 已释放')
      onChanged()
    } catch (e) {
      setReleasing(null)
      report(e)
    } finally {
      setBusy(false)
    }
  }

  const usageColumns: ColumnDef<IPUsage>[] = [
    { accessorKey: 'ip', header: 'IP 地址', cell: ({ row }) => <span className="font-mono">{row.original.ip}</span> },
    { accessorKey: 'source', header: '来源', cell: ({ row }) => <Badge variant="secondary">{sourceLabel(row.original.source)}</Badge> },
    { accessorKey: 'state', header: '状态', cell: ({ row }) => <Badge variant="outline">{stateLabel(row.original.state)}</Badge> },
    { accessorKey: 'dnsName', header: 'DNS 名称', cell: ({ row }) => <span className="font-mono">{row.original.dnsName || '—'}</span> },
    { id: 'owner', header: '资产 / 标签', cell: ({ row }) => <span>{row.original.assetName || row.original.label || '—'}{row.original.assetName && row.original.label && <span className="text-muted-foreground"> / {row.original.label}</span>}</span> },
    { accessorKey: 'role', header: '角色', cell: ({ row }) => roleLabels[row.original.role ?? ''] ?? (row.original.role || '—') },
    { accessorKey: 'notes', header: '备注', cell: ({ row }) => row.original.notes || '—' },
    ...(editable ? [{ id: 'actions', header: '操作', cell: ({ row }: { row: { original: IPUsage } }) => row.original.source === 'allocated' ? <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => editAllocation(row.original)}>编辑</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => setReleasing(row.original)}>释放</Button></div> : null }] : []),
  ]
  const freeColumns: ColumnDef<string>[] = [
    { id: 'ip', header: '空闲 IP', cell: ({ row }) => <span className="font-mono">{row.original}</span> },
    ...(editable ? [{ id: 'actions', header: '操作', cell: ({ row }: { row: { original: string } }) => <Button variant="link" size="sm" onClick={() => chooseFreeIP(row.original)}>分配此地址</Button> }] : []),
  ]
  const usageTable = useReactTable({ data: usage, columns: usageColumns, getCoreRowModel: getCoreRowModel() })
  const freeTable = useReactTable({ data: freeItems, columns: freeColumns, getCoreRowModel: getCoreRowModel(), manualPagination: true })
  const selectBaseClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const selectClass = `${selectBaseClass} w-full`
  const labelClass = 'space-y-2 text-sm font-medium'
  function renderAllocationFields(values: typeof editFields, update: (next: typeof editFields) => void) {
    return <>
      <div className={labelClass}><span>关联资产</span><SearchableSelect label="关联资产" placeholder="不关联资产" value={values.assetId ? String(values.assetId) : ''} onChange={value => update({ ...values, assetId: Number(value) || 0 })} options={assets.map(asset => ({ value: String(asset.id), label: assetLabel(asset) }))} /></div>
      <label className={labelClass}>状态<select className={selectClass} value={values.status} onChange={event => update({ ...values, status: event.target.value })}>{Object.entries(allocationStateMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
      <label className={labelClass}>角色<select className={selectClass} value={values.role} onChange={event => update({ ...values, role: event.target.value })}><option value="">可选</option>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={labelClass}>DNS 名称<Input className="font-mono" maxLength={255} placeholder="例如：db-01.example.test" value={values.dnsName} onChange={event => update({ ...values, dnsName: event.target.value })} /></label>
      <label className={labelClass}>标签 / 用途<Input maxLength={160} placeholder="例如：VIP" value={values.label} onChange={event => update({ ...values, label: event.target.value })} /></label>
      <label className={`${labelClass} col-span-2`}>备注<Textarea rows={2} maxLength={2000} value={values.notes} onChange={event => update({ ...values, notes: event.target.value })} /></label>
    </>
  }
  function renderTable<T>(table: ReturnType<typeof useReactTable<T>>, empty: string) {
    return <Table><TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={table.getAllColumns().length} className="py-8 text-center text-muted-foreground">{empty}</TableCell></TableRow>}</TableBody></Table>
  }
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
    {!subnets.length ? <div className="py-12 text-center text-muted-foreground">{loading ? '正在加载 IPAM 数据…' : '暂无网段，新增一个网段开始管理 IP 地址'}</div> : <div className="grid grid-cols-[minmax(280px,340px)_minmax(0,1fr)] gap-5">
      <div className="space-y-3"><Input placeholder="搜索名称、CIDR、VLAN、用途" value={subnetSearch} onChange={event => setSubnetSearch(event.target.value)} /><select aria-label="筛选网段状态" className={selectClass} value={subnetStatus ?? ''} onChange={event => setSubnetStatus(event.target.value || undefined)}><option value="">全部状态</option>{Object.entries(subnetStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select>
        <div className="max-h-[700px] space-y-1 overflow-y-auto">{visibleSubnetRows.length ? visibleSubnetRows.map(({ subnet: item, depth, children }) => <div key={item.id} className={`flex items-start gap-1 rounded-md border p-3 ${item.id === selectedId ? 'border-info bg-info-soft' : 'border-transparent hover:bg-accent/50'}`} style={{ paddingLeft: 12 + depth * 16 }}>
          {children > 0 ? <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`${collapsed.has(item.id) ? '展开' : '收起'} ${item.name} 的子网`} aria-expanded={!collapsed.has(item.id)} onClick={() => toggleSubnet(item.id)}>{collapsed.has(item.id) ? <ChevronRight /> : <ChevronDown />}</Button> : <span className="w-6 shrink-0" />}
          <div className="min-w-0 flex-1"><button type="button" className="w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-current={item.id === selectedId ? 'true' : undefined} onClick={() => void selectSubnet(item.id)}><span className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1"><strong>{item.name}</strong>{children > 0 && <Badge variant="secondary">{children}</Badge>}</span><Badge variant="outline" className="font-mono">{item.cidr}</Badge></span><span className="mt-1 block text-xs text-muted-foreground">{subnetStatusMeta[item.status]?.label ?? item.status}{item.role ? ` · ${item.role}` : ''} · VLAN {item.vlan ? (item.vlanName ? `${item.vlan} ${item.vlanName}` : item.vlan) : '—'} · 已用 {count(item.used)} / {count(item.usable)} · 空闲 {count(item.free)}</span></button><Progress aria-label={`${item.name} 地址使用率`} className="mt-2" value={item.usable > 0 ? Math.min(100, Math.round(item.used / item.usable * 100)) : 0} /></div>
        </div>) : <p className="py-8 text-center text-sm text-muted-foreground">没有匹配的网段</p>}</div></div>
      <div className="min-w-0">{detail ? <><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{detail.name}</h2><div className="my-2 flex gap-1"><Badge variant="secondary">{subnetStatusMeta[detail.status]?.label ?? detail.status}</Badge>{detail.role && <Badge variant="outline">{detail.role}</Badge>}{detail.vlan && <Badge variant="outline">VLAN {detail.vlan}{detail.vlanName ? ` · ${detail.vlanName}` : ''}</Badge>}</div><p className="font-mono text-sm text-muted-foreground">{detail.cidr} · 网关 {detail.gateway || '—'}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onToggleSubnetBookmark(detail.id)}><Star className={bookmarkedSubnets.includes(detail.id) ? 'fill-current' : ''} />{bookmarkedSubnets.includes(detail.id) ? '已收藏' : '收藏'}</Button>{editable && <><Button variant="outline" size="sm" onClick={editSubnet}>编辑</Button><Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={() => setDeleting(true)}>删除</Button></>}</div></div>
      {detail.notes && <p className="mt-3 text-sm text-muted-foreground">{detail.notes}</p>}<div className="mt-4 grid grid-cols-3 gap-3">{[['可用地址', detail.usable], ['已占用', detail.used], ['空闲', detail.free]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><div className="text-sm text-muted-foreground">{label}</div><div className="text-xl font-semibold">{value}</div></div>)}</div><div className="mt-2 flex items-center gap-2"><Progress aria-label="地址使用率" value={utilization} /><span className="text-xs text-muted-foreground">{utilization}%</span></div>
      {editable && <Card id="allocate-ip-card" className="mt-4"><CardHeader><CardTitle>分配 IP</CardTitle></CardHeader><CardContent><form onSubmit={event => { event.preventDefault(); void allocate() }}><div className="grid grid-cols-2 gap-3"><label className={labelClass}>IP 地址<Input value={allocation.ip} maxLength={64} placeholder="例如：192.0.2.20" onChange={event => setAllocation({ ...allocation, ip: event.target.value })} /></label>{renderAllocationFields(allocation, next => setAllocation({ ...allocation, ...next }))}</div><div className="mt-4 flex gap-2"><Button type="submit" disabled={busy}>分配</Button><Button type="button" variant="outline" disabled={!detail.freeIps.length} onClick={() => setAllocation({ ...allocation, ip: detail.freeIps[0] ?? '' })}>使用下一个空闲 IP</Button></div></form></CardContent></Card>}
      <div className="mt-6 flex items-center justify-between gap-3"><h3 className="font-semibold">已占用 IP</h3><Input className="max-w-xs" placeholder="搜索 IP、DNS、资产、角色或标签" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="mt-2 max-h-[300px] overflow-auto">{renderTable(usageTable, '没有匹配的已占用 IP')}</div>
      <div className="mt-6 flex items-center justify-between gap-3"><h3 className="font-semibold">空闲 IP</h3><span className="text-sm text-muted-foreground">共 {count(freeTotal)} 个 · 分页浏览，点击“分配此地址”填入上方表单</span></div><div className="mt-2">{freeLoading ? <p className="py-8 text-center text-sm text-muted-foreground">正在加载空闲 IP…</p> : renderTable(freeTable, detail.free ? '没有可显示的空闲 IP' : '该网段已无空闲 IP')}</div><div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm"><span className="whitespace-nowrap text-muted-foreground">共 {count(freeTotal)} 个空闲地址</span><label className="flex items-center gap-2 whitespace-nowrap text-muted-foreground">每页<select aria-label="每页空闲地址数量" className={`${selectBaseClass} w-20 shrink-0`} value={freePageSize} onChange={event => changeFreePage(1, Number(event.target.value))}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select>条</label><span className="whitespace-nowrap text-muted-foreground">第 {freePage} / {Math.max(1, Math.ceil(freeTotal / freePageSize))} 页</span><div className="flex items-center gap-1"><Button variant="outline" size="icon-sm" aria-label="第一页" disabled={freeLoading || freePage <= 1} onClick={() => changeFreePage(1, freePageSize)}><ChevronsLeft /></Button><Button variant="outline" size="icon-sm" aria-label="上一页" disabled={freeLoading || freePage <= 1} onClick={() => changeFreePage(freePage - 1, freePageSize)}><ChevronLeft /></Button><Button variant="outline" size="icon-sm" aria-label="下一页" disabled={freeLoading || freePage * freePageSize >= freeTotal} onClick={() => changeFreePage(freePage + 1, freePageSize)}><ChevronRight /></Button><Button variant="outline" size="icon-sm" aria-label="最后一页" disabled={freeLoading || freePage * freePageSize >= freeTotal} onClick={() => changeFreePage(Math.max(1, Math.ceil(freeTotal / freePageSize)), freePageSize)}><ChevronsRight /></Button></div></div>
      </> : <div className="py-12 text-center text-muted-foreground">选择左侧网段查看地址</div>}</div></div>}
  </CardContent><Dialog open={!!editingAllocation} onOpenChange={next => { if (!next && !busy) { setEditingAllocation(null); setAllocationError('') } }}><DialogContent className="sm:max-w-[560px]"><DialogHeader><DialogTitle>编辑 {editingAllocation?.ip}</DialogTitle></DialogHeader>{allocationError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{allocationError}</div>}<form onSubmit={event => { event.preventDefault(); void updateAllocation() }}><div className="grid grid-cols-2 gap-3">{renderAllocationFields(editFields, setEditFields)}</div><DialogFooter className="mt-4"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditingAllocation(null)}>取消</Button><Button type="submit" disabled={busy}>保存</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={deleting} onOpenChange={next => { if (!busy) setDeleting(next) }}><DialogContent><DialogHeader><DialogTitle>确定删除该网段？</DialogTitle><DialogDescription>确认删除 {selected?.name}。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(false)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { setDeleting(false); void deleteSubnet() }}>删除</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!releasing} onOpenChange={next => { if (!next && !busy) setReleasing(null) }}><DialogContent><DialogHeader><DialogTitle>释放该 IP？</DialogTitle><DialogDescription>确认释放 {releasing?.ip}。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReleasing(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { if (releasing) void release(releasing) }}>释放</Button></DialogFooter></DialogContent></Dialog>
  </Card>
}
