import { OptionSelect } from './OptionSelect'
import { useEffect, useMemo, useState } from 'react'
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { Plus, RefreshCw, Upload } from 'lucide-react'
import { api, APIError } from '../api'
import { downloadCSV } from '../csv'
import type { Asset, IPAddress, Link, Subnet } from '../api'
import { assetLocations, assetRoomId, buildRoomCounts, matchesRoomFilter } from '../facilities'
import type { Facilities } from '../facilities'
import { kindLabel } from '../kinds'
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { SearchableSelect } from './SearchableSelect'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { RoomTreeLayout, type RoomFilter } from './RoomTreeLayout'
import { Select } from './AppControls'

interface Props {
  editable: boolean
  hideTitle?: boolean
  initialSubnetId?: number | null
  onInitialSubnetConsumed?: () => void
  assets: Asset[]
  links: Link[]
  facilities: Facilities
  roomFilter: RoomFilter
  onRoomFilterChange: (next: RoomFilter) => void
  subnets: Subnet[]
  onOpenAsset: (id: number) => void
  onOpenSubnet: (id: number) => void
  onSessionError: (error: unknown) => void
  onChanged: () => void
}
const stateMeta: Record<string, string> = { active: '启用', reserved: '预留', deprecated: '停用', dhcp: 'DHCP', slaac: 'SLAAC' }
const stateBadgeClass: Record<string, string> = {
  active: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-success before:content-[""]',
  reserved: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-warning before:content-[""]',
  deprecated: 'border-border bg-muted/60 text-muted-foreground',
  dhcp: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-foreground before:content-[""]',
  slaac: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-foreground before:content-[""]',
}
const sourceMeta: Record<string, string> = { allocated: '手工分配', asset: '资产地址', gateway: '网关' }
const roleLabels: Record<string, string> = { loopback: '环回', secondary: '辅助', vip: 'VIP', vrrp: 'VRRP', hsrp: 'HSRP', glbp: 'GLBP', anycast: 'Anycast' }
interface AddressFields { subnetId?: number; ip: string; status: string; dnsName: string; role: string; assetId?: number; label: string; notes: string }
const emptyFields: AddressFields = { ip: '', status: 'active', dnsName: '', role: '', label: '', notes: '' }
const assetLabel = (asset: Asset) => `${asset.name}（${kindLabel(asset.kind)}）`

export function IPAddressView({ editable, hideTitle, initialSubnetId, onInitialSubnetConsumed, assets, links, facilities, roomFilter, onRoomFilterChange, subnets, onOpenAsset, onOpenSubnet, onSessionError, onChanged }: Props) {
  const [addresses, setAddresses] = useState<IPAddress[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [state, setState] = useState('')
  const [subnetId, setSubnetId] = useState(() => (initialSubnetId ? String(initialSubnetId) : ''))
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IPAddress | null>(null)
  const [releasing, setReleasing] = useState<IPAddress | null>(null)
  const [fields, setFields] = useState<AddressFields>(emptyFields)
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (initialSubnetId) {
      setSubnetId(String(initialSubnetId))
      onInitialSubnetConsumed?.()
    }
  }, [initialSubnetId, onInitialSubnetConsumed])
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
  const subnetById = useMemo(() => new Map(subnets.map(item => [item.id, item])), [subnets])
  const assetById = useMemo(() => new Map(assets.map(item => [item.id, item])), [assets])
  const locations = useMemo(() => assetLocations(facilities, links), [facilities, links])
  const resolveAddressRoomId = useMemo(
    () => (address: IPAddress): number | null => {
      if (address.assetId) {
        const asset = assetById.get(address.assetId)
        const rid = asset ? assetRoomId(asset, locations, assetById, links) : null
        if (rid) return rid
      }
      return subnetById.get(address.subnetId)?.roomId || null
    },
    [assetById, links, locations, subnetById],
  )
  const roomCounts = useMemo(
    () => buildRoomCounts(addresses, resolveAddressRoomId),
    [addresses, resolveAddressRoomId],
  )
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return addresses.filter(address => matchesRoomFilter(resolveAddressRoomId(address), roomFilter) && (!source || address.source === source) && (!state || address.state === state) && (!subnetId || address.subnetId === Number(subnetId)) && (!query || [address.ip, address.dnsName, address.assetName, address.label, address.notes, address.subnetName, stateMeta[address.state], sourceMeta[address.source]].some(value => value?.toLowerCase().includes(query))))
  }, [addresses, keyword, resolveAddressRoomId, roomFilter, source, state, subnetId])
  const columns: ColumnDef<IPAddress>[] = [
    { accessorKey: 'ip', header: 'IP 地址', sortingFn: (a, b) => a.original.ip.localeCompare(b.original.ip, undefined, { numeric: true }), meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <span className="font-mono text-xs font-medium tabular-nums">{row.original.ip}</span> },
    { accessorKey: 'state', header: '状态', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <Badge variant="outline" className={stateBadgeClass[row.original.state]}>{stateMeta[row.original.state] ?? row.original.state}</Badge> },
    { accessorKey: 'source', header: '来源', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <Badge variant="secondary">{sourceMeta[row.original.source] ?? row.original.source}</Badge> },
    { accessorKey: 'dnsName', header: 'DNS 名称', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.dnsName || <span className="text-muted-foreground">—</span>}</span> },
    { accessorKey: 'role', header: '角色', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => roleLabels[row.original.role ?? ''] ?? (row.original.role || <span className="text-muted-foreground">—</span>) },
    { id: 'owner', header: '资产 / 用途', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <span>{row.original.assetId && row.original.assetName ? <Button variant="link" className="h-auto p-0" onClick={() => onOpenAsset(row.original.assetId!)}>{row.original.assetName}</Button> : row.original.label || <span className="text-muted-foreground">—</span>}{row.original.assetId && row.original.label && <span className="text-muted-foreground"> / {row.original.label}</span>}</span> },
    { id: 'subnet', header: '网段', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <Button variant="link" className="h-auto p-0" onClick={() => onOpenSubnet(row.original.subnetId)}>{row.original.subnetName}</Button> },
    { accessorKey: 'notes', header: '备注', enableSorting: false, cell: ({ row }) => row.original.notes ? <span className="text-muted-foreground">{row.original.notes}</span> : <span className="text-muted-foreground">—</span> },
    ...(editable ? [{
      id: 'actions',
      enableSorting: false,
      meta: { headerClassName: 'w-10 text-right', cellClassName: 'w-10 whitespace-nowrap text-right' },
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }: { row: { original: IPAddress } }) => row.original.allocationId ? (
        <div className="flex justify-end" onClick={event => event.stopPropagation()}>
          <RowActionsMenu
            ariaLabel={`IP ${row.original.ip} 更多操作`}
            onEdit={() => showForm(row.original)}
            onDelete={() => setReleasing(row.original)}
            deleteLabel="释放"
          />
        </div>
      ) : null,
    }] : []),
  ]
  const table = useReactTable({ data: visible, columns, state: { sorting }, onSortingChange: setSorting, initialState: { pagination: { pageIndex: 0, pageSize: 20 } }, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel() })
  function exportCSV() {
    downloadCSV('dc-db-ip-addresses.csv', [
      ['IP 地址', '来源', '状态', 'DNS 名称', '角色', '网段', '资产', '用途', '备注'],
      ...visible.map(item => [
        item.ip, sourceMeta[item.source] ?? item.source,
        stateMeta[item.state] ?? item.state, item.dnsName ?? '', item.role ?? '',
        item.subnetName, item.assetName ?? '', item.label ?? '', item.notes ?? '',
      ]),
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
      title={hideTitle ? undefined : 'IP 地址'}
      filters={<>
        <Input className="h-8 w-[240px]" placeholder="搜索 IP、DNS、资产、用途或网段" value={keyword} onChange={event => setKeyword(event.target.value)} />
        <Select
          size="small" style={{ width: 220 }} allowClear placeholder="全部网段" value={subnetId || undefined}
          onChange={(value: string | undefined) => setSubnetId(value ?? '')}
          options={subnets.map(subnet => ({ value: String(subnet.id), label: `${subnet.name} · ${subnet.cidr}` }))}
        />
        <Select
          size="small" style={{ width: 140 }} allowClear searchable={false} placeholder="全部来源" value={source || undefined}
          onChange={(value: string | undefined) => setSource(value ?? '')}
          options={Object.entries(sourceMeta).map(([value, label]) => ({ value, label }))}
        />
        <Select
          size="small" style={{ width: 130 }} allowClear searchable={false} placeholder="全部状态" value={state || undefined}
          onChange={(value: string | undefined) => setState(value ?? '')}
          options={Object.entries(stateMeta).map(([value, label]) => ({ value, label }))}
        />
      </>}
      actions={<>
        <Button size="sm" variant="outline" disabled={!visible.length} onClick={exportCSV}><Upload />导出</Button>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw />刷新</Button>
        {editable && <Button size="sm" onClick={() => showForm(null)}><Plus />分配 IP</Button>}
      </>}
    />
    {error && <div role="alert" className="mb-4 flex justify-between rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {feedback && <div role="status" className="mb-4 flex justify-between rounded-md border border-success-border bg-success-soft p-3 text-sm text-success">{feedback}<button aria-label="关闭" onClick={() => setFeedback('')}>×</button></div>}
    <DataTable
      table={table}
      loading={loading}
      emptyMessage="暂无匹配的 IP 地址"
    />
    <Dialog open={modalOpen} onOpenChange={next => { if (!busy) { setModalOpen(next); if (!next) setEditing(null) } }}><DialogContent className="sm:max-w-[600px]"><DialogHeader><DialogTitle>{editing ? `编辑 ${editing.ip}` : '分配 IP 地址'}</DialogTitle></DialogHeader>
    {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}><div className="grid grid-cols-2 gap-3">
      <div className="space-y-2"><span className="text-sm font-medium">网段</span><SearchableSelect label="网段" placeholder="选择网段" allowClear={false} disabled={!!editing} value={fields.subnetId ? String(fields.subnetId) : ''} onChange={value => setFields({ ...fields, subnetId: Number(value) || undefined })} options={subnets.map(subnet => ({ value: String(subnet.id), label: `${subnet.name} · ${subnet.cidr}` }))} /></div>
      <div className="space-y-2"><label htmlFor="address-ip" className="text-sm font-medium">IP 地址</label><Input id="address-ip" required disabled={!!editing} maxLength={64} className="font-mono" placeholder="例如：192.0.2.20" value={fields.ip} onChange={event => setFields({ ...fields, ip: event.target.value })} /></div>
      <div className="space-y-2"><label htmlFor="address-state" className="text-sm font-medium">状态</label><OptionSelect id="address-state" className="w-full" value={fields.status} onChange={value => setFields({ ...fields, status: value })} options={Object.entries(stateMeta).map(([value, label]) => ({ value, label }))} /></div>
      <div className="space-y-2"><label htmlFor="address-role" className="text-sm font-medium">角色</label><OptionSelect id="address-role" className="w-full" value={fields.role} onChange={value => setFields({ ...fields, role: value })} options={[{ value: '', label: '可选' }, ...Object.entries(roleLabels).map(([value, label]) => ({ value, label }))]} /></div>
      <div className="space-y-2"><label htmlFor="address-dns" className="text-sm font-medium">DNS 名称</label><Input id="address-dns" className="font-mono" maxLength={255} placeholder="例如：db-01.example.test" value={fields.dnsName} onChange={event => setFields({ ...fields, dnsName: event.target.value })} /></div>
      <div className="space-y-2"><span className="text-sm font-medium">关联资产</span><SearchableSelect label="关联资产" placeholder="可选" value={fields.assetId ? String(fields.assetId) : ''} onChange={value => setFields({ ...fields, assetId: Number(value) || undefined })} options={assets.map(asset => ({ value: String(asset.id), label: assetLabel(asset) }))} /></div>
      <div className="col-span-2 space-y-2"><label htmlFor="address-label" className="text-sm font-medium">用途</label><Input id="address-label" maxLength={160} placeholder="例如：VIP、数据库主地址" value={fields.label} onChange={event => setFields({ ...fields, label: event.target.value })} /></div>
      <div className="col-span-2 space-y-2"><label htmlFor="address-notes" className="text-sm font-medium">备注</label><Textarea id="address-notes" rows={2} maxLength={2000} placeholder="可选" value={fields.notes} onChange={event => setFields({ ...fields, notes: event.target.value })} /></div>
    </div><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setModalOpen(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中...' : '保存'}</Button></DialogFooter></form></DialogContent></Dialog>
    <AlertDialog open={!!releasing} onOpenChange={open => { if (!open && !busy) setReleasing(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>释放该 IP？</AlertDialogTitle>
          <AlertDialogDescription>确认释放 {releasing?.ip}？释放后该地址将重新变为空闲。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={event => {
              event.preventDefault()
              if (releasing) void release(releasing)
            }}
          >
            {busy ? '释放中…' : '释放'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </RoomTreeLayout>
  )
}
