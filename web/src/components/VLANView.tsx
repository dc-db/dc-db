import { OptionSelect } from './OptionSelect'
import { useEffect, useMemo, useState } from 'react'
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState } from '@tanstack/react-table'
import { Plus, RefreshCw, Upload } from 'lucide-react'
import { api, APIError } from '../api'
import { downloadCSV } from '../csv'
import type { VLAN, VLANFields } from '../api'
import { buildRoomCounts, matchesRoomFilter } from '../facilities'
import type { Facilities } from '../facilities'
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
import { Select } from './AppControls'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'
import { RowActionsMenu } from './RowActionsMenu'
import { RoomTreeLayout, type RoomFilter } from './RoomTreeLayout'
import { DataTableViewOptions } from './TableColumnControls'
import { BulkActionBar, createRowSelectionColumn } from './TableSelectionControls'

interface Props {
  editable: boolean
  hideTitle?: boolean
  facilities: Facilities
  roomFilter: RoomFilter
  onRoomFilterChange: (next: RoomFilter) => void
  onSelectVLAN?: (vlan: VLAN) => void
  onSessionError: (error: unknown) => void
  onChanged: () => void
}
const statusMeta: Record<string, { label: string; className: string }> = {
  active: { label: '启用', className: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-success before:content-[""]' },
  reserved: { label: '预留', className: 'border-border bg-transparent text-foreground gap-1.5 before:size-1.5 before:rounded-full before:bg-warning before:content-[""]' },
  deprecated: { label: '停用', className: 'border-border bg-muted/60 text-muted-foreground' },
}
const emptyFields: VLANFields = { vid: 0, name: '', status: 'active', description: '', roomId: undefined }

export function VLANView({ editable, hideTitle, facilities, roomFilter, onRoomFilterChange, onSelectVLAN, onSessionError, onChanged }: Props) {
  const rooms = facilities.rooms
  const [vlans, setVlans] = useState<VLAN[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<VLAN | null>(null)
  const [deleting, setDeleting] = useState<VLAN | null>(null)
  const [fields, setFields] = useState<VLANFields>(emptyFields)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => { void load() }, [])
  useEffect(() => {
    const validIds = new Set(vlans.map(vlan => String(vlan.id)))
    setRowSelection(prev => {
      const next: RowSelectionState = {}
      let changed = false
      for (const [id, selected] of Object.entries(prev)) {
        if (selected && validIds.has(id)) next[id] = true
        else changed = true
      }
      return changed ? next : prev
    })
  }, [vlans])
  function report(e: unknown) {
    if (e instanceof APIError && e.status === 401) { onSessionError(e); return }
    setError(e instanceof Error ? e.message : '操作失败')
  }
  async function load() {
    setLoading(true); setError('')
    try { setVlans(await api<VLAN[]>('/vlans')) } catch (e) { report(e) } finally { setLoading(false) }
  }
  function showForm(vlan: VLAN | null) {
    setEditing(vlan); setFeedback(''); setError(''); setModalError('')
    setFields(
      vlan
        ? { vid: vlan.vid, name: vlan.name, status: vlan.status, description: vlan.description, roomId: vlan.roomId || undefined }
        : { ...emptyFields, roomId: typeof roomFilter === 'number' ? roomFilter : undefined },
    )
    setModalOpen(true)
  }
  async function save() {
    if (!Number.isInteger(fields.vid) || fields.vid < 1 || fields.vid > 4094) { setModalError('请输入 1–4094 的 VLAN ID'); return }
    if (!fields.name.trim()) { setModalError('请输入 VLAN 名称'); return }
    setBusy(true); setModalError('')
    try {
      const body = { ...fields, roomId: fields.roomId ?? 0, version: editing?.version ?? 0 }
      const wasEdit = !!editing
      if (editing) await api<VLAN>(`/vlans/${editing.id}`, 'PUT', body)
      else await api<VLAN>('/vlans', 'POST', body)
      setModalOpen(false); setEditing(null); await load()
      setFeedback(wasEdit ? 'VLAN 已更新' : 'VLAN 已创建'); onChanged()
    } catch (e) {
      if (e instanceof APIError && e.status === 401) onSessionError(e)
      else setModalError(e instanceof Error ? e.message : '保存失败')
    } finally { setBusy(false) }
  }
  async function remove(vlan: VLAN) {
    setBusy(true); setError('')
    try { await api(`/vlans/${vlan.id}?version=${vlan.version}`, 'DELETE'); setDeleting(null); await load(); setFeedback('VLAN 已删除'); onChanged() }
    catch (e) { setDeleting(null); report(e) } finally { setBusy(false) }
  }
  const roomCounts = useMemo(() => buildRoomCounts(vlans, vlan => vlan.roomId || null), [vlans])
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return vlans.filter(vlan => matchesRoomFilter(vlan.roomId || null, roomFilter) && (!status || vlan.status === status) && (!query || [String(vlan.vid), vlan.name, vlan.description, vlan.roomName].some(value => value?.toLowerCase().includes(query))))
  }, [keyword, roomFilter, status, vlans])

  const columns: ColumnDef<VLAN>[] = [
    createRowSelectionColumn<VLAN>({
      selectAllLabel: '全选当前页 VLAN',
      getRowLabel: vlan => `选择 VLAN ${vlan.vid} ${vlan.name}`,
    }),
    { accessorKey: 'vid', header: 'VLAN ID', meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <span className="font-mono text-xs font-medium tabular-nums">{row.original.vid}</span> },
    { accessorKey: 'name', header: '名称', sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'zh-CN', { numeric: true }), cell: ({ row }) => <div className="flex flex-col gap-0.5"><span className="font-medium">{row.original.name}</span>{row.original.description && <span className="text-xs text-muted-foreground">{row.original.description}</span>}</div> },
    {
      id: 'status',
      accessorFn: row => statusMeta[row.status]?.label ?? row.status,
      header: '状态',
      sortingFn: (a, b) => (a.getValue<string>('status') ?? '').localeCompare(b.getValue<string>('status') ?? '', 'zh-CN'),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => { const meta = statusMeta[row.original.status] ?? { label: row.original.status, className: '' }; return <Badge variant="outline" className={meta.className}>{meta.label}</Badge> },
    },
    {
      id: 'roomName',
      accessorFn: row => row.roomName?.trim() || undefined,
      header: '所属数据中心',
      sortUndefined: 'last',
      sortingFn: (a, b) => (a.getValue<string | undefined>('roomName') ?? '').localeCompare(b.getValue<string | undefined>('roomName') ?? '', 'zh-CN', { numeric: true }),
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => row.original.roomName || <span className="text-muted-foreground">—</span>,
    },
    { accessorKey: 'prefixCount', header: '关联网段', meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <Badge variant={row.original.prefixCount ? 'secondary' : 'outline'} className="tabular-nums">{row.original.prefixCount}</Badge> },
    {
      id: 'updatedAt',
      accessorFn: row => (row.updatedAt ? new Date(row.updatedAt).getTime() : undefined),
      header: '最近更新',
      sortUndefined: 'last',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{row.original.updatedAt ? new Date(row.original.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</span>,
    },
    ...(editable ? [{
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      meta: { headerClassName: 'w-10 text-right', cellClassName: 'w-10 whitespace-nowrap text-right' },
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }: { row: { original: VLAN } }) => (
        <div className="-mx-3 -my-2 flex items-center justify-end px-3 py-2" onClick={event => event.stopPropagation()}>
          <RowActionsMenu
            ariaLabel={`VLAN ${row.original.vid} 更多操作`}
            onEdit={() => showForm(row.original)}
            onDelete={() => setDeleting(row.original)}
          />
        </div>
      ),
    }] : []),
  ]
  const table = useReactTable({
    data: visible,
    columns,
    getRowId: row => String(row.id),
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
  const selectedVLANs = table.getSelectedRowModel().rows.map(row => row.original)
  const referencedSelectedCount = selectedVLANs.filter(vlan => vlan.prefixCount > 0).length

  async function bulkRemove() {
    if (bulkDeleting || !selectedVLANs.length) return
    const targets = [...selectedVLANs]
    setBulkDeleting(true)
    setError('')
    setFeedback('')
    const succeededIds: string[] = []
    const failed: { vlan: VLAN; message: string }[] = []
    try {
      for (const vlan of targets) {
        try {
          await api(`/vlans/${vlan.id}?version=${vlan.version}`, 'DELETE')
          succeededIds.push(String(vlan.id))
        } catch (e) {
          if (e instanceof APIError && e.status === 401) {
            setBulkDeleteOpen(false)
            onSessionError(e)
            return
          }
          failed.push({ vlan, message: e instanceof Error ? e.message : '删除失败' })
        }
      }
      setBulkDeleteOpen(false)
      if (succeededIds.length > 0) {
        const succeededSet = new Set(succeededIds)
        setRowSelection(prev => {
          const next: RowSelectionState = {}
          for (const [id, selected] of Object.entries(prev)) {
            if (selected && !succeededSet.has(id)) next[id] = true
          }
          return next
        })
        await load()
        onChanged()
      }
      if (succeededIds.length > 0 && failed.length === 0) {
        setFeedback(`已删除 ${succeededIds.length} 个 VLAN`)
      } else if (succeededIds.length > 0) {
        setFeedback(`已删除 ${succeededIds.length} 个 VLAN`)
        const detail = failed.slice(0, 3).map(entry => `VLAN ${entry.vlan.vid}（${entry.vlan.name}）：${entry.message}`).join('；')
        setError(`${failed.length} 个 VLAN 删除失败：${detail}${failed.length > 3 ? ` 等 ${failed.length} 项` : ''}`)
      } else if (failed.length > 0) {
        const detail = failed.slice(0, 3).map(entry => `VLAN ${entry.vlan.vid}（${entry.vlan.name}）：${entry.message}`).join('；')
        setError(`删除失败：${detail}${failed.length > 3 ? ` 等 ${failed.length} 项` : ''}`)
      }
    } finally {
      setBulkDeleting(false)
    }
  }

  function formatVLANsCSVRows(items: VLAN[]) {
    return [
      ['VLAN ID', '名称', '状态', '所属数据中心', '关联网段数', '描述'],
      ...items.map(vlan => [
        vlan.vid, vlan.name, statusMeta[vlan.status]?.label ?? vlan.status,
        vlan.roomName ?? '', vlan.prefixCount, vlan.description,
      ]),
    ]
  }
  function exportCSV() {
    downloadCSV('dc-db-vlans.csv', formatVLANsCSVRows(visible))
  }
  function exportSelectedVLANsCSV() {
    if (!selectedVLANs.length) return
    downloadCSV('dc-db-vlans-selected.csv', formatVLANsCSVRows(selectedVLANs))
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
      title={hideTitle ? undefined : 'VLAN'}
      filters={<>
        <Input className="h-8 w-[240px]" placeholder="搜索 VLAN ID、名称、描述或数据中心" value={keyword} onChange={event => setKeyword(event.target.value)} />
        <Select
          size="small" style={{ width: 130 }} allowClear searchable={false} placeholder="全部状态" value={status || undefined}
          onChange={(value: string | undefined) => setStatus(value ?? '')}
          options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
        />
      </>}
      actions={<>
        <DataTableViewOptions table={table} />
        <Button size="sm" variant="outline" disabled={!visible.length} onClick={exportCSV}><Upload />导出</Button>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw />刷新</Button>
        {editable && <Button size="sm" onClick={() => showForm(null)}><Plus />新增 VLAN</Button>}
      </>}
    />
    {error && <div role="alert" className="mb-4 flex justify-between rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {feedback && <div role="status" className="mb-4 flex justify-between rounded-md border border-success-border bg-success-soft p-3 text-sm text-success">{feedback}<button aria-label="关闭" onClick={() => setFeedback('')}>×</button></div>}
    <DataTable
      table={table}
      loading={loading}
      pagerUnit="个"
      onRowClick={onSelectVLAN ? (vlan, event) => {
        if ((event.target as HTMLElement).closest('button, a, [role="checkbox"], [role="menuitem"], [data-slot="dropdown-menu-content"]')) return
        onSelectVLAN(vlan)
      } : undefined}
      emptyMessage={keyword || status || roomFilter !== 'all' ? '没有匹配的 VLAN' : '暂无 VLAN，新增一个开始规划二层网络'}
    />
    <Dialog open={modalOpen} onOpenChange={next => { if (!busy) { setModalOpen(next); if (!next) setEditing(null) } }}><DialogContent><DialogHeader><DialogTitle>{editing ? `编辑 VLAN ${editing.vid}` : '新增 VLAN'}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="grid grid-cols-3 gap-3"><div className="space-y-2"><label className="text-sm font-medium" htmlFor="vlan-id">VLAN ID</label><Input id="vlan-id" type="number" min={1} max={4094} required placeholder="1–4094" value={fields.vid || ''} onChange={event => setFields({ ...fields, vid: Number(event.target.value) })} /></div><div className="col-span-2 space-y-2"><label className="text-sm font-medium" htmlFor="vlan-name">名称</label><Input id="vlan-name" required maxLength={80} placeholder="例如：服务器区" value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></div></div>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="vlan-status">状态</label><OptionSelect id="vlan-status" className="w-full" value={fields.status} onChange={value => setFields({ ...fields, status: value as VLANFields['status'] })} options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))} /></div>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="vlan-room">所属数据中心</label><OptionSelect id="vlan-room" className="w-full" value={String(fields.roomId ?? '')} onChange={value => setFields({ ...fields, roomId: value ? Number(value) : undefined })} options={[{ value: '', label: '可选' }, ...rooms.map(room => ({ value: String(room.id), label: room.name }))]} /></div>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="vlan-description">描述</label><Textarea id="vlan-description" rows={2} maxLength={200} placeholder="用途、网段规划等说明" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /><div className="text-right text-xs text-muted-foreground">{fields.description.length} / 200</div></div>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setModalOpen(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中...' : '保存'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除该 VLAN？</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除 VLAN {deleting?.vid}{deleting?.name ? `（${deleting.name}）` : ''}？仍有网段使用时不能删除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={event => {
              event.preventDefault()
              if (deleting) void remove(deleting)
            }}
          >
            {busy ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <BulkActionBar
      count={selectedVLANs.length}
      unit="个 VLAN"
      onClear={() => setRowSelection({})}
      onExport={exportSelectedVLANsCSV}
      onDelete={editable ? () => setBulkDeleteOpen(true) : undefined}
      deleting={bulkDeleting}
    />
    <AlertDialog open={bulkDeleteOpen} onOpenChange={open => { if (!open && !bulkDeleting) setBulkDeleteOpen(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确定删除所选 {selectedVLANs.length} 个 VLAN？</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除所选的 {selectedVLANs.length} 个 VLAN？此操作无法撤销。
            {referencedSelectedCount > 0 ? `其中 ${referencedSelectedCount} 个 VLAN 仍有关联网段，将被跳过并提示原因。` : '仍有网段使用时不能删除。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={bulkDeleting}
            onClick={event => {
              event.preventDefault()
              void bulkRemove()
            }}
          >
            {bulkDeleting ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </RoomTreeLayout>
  )
}
