import { useEffect, useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, APIError } from '../api'
import type { Service, ServiceFields } from '../api'
import { Select } from './AppControls'
import { Button } from './ui/button'
import { PageHeader } from './PageHeader'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

interface Props {
  editable: boolean
  onSessionError: (error: unknown) => void
}

const emptyService: ServiceFields = { name: '', category: '', defaultPort: 0, description: '' }

export function ServiceManager({ editable, onSessionError }: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [deleting, setDeleting] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [fields, setFields] = useState<ServiceFields>(emptyService)

  useEffect(() => { void load() }, [])

  function report(value: unknown) {
    if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
    setError(value instanceof Error ? value.message : '操作失败')
  }

  async function load() {
    setLoading(true)
    setError('')
    try { setServices(await api<Service[]>('/services')) }
    catch (value) { report(value) } finally { setLoading(false) }
  }

  const categories = useMemo(() => [...new Set(services.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [services])
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return services.filter(item =>
      (!category || item.category === category) &&
      (!query || [item.name, item.category, item.description].some(value => value.toLowerCase().includes(query))))
  }, [services, keyword, category])

  function showForm(service: Service | null) {
    setEditing(service)
    setFields(service
      ? { name: service.name, category: service.category, defaultPort: service.defaultPort, description: service.description }
      : emptyService)
    setModalError('')
    setOpen(true)
  }

  async function save() {
    if (!fields.name.trim()) { setModalError('请填写服务名称'); return }
    setSaving(true)
    setModalError('')
    try {
      if (editing) await api<Service>(`/services/${editing.id}`, 'PUT', fields)
      else await api<Service>('/services', 'POST', fields)
      setOpen(false)
      await load()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setModalError(value instanceof Error ? value.message : '保存失败')
    } finally { setSaving(false) }
  }

  async function remove(service: Service) {
    setSaving(true)
    try {
      await api(`/services/${service.id}`, 'DELETE')
      setDeleting(null)
      await load()
    } catch (value) {
      if (value instanceof APIError && value.status === 401) { onSessionError(value); return }
      setError(value instanceof Error ? value.message : '删除失败')
    } finally { setSaving(false) }
  }

  const columns = useMemo<ColumnDef<Service>[]>(() => [
    { accessorKey: 'name', header: '服务名称', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: 'category', header: '分类', cell: ({ row }) => row.original.category || <span className="text-muted-foreground">—</span> },
    { accessorKey: 'defaultPort', header: '默认端口', cell: ({ row }) => row.original.defaultPort ? <span className="font-mono">{row.original.defaultPort}</span> : <span className="text-muted-foreground">—</span> },
    { accessorKey: 'description', header: '说明', cell: ({ row }) => row.original.description || <span className="text-muted-foreground">—</span> },
    { id: 'builtin', header: '来源', cell: ({ row }) => <span className="text-muted-foreground">{row.original.builtin ? '内置' : '自定义'}</span> },
    ...(editable ? [{
      id: 'actions', header: '操作',
      cell: ({ row }: { row: { original: Service } }) => <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => showForm(row.original)}><Pencil />编辑</Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(row.original)}><Trash2 />删除</Button>
      </div>,
    }] : []),
  ], [editable])

  const table = useReactTable({ data: visible, columns, getCoreRowModel: getCoreRowModel() })

  return <>
    <PageHeader
      title="服务"
      filters={<>
        <Input className="max-w-sm" placeholder="搜索服务名称、分类或说明" value={keyword} onChange={event => setKeyword(event.target.value)} />
        <Select
          style={{ width: 140 }} allowClear searchable={false} placeholder="全部分类"
          value={category || undefined}
          onChange={(value: string | undefined) => setCategory(value ?? '')}
          options={categories.map(item => ({ value: item, label: item }))}
        />
      </>}
      actions={editable && <Button onClick={() => showForm(null)}><Plus />新增服务</Button>}
    />
    {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <Table>
        <TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
        <TableBody>
          {loading
            ? <TableRow><TableCell colSpan={columns.length}>加载中…</TableCell></TableRow>
            : table.getRowModel().rows.length
              ? table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)
              : <TableRow><TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">没有匹配的服务</TableCell></TableRow>}
        </TableBody>
    </Table>
    <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next) }}><DialogContent>
      <DialogHeader><DialogTitle>{editing ? '编辑服务' : '新增服务'}</DialogTitle></DialogHeader>
      {modalError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{modalError}</div>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="space-y-2"><label htmlFor="service-name" className="text-sm font-medium">服务名称</label><Input id="service-name" required maxLength={120} placeholder="例如：nginx" value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><label htmlFor="service-category" className="text-sm font-medium">分类</label><Input id="service-category" maxLength={40} placeholder="例如：数据库" value={fields.category} onChange={event => setFields({ ...fields, category: event.target.value })} /></div>
          <div className="space-y-2"><label htmlFor="service-port" className="text-sm font-medium">默认端口</label><Input id="service-port" type="number" min={0} max={65535} placeholder="可选" value={fields.defaultPort || ''} onChange={event => setFields({ ...fields, defaultPort: Number(event.target.value) || 0 })} /></div>
        </div>
        <div className="space-y-2"><label htmlFor="service-description" className="text-sm font-medium">说明</label><Textarea id="service-description" maxLength={200} rows={3} placeholder="可选，一句话说明用途" value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></div>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={next => { if (!next && !saving) setDeleting(null) }}><DialogContent>
      <DialogHeader><DialogTitle>删除服务「{deleting?.name}」？</DialogTitle><DialogDescription>只从服务目录里移除，不影响资产。</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={saving} onClick={() => { if (deleting) void remove(deleting) }}>删除</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
