import { useEffect, useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, APIError } from '../api'
import type { MetadataEntry, MetadataFields } from '../api'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { PageHeader } from './PageHeader'
import { TablePager } from './TablePager'

interface Props {
  kind: string
  title: string
  hideTitle?: boolean
  editable: boolean
  onSessionError: (error: unknown) => void
  onChanged?: () => void
}

// Generic dictionary category (负责人, 运营商, …): name plus an optional note.
export function MetadataManager({ kind, title, hideTitle, editable, onSessionError, onChanged }: Props) {
  const [entries, setEntries] = useState<MetadataEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<MetadataEntry | null>(null)
  const [deleting, setDeleting] = useState<MetadataEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [fields, setFields] = useState({ name: '', description: '' })

  useEffect(() => { void load() }, [kind])

  function report(value: unknown) {
    if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
    setError(value instanceof Error ? value.message : '操作失败')
  }

  async function load() {
    setLoading(true)
    setError('')
    try { setEntries(await api<MetadataEntry[]>(`/metadata?kind=${kind}`)) }
    catch (value) { report(value) } finally { setLoading(false) }
  }

  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return query ? entries.filter(item => [item.name, item.description].some(value => value.toLowerCase().includes(query))) : entries
  }, [entries, keyword])

  function showForm(entry: MetadataEntry | null) {
    setEditing(entry)
    setFields({ name: entry?.name ?? '', description: entry?.description ?? '' })
    setModalError('')
    setOpen(true)
  }

  async function save() {
    if (!fields.name.trim()) { setModalError('请填写名称'); return }
    setSaving(true)
    setModalError('')
    const body: MetadataFields = { kind, name: fields.name, description: fields.description }
    try {
      if (editing) await api<MetadataEntry>(`/metadata/${editing.id}`, 'PUT', body)
      else await api<MetadataEntry>('/metadata', 'POST', body)
      setOpen(false)
      await load()
      onChanged?.()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setModalError(value instanceof Error ? value.message : '保存失败')
    } finally { setSaving(false) }
  }

  async function remove(entry: MetadataEntry) {
    setSaving(true)
    try {
      await api(`/metadata/${entry.id}`, 'DELETE')
      setDeleting(null)
      await load()
      onChanged?.()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setError(value instanceof Error ? value.message : '删除失败')
    } finally { setSaving(false) }
  }

  const columns = useMemo<ColumnDef<MetadataEntry>[]>(() => [
    { accessorKey: 'name', header: '名称', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: 'description', header: '备注', cell: ({ row }) => row.original.description || <span className="text-muted-foreground">—</span> },
    ...(editable ? [{
      id: 'actions', header: () => <div className="text-right">操作</div>,
      cell: ({ row }: { row: { original: MetadataEntry } }) => <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => showForm(row.original)}><Pencil />编辑</Button>
      </div>,
    }] : []),
  ], [editable])

  const table = useReactTable({ data: visible, columns, initialState: { pagination: { pageIndex: 0, pageSize: 20 } }, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() })

  return <>
    <PageHeader
      title={hideTitle ? undefined : title}
      filters={<Input className="max-w-sm" placeholder={`搜索${title}名称或备注`} value={keyword} onChange={event => setKeyword(event.target.value)} />}
      actions={editable && <Button onClick={() => showForm(null)}><Plus />新增{title}</Button>}
    />
    {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <Table>
      <TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
      <TableBody>
        {loading
          ? <TableRow><TableCell colSpan={columns.length}>加载中…</TableCell></TableRow>
          : table.getRowModel().rows.length
            ? table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)
            : <TableRow><TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">还没有{title}，新增一个开始归类</TableCell></TableRow>}
      </TableBody>
    </Table>
      <TablePager table={table} />
    <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next) }}><DialogContent>
      <DialogHeader><DialogTitle>{editing ? `编辑${title}` : `新增${title}`}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="space-y-2"><label htmlFor="metadata-name" className="text-sm font-medium">名称</label><Input id="metadata-name" required maxLength={80} value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></div>
        <div className="space-y-2"><label htmlFor="metadata-description" className="text-sm font-medium">备注</label><Textarea id="metadata-description" maxLength={200} rows={3} placeholder="可选" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></div>
        <DialogFooter>
          {editing && <Button type="button" variant="destructive" className="mr-auto" disabled={saving} onClick={() => { setOpen(false); setDeleting(editing) }}><Trash2 />删除</Button>}
          <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={next => { if (!next && !saving) setDeleting(null) }}><DialogContent>
      <DialogHeader><DialogTitle>删除「{deleting?.name}」？</DialogTitle><DialogDescription>只从参考数据里移除，不影响资产。</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={saving} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
