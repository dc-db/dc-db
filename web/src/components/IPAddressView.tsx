import { useEffect, useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api, APIError } from '../api'
import type { Asset, IPAddress, Subnet } from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { SearchableSelect } from './SearchableSelect'

interface Props { editable: boolean; assets: Asset[]; subnets: Subnet[]; onOpenAsset: (id: number) => void; onOpenSubnet: (id: number) => void; onSessionError: (error: unknown) => void; onChanged: () => void }
const stateMeta: Record<string, string> = { active: '启用', reserved: '预留', deprecated: '停用', dhcp: 'DHCP', slaac: 'SLAAC' }
const sourceMeta: Record<string, string> = { allocated: '手工分配', asset: '资产地址', gateway: '网关' }
const roleLabels: Record<string, string> = { loopback: '环回', secondary: '辅助', vip: 'VIP', vrrp: 'VRRP', hsrp: 'HSRP', glbp: 'GLBP', anycast: 'Anycast' }
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'
interface AddressFields { subnetId?: number; ip: string; status: string; dnsName: string; role: string; assetId?: number; label: string; notes: string }
const emptyFields: AddressFields = { ip: '', status: 'active', dnsName: '', role: '', label: '', notes: '' }
const assetLabel = (asset: Asset) => `${asset.name}（${asset.kind === 'vm' ? '虚拟机' : asset.kind === 'switch' ? '交换机' : '物理机'}）`

export function IPAddressView({ editable, assets, subnets, onOpenAsset, onOpenSubnet, onSessionError, onChanged }: Props) {
  const [addresses, setAddresses] = useState<IPAddress[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState('')
  const [state, setState] = useState('')
  const [subnetId, setSubnetId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IPAddress | null>(null)
  const [releasing, setReleasing] = useState<IPAddress | null>(null)
  const [fields, setFields] = useState<AddressFields>(emptyFields)
  useEffect(() => { void load() }, [])
  function report(e: unknown) { if (e instanceof APIError && e.status === 401) { onSessionError(e); return }; setError(e instanceof Error ? e.message : '操作失败') }
  async function load() { setLoading(true); setError(''); try { setAddresses(await api<IPAddress[]>('/ip-addresses')) } catch (e) { report(e) } finally { setLoading(false) } }
  function showForm(address: IPAddress | null) {
    setEditing(address); setError(''); setModalError(''); setFeedback('')
    setFields(address ? { subnetId: address.subnetId, ip: address.ip, status: address.state, dnsName: address.dnsName ?? '', role: address.role ?? '', assetId: address.assetId || undefined, label: address.label ?? '', notes: address.notes ?? '' } : emptyFields)
    setModalOpen(true)
  }
  async function save() {
    if (!editing && (!fields.subnetId || !fields.ip.trim())) { setModalError('请选择网段并填写 IP 地址'); return }
    setBusy(true); setModalError('')
    try {
      const body = { assetId: fields.assetId ?? 0, label: fields.label, notes: fields.notes, status: fields.status, dnsName: fields.dnsName, role: fields.role }
      if (editing?.allocationId) await api(`/allocations/${editing.allocationId}`, 'PUT', { ...body, version: editing.version ?? 0 })
      else await api(`/subnets/${fields.subnetId}/allocations`, 'POST', { ...body, ip: fields.ip.trim() })
      const wasEdit = !!editing
      setModalOpen(false); setEditing(null); await load(); setFeedback(wasEdit ? 'IP 地址记录已更新' : 'IP 地址已分配'); onChanged()
    } catch (e) { if (e instanceof APIError && e.status === 401) onSessionError(e); else setModalError(e instanceof Error ? e.message : '保存失败') } finally { setBusy(false) }
  }
  async function release(address: IPAddress) {
    if (!address.allocationId) return
    setBusy(true); setError('')
    try { await api(`/allocations/${address.allocationId}?version=${address.version ?? 0}`, 'DELETE'); setReleasing(null); await load(); setFeedback('IP 地址已释放'); onChanged() }
    catch (e) { setReleasing(null); report(e) } finally { setBusy(false) }
  }
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return addresses.filter(address => (!source || address.source === source) && (!state || address.state === state) && (!subnetId || address.subnetId === Number(subnetId)) && (!query || [address.ip, address.dnsName, address.assetName, address.label, address.notes, address.subnetName, stateMeta[address.state], sourceMeta[address.source]].some(value => value?.toLowerCase().includes(query))))
  }, [addresses, keyword, source, state, subnetId])
  const stats = [['全部地址', addresses.length], ['手工分配', addresses.filter(a => a.source === 'allocated').length], ['资产地址', addresses.filter(a => a.source === 'asset').length], ['网关', addresses.filter(a => a.source === 'gateway').length]] as const
  const columns: ColumnDef<IPAddress>[] = [
    { accessorKey: 'ip', header: 'IP 地址', cell: ({ row }) => <span className="font-mono">{row.original.ip}</span> },
    { accessorKey: 'state', header: '状态', cell: ({ row }) => <Badge variant="outline">{stateMeta[row.original.state] ?? row.original.state}</Badge> },
    { accessorKey: 'source', header: '来源', cell: ({ row }) => <Badge variant="secondary">{sourceMeta[row.original.source] ?? row.original.source}</Badge> },
    { accessorKey: 'dnsName', header: 'DNS 名称', cell: ({ row }) => <span className="font-mono">{row.original.dnsName || '—'}</span> },
    { accessorKey: 'role', header: '角色', cell: ({ row }) => roleLabels[row.original.role ?? ''] ?? (row.original.role || '—') },
    { id: 'owner', header: '资产 / 用途', cell: ({ row }) => <span>{row.original.assetId && row.original.assetName ? <Button variant="link" className="h-auto p-0" onClick={() => onOpenAsset(row.original.assetId!)}>{row.original.assetName}</Button> : row.original.label || '—'}{row.original.assetId && row.original.label && <span className="text-muted-foreground"> / {row.original.label}</span>}</span> },
    { id: 'subnet', header: '网段', cell: ({ row }) => <Button variant="link" className="h-auto p-0" onClick={() => onOpenSubnet(row.original.subnetId)}>{row.original.subnetName}</Button> },
    { accessorKey: 'notes', header: '备注', cell: ({ row }) => row.original.notes || '—' },
    ...(editable ? [{ id: 'actions', header: '操作', cell: ({ row }: { row: { original: IPAddress } }) => row.original.allocationId ? <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => showForm(row.original)}><Pencil />编辑</Button><Button variant="ghost" size="icon" className="text-destructive" aria-label={`释放 ${row.original.ip}`} onClick={() => setReleasing(row.original)}><Trash2 /></Button></div> : '—' }] : []),
  ]
  const table = useReactTable({ data: visible, columns, initialState: { pagination: { pageIndex: 0, pageSize: 20 } }, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() })
  return <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle className="flex items-center gap-2">IP 地址 <Badge variant="secondary">{addresses.length} 条记录</Badge></CardTitle><div className="flex gap-2"><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw />刷新</Button>{editable && <Button onClick={() => showForm(null)}><Plus />分配 IP</Button>}</div></CardHeader><CardContent>
    {error && <div role="alert" className="mb-4 flex justify-between rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {feedback && <div role="status" className="mb-4 flex justify-between rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400">{feedback}<button aria-label="关闭" onClick={() => setFeedback('')}>×</button></div>}
    <div className="mb-4 grid grid-cols-4 gap-3">{stats.map(([label, value]) => <div key={label} className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>)}</div>
    <div className="mb-4 flex items-center gap-3"><Input className="max-w-sm" placeholder="搜索 IP、DNS、资产、用途或网段" value={keyword} onChange={event => setKeyword(event.target.value)} /><select aria-label="筛选网段" className={`${selectClass} max-w-44`} value={subnetId} onChange={event => setSubnetId(event.target.value)}><option value="">全部网段</option>{subnets.map(subnet => <option key={subnet.id} value={subnet.id}>{subnet.name} · {subnet.cidr}</option>)}</select><select aria-label="筛选来源" className={`${selectClass} max-w-32`} value={source} onChange={event => setSource(event.target.value)}><option value="">全部来源</option>{Object.entries(sourceMeta).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="筛选状态" className={`${selectClass} max-w-32`} value={state} onChange={event => setState(event.target.value)}><option value="">全部状态</option>{Object.entries(stateMeta).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="text-sm text-muted-foreground">共 {visible.length} 条</span></div>
    <div className="overflow-x-auto"><Table><TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={columns.length}>加载中...</TableCell></TableRow> : table.getRowModel().rows.length ? table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">暂无匹配的 IP 地址</TableCell></TableRow>}</TableBody></Table></div>
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-sm"><span className="text-muted-foreground">共 {visible.length} 条</span><label className="flex items-center gap-2 whitespace-nowrap text-muted-foreground">每页<select aria-label="每页条数" className={`${selectClass} w-20`} value={table.getState().pagination.pageSize} onChange={event => table.setPageSize(Number(event.target.value))}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select>条</label><span className="whitespace-nowrap text-muted-foreground">第 {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())} 页</span><div className="flex items-center gap-1"><Button variant="outline" size="icon-sm" aria-label="第一页" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}><ChevronsLeft /></Button><Button variant="outline" size="icon-sm" aria-label="上一页" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft /></Button><Button variant="outline" size="icon-sm" aria-label="下一页" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight /></Button><Button variant="outline" size="icon-sm" aria-label="最后一页" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(Math.max(0, table.getPageCount() - 1))}><ChevronsRight /></Button></div></div>
  </CardContent><Dialog open={modalOpen} onOpenChange={next => { if (!busy) { setModalOpen(next); if (!next) setEditing(null) } }}><DialogContent className="sm:max-w-[600px]"><DialogHeader><DialogTitle>{editing ? `编辑 ${editing.ip}` : '分配 IP 地址'}</DialogTitle></DialogHeader>
    {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}><div className="grid grid-cols-2 gap-3">
      <div className="space-y-2"><span className="text-sm font-medium">网段</span><SearchableSelect label="网段" placeholder="选择网段" allowClear={false} disabled={!!editing} value={fields.subnetId ? String(fields.subnetId) : ''} onChange={value => setFields({ ...fields, subnetId: Number(value) || undefined })} options={subnets.map(subnet => ({ value: String(subnet.id), label: `${subnet.name} · ${subnet.cidr}` }))} /></div>
      <div className="space-y-2"><label htmlFor="address-ip" className="text-sm font-medium">IP 地址</label><Input id="address-ip" required disabled={!!editing} maxLength={64} className="font-mono" placeholder="例如：192.0.2.20" value={fields.ip} onChange={event => setFields({ ...fields, ip: event.target.value })} /></div>
      <div className="space-y-2"><label htmlFor="address-state" className="text-sm font-medium">状态</label><select id="address-state" className={selectClass} value={fields.status} onChange={event => setFields({ ...fields, status: event.target.value })}>{Object.entries(stateMeta).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="address-role" className="text-sm font-medium">角色</label><select id="address-role" className={selectClass} value={fields.role} onChange={event => setFields({ ...fields, role: event.target.value })}><option value="">可选</option>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="address-dns" className="text-sm font-medium">DNS 名称</label><Input id="address-dns" className="font-mono" maxLength={255} placeholder="例如：db-01.example.test" value={fields.dnsName} onChange={event => setFields({ ...fields, dnsName: event.target.value })} /></div>
      <div className="space-y-2"><span className="text-sm font-medium">关联资产</span><SearchableSelect label="关联资产" placeholder="可选" value={fields.assetId ? String(fields.assetId) : ''} onChange={value => setFields({ ...fields, assetId: Number(value) || undefined })} options={assets.map(asset => ({ value: String(asset.id), label: assetLabel(asset) }))} /></div>
      <div className="col-span-2 space-y-2"><label htmlFor="address-label" className="text-sm font-medium">用途 / 标签</label><Input id="address-label" maxLength={160} placeholder="例如：VIP、数据库主地址" value={fields.label} onChange={event => setFields({ ...fields, label: event.target.value })} /></div>
      <div className="col-span-2 space-y-2"><label htmlFor="address-notes" className="text-sm font-medium">备注</label><Textarea id="address-notes" rows={2} maxLength={2000} placeholder="可选" value={fields.notes} onChange={event => setFields({ ...fields, notes: event.target.value })} /></div>
    </div><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setModalOpen(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中...' : '保存'}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={!!releasing} onOpenChange={next => { if (!next && !busy) setReleasing(null) }}><DialogContent><DialogHeader><DialogTitle>释放该 IP？</DialogTitle><DialogDescription>确认释放 {releasing?.ip}。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReleasing(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { if (releasing) void release(releasing) }}>释放</Button></DialogFooter></DialogContent></Dialog>
  </Card>
}
