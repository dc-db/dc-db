import { useEffect, useMemo, useState } from 'react'
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { Download, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api, APIError } from '../api'
import { downloadCSV } from '../csv'
import type { VLAN, VLANFields } from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Select } from './AppControls'
import { DataTable } from './DataTable'
import { PageHeader } from './PageHeader'

interface RoomOption { id: number; name: string }
interface Props { editable: boolean; hideTitle?: boolean; rooms: RoomOption[]; onSelectVLAN?: (vlan: VLAN) => void; onSessionError: (error: unknown) => void; onChanged: () => void }
const statusMeta: Record<string, { label: string; className: string }> = {
  active: { label: '启用', className: 'border-success-border bg-success-soft text-success' },
  reserved: { label: '预留', className: 'border-warning-border bg-warning-soft text-warning' },
  deprecated: { label: '停用', className: 'border-border bg-muted text-muted-foreground' },
}
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'
const emptyFields: VLANFields = { vid: 0, name: '', status: 'active', description: '', roomId: undefined }

export function VLANView({ editable, hideTitle, rooms, onSelectVLAN, onSessionError, onChanged }: Props) {
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

  useEffect(() => { void load() }, [])
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
    setFields(vlan ? { vid: vlan.vid, name: vlan.name, status: vlan.status, description: vlan.description, roomId: vlan.roomId || undefined } : emptyFields)
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
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return vlans.filter(vlan => (!status || vlan.status === status) && (!query || [String(vlan.vid), vlan.name, vlan.description, vlan.roomName].some(value => value?.toLowerCase().includes(query))))
  }, [keyword, status, vlans])

  const columns: ColumnDef<VLAN>[] = [
    { accessorKey: 'vid', header: 'VLAN ID', meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <span className="font-mono text-xs font-medium tabular-nums">{row.original.vid}</span> },
    { accessorKey: 'name', header: '名称', sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'zh-CN'), cell: ({ row }) => <div className="flex flex-col gap-0.5"><span className="font-medium">{row.original.name}</span>{row.original.description && <span className="text-xs text-muted-foreground">{row.original.description}</span>}</div> },
    { accessorKey: 'status', header: '状态', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => { const meta = statusMeta[row.original.status] ?? { label: row.original.status, className: '' }; return <Badge variant="outline" className={meta.className}>{meta.label}</Badge> } },
    { accessorKey: 'roomName', header: '所属数据中心', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => row.original.roomName || <span className="text-muted-foreground">—</span> },
    { accessorKey: 'prefixCount', header: '关联网段', meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <Badge variant={row.original.prefixCount ? 'secondary' : 'outline'} className="tabular-nums">{row.original.prefixCount}</Badge> },
    { accessorKey: 'updatedAt', header: '最近更新', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{row.original.updatedAt ? new Date(row.original.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</span> },
    ...(editable ? [{
      id: 'actions',
      enableSorting: false,
      meta: { headerClassName: 'w-[120px] text-right', cellClassName: 'w-[120px] whitespace-nowrap text-right' },
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }: { row: { original: VLAN } }) => (
        <div className="table-row-action flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => showForm(row.original)}><Pencil />编辑</Button>
          <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={`删除 VLAN ${row.original.vid}`} onClick={() => setDeleting(row.original)}><Trash2 /></Button>
        </div>
      ),
    }] : []),
  ]
  const table = useReactTable({ data: visible, columns, state: { sorting }, onSortingChange: setSorting, initialState: { pagination: { pageIndex: 0, pageSize: 20 } }, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel() })

  function exportCSV() {
    downloadCSV('dc-db-vlans.csv', [
      ['VLAN ID', '名称', '状态', '所属数据中心', '关联网段数', '描述'],
      ...visible.map(vlan => [
        vlan.vid, vlan.name, statusMeta[vlan.status]?.label ?? vlan.status,
        vlan.roomName ?? '', vlan.prefixCount, vlan.description,
      ]),
    ])
  }

  return <>
    <PageHeader
      title={hideTitle ? undefined : 'VLAN'}
      filters={<>
        <Input className="max-w-sm" placeholder="搜索 VLAN ID、名称、描述或数据中心" value={keyword} onChange={event => setKeyword(event.target.value)} />
        <Select
          style={{ width: 130 }} allowClear searchable={false} placeholder="全部状态" value={status || undefined}
          onChange={(value: string | undefined) => setStatus(value ?? '')}
          options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
        />
      </>}
      actions={<>
        <Button variant="outline" disabled={!visible.length} onClick={exportCSV}><Download />导出</Button>
        <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw />刷新</Button>
        {editable && <Button onClick={() => showForm(null)}><Plus />新增 VLAN</Button>}
      </>}
    />
    {error && <div role="alert" className="mb-4 flex justify-between rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {feedback && <div role="status" className="mb-4 flex justify-between rounded-md border border-success-border bg-success-soft p-3 text-sm text-success">{feedback}<button aria-label="关闭" onClick={() => setFeedback('')}>×</button></div>}
    <DataTable
      table={table}
      loading={loading}
      pagerUnit="个"
      onRowClick={onSelectVLAN ? (vlan, event) => {
        if ((event.target as HTMLElement).closest('button, a')) return
        onSelectVLAN(vlan)
      } : undefined}
      emptyMessage={keyword || status ? '没有匹配的 VLAN' : '暂无 VLAN，新增一个开始规划二层网络'}
    />
    <Dialog open={modalOpen} onOpenChange={next => { if (!busy) { setModalOpen(next); if (!next) setEditing(null) } }}><DialogContent><DialogHeader><DialogTitle>{editing ? `编辑 VLAN ${editing.vid}` : '新增 VLAN'}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="grid grid-cols-3 gap-3"><div className="space-y-2"><label className="text-sm font-medium" htmlFor="vlan-id">VLAN ID</label><Input id="vlan-id" type="number" min={1} max={4094} required placeholder="1–4094" value={fields.vid || ''} onChange={event => setFields({ ...fields, vid: Number(event.target.value) })} /></div><div className="col-span-2 space-y-2"><label className="text-sm font-medium" htmlFor="vlan-name">名称</label><Input id="vlan-name" required maxLength={80} placeholder="例如：服务器区" value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></div></div>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="vlan-status">状态</label><select id="vlan-status" className={selectClass} value={fields.status} onChange={event => setFields({ ...fields, status: event.target.value as VLANFields['status'] })}>{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></div>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="vlan-room">所属数据中心</label><select id="vlan-room" className={selectClass} value={fields.roomId ?? ''} onChange={event => setFields({ ...fields, roomId: event.target.value ? Number(event.target.value) : undefined })}><option value="">可选</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></div>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="vlan-description">描述</label><Textarea id="vlan-description" rows={2} maxLength={200} placeholder="用途、网段规划等说明" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /><div className="text-right text-xs text-muted-foreground">{fields.description.length} / 200</div></div>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setModalOpen(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中...' : '保存'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={next => { if (!next && !busy) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>删除该 VLAN？</DialogTitle><DialogDescription>仍有网段使用时不能删除。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter></DialogContent></Dialog>
  </>
}
