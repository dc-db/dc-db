import { OptionSelect } from './OptionSelect'
import { useEffect, useMemo, useState } from 'react'
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState } from '@tanstack/react-table'
import { Plus, RefreshCw } from 'lucide-react'
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
import { buildFacetedOptions, ClearFiltersButton, DataTableViewOptions, matchesMultiFilter } from './TableColumnControls'
import { BulkActionBar, createRowSelectionColumn } from './TableSelectionControls'

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

function compareIP(left: string, right: string): number {
  const ln = ipv4Number(left)
  const rn = ipv4Number(right)
  if (ln !== null && rn !== null) return ln - rn
  if (ln !== null) return -1
  if (rn !== null) return 1
  return left.localeCompare(right, undefined, { numeric: true })
}

function compareText(left?: string | null, right?: string | null): number {
  return (left ?? '').localeCompare(right ?? '', 'zh-CN', { numeric: true })
}

function ipRowId(row: IPAddress): string {
  return row.allocationId ? `alloc-${row.allocationId}` : (row.key || `${row.subnetId}-${row.source}-${row.ip}`)
}

export function IPAddressView({ editable, hideTitle, initialSubnetId, onInitialSubnetConsumed, assets, links, facilities, roomFilter, onRoomFilterChange, subnets, onOpenAsset, onOpenSubnet, onSessionError, onChanged }: Props) {
  const [addresses, setAddresses] = useState<IPAddress[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkReleaseOpen, setBulkReleaseOpen] = useState(false)
  const [bulkReleasing, setBulkReleasing] = useState(false)
  const [stateFilter, setStateFilter] = useState<string[]>([])
  const [roleFilter, setRoleFilter] = useState<string[]>([])
  const [subnetFilter, setSubnetFilter] = useState<string[]>(() => (initialSubnetId ? [String(initialSubnetId)] : []))
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IPAddress | null>(null)
  const [releasing, setReleasing] = useState<IPAddress | null>(null)
  const [fields, setFields] = useState<AddressFields>(emptyFields)
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (initialSubnetId) {
      setSubnetFilter([String(initialSubnetId)])
      onInitialSubnetConsumed?.()
    }
  }, [initialSubnetId, onInitialSubnetConsumed])
  useEffect(() => {
    const validIds = new Set(addresses.map(ipRowId))
    setRowSelection(prev => {
      const next: RowSelectionState = {}
      let changed = false
      for (const [id, selected] of Object.entries(prev)) {
        if (selected && validIds.has(id)) next[id] = true
        else changed = true
      }
      return changed ? next : prev
    })
  }, [addresses])
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
  const scopedAddresses = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return addresses.filter(address =>
      matchesRoomFilter(resolveAddressRoomId(address), roomFilter)
      && (!query || [
        address.ip,
        address.dnsName,
        address.assetName,
        address.label,
        address.notes,
        address.subnetName,
        subnetById.get(address.subnetId)?.cidr,
        roleLabels[address.role ?? ''] ?? address.role,
        stateMeta[address.state],
        sourceMeta[address.source],
      ].some(value => value?.toLowerCase().includes(query))),
    )
  }, [addresses, keyword, resolveAddressRoomId, roomFilter, subnetById])
  const stateCatalog = useMemo(
    () => Object.entries(stateMeta).map(([value, label]) => ({ value, label })),
    [],
  )
  const sourceCatalog = useMemo(
    () => Object.entries(sourceMeta).map(([value, label]) => ({ value, label })),
    [],
  )
  const roleCatalog = useMemo(
    () => Object.entries(roleLabels).map(([value, label]) => ({ value, label })),
    [],
  )
  const subnetCatalog = useMemo(
    () => subnets
      .slice()
      .sort((a, b) => compareText(a.name, b.name) || compareText(a.cidr, b.cidr))
      .map(subnet => ({ value: String(subnet.id), label: `${subnet.name} · ${subnet.cidr}` })),
    [subnets],
  )
  const stateFilterOptions = useMemo(() => buildFacetedOptions({
    items: scopedAddresses.filter(address =>
      matchesMultiFilter(sourceFilter, address.source)
      && matchesMultiFilter(roleFilter, address.role)
      && matchesMultiFilter(subnetFilter, String(address.subnetId)),
    ),
    getEntries: address => ({ value: address.state, label: stateMeta[address.state] ?? address.state }),
    catalog: stateCatalog,
    includeZeroCatalog: true,
    selectedValues: stateFilter,
  }), [roleFilter, scopedAddresses, sourceFilter, stateCatalog, stateFilter, subnetFilter])
  const sourceFilterOptions = useMemo(() => buildFacetedOptions({
    items: scopedAddresses.filter(address =>
      matchesMultiFilter(stateFilter, address.state)
      && matchesMultiFilter(roleFilter, address.role)
      && matchesMultiFilter(subnetFilter, String(address.subnetId)),
    ),
    getEntries: address => ({ value: address.source, label: sourceMeta[address.source] ?? address.source }),
    catalog: sourceCatalog,
    includeZeroCatalog: true,
    selectedValues: sourceFilter,
  }), [roleFilter, scopedAddresses, sourceCatalog, sourceFilter, stateFilter, subnetFilter])
  const roleFilterOptions = useMemo(() => buildFacetedOptions({
    items: scopedAddresses.filter(address =>
      matchesMultiFilter(stateFilter, address.state)
      && matchesMultiFilter(sourceFilter, address.source)
      && matchesMultiFilter(subnetFilter, String(address.subnetId)),
    ),
    getEntries: address => {
      const role = address.role?.trim()
      return role ? { value: role, label: roleLabels[role] ?? role } : null
    },
    catalog: roleCatalog,
    includeEmpty: true,
    emptyLabel: '未设置',
    selectedValues: roleFilter,
  }), [roleCatalog, roleFilter, scopedAddresses, sourceFilter, stateFilter, subnetFilter])
  const subnetFilterOptions = useMemo(() => buildFacetedOptions({
    items: scopedAddresses.filter(address =>
      matchesMultiFilter(stateFilter, address.state)
      && matchesMultiFilter(sourceFilter, address.source)
      && matchesMultiFilter(roleFilter, address.role),
    ),
    getEntries: address => {
      const subnet = subnetById.get(address.subnetId)
      return {
        value: String(address.subnetId),
        label: subnet ? `${subnet.name} · ${subnet.cidr}` : address.subnetName,
      }
    },
    catalog: subnetCatalog,
    selectedValues: subnetFilter,
  }), [roleFilter, scopedAddresses, sourceFilter, stateFilter, subnetById, subnetCatalog, subnetFilter])
  const activeFilterCount = stateFilter.length + sourceFilter.length + roleFilter.length + subnetFilter.length
  const visible = useMemo(
    () => scopedAddresses.filter(address =>
      matchesMultiFilter(stateFilter, address.state)
      && matchesMultiFilter(sourceFilter, address.source)
      && matchesMultiFilter(roleFilter, address.role)
      && matchesMultiFilter(subnetFilter, String(address.subnetId)),
    ),
    [roleFilter, scopedAddresses, sourceFilter, stateFilter, subnetFilter],
  )
  const columns: ColumnDef<IPAddress>[] = [
    createRowSelectionColumn<IPAddress>({
      selectAllLabel: '全选当前页 IP 地址',
      getRowLabel: row => `选择 IP ${row.ip}`,
    }),
    {
      accessorKey: 'ip',
      header: 'IP 地址',
      sortingFn: (a, b) => compareIP(a.original.ip, b.original.ip),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="font-mono text-xs font-medium tabular-nums">{row.original.ip}</span>,
    },
    {
      id: 'state',
      accessorFn: row => stateMeta[row.state] ?? row.state,
      header: '状态',
      sortingFn: (a, b) => compareText(a.getValue<string>('state'), b.getValue<string>('state')),
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: {
          options: stateFilterOptions,
          selectedValues: stateFilter,
          onChange: setStateFilter,
          searchPlaceholder: '搜索状态…',
        },
      },
      cell: ({ row }) => <Badge variant="outline" className={stateBadgeClass[row.original.state]}>{stateMeta[row.original.state] ?? row.original.state}</Badge>,
    },
    {
      id: 'source',
      accessorFn: row => sourceMeta[row.source] ?? row.source,
      header: '来源',
      sortingFn: (a, b) => compareText(a.getValue<string>('source'), b.getValue<string>('source')),
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: {
          options: sourceFilterOptions,
          selectedValues: sourceFilter,
          onChange: setSourceFilter,
          searchPlaceholder: '搜索来源…',
        },
      },
      cell: ({ row }) => <Badge variant="secondary">{sourceMeta[row.original.source] ?? row.original.source}</Badge>,
    },
    {
      id: 'dnsName',
      accessorFn: row => row.dnsName?.trim() || undefined,
      header: 'DNS 名称',
      sortUndefined: 'last',
      sortingFn: (a, b) => compareText(a.getValue<string | undefined>('dnsName'), b.getValue<string | undefined>('dnsName')),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.dnsName || <span className="text-muted-foreground">—</span>}</span>,
    },
    {
      id: 'role',
      accessorFn: row => (roleLabels[row.role ?? ''] ?? row.role)?.trim() || undefined,
      header: '角色',
      sortUndefined: 'last',
      sortingFn: (a, b) => compareText(a.getValue<string | undefined>('role'), b.getValue<string | undefined>('role')),
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: {
          options: roleFilterOptions,
          selectedValues: roleFilter,
          onChange: setRoleFilter,
          searchPlaceholder: '搜索角色…',
        },
      },
      cell: ({ row }) => roleLabels[row.original.role ?? ''] ?? (row.original.role || <span className="text-muted-foreground">—</span>),
    },
    {
      id: 'owner',
      accessorFn: row => [row.assetName, row.label].filter(Boolean).join(' / ') || undefined,
      header: '资产 / 用途',
      sortUndefined: 'last',
      sortingFn: (a, b) => compareText(a.getValue<string | undefined>('owner'), b.getValue<string | undefined>('owner')),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span>{row.original.assetId && row.original.assetName ? <Button variant="link" className="h-auto p-0" onClick={() => onOpenAsset(row.original.assetId!)}>{row.original.assetName}</Button> : row.original.label || <span className="text-muted-foreground">—</span>}{row.original.assetId && row.original.label && <span className="text-muted-foreground"> / {row.original.label}</span>}</span>,
    },
    {
      id: 'subnet',
      accessorFn: row => row.subnetName,
      header: '网段',
      sortingFn: (a, b) => compareText(a.original.subnetName, b.original.subnetName),
      meta: {
        cellClassName: 'whitespace-nowrap',
        filter: {
          options: subnetFilterOptions,
          selectedValues: subnetFilter,
          onChange: setSubnetFilter,
          searchPlaceholder: '搜索网段…',
        },
      },
      cell: ({ row }) => <Button variant="link" className="h-auto p-0" onClick={() => onOpenSubnet(row.original.subnetId)}>{row.original.subnetName}</Button>,
    },
    {
      id: 'notes',
      accessorFn: row => row.notes?.trim() || undefined,
      header: '备注',
      sortUndefined: 'last',
      sortingFn: (a, b) => compareText(a.getValue<string | undefined>('notes'), b.getValue<string | undefined>('notes')),
      cell: ({ row }) => row.original.notes ? <span className="text-muted-foreground">{row.original.notes}</span> : <span className="text-muted-foreground">—</span>,
    },
    ...(editable ? [{
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
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
  const table = useReactTable({
    data: visible,
    columns,
    getRowId: ipRowId,
    enableRowSelection: true,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  const selectedRows = table.getSelectedRowModel().rows.map(row => row.original)
  const releasableSelected = selectedRows.filter(item => Boolean(item.allocationId))
  const nonReleasableCount = selectedRows.length - releasableSelected.length

  async function bulkRelease() {
    if (bulkReleasing || !releasableSelected.length) return
    const targets = [...releasableSelected]
    const skippedCount = nonReleasableCount
    setBulkReleasing(true)
    setError('')
    setFeedback('')
    const succeededIds: string[] = []
    const failed: { item: IPAddress; message: string }[] = []
    try {
      for (const item of targets) {
        if (!item.allocationId) continue
        try {
          await api(`/allocations/${item.allocationId}?version=${item.version ?? 0}`, 'DELETE')
          succeededIds.push(ipRowId(item))
        } catch (e) {
          if (e instanceof APIError && e.status === 401) {
            setBulkReleaseOpen(false)
            onSessionError(e)
            return
          }
          failed.push({ item, message: e instanceof Error ? e.message : '释放失败' })
        }
      }
      setBulkReleaseOpen(false)
      if (succeededIds.length > 0) {
        if (failed.length === 0) {
          setRowSelection({})
        } else {
          const succeededSet = new Set(succeededIds)
          setRowSelection(prev => {
            const next: RowSelectionState = {}
            for (const [id, selected] of Object.entries(prev)) {
              if (selected && !succeededSet.has(id)) next[id] = true
            }
            return next
          })
        }
        await load()
        onChanged()
      }
      if (succeededIds.length > 0 && failed.length === 0) {
        setFeedback(skippedCount > 0
          ? `已释放 ${succeededIds.length} 条 IP 地址（已跳过 ${skippedCount} 条非手工分配地址）`
          : `已释放 ${succeededIds.length} 条 IP 地址`)
      } else if (succeededIds.length > 0) {
        setFeedback(`已释放 ${succeededIds.length} 条 IP 地址`)
        const detail = failed.slice(0, 3).map(entry => `${entry.item.ip}：${entry.message}`).join('；')
        setError(`${failed.length} 条释放失败：${detail}${failed.length > 3 ? ` 等 ${failed.length} 项` : ''}`)
      } else if (failed.length > 0) {
        const detail = failed.slice(0, 3).map(entry => `${entry.item.ip}：${entry.message}`).join('；')
        setError(`释放失败：${detail}${failed.length > 3 ? ` 等 ${failed.length} 项` : ''}`)
      }
    } finally {
      setBulkReleasing(false)
    }
  }

  function formatIPsCSVRows(items: IPAddress[]) {
    return [
      ['IP 地址', '来源', '状态', 'DNS 名称', '角色', '网段', '资产', '用途', '备注'],
      ...items.map(item => [
        item.ip, sourceMeta[item.source] ?? item.source,
        stateMeta[item.state] ?? item.state, item.dnsName ?? '', item.role ?? '',
        item.subnetName, item.assetName ?? '', item.label ?? '', item.notes ?? '',
      ]),
    ]
  }
  function exportSelectedIPsCSV() {
    if (!selectedRows.length) return
    downloadCSV('dc-db-ip-addresses-selected.csv', formatIPsCSVRows(selectedRows))
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
        <DataTableViewOptions align="start" table={table} />
        <ClearFiltersButton
          count={activeFilterCount}
          onReset={() => {
            setStateFilter([])
            setSourceFilter([])
            setRoleFilter([])
            setSubnetFilter([])
          }}
        />
      </>}
      actions={<>
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
    <BulkActionBar
      count={selectedRows.length}
      unit="条地址"
      onClear={() => setRowSelection({})}
      onExport={exportSelectedIPsCSV}
      onDelete={editable && releasableSelected.length > 0 ? () => setBulkReleaseOpen(true) : undefined}
      deleteLabel="释放"
      deleting={bulkReleasing}
    />
    <AlertDialog open={bulkReleaseOpen} onOpenChange={open => { if (!open && !bulkReleasing) setBulkReleaseOpen(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>释放所选 {releasableSelected.length} 条手工分配 IP？</AlertDialogTitle>
          <AlertDialogDescription>
            确认释放所选的 {releasableSelected.length} 条手工分配 IP？释放后这些地址将重新变为空闲。
            {nonReleasableCount > 0 ? `其余 ${nonReleasableCount} 条来自资产或网关的地址不可直接释放，将自动跳过。` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkReleasing}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={bulkReleasing}
            onClick={event => {
              event.preventDefault()
              void bulkRelease()
            }}
          >
            {bulkReleasing ? '释放中…' : '释放'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </RoomTreeLayout>
  )
}
