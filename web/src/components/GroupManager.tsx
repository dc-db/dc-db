import { useEffect, useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, APIError } from '../api'
import type { Group, GroupFields } from '../api'
import { Button } from './ui/button'
import { PageHeader } from './PageHeader'
import { TablePager } from './TablePager'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

interface Props {
  editable: boolean
  hideTitle?: boolean
  onSessionError: (error: unknown) => void
  onChanged?: (groups: Group[]) => void
}

export function GroupManager({ editable, hideTitle, onSessionError, onChanged }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [fields, setFields] = useState<GroupFields>({ name: '', description: '' })

  useEffect(() => { void load() }, [])

  function report(value: unknown) {
    if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
    setError(value instanceof Error ? value.message : '操作失败')
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const next = await api<Group[]>('/groups')
      setGroups(next)
      onChanged?.(next)
    } catch (value) { report(value) } finally { setLoading(false) }
  }

  function showForm(group: Group | null) {
    setEditing(group)
    setFields({ name: group?.name ?? '', description: group?.description ?? '' })
    setModalError('')
    setOpen(true)
  }

  async function save() {
    if (!fields.name.trim()) { setModalError('请填写群组名称'); return }
    setSaving(true)
    setModalError('')
    try {
      if (editing) await api<Group>(`/groups/${editing.id}`, 'PUT', fields)
      else await api<Group>('/groups', 'POST', fields)
      setOpen(false)
      await load()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setModalError(value instanceof Error ? value.message : '保存失败')
    } finally { setSaving(false) }
  }

  async function remove(group: Group) {
    setSaving(true)
    try {
      await api(`/groups/${group.id}`, 'DELETE')
      setDeleting(null)
      await load()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setError(value instanceof Error ? value.message : '删除失败')
    } finally { setSaving(false) }
  }

  const columns = useMemo<ColumnDef<Group>[]>(() => [
    { accessorKey: 'name', header: '群组名称', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: 'assetCount', header: '资产数', cell: ({ row }) => row.original.assetCount },
    { accessorKey: 'description', header: '备注', cell: ({ row }) => row.original.description || <span className="text-muted-foreground">—</span> },
    ...(editable ? [{
      id: 'actions', header: () => <div className="text-right">操作</div>,
      cell: ({ row }: { row: { original: Group } }) => <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => showForm(row.original)}><Pencil />编辑</Button>
      </div>,
    }] : []),
  ], [editable])

  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return query ? groups.filter(item => [item.name, item.description].some(value => value.toLowerCase().includes(query))) : groups
  }, [groups, keyword])
  const table = useReactTable({ data: visible, columns, initialState: { pagination: { pageIndex: 0, pageSize: 20 } }, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() })

  return <>
    <PageHeader
      title={hideTitle ? undefined : '群组'}
      filters={<Input className="max-w-sm" placeholder="搜索群组名称或备注" value={keyword} onChange={event => setKeyword(event.target.value)} />}
      actions={editable && <Button onClick={() => showForm(null)}><Plus />新增群组</Button>}
    />
    {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <Table>
        <TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
        <TableBody>
          {loading
            ? <TableRow><TableCell colSpan={columns.length}>加载中…</TableCell></TableRow>
            : table.getRowModel().rows.length
              ? table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)
              : <TableRow><TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">还没有群组。按项目建一个，资产就能归类了</TableCell></TableRow>}
        </TableBody>
    </Table>
      <TablePager table={table} />
    <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next) }}><DialogContent>
      <DialogHeader><DialogTitle>{editing ? '编辑群组' : '新增群组'}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="space-y-2"><label htmlFor="group-name" className="text-sm font-medium">群组名称</label><Input id="group-name" required maxLength={80} placeholder="例如：核心业务、测试环境" value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></div>
        <div className="space-y-2"><label htmlFor="group-description" className="text-sm font-medium">备注</label><Textarea id="group-description" maxLength={200} rows={3} placeholder="可选，备注这个项目包含什么" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></div>
        <DialogFooter>
          {editing && <Button type="button" variant="destructive" className="mr-auto" disabled={saving} onClick={() => { setOpen(false); setDeleting(editing) }}><Trash2 />删除</Button>}
          <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={next => { if (!next && !saving) setDeleting(null) }}><DialogContent>
      <DialogHeader><DialogTitle>删除群组「{deleting?.name}」？</DialogTitle><DialogDescription>组内资产会保留，只是不再归属这个群组。</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={saving} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
